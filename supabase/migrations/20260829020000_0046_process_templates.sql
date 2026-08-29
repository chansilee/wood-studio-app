-- 編輯生產流程: reusable, named process-flow templates decoupled from any one
-- product. process_nodes/process_edges now belong to EITHER a product OR a
-- template (never both, never neither) via a nullable FK pair + xor check,
-- so the existing ProcessFlowEditor and its validation logic work unchanged
-- for either scope. Applying a template to a product is a one-time COPY
-- (fresh node/edge rows, fresh ids) — never a live reference — because each
-- product needs its own independent production log / tag_balances history
-- even when it shares a template's structure with other products.
-- products.process_template_id is purely provenance ("started from this
-- template"); editing or deleting a template afterward never touches
-- products that were copied from it.
create table public.process_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.process_nodes
  alter column product_id drop not null,
  add column template_id uuid references public.process_templates(id) on delete cascade,
  add constraint process_nodes_owner_xor check (
    (product_id is not null and template_id is null) or (product_id is null and template_id is not null)
  );

alter table public.process_edges
  alter column product_id drop not null,
  add column template_id uuid references public.process_templates(id) on delete cascade,
  add constraint process_edges_owner_xor check (
    (product_id is not null and template_id is null) or (product_id is null and template_id is not null)
  );

alter table public.products add column process_template_id uuid references public.process_templates(id) on delete set null;

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
where n.kind = 'tag' and n.product_id is not null;

alter table public.process_templates enable row level security;
create policy "process_templates_select_non_guest" on public.process_templates for select using (current_role_name() is distinct from 'guest');
create policy "process_templates_owner_write" on public.process_templates for all using (is_owner()) with check (is_owner());
