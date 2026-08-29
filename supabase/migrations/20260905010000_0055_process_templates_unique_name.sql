-- Template names must be unique so the owner can tell them apart, and so
-- copy-naming ("X - 複製", "X - 複製 (2)"...) has a reliable collision check
-- to defer to at the DB level too, not just the client-side pre-check.
alter table public.process_templates add constraint process_templates_name_unique unique (name);
