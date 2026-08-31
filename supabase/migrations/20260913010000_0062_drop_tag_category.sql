-- Replaced by category_boxes (spatial containment) before this per-tag
-- dropdown ever saw real use — no data loss (0 rows had it set).
alter table public.process_nodes drop constraint process_nodes_category_tag_only;
alter table public.process_nodes drop column category;
