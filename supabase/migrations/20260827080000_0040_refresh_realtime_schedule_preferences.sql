-- The Realtime tenant appears to cache per-table replica identity/schema info
-- from when it first connected, and hadn't picked up the earlier
-- REPLICA IDENTITY FULL change (DELETE payload.old still only had `id`).
-- Dropping and re-adding the table to the publication mirrors the kind of
-- change that triggered a schema refresh (observed in realtime_logs as
-- "Found new oids") to force it to pick up the current replica identity.
alter publication supabase_realtime drop table public.schedule_preferences;
alter publication supabase_realtime add table public.schedule_preferences;
