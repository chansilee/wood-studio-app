-- 產品參考: redesign the empty products stub to match the discussed model
-- (name/category/tags/spec fields), plus the node-graph process-flow tables
-- and the daily production log tables that consume/produce against them.
--
-- Model: process_nodes are either 'action' (a verb — what was done) or
-- 'tag' (a state/quantity checkpoint sitting between actions, incl. the
-- boundary tags 開始/成品). process_edges connect tag->action (this state
-- can feed that action) or action->tag (doing this action can produce that
-- state, including terminal defect-reason tags). A production_logs row is
-- "this member did this action today, consuming N from this input tag";
-- production_log_outputs splits that N into one or more output tags
-- (good + defect reasons). tag_balances sums inflow minus outflow per tag.
alter table public.products drop column if exists series;
alter table public.products drop column if exists pose;
alter table public.products drop column if exists process_steps;
alter table public.products add column category text;
alter table public.products add column tags text[] not null default '{}';
alter table public.products add column size_note text;
alter table public.products add column material text;
alter table public.products add column material_thickness_mm numeric;

create type public.process_node_kind as enum ('action', 'tag');

create table public.process_nodes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  kind public.process_node_kind not null,
  label text not null,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.process_edges (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  from_node_id uuid not null references public.process_nodes(id) on delete cascade,
  to_node_id uuid not null references public.process_nodes(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id)
);

create table public.production_logs (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  member_id uuid not null references public.profiles(id),
  log_date date not null,
  action_node_id uuid not null references public.process_nodes(id),
  input_tag_id uuid not null references public.process_nodes(id),
  qty_consumed integer not null check (qty_consumed > 0),
  created_at timestamptz not null default now()
);

create table public.production_log_outputs (
  id uuid primary key default gen_random_uuid(),
  log_id uuid not null references public.production_logs(id) on delete cascade,
  output_tag_id uuid not null references public.process_nodes(id),
  qty integer not null check (qty > 0)
);

create or replace view public.tag_balances
with (security_invoker = true)
as
select
  n.id as tag_id,
  n.product_id,
  coalesce(inflow.qty, 0) - coalesce(outflow.qty, 0) as available_qty
from public.process_nodes n
left join (
  select output_tag_id, sum(qty) as qty from public.production_log_outputs group by output_tag_id
) inflow on inflow.output_tag_id = n.id
left join (
  select input_tag_id, sum(qty_consumed) as qty from public.production_logs group by input_tag_id
) outflow on outflow.input_tag_id = n.id
where n.kind = 'tag';

-- 開始 is the unlimited source tag; every other tag must have enough
-- balance (inflow so far minus what's already been consumed) before a log
-- can draw qty_consumed from it, and the input tag must actually be a
-- defined input of the chosen action per the product's graph.
create or replace function public.validate_production_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_kind process_node_kind;
  input_kind process_node_kind;
  input_label text;
  has_edge boolean;
  available numeric;
begin
  select kind into action_kind from process_nodes where id = new.action_node_id and product_id = new.product_id;
  if action_kind is distinct from 'action' then
    raise exception '動作站不存在或不屬於此產品';
  end if;

  select kind, label into input_kind, input_label from process_nodes where id = new.input_tag_id and product_id = new.product_id;
  if input_kind is distinct from 'tag' then
    raise exception '輸入標籤不存在或不屬於此產品';
  end if;

  select exists(
    select 1 from process_edges where from_node_id = new.input_tag_id and to_node_id = new.action_node_id
  ) into has_edge;
  if not has_edge then
    raise exception '這個動作站沒有連接這個輸入標籤，無法登記';
  end if;

  if input_label is distinct from '開始' then
    select coalesce(available_qty, 0) into available from tag_balances where tag_id = new.input_tag_id;
    if coalesce(available, 0) < new.qty_consumed then
      raise exception '「%」目前庫存只有 %，不足以登記 % 件', input_label, coalesce(available, 0), new.qty_consumed;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_validate_production_log
  before insert on public.production_logs
  for each row execute function public.validate_production_log();

-- each output tag must be a defined output of the log's action per the graph
create or replace function public.validate_production_log_output()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_id uuid;
  output_kind process_node_kind;
  has_edge boolean;
begin
  select action_node_id into action_id from production_logs where id = new.log_id;

  select kind into output_kind from process_nodes where id = new.output_tag_id;
  if output_kind is distinct from 'tag' then
    raise exception '輸出標籤不存在';
  end if;

  select exists(
    select 1 from process_edges where from_node_id = action_id and to_node_id = new.output_tag_id
  ) into has_edge;
  if not has_edge then
    raise exception '這個動作站沒有這個輸出標籤，無法登記';
  end if;

  return new;
end;
$$;

create trigger trg_validate_production_log_output
  before insert on public.production_log_outputs
  for each row execute function public.validate_production_log_output();

alter table public.process_nodes enable row level security;
alter table public.process_edges enable row level security;
alter table public.production_logs enable row level security;
alter table public.production_log_outputs enable row level security;

create policy "process_nodes_select_non_guest" on public.process_nodes for select using (current_role_name() is distinct from 'guest');
create policy "process_nodes_owner_write" on public.process_nodes for all using (is_owner()) with check (is_owner());

create policy "process_edges_select_non_guest" on public.process_edges for select using (current_role_name() is distinct from 'guest');
create policy "process_edges_owner_write" on public.process_edges for all using (is_owner()) with check (is_owner());

create policy "production_logs_select_non_guest" on public.production_logs for select using (current_role_name() is distinct from 'guest');
create policy "production_logs_insert_self" on public.production_logs for insert with check (member_id = auth.uid() and current_role_name() is distinct from 'guest');
create policy "production_logs_delete_self_or_owner" on public.production_logs for delete using (member_id = auth.uid() or is_owner());
create policy "production_logs_update_self_or_owner" on public.production_logs for update using (member_id = auth.uid() or is_owner()) with check (member_id = auth.uid() or is_owner());

create policy "production_log_outputs_select_non_guest" on public.production_log_outputs for select using (current_role_name() is distinct from 'guest');
create policy "production_log_outputs_insert_self" on public.production_log_outputs for insert with check (
  exists (select 1 from production_logs l where l.id = log_id and (l.member_id = auth.uid()))
);
create policy "production_log_outputs_delete_self_or_owner" on public.production_log_outputs for delete using (
  exists (select 1 from production_logs l where l.id = log_id and (l.member_id = auth.uid() or is_owner()))
);
