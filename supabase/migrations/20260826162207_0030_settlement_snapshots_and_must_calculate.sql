-- members: 必須計算月結 flag (staff default true, others false, role-linked reset like the others)
alter table public.profiles
  add column must_calculate_settlement boolean not null default false;

update public.profiles set must_calculate_settlement = (role = 'staff');

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.role is distinct from old.role
    or new.default_daily_hours is distinct from old.default_daily_hours
    or new.hire_date is distinct from old.hire_date
    or new.weekly_rest_check_enabled is distinct from old.weekly_rest_check_enabled
    or new.must_publish_schedule is distinct from old.must_publish_schedule
    or new.must_calculate_settlement is distinct from old.must_calculate_settlement
  ) then
    if not public.is_owner() then
      if not (new.role = 'owner' and new.id = auth.uid() and not public.has_any_owner()) then
        raise exception 'only owner can change role, default_daily_hours, hire_date, weekly_rest_check_enabled, must_publish_schedule, or must_calculate_settlement';
      end if;
    end if;
  end if;

  if new.role is distinct from old.role then
    new.weekly_rest_check_enabled := (new.role = 'staff');
    new.must_publish_schedule := (new.role = 'staff');
    new.must_calculate_settlement := (new.role = 'staff');
  end if;

  return new;
end;
$$;

-- 月結鏡像: a permanent, owner-only text mirror of one member's settlement for one month
create table public.settlement_snapshots (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  year_month date not null,
  snapshot jsonb not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (member_id, year_month)
);

alter table public.settlement_snapshots enable row level security;

create policy "settlement_snapshots_owner_all" on public.settlement_snapshots
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.validate_settlement_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  today_taipei date := (now() at time zone 'Asia/Taipei')::date;
  window_start date := (new.year_month + interval '1 month')::date;
  window_end date := window_start + 4;
begin
  if today_taipei < window_start or today_taipei > window_end then
    raise exception '只能在結算月份的下個月 1 日~5 日之間產出月結';
  end if;

  new.created_by := auth.uid();
  new.created_at := now();

  return new;
end;
$$;

create trigger trg_validate_settlement_snapshot
  before insert on public.settlement_snapshots
  for each row execute function public.validate_settlement_snapshot();

revoke execute on function public.validate_settlement_snapshot() from anon, authenticated, public;
