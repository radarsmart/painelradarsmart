alter table if exists public.awin_product_enrichment_cache
  add column if not exists is_free_shipping boolean not null default false,
  add column if not exists shipping_summary text null,
  add column if not exists shipping_confidence text null,
  add column if not exists shipping_source text null;
