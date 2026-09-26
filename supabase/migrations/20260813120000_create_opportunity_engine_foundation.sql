-- Radar Smart Opportunity Engine - foundation.
-- Idempotente e compatível com o fluxo atual: adiciona dados canônicos e
-- pagamento normalizado sem remover/renomear campos existentes.

alter table public.offers
  add column if not exists canonical_product_id uuid,
  add column if not exists regular_price numeric,
  add column if not exists cash_price numeric,
  add column if not exists pix_price numeric,
  add column if not exists card_price numeric,
  add column if not exists installment_total_price numeric,
  add column if not exists shipping_cost numeric,
  add column if not exists coupon_discount numeric,
  add column if not exists automatic_discount numeric,
  add column if not exists cashback numeric,
  add column if not exists effective_price numeric,
  add column if not exists unit_price numeric,
  add column if not exists unit_price_basis text,
  add column if not exists payment_information_original text,
  add column if not exists match_score integer,
  add column if not exists match_status text,
  add column if not exists opportunity_score integer,
  add column if not exists opportunity_classification text,
  add column if not exists publishing_gate_status text,
  add column if not exists opportunity_reasons jsonb not null default '[]'::jsonb,
  add column if not exists opportunity_warnings jsonb not null default '[]'::jsonb;

create table if not exists public.raw_products (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  marketplace text,
  external_product_id text,
  external_seller_id text,
  title_original text not null,
  description_original text,
  url text,
  affiliate_url text,
  image_url text,
  brand_original text,
  model_original text,
  ean_original text,
  sku_original text,
  price_original numeric,
  old_price_original numeric,
  shipping_original jsonb,
  payment_information_original text,
  seller text,
  rating numeric,
  review_count integer,
  sales_count integer,
  stock_status text,
  captured_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.canonical_products (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  brand text,
  model text,
  ean text,
  gtin text,
  mpn text,
  category text not null default 'general',
  attributes_json jsonb not null default '{}'::jsonb,
  canonical_key text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_key)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'offers_canonical_product_id_fkey'
  ) then
    alter table public.offers
      add constraint offers_canonical_product_id_fkey
      foreign key (canonical_product_id)
      references public.canonical_products(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.product_offer_matches (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid references public.canonical_products(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  raw_product_id uuid references public.raw_products(id) on delete set null,
  match_score integer not null default 0,
  match_status text not null default 'REVIEW_REQUIRED',
  match_reasons jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, canonical_product_id)
);

create table if not exists public.opportunity_evaluations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  trend_score integer,
  purchase_intent_score integer,
  market_price_advantage numeric,
  radar_real_discount numeric,
  sales_popularity integer,
  payment_attractiveness integer,
  internal_performance integer,
  affiliate_commission numeric,
  opportunity_score integer not null default 0,
  classification text not null,
  publishing_gate_status text not null default 'REVIEW_REQUIRED',
  reasons jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.offer_price_history (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  marketplace text,
  seller text,
  price numeric,
  original_price numeric,
  regular_price numeric,
  pix_price numeric,
  card_price numeric,
  effective_price numeric,
  shipping_cost numeric,
  currency text not null default 'BRL',
  source text,
  captured_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb
);

alter table public.offer_price_history
  add column if not exists canonical_product_id uuid references public.canonical_products(id) on delete set null,
  add column if not exists marketplace text,
  add column if not exists seller text,
  add column if not exists regular_price numeric,
  add column if not exists pix_price numeric,
  add column if not exists card_price numeric,
  add column if not exists effective_price numeric,
  add column if not exists shipping_cost numeric,
  add column if not exists raw_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_raw_products_marketplace_external
  on public.raw_products (marketplace, external_product_id);
create index if not exists idx_raw_products_captured_at
  on public.raw_products (captured_at desc);
create index if not exists idx_canonical_products_ean
  on public.canonical_products (ean);
create index if not exists idx_canonical_products_brand_model
  on public.canonical_products (brand, model);
create index if not exists idx_canonical_products_category
  on public.canonical_products (category);
create index if not exists idx_offers_canonical_product_id
  on public.offers (canonical_product_id);
create index if not exists idx_offers_opportunity_score
  on public.offers (opportunity_score desc);
create index if not exists idx_product_offer_matches_offer
  on public.product_offer_matches (offer_id);
create index if not exists idx_product_offer_matches_canonical
  on public.product_offer_matches (canonical_product_id, match_score desc);
create index if not exists idx_opportunity_evaluations_offer
  on public.opportunity_evaluations (offer_id, evaluated_at desc);
create index if not exists idx_offer_price_history_offer_captured
  on public.offer_price_history (offer_id, captured_at desc);
create index if not exists idx_offer_price_history_canonical_captured
  on public.offer_price_history (canonical_product_id, captured_at desc);

alter table public.raw_products enable row level security;
alter table public.canonical_products enable row level security;
alter table public.product_offer_matches enable row level security;
alter table public.opportunity_evaluations enable row level security;
alter table public.offer_price_history enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'raw_products',
    'canonical_products',
    'product_offer_matches',
    'opportunity_evaluations',
    'offer_price_history'
  ]
  loop
    execute format('drop policy if exists service_role_full_access on public.%I', table_name);
    execute format(
      'create policy service_role_full_access on public.%I for all using ((select auth.role()) = ''service_role'') with check ((select auth.role()) = ''service_role'')',
      table_name
    );

    execute format('drop policy if exists admin_full_access on public.%I', table_name);
    execute format(
      'create policy admin_full_access on public.%I for all using (exists (select 1 from public.admins a where a.id = (select auth.uid()))) with check (exists (select 1 from public.admins a where a.id = (select auth.uid())))',
      table_name
    );
  end loop;
end
$$;
