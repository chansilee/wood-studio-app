alter table public.org_settings
  add column geofence_disabled boolean not null default false;

update public.org_settings set geofence_radius_m = 100 where id = 1;
alter table public.org_settings alter column geofence_radius_m set default 100;

alter table public.attendance_events alter column is_within_geofence set default false;
