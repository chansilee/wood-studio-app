-- 非負責人的排班系統[排班喜好]分頁: members declare 偏好上班/偏好放假 for the
-- single upcoming month currently open for preference input. Owners read all
-- rows (read-only hint overlay in 排班模式); members only ever touch their own.
create type public.schedule_preference_type as enum ('prefer_work', 'prefer_off');

create table public.schedule_preferences (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  preference public.schedule_preference_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, work_date)
);

alter table public.schedule_preferences enable row level security;

create policy "schedule_preferences_select_self" on public.schedule_preferences
  for select using (member_id = auth.uid());

create policy "schedule_preferences_select_owner" on public.schedule_preferences
  for select using (public.is_owner());

create policy "schedule_preferences_insert_self" on public.schedule_preferences
  for insert with check (member_id = auth.uid() and public.current_role_name() is distinct from 'guest');

create policy "schedule_preferences_update_self" on public.schedule_preferences
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

create policy "schedule_preferences_delete_self" on public.schedule_preferences
  for delete using (member_id = auth.uid());

-- the single month a member is currently allowed to declare/edit preferences for:
-- next month before the 25th, the month after that from the 25th onward (mirrors
-- when the owner closes next month's roster for editing)
create or replace function public.preference_editable_year_month()
returns date
language sql
stable
as $$
  select case
    when extract(day from (now() at time zone 'Asia/Taipei')) < 25
      then (date_trunc('month', (now() at time zone 'Asia/Taipei')::date) + interval '1 month')::date
    else (date_trunc('month', (now() at time zone 'Asia/Taipei')::date) + interval '2 month')::date
  end;
$$;

create or replace function public.validate_schedule_preference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wd date;
begin
  if tg_op = 'DELETE' then
    wd := old.work_date;
  else
    wd := new.work_date;
  end if;

  if date_trunc('month', wd)::date <> public.preference_editable_year_month() then
    raise exception '目前只能填寫 % 的排班喜好', to_char(public.preference_editable_year_month(), 'YYYY-MM');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_validate_schedule_preference
  before insert or update or delete on public.schedule_preferences
  for each row execute function public.validate_schedule_preference();
