-- Same fix as schedule_preferences: schedules' primary key is `id`, so a
-- DELETE's realtime payload.old only carried `id` under the default replica
-- identity, even after fixing the payload.new/payload.old branching bug in
-- OwnerScheduleEditor's DELETE handler (it needs work_date to find the cell).
alter table public.schedules replica identity full;
