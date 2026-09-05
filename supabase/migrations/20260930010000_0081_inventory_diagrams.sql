-- 出入倉庫 sub-SKU 分類「連線圖」：一個 diagram 對應一個成品 tag 的名字
-- （之後用 Match to Product 掃描比對），底下是可變層數的分類（例如眉型、
-- 眼型），每層底下有多個選項節點，節點之間用 edge 連線代表「這個選項可以
-- 接到下一層哪個選項」，全部走滿層數的一條連線鏈才算一個完整入庫品項。
-- 這個 diagram 是全域共用的（不像生產流程 DAG 是每個產品各自複製一份），
-- 同一個成品 tag 名字的所有產品都共用同一份。
create table public.inventory_diagrams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  locked_by uuid references public.profiles(id),
  locked_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 層：每個 diagram 底下可以自由新增/命名，depth 決定左到右順序
create table public.inventory_diagram_layers (
  id uuid primary key default gen_random_uuid(),
  diagram_id uuid not null references public.inventory_diagrams(id) on delete cascade,
  name text not null,
  depth int not null,
  created_at timestamptz not null default now(),
  unique (diagram_id, depth)
);

-- 節點：層底下的選項（例如眉型層底下的「點點眉」「M字眉」）
create table public.inventory_diagram_nodes (
  id uuid primary key default gen_random_uuid(),
  layer_id uuid not null references public.inventory_diagram_layers(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  unique (layer_id, label)
);

-- 連線：只能接相鄰兩層的節點（用 trigger 檢查），第一層節點本身就自動視為
-- 起點的選項，不需要額外對「起點」拉線
create table public.inventory_diagram_edges (
  id uuid primary key default gen_random_uuid(),
  diagram_id uuid not null references public.inventory_diagrams(id) on delete cascade,
  from_node_id uuid not null references public.inventory_diagram_nodes(id) on delete cascade,
  to_node_id uuid not null references public.inventory_diagram_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id)
);

create or replace function public.validate_inventory_diagram_edge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  from_depth int;
  from_diagram uuid;
  to_depth int;
  to_diagram uuid;
begin
  select l.depth, l.diagram_id into from_depth, from_diagram
  from public.inventory_diagram_nodes n join public.inventory_diagram_layers l on l.id = n.layer_id
  where n.id = new.from_node_id;
  select l.depth, l.diagram_id into to_depth, to_diagram
  from public.inventory_diagram_nodes n join public.inventory_diagram_layers l on l.id = n.layer_id
  where n.id = new.to_node_id;

  if from_diagram is distinct from to_diagram or from_diagram is distinct from new.diagram_id then
    raise exception '連線的兩端必須屬於同一個 diagram';
  end if;
  if to_depth is distinct from from_depth + 1 then
    raise exception '只能連接相鄰兩層的節點';
  end if;
  return new;
end;
$$;

create trigger trg_validate_inventory_diagram_edge
  before insert on public.inventory_diagram_edges
  for each row execute function public.validate_inventory_diagram_edge();

alter table public.inventory_diagrams enable row level security;
alter table public.inventory_diagram_layers enable row level security;
alter table public.inventory_diagram_nodes enable row level security;
alter table public.inventory_diagram_edges enable row level security;

-- 所有登入成員都能查看（分類是給前台/員工登記用的參考資料），只有負責人能editing
create policy inventory_diagrams_select_all on public.inventory_diagrams
  for select using (auth.uid() is not null);
create policy inventory_diagrams_owner_write on public.inventory_diagrams
  for all using (public.is_owner()) with check (public.is_owner());

create policy inventory_diagram_layers_select_all on public.inventory_diagram_layers
  for select using (auth.uid() is not null);
create policy inventory_diagram_layers_owner_write on public.inventory_diagram_layers
  for all using (public.is_owner()) with check (public.is_owner());

create policy inventory_diagram_nodes_select_all on public.inventory_diagram_nodes
  for select using (auth.uid() is not null);
create policy inventory_diagram_nodes_owner_write on public.inventory_diagram_nodes
  for all using (public.is_owner()) with check (public.is_owner());

create policy inventory_diagram_edges_select_all on public.inventory_diagram_edges
  for select using (auth.uid() is not null);
create policy inventory_diagram_edges_owner_write on public.inventory_diagram_edges
  for all using (public.is_owner()) with check (public.is_owner());
