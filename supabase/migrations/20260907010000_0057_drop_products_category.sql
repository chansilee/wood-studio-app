-- 產品類別 is dropped entirely — its purpose is fully covered by tags now,
-- and the owner confirmed the only two entries not already reflected in
-- tags (鹹魚柴/柯基寶貝) were test data, fine to lose.
alter table public.products drop column category;
