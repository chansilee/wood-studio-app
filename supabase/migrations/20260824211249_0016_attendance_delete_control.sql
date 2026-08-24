alter table public.org_settings
  add column allow_delete_records boolean not null default false;

drop policy "attendance_events_owner_delete" on public.attendance_events;

create policy "attendance_events_owner_delete" on public.attendance_events
  for delete using (
    public.is_owner()
    and exists (select 1 from public.org_settings where id = 1 and allow_delete_records = true)
    and (occurred_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date
  );
