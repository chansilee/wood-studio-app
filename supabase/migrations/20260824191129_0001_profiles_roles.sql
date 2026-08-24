create type public.member_role as enum ('owner', 'staff', 'apprentice', 'guest');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.member_role not null default 'guest',
  default_daily_hours numeric(4,2) not null default 6,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_owner()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.current_role_name()
returns public.member_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.default_daily_hours is distinct from old.default_daily_hours) then
    if not public.is_owner() then
      raise exception 'only owner can change role or default_daily_hours';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_protect_profile_privileged_fields
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_fields();

create policy "profiles_select_self" on public.profiles
  for select using (id = auth.uid());

create policy "profiles_select_owner_all" on public.profiles
  for select using (public.is_owner());

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid());

create policy "profiles_update_owner_all" on public.profiles
  for update using (public.is_owner());

create table public.org_settings (
  id smallint primary key default 1 check (id = 1),
  company_lat double precision,
  company_lng double precision,
  geofence_radius_m integer not null default 200,
  lunch_start time,
  lunch_end time,
  dinner_start time,
  dinner_end time,
  updated_at timestamptz not null default now()
);

insert into public.org_settings (id) values (1);

alter table public.org_settings enable row level security;

create policy "org_settings_select_non_guest" on public.org_settings
  for select using (public.current_role_name() is distinct from 'guest');

create policy "org_settings_update_owner" on public.org_settings
  for update using (public.is_owner());
