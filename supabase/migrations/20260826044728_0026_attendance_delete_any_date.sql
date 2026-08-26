-- Allow owner to delete attendance_events on any date (not just today), still gated by allow_delete_records
drop policy "attendance_events_owner_delete" on public.attendance_events;

create policy "attendance_events_owner_delete" on public.attendance_events
  for delete using (
    public.is_owner()
    and exists (select 1 from public.org_settings where id = 1 and allow_delete_records = true)
  );
