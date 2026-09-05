-- recompute_diagram_paths 用 "create temporary table ... on commit drop" 存中間
-- 結果，但這張暫存表只在「交易結束」才會被丟掉，不是每次呼叫function結束就
-- 丟掉。只要同一個交易/連線裡呼叫這個function超過一次（例如
-- delete_inventory_diagram_edge/_node/_layer 內部又呼叫一次），第二次就會因
-- 為暫存表已存在而直接報錯。改成 create if not exists + 每次先清空，同一個
-- session/交易裡呼叫幾次都不會壞。
create or replace function public.recompute_diagram_paths(p_diagram_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  create temporary table if not exists _computed_paths (node_ids uuid[]) on commit drop;
  delete from _computed_paths;

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
