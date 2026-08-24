create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

alter table public.leave_types enable row level security;

create policy "leave_types_select_non_guest" on public.leave_types
  for select using (public.current_role_name() is distinct from 'guest');

create policy "leave_types_owner_write" on public.leave_types
  for all using (public.is_owner()) with check (public.is_owner());

insert into public.leave_types (name) values ('事假'), ('病假'), ('婚假'), ('喪假'), ('公出'), ('曠職');

alter table public.leave_requests drop column leave_type;
drop type public.leave_type;

alter table public.leave_requests
  add column leave_type_id uuid not null references public.leave_types(id);

alter table public.leave_requests
  add constraint leave_requests_member_date_unique unique (member_id, leave_date);

create or replace function public.validate_leave_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  shift_status_val public.shift_status;
begin
  select status into shift_status_val from public.schedules
    where member_id = new.member_id and work_date = new.leave_date;

  if shift_status_val is distinct from 'normal' then
    raise exception '只能針對「正常班」的日期申請假別';
  end if;

  if new.duration_type = 'partial' and (new.hours is null or new.hours <= 0) then
    raise exception '部分時數請假必須填寫時數';
  end if;

  return new;
end;
$$;

create trigger trg_validate_leave_request
  before insert on public.leave_requests
  for each row execute function public.validate_leave_request();

revoke execute on function public.validate_leave_request() from public;
