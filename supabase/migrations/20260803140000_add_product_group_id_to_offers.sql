alter table public.offers
  add column if not exists product_group_id uuid;

create index if not exists idx_offers_product_group_id on public.offers (product_group_id);
