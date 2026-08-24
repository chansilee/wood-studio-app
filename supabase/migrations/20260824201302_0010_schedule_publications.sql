create table public.schedule_publications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  year_month date not null,
  published_by uuid references public.profiles(id),
  published_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index schedule_publications_member_month_idx
  on public.schedule_publications (member_id, year_month, published_at desc);

alter table public.schedule_publications enable row level security;

create policy "schedule_publications_select_self" on public.schedule_publications
  for select using (member_id = auth.uid());

create policy "schedule_publications_select_owner_all" on public.schedule_publications
  for select using (public.is_owner());

create policy "schedule_publications_owner_insert" on public.schedule_publications
  for insert with check (public.is_owner());

create or replace function public.prune_schedule_publications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.schedule_publications
  where member_id = new.member_id
    and year_month = new.year_month
    and id not in (
      select id from public.schedule_publications
      where member_id = new.member_id and year_month = new.year_month
      order by published_at desc
      limit 3
    );
  return new;
end;
$$;

create trigger trg_prune_schedule_publications
  after insert on public.schedule_publications
  for each row execute function public.prune_schedule_publications();
