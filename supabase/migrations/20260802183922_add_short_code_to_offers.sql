alter table public.offers
  add column if not exists short_code text unique;

create index if not exists idx_offers_short_code on public.offers (short_code);
