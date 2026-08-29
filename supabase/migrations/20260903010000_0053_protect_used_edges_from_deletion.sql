-- Nodes with production-log history are already protected from deletion via
-- FK (no ON DELETE CASCADE from production_logs/production_log_outputs), but
-- edges have no FK pointing at them at all — nothing stopped deleting an
-- edge that real logs had already walked, which would silently block ever
-- logging that same tag->action or action->tag step again in the future.
create or replace function public.validate_process_edge_delete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  from_kind process_node_kind;
  used boolean;
begin
  select kind into from_kind from process_nodes where id = old.from_node_id;
  if from_kind = 'action' then
    select exists (
      select 1 from production_log_outputs plo
      join production_logs pl on pl.id = plo.log_id
      where pl.action_node_id = old.from_node_id and plo.output_tag_id = old.to_node_id
    ) into used;
  else
    select exists (
      select 1 from production_logs
      where input_tag_id = old.from_node_id and action_node_id = old.to_node_id
    ) into used;
  end if;
  if used then
    raise exception 'this edge has production log history and cannot be deleted';
  end if;
  return old;
end;
$$;

create trigger process_edges_delete_guard
before delete on public.process_edges
for each row execute function public.validate_process_edge_delete();
