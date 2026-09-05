-- 完整路徑（sub-SKU）：從第一層開始沿著已連線的節點走，走到「這個節點已經
-- 沒有再往下一層的連線」就算一條完整路徑——不是「一定要走滿目前層數最多的
-- 那幾層」。這樣以後在最右邊新增一層，既有（可能已經有品項在用）的路徑
-- 不會因此變得「不完整」而被迫消失，跟舊有的連線邏輯完全脫鉤，符合「新增
-- 層永遠是安全操作」的原則。
create table public.inventory_diagram_paths (
  id uuid primary key default gen_random_uuid(),
  diagram_id uuid not null references public.inventory_diagrams(id) on delete cascade,
  node_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique (diagram_id, node_ids)
);

-- 產品（成品tag）對某個共用diagram底下某條路徑的「啟用／預設」設定。
-- 啟用只能新增、不能取消（見下方 trigger）；預設可以隨時改，且同一個
-- 成品tag同時只能有一條預設路徑（部分唯一索引）；預設必須是已啟用的路徑。
create table public.product_inventory_path_settings (
  id uuid primary key default gen_random_uuid(),
  product_tag_node_id uuid not null references public.process_nodes(id) on delete cascade,
  path_id uuid not null references public.inventory_diagram_paths(id) on delete restrict,
  enabled boolean not null default true,
  is_default boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (product_tag_node_id, path_id),
  check (not is_default or enabled)
);
create unique index product_inventory_path_settings_one_default
  on public.product_inventory_path_settings (product_tag_node_id)
  where is_default;

create or replace function public.validate_inventory_path_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.enabled = true and new.enabled = false then
    raise exception '啟用後不能再取消，只能繼續新增其他路徑';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_validate_inventory_path_setting
  before update on public.product_inventory_path_settings
  for each row execute function public.validate_inventory_path_setting();

-- 重新計算某個 diagram 目前「走得到的完整路徑」，並且：
-- - 新出現的路徑：新增進 inventory_diagram_paths
-- - 舊路徑如果已經不再是「走得到的完整路徑」，但仍被某個產品的啟用/預設
--   設定引用著：直接擋下這次變更（整個呼叫這個function的異動都會 rollback），
--   這就是「已使用的路徑會卡死、連線圖上該連線點了沒反應」的資料庫層防護
-- - 沒有被引用的舊路徑：直接砍掉，保持表格乾淨
-- 之後 Phase 4 做入庫/出庫/更正的流水帳表時，這裡的「還有沒有被引用」也要
-- 一併檢查那幾張表，現在先只檢查 product_inventory_path_settings。
create or replace function public.recompute_diagram_paths(p_diagram_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  create temporary table _computed_paths (node_ids uuid[]) on commit drop;

  insert into _computed_paths
  with recursive walk(node_ids, cur_node) as (
    select array[n.id], n.id
    from inventory_diagram_nodes n
    join inventory_diagram_layers l on l.id = n.layer_id
    where l.diagram_id = p_diagram_id and l.depth = 1
    union all
    select w.node_ids || e.to_node_id, e.to_node_id
    from walk w
    join inventory_diagram_edges e on e.from_node_id = w.cur_node
  )
  select w.node_ids
  from walk w
  where not exists (select 1 from inventory_diagram_edges e2 where e2.from_node_id = w.cur_node);

  if exists (
    select 1
    from inventory_diagram_paths p
    where p.diagram_id = p_diagram_id
      and not exists (select 1 from _computed_paths c where c.node_ids = p.node_ids)
      and exists (select 1 from product_inventory_path_settings s where s.path_id = p.id)
  ) then
    raise exception '此變更會移除已被產品啟用/設為預設的入庫分類路徑，操作已取消';
  end if;

  delete from inventory_diagram_paths p
  where p.diagram_id = p_diagram_id
    and not exists (select 1 from _computed_paths c where c.node_ids = p.node_ids);

  insert into inventory_diagram_paths (diagram_id, node_ids)
  select p_diagram_id, c.node_ids from _computed_paths c
  on conflict (diagram_id, node_ids) do nothing;
end;
$$;

-- 以下三個 RPC 把「刪除 + 重算」包在同一個交易裡：一旦 recompute 擋下來，
-- 前面的刪除也會一起 rollback，畫面上呈現的效果就是「點了沒反應」。
create or replace function public.delete_inventory_diagram_edge(p_edge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_diagram_id uuid;
begin
  if not public.is_owner() then
    raise exception '只有負責人可以編輯入庫分類';
  end if;
  select diagram_id into v_diagram_id from inventory_diagram_edges where id = p_edge_id;
  if v_diagram_id is null then return; end if;
  delete from inventory_diagram_edges where id = p_edge_id;
  perform public.recompute_diagram_paths(v_diagram_id);
end;
$$;

create or replace function public.delete_inventory_diagram_node(p_node_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_layer_id uuid;
  v_diagram_id uuid;
  v_sibling_count int;
begin
  if not public.is_owner() then
    raise exception '只有負責人可以編輯入庫分類';
  end if;
  select layer_id into v_layer_id from inventory_diagram_nodes where id = p_node_id;
  if v_layer_id is null then return; end if;
  select diagram_id into v_diagram_id from inventory_diagram_layers where id = v_layer_id;
  select count(*) into v_sibling_count from inventory_diagram_nodes where layer_id = v_layer_id;
  if v_sibling_count <= 1 then
    raise exception '每一層至少要留一個節點，不能刪到剩 0 個';
  end if;
  delete from inventory_diagram_nodes where id = p_node_id;
  perform public.recompute_diagram_paths(v_diagram_id);
end;
$$;

-- 目前只允許刪除最後一層（避免刪中間層要處理後面層數重新編號的複雜度）；
-- 之後如果真的需要刪中間層，再另外處理重新編號
create or replace function public.delete_inventory_diagram_layer(p_layer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_diagram_id uuid;
  v_depth int;
  v_max_depth int;
begin
  if not public.is_owner() then
    raise exception '只有負責人可以編輯入庫分類';
  end if;
  select diagram_id, depth into v_diagram_id, v_depth from inventory_diagram_layers where id = p_layer_id;
  if v_diagram_id is null then return; end if;
  select max(depth) into v_max_depth from inventory_diagram_layers where diagram_id = v_diagram_id;
  if v_depth <> v_max_depth then
    raise exception '目前只能刪除最右邊（最後一層）的層';
  end if;
  delete from inventory_diagram_layers where id = p_layer_id;
  perform public.recompute_diagram_paths(v_diagram_id);
end;
$$;

alter table public.inventory_diagram_paths enable row level security;
alter table public.product_inventory_path_settings enable row level security;

create policy inventory_diagram_paths_select_all on public.inventory_diagram_paths
  for select using (auth.uid() is not null);
create policy inventory_diagram_paths_owner_write on public.inventory_diagram_paths
  for all using (public.is_owner()) with check (public.is_owner());

create policy product_inventory_path_settings_select_all on public.product_inventory_path_settings
  for select using (auth.uid() is not null);
create policy product_inventory_path_settings_owner_write on public.product_inventory_path_settings
  for all using (public.is_owner()) with check (public.is_owner());
