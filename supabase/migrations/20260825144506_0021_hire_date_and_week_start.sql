alter table public.profiles
  add column hire_date date,
  add column weekly_rest_check_enabled boolean not null default true;

update public.profiles set weekly_rest_check_enabled = (role = 'staff');

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
  ) then
    if not public.is_owner() then
      if not (new.role = 'owner' and new.id = auth.uid() and not public.has_any_owner()) then
        raise exception 'only owner can change role, default_daily_hours, hire_date, or weekly_rest_check_enabled';
      end if;
    end if;
  end if;

  if new.role is distinct from old.role then
    new.weekly_rest_check_enabled := (new.role = 'staff');
  end if;

  return new;
end;
$$;

create table public.member_week_start_overrides (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  year_month date not null,
  week_start_weekday smallint not null check (week_start_weekday between 0 and 6),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  unique (member_id, year_month)
);

alter table public.member_week_start_overrides enable row level security;

create policy "week_start_select_self" on public.member_week_start_overrides
  for select using (member_id = auth.uid());

create policy "week_start_select_owner_all" on public.member_week_start_overrides
  for select using (public.is_owner());

create policy "week_start_owner_write" on public.member_week_start_overrides
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.validate_schedule_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hire date;
begin
  select hire_date into hire from public.profiles where id = new.member_id;
  if hire is not null and new.work_date < hire then
    raise exception '到職日（%）之前的日期無法排班', hire;
  end if;
  return new;
end;
$$;

create trigger trg_validate_schedule_entry
  before insert or update on public.schedules
  for each row execute function public.validate_schedule_entry();

revoke execute on function public.validate_schedule_entry() from anon, authenticated, public;
