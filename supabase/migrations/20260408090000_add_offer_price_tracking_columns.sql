alter table if exists public.offers
  add column if not exists price_updated_at timestamptz;

alter table if exists public.offers
  add column if not exists price_previous numeric;

alter table if exists public.offers
  add column if not exists price_trend text;
