-- Defense-in-depth for the UI change: block changing role away from 'owner'
-- when it's the only owner account left in the system, so the owner can't
-- accidentally lock themselves (and everyone else) out of management. This
-- guards the API directly, not just the disabled <select> in 成員管理.
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
    or new.preferred_display_name is distinct from old.preferred_display_name
    or new.pure_management is distinct from old.pure_management
  ) then
    if not public.is_owner() then
      if not (new.role = 'owner' and new.id = auth.uid() and not public.has_any_owner()) then
        raise exception 'only owner can change role, default_daily_hours, hire_date, weekly_rest_check_enabled, must_publish_schedule, must_calculate_settlement, preferred_display_name, or pure_management';
      end if;
    end if;
  end if;

  if old.role = 'owner' and new.role is distinct from 'owner' then
    if (select count(*) from public.profiles where role = 'owner') <= 1 then
      raise exception '系統至少需要一位負責人，無法將唯一的負責人變更身分';
    end if;
  end if;

  if new.role is distinct from old.role then
    new.weekly_rest_check_enabled := (new.role = 'staff');
    new.must_publish_schedule := (new.role = 'staff');
    new.must_calculate_settlement := (new.role = 'staff');
  end if;

  if new.role is distinct from 'owner' then
    new.pure_management := false;
  end if;

  return new;
end;
$$;
