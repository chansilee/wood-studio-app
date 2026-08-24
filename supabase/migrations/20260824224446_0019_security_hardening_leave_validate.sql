-- Supabase's default privileges grant EXECUTE directly to anon/authenticated on new
-- functions in the public schema, independent of the PUBLIC pseudo-role grant. Revoking
-- from `public` alone (as prior hardening migrations assumed) is not sufficient — revoke
-- from all three explicitly.
revoke execute on function public.validate_leave_request() from anon, authenticated, public;
