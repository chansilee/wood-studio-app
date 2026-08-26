alter table public.org_settings
  add column block_past_scheduling boolean not null default true,
  add column remind_month_end_publish boolean not null default true;

alter table public.profiles
  add column must_publish_schedule boolean not null default false;

update public.profiles set must_publish_schedule = (role = 'staff');

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
  ) then
    if not public.is_owner() then
      if not (new.role = 'owner' and new.id = auth.uid() and not public.has_any_owner()) then
        raise exception 'only owner can change role, default_daily_hours, hire_date, weekly_rest_check_enabled, or must_publish_schedule';
      end if;
    end if;
  end if;

  if new.role is distinct from old.role then
    new.weekly_rest_check_enabled := (new.role = 'staff');
    new.must_publish_schedule := (new.role = 'staff');
  end if;

  return new;
end;
$$;
