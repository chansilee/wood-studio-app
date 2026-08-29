-- Editing a log is implemented as an atomic delete-then-reinsert (reusing
-- every existing validation trigger a fresh entry goes through) rather than
-- an in-place UPDATE, so the edited row is guaranteed just as valid as any
-- newly created one. Wrapped in a single function so the delete and the
-- reinsert commit or fail together — a plain client-side delete-then-insert
-- risks losing the row entirely if the reinsert fails partway.
create or replace function public.edit_latest_production_log(
  p_log_id uuid,
  p_input_tag_id uuid,
  p_action_node_id uuid,
  p_qty_consumed integer,
  p_log_date date,
  p_outputs jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_product_id uuid;
  v_member_id uuid;
  v_new_log_id uuid;
  v_output jsonb;
begin
  select product_id, member_id into v_product_id, v_member_id from production_logs where id = p_log_id;
  if v_product_id is null then
    raise exception 'log not found';
  end if;

  if not (auth.uid() = v_member_id or is_owner()) then
    raise exception 'not authorized to edit this log';
  end if;

  -- still fires validate_production_log_delete_order (LIFO-only) underneath
  delete from production_logs where id = p_log_id;

  insert into production_logs (product_id, member_id, log_date, action_node_id, input_tag_id, qty_consumed)
  values (v_product_id, v_member_id, p_log_date, p_action_node_id, p_input_tag_id, p_qty_consumed)
  returning id into v_new_log_id;

  for v_output in select * from jsonb_array_elements(p_outputs)
  loop
    insert into production_log_outputs (log_id, output_tag_id, qty)
    values (v_new_log_id, (v_output->>'tag_id')::uuid, (v_output->>'qty')::integer);
  end loop;

  return v_new_log_id;
end;
$$;

grant execute on function public.edit_latest_production_log(uuid, uuid, uuid, integer, date, jsonb) to authenticated;
