-- Default replica identity only includes the primary key in a DELETE's
-- realtime payload, so OwnerScheduleEditor's schedule_preferences DELETE
-- handler (keyed on work_date) was silently no-op'ing — "這天我隨意" never
-- cleared the hint border for the owner in real time. Full identity puts
-- every column (work_date, preference, member_id) on the old row.
alter table public.schedule_preferences replica identity full;
