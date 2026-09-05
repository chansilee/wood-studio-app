-- "delete from _computed_paths;" (清空暫存表，沒有 WHERE) 會被 Supabase 的
-- safe-update 保護擋下來（"DELETE requires a WHERE clause"），即使是在
-- security definer function 裡面、對的是暫存表也一樣。改用 truncate 清空整
-- 張表，語意一樣、不會被這個保護規則擋到。
create or replace function public.recompute_diagram_paths(p_diagram_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  create temporary table if not exists _computed_paths (node_ids uuid[]) on commit drop;
  truncate _computed_paths;

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
