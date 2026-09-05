-- 補三個 Phase 1 沒做完的部分：

-- 1. 新增連線也可能讓一條「已鎖定的葉節點路徑」消失（例如 A 原本沒有往下的
--    連線、自己就是一條完整路徑，現在把 A 接到下一層的 B，A 就不再是葉節點
--    了）——所以新增連線也要跟刪除一樣，包成「新增+重算」同一個交易，擋下
--    會弄掉已使用路徑的操作。
create or replace function public.add_inventory_diagram_edge(
  p_diagram_id uuid, p_from_node_id uuid, p_to_node_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    raise exception '只有負責人可以編輯入庫分類';
  end if;
  insert into inventory_diagram_edges (diagram_id, from_node_id, to_node_id)
  values (p_diagram_id, p_from_node_id, p_to_node_id);
  perform public.recompute_diagram_paths(p_diagram_id);
end;
$$;

-- 2. 整個 diagram 的刪除：先檢查有沒有任何產品的成品tag引用底下任何一條
--    路徑，有的話報出「已有(N)個產品使用此入庫分類，此項目不可刪除」
create or replace function public.delete_inventory_diagram(p_diagram_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_owner() then
    raise exception '只有負責人可以編輯入庫分類';
  end if;
  select count(distinct s.product_tag_node_id) into v_count
  from product_inventory_path_settings s
  join inventory_diagram_paths p on p.id = s.path_id
  where p.diagram_id = p_diagram_id;
  if v_count > 0 then
    raise exception '已有(%)個產品使用此入庫分類，此項目不可刪除', v_count;
  end if;
  delete from inventory_diagrams where id = p_diagram_id;
end;
$$;

-- 3. 節點改名：已被使用（在某個被產品引用的路徑裡）就鎖住不能改名，理由跟
--    刪除一樣——歷史品項名稱不能事後被偷換
create or replace function public.validate_inventory_diagram_node_rename()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.label is distinct from old.label then
    if exists (
      select 1
      from inventory_diagram_paths p
      join product_inventory_path_settings s on s.path_id = p.id
      where old.id = any(p.node_ids)
    ) then
      raise exception '此節點已被產品使用，無法改名';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_validate_inventory_diagram_node_rename
  before update on public.inventory_diagram_nodes
  for each row execute function public.validate_inventory_diagram_node_rename();
