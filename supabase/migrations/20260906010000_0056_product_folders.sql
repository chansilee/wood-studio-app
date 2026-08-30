-- Personal, per-user product folders. Membership is never stored — a
-- product "belongs" to a folder purely because one of its tags is a literal
-- substring of the folder's name, recomputed live on every view. This means
-- folders carry zero references to products at all, so creating/renaming/
-- deleting a folder can never touch or endanger any product data.
create table public.product_folders (
  id uuid primary key default gen_random_uuid(),
  owner_member_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.product_folders(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index product_folders_owner_idx on public.product_folders(owner_member_id);
create index product_folders_parent_idx on public.product_folders(parent_id);

alter table public.product_folders enable row level security;
create policy "product_folders_all_self" on public.product_folders for all
  using (owner_member_id = auth.uid()) with check (owner_member_id = auth.uid());

-- Per-user "was 資料夾模式 last left on" toggle for 產品參考.
create table public.product_view_preferences (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  folder_mode_enabled boolean not null default false
);

alter table public.product_view_preferences enable row level security;
create policy "product_view_preferences_self" on public.product_view_preferences for all
  using (member_id = auth.uid()) with check (member_id = auth.uid());
