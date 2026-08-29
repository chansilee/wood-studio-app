-- products.process_template_id was a single nullable pointer ("this product
-- started from template X") — insufficient once a product can receive a full
-- apply from one template AND additive diffs from others over time, and it
-- only recorded the "apply from product page" direction, not "push diff from
-- template page", so the two directions drifted out of sync. Replace it with
-- a proper history table: one row per apply action (either direction, either
-- mode), so "which templates touched this product" is always consistent no
-- matter which side triggered it, and multiple applications are all visible.
create table public.product_template_applications (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  template_id uuid references public.process_templates(id) on delete set null,
  template_name text not null,
  mode text not null check (mode in ('replace', 'diff')),
  applied_at timestamptz not null default now(),
  applied_by uuid references public.profiles(id)
);

create index product_template_applications_product_id_idx on public.product_template_applications(product_id);
create index product_template_applications_template_id_idx on public.product_template_applications(template_id);

alter table public.products drop column process_template_id;

alter table public.product_template_applications enable row level security;
create policy "product_template_applications_select_non_guest" on public.product_template_applications for select using (current_role_name() is distinct from 'guest');
create policy "product_template_applications_owner_write" on public.product_template_applications for all using (is_owner()) with check (is_owner());
