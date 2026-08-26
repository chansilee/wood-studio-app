-- 審閱紀錄: member confirms they've viewed a published schedule, owner can audit/delete
alter table public.org_settings
  add column protect_review_records boolean not null default true;

create table public.schedule_confirmations (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.schedule_publications(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  unique (publication_id)
);

alter table public.schedule_confirmations enable row level security;

create policy schedule_confirmations_select_owner_all
  on public.schedule_confirmations for select
  using (is_owner());

create policy schedule_confirmations_select_self
  on public.schedule_confirmations for select
  using (member_id = auth.uid());

create policy schedule_confirmations_insert_self
  on public.schedule_confirmations for insert
  with check (
    member_id = auth.uid()
    and exists (
      select 1 from public.schedule_publications sp
      where sp.id = publication_id and sp.member_id = auth.uid()
    )
  );

create policy schedule_confirmations_delete_owner
  on public.schedule_confirmations for delete
  using (
    is_owner()
    and coalesce((select protect_review_records from public.org_settings where id = 1), true) = false
  );
