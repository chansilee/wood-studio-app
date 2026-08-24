create policy "profiles_select_non_guest_all" on public.profiles
  for select using (public.current_role_name() is distinct from 'guest');
