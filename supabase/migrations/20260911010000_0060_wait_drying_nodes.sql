-- 等待乾燥 nodes: a fully-automatic action node (wait_days is not null) that
-- a human never manually triggers. The moment qty lands in a tag whose sole
-- outgoing edge points at one of these, a trigger immediately logs the
-- "entering" half (member_id null = 系統自動, no production_log_outputs yet);
-- a periodic resolver later fills in the output once wait_days has elapsed,
-- completing that same log rather than creating a second one.

alter table public.process_nodes
  add column wait_days numeric check (wait_days > 0),
  add constraint process_nodes_wait_days_action_only check (wait_days is null or kind = 'action');

alter table public.production_logs
  alter column member_id drop not null;

-- A tag feeding a wait node must feed ONLY that wait node (100% of arriving
-- qty auto-drains with no human decision point); a wait node itself may only
-- have a single outgoing edge (nobody's present at maturity to split it).
-- Drawing a new edge that would violate either rule deletes the older
-- conflicting edge(s) — "newest connection wins" — but if an older edge
-- already has production-log history, the existing delete-guard trigger
-- (process_edges_delete_guard) blocks that delete, which aborts this insert
-- too, surfacing as the same friendly "history exists" error.
create or replace function public.validate_wait_edge_rules()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  from_kind process_node_kind;
  new_to_wait boolean;
  existing record;
  existing_to_wait boolean;
begin
  select kind into from_kind from process_nodes where id = new.from_node_id;
  select (wait_days is not null) into new_to_wait from process_nodes where id = new.to_node_id;

  if from_kind = 'action' then
    -- a wait-node source may only ever have one outgoing edge
    if (select wait_days from process_nodes where id = new.from_node_id) is not null then
      if exists (select 1 from process_edges where from_node_id = new.from_node_id) then
        raise exception 'wait node can only have one output edge';
      end if;
    end if;
    return new;
  end if;

  -- from a tag: enforce the wait/manual exclusivity by dropping whichever
  -- existing sibling edges conflict with the new one
  for existing in select * from process_edges where from_node_id = new.from_node_id loop
    select (wait_days is not null) into existing_to_wait from process_nodes where id = existing.to_node_id;
    if new_to_wait or existing_to_wait then
      delete from process_edges where id = existing.id;
    end if;
  end loop;

  return new;
end;
$$;

create trigger process_edges_wait_rules_guard
before insert on public.process_edges
for each row execute function public.validate_wait_edge_rules();

-- Fires whenever qty lands in a tag (via a human's or another wait node's
-- output) — if that tag's sole destination is a wait node, immediately log
-- the automatic "entering" half so the balance moves out of the source tag
-- right away; the output half is filled in later once wait_days elapses.
create or replace function public.auto_advance_wait_node()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  wait_node_id uuid;
  src_product_id uuid;
begin
  select to_node_id into wait_node_id
  from process_edges
  where from_node_id = new.output_tag_id
    and to_node_id in (select id from process_nodes where wait_days is not null)
  limit 1;

  if wait_node_id is null then
    return new;
  end if;

  select product_id into src_product_id from production_logs where id = new.log_id;

  insert into production_logs (product_id, member_id, log_date, action_node_id, input_tag_id, qty_consumed, created_at)
  values (src_product_id, null, current_date, wait_node_id, new.output_tag_id, new.qty, now());

  return new;
end;
$$;

create trigger trg_auto_advance_wait_node
after insert on public.production_log_outputs
for each row execute function public.auto_advance_wait_node();

-- Completes any wait-node log whose wait_days has elapsed by filling in its
-- (until now deliberately missing) output — callable by any signed-in member
-- so opening any page that calls it keeps things fresh, and additionally
-- scheduled hourly via pg_cron so it also runs with nobody watching.
create or replace function public.resolve_matured_wait_logs()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  r record;
begin
  for r in
    select pl.id as log_id, pl.qty_consumed, pl.action_node_id, pn.wait_days,
           (select e.to_node_id from process_edges e where e.from_node_id = pl.action_node_id limit 1) as output_tag_id
    from production_logs pl
    join process_nodes pn on pn.id = pl.action_node_id
    where pn.wait_days is not null
      and pl.created_at + (pn.wait_days || ' days')::interval <= now()
      and not exists (select 1 from production_log_outputs plo where plo.log_id = pl.id)
  loop
    if r.output_tag_id is not null then
      insert into production_log_outputs (log_id, output_tag_id, qty) values (r.log_id, r.output_tag_id, r.qty_consumed);
    end if;
  end loop;
end;
$$;

create extension if not exists pg_cron;
select cron.schedule('resolve-matured-wait-logs', '0 * * * *', $$select public.resolve_matured_wait_logs();$$);
