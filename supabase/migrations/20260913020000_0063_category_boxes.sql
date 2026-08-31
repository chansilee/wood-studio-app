-- A dashed box drawn on the process-flow canvas that spatially "contains"
-- whichever tags happen to sit inside it — membership is computed live from
-- node position vs. box bounds, never stored per-node. This deliberately
-- keeps categorization fully decoupled from process_nodes, so re-drawing a
-- box never touches (and is never blocked by) the production-log-history
-- protection on nodes/edges. Boxes may overlap; a tag inside two boxes with
-- the same name still only counts once for that name (dedup happens at
-- read time via a Set of box names, not here).
create table public.category_boxes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete cascade,
  template_id uuid references public.process_templates(id) on delete cascade,
  name text not null,
  pos_x numeric not null default 0,
  pos_y numeric not null default 0,
  width numeric not null default 220,
  height numeric not null default 160,
  created_at timestamptz not null default now()
);

alter table public.category_boxes enable row level security;
create policy "category_boxes_select_non_guest" on public.category_boxes for select using (current_role_name() is distinct from 'guest');
create policy "category_boxes_owner_write" on public.category_boxes for all using (is_owner()) with check (is_owner());
