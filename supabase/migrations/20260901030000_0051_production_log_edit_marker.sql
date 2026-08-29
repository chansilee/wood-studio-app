-- An edit must not make it look like the staff member reported the work at
-- the edit time (e.g. reported in the afternoon, corrected that night) —
-- keep the original created_at, but leave a visible trace that a correction
-- happened, so history is still auditable rather than silently rewritten.
alter table public.production_logs
  add column edited_at timestamptz,
  add column edited_by uuid references public.profiles(id);

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
  v_created_at timestamptz;
  v_new_log_id uuid;
  v_output jsonb;
begin
  select product_id, member_id, created_at into v_product_id, v_member_id, v_created_at
  from production_logs where id = p_log_id;
  if v_product_id is null then
    raise exception 'log not found';
  end if;

  if not (auth.uid() = v_member_id or is_owner()) then
    raise exception 'not authorized to edit this log';
  end if;

  -- still fires validate_production_log_delete_order (LIFO-only) underneath
  delete from production_logs where id = p_log_id;

  insert into production_logs (
    product_id, member_id, log_date, action_node_id, input_tag_id, qty_consumed,
    created_at, edited_at, edited_by
  )
  values (
    v_product_id, v_member_id, p_log_date, p_action_node_id, p_input_tag_id, p_qty_consumed,
    v_created_at, now(), auth.uid()
  )
  returning id into v_new_log_id;

  for v_output in select * from jsonb_array_elements(p_outputs)
  loop
    insert into production_log_outputs (log_id, output_tag_id, qty)
    values (v_new_log_id, (v_output->>'tag_id')::uuid, (v_output->>'qty')::integer);
  end loop;

  return v_new_log_id;
end;
$$;
