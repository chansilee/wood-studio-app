-- 成員管理[$]: per-member 約定月薪表, a history of hourly wage rates that take
-- effect on a given month's 1st. Always anchored at 到職日 for the first row.
create table public.member_wage_rates (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles(id) on delete cascade,
  effective_date date not null,
  hourly_wage numeric(8,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint member_wage_rates_effective_date_first_of_month check (extract(day from effective_date) = 1),
  constraint member_wage_rates_hourly_wage_positive check (hourly_wage > 0),
  unique (member_id, effective_date)
);

alter table public.member_wage_rates enable row level security;

create policy "member_wage_rates_owner_all" on public.member_wage_rates
  for all using (public.is_owner()) with check (public.is_owner());

create or replace function public.validate_member_wage_rate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hire date;
begin
  select hire_date into hire from public.profiles where id = new.member_id;
  if hire is null then
    raise exception '該成員尚未設定到職日，無法建立約定月薪表';
  end if;
  if new.effective_date < hire then
    raise exception '生效日不可早於到職日';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger trg_validate_member_wage_rate
  before insert or update on public.member_wage_rates
  for each row execute function public.validate_member_wage_rate();
