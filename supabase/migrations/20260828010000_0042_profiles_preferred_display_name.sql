-- Owner-set display name override: the account's own "顯示名稱" (display_name)
-- is self-chosen at signup/whim, but the owner needs to see each member's real
-- name everywhere (their own name too, so it stays consistent site-wide) —
-- preferred_display_name, when set, takes priority. Only the owner may set it,
-- via the same privileged-fields trigger used for role/hire_date/etc.
alter table public.profiles add column preferred_display_name text;

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
  ) then
    if not public.is_owner() then
      if not (new.role = 'owner' and new.id = auth.uid() and not public.has_any_owner()) then
        raise exception 'only owner can change role, default_daily_hours, hire_date, weekly_rest_check_enabled, must_publish_schedule, must_calculate_settlement, or preferred_display_name';
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
