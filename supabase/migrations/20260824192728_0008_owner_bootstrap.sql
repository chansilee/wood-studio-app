create or replace function public.has_any_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where role = 'owner');
$$;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.default_daily_hours is distinct from old.default_daily_hours) then
    if not public.is_owner() then
      -- bootstrap escape hatch: allow a user to make themselves the first owner
      -- only when the studio has no owner yet at all
      if new.role = 'owner' and new.id = auth.uid() and not public.has_any_owner() then
        return new;
      end if;
      raise exception 'only owner can change role or default_daily_hours';
    end if;
  end if;
  return new;
end;
$$;
