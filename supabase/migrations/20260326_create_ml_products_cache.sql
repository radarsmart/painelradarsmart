create table if not exists public.ml_products_cache (
  id text primary key,
  title text,
  price numeric,
  thumbnail text,
  permalink text,
  category_id text,
  sold_quantity int,
  updated_at timestamptz default now()
);

create index if not exists ml_products_cache_updated_at_idx
  on public.ml_products_cache (updated_at desc);

create index if not exists ml_products_cache_category_id_idx
  on public.ml_products_cache (category_id);
