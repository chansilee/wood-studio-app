-- Postgres grants EXECUTE to PUBLIC by default on function creation, so revoking
-- only from anon/authenticated (0007, 0011) did not actually lock these down —
-- anon/authenticated inherit through the PUBLIC grant. Revoke from PUBLIC too.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.protect_profile_privileged_fields() from public;
revoke execute on function public.prune_schedule_publications() from public;
revoke execute on function public.validate_attendance_event() from public;
