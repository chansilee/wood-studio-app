create table public.products (
  id uuid primary key default gen_random_uuid(),
  series smallint,
  name text not null,
  pose text,
  process_steps text,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "products_select_non_guest" on public.products
  for select using (public.current_role_name() is distinct from 'guest');

create policy "products_owner_write" on public.products
  for all using (public.is_owner()) with check (public.is_owner());

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  r2_key text not null,
  r2_url text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

alter table public.product_images enable row level security;

create policy "product_images_select_non_guest" on public.product_images
  for select using (public.current_role_name() is distinct from 'guest');

create policy "product_images_owner_write" on public.product_images
  for all using (public.is_owner()) with check (public.is_owner());
