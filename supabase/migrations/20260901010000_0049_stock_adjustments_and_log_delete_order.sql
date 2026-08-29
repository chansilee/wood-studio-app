-- 校正紀錄: manual +/- stock corrections, decoupled from the production
-- flow graph entirely (unlike production_logs, which must always route
-- through a valid tag->action->tag edge). This lets the owner fix a wrong
-- number without needing a graph path to walk, and — critically — without
-- ever touching past production_logs rows, which would silently corrupt
-- every later balance check that already passed using the old numbers.
create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  tag_id uuid not null references public.process_nodes(id),
  qty_delta integer not null,
  reason text,
  adjusted_by uuid references public.profiles(id),
  adjusted_at timestamptz not null default now()
);

create index stock_adjustments_product_id_idx on public.stock_adjustments(product_id);
create index stock_adjustments_tag_id_idx on public.stock_adjustments(tag_id);

create or replace function public.validate_stock_adjustment()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  tag_kind process_node_kind;
  tag_product uuid;
begin
  select kind, product_id into tag_kind, tag_product from process_nodes where id = new.tag_id;
  if tag_kind is distinct from 'tag' then
    raise exception 'stock_adjustments.tag_id must reference a tag node';
  end if;
  if tag_product is distinct from new.product_id then
    raise exception 'tag does not belong to this product';
  end if;
  return new;
end;
$$;

create trigger stock_adjustments_validate
before insert or update on public.stock_adjustments
for each row execute function public.validate_stock_adjustment();

alter table public.stock_adjustments enable row level security;
create policy "stock_adjustments_select_non_guest" on public.stock_adjustments for select using (current_role_name() is distinct from 'guest');
create policy "stock_adjustments_owner_write" on public.stock_adjustments for all using (is_owner()) with check (is_owner());

-- fold adjustments into the live balance view
create or replace view public.tag_balances
with (security_invoker = true)
as
select
  n.id as tag_id,
  n.product_id,
  coalesce(inflow.qty, 0) - coalesce(outflow.qty, 0) + coalesce(adj.qty, 0) as available_qty
from public.process_nodes n
left join (
  select output_tag_id, sum(qty) as qty from public.production_log_outputs group by output_tag_id
) inflow on inflow.output_tag_id = n.id
left join (
  select input_tag_id, sum(qty_consumed) as qty from public.production_logs group by input_tag_id
) outflow on outflow.input_tag_id = n.id
left join (
  select tag_id, sum(qty_delta) as qty from public.stock_adjustments group by tag_id
) adj on adj.tag_id = n.id
where n.kind = 'tag' and n.product_id is not null;

-- Deleting (or editing) a production_logs row that ISN'T the most recent one
-- for its product is dangerous: later logs for that product already had
-- their balance checked against numbers that included this row's output, and
-- removing/changing it after the fact doesn't re-validate them — the books
-- just silently stop adding up. Restrict both to strict LIFO order per
-- product; the app always deletes-then-reinserts for an "edit", so both
-- operations go through this same guard.
create or replace function public.validate_production_log_delete_order()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if exists (
    select 1 from production_logs
    where product_id = old.product_id and created_at > old.created_at
  ) then
    raise exception 'can only delete or edit the most recent production log for this product';
  end if;
  return old;
end;
$$;

create trigger production_logs_delete_order
before delete on public.production_logs
for each row execute function public.validate_production_log_delete_order();
