create table if not exists public.awin_product_enrichment_cache (
  id bigserial primary key,
  cache_key text not null unique,
  advertiser_id text null,
  product_id text null,
  merchant_product_id text null,
  merchant_name text null,
  product_name text null,
  product_url text null,
  affiliate_url text null,
  is_brazil_domestic boolean not null default false,
  signal_summary text null,
  signal_confidence text null,
  signal_source text null,
  raw_payload jsonb null,
  enriched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_awin_product_enrichment_cache_expires_at
  on public.awin_product_enrichment_cache (expires_at);

create index if not exists idx_awin_product_enrichment_cache_advertiser_id
  on public.awin_product_enrichment_cache (advertiser_id);
