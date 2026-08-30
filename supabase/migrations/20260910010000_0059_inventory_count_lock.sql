-- 總數瀏覽 / 盤點修正: a single advisory-lock row so at most one person is
-- mid-stocktake at a time. draft holds their not-yet-submitted cell edits so
-- the SAME account can resume within the client's expiry window after
-- closing the tab without finishing (see src/shared/lib/inventoryLock.ts).
create table public.inventory_count_lock (
  id smallint primary key default 1,
  locked_by uuid references public.profiles(id),
  locked_at timestamptz,
  draft jsonb not null default '{}'::jsonb,
  reason text not null default '',
  constraint inventory_count_lock_singleton check (id = 1)
);

insert into public.inventory_count_lock (id) values (1);

alter table public.inventory_count_lock enable row level security;
create policy "inventory_count_lock_select_non_guest" on public.inventory_count_lock for select using (current_role_name() is distinct from 'guest');
create policy "inventory_count_lock_owner_write" on public.inventory_count_lock for update using (is_owner()) with check (is_owner());
