-- 基礎價格: a history of prices that take effect on a given date, mirroring
-- member_wage_rates' pattern (always anchored at product creation for the
-- first row, so a product's current price is never a dead lookup).
create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  effective_date date not null,
  price numeric(10,2) not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint product_prices_price_non_negative check (price >= 0),
  unique (product_id, effective_date)
);

alter table public.product_prices enable row level security;
create policy "product_prices_select_non_guest" on public.product_prices for select using (current_role_name() is distinct from 'guest');
create policy "product_prices_owner_write" on public.product_prices for all using (is_owner()) with check (is_owner());

create or replace function public.validate_product_price()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  created date;
begin
  select created_at::date into created from public.products where id = new.product_id;
  if created is null then
    raise exception 'product not found';
  end if;
  if new.effective_date < created then
    raise exception '生效日不可早於產品建立日期';
  end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end;
$$;

create trigger trg_validate_product_price
  before insert or update on public.product_prices
  for each row execute function public.validate_product_price();

-- the price actually in effect "as of the database's own clock" — computed
-- server-side so search/folder matching agrees for every viewer regardless
-- of their browser's local time or timezone
create view public.current_product_prices
with (security_invoker = true)
as
select distinct on (product_id) product_id, price, effective_date
from public.product_prices
where effective_date <= current_date
order by product_id, effective_date desc;
