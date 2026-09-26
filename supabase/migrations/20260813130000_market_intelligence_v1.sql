-- Radar Smart Market Intelligence v1.
-- Evidencias auditaveis de precos externos + cache curto para providers.

alter table public.opportunity_evaluation_jobs
  add column if not exists force_market_refresh boolean not null default false;

alter table public.opportunity_evaluations
  add column if not exists market_lowest_pix_price numeric,
  add column if not exists market_lowest_card_price numeric,
  add column if not exists market_lowest_effective_price numeric,
  add column if not exists market_valid_offer_count integer,
  add column if not exists market_outlier_count integer,
  add column if not exists market_confidence_score integer,
  add column if not exists market_evidence jsonb not null default '[]'::jsonb,
  add column if not exists market_search_status text,
  add column if not exists market_search_query text,
  add column if not exists market_search_cached boolean not null default false;

alter table public.opportunity_current_state
  add column if not exists market_lowest_pix_price numeric,
  add column if not exists market_lowest_card_price numeric,
  add column if not exists market_lowest_effective_price numeric,
  add column if not exists market_valid_offer_count integer,
  add column if not exists market_outlier_count integer,
  add column if not exists market_confidence_score integer,
  add column if not exists market_evidence jsonb not null default '[]'::jsonb,
  add column if not exists market_search_status text,
  add column if not exists market_search_query text,
  add column if not exists market_search_cached boolean not null default false;

create table if not exists public.external_market_search_cache (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid references public.canonical_products(id) on delete cascade,
  canonical_key text not null,
  provider text not null,
  query text not null,
  query_strategy text not null,
  query_hash text not null unique,
  status text not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null,
  result_count integer not null default 0,
  error text,
  raw_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.external_market_evidence (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid references public.canonical_products(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  search_cache_id uuid references public.external_market_search_cache(id) on delete set null,
  provider text not null,
  source text not null,
  marketplace text,
  seller text,
  external_product_id text,
  title text not null,
  url text,
  image_url text,
  regular_price numeric,
  pix_price numeric,
  card_price numeric,
  installments integer,
  installment_value numeric,
  interest_free boolean,
  shipping_cost numeric,
  effective_price numeric,
  currency text not null default 'BRL',
  match_score integer not null default 0,
  match_status text not null default 'REVIEW_REQUIRED',
  match_reasons jsonb not null default '[]'::jsonb,
  conflicts jsonb not null default '[]'::jsonb,
  included_in_comparison boolean not null default false,
  excluded_reason text,
  is_price_outlier boolean not null default false,
  captured_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_external_market_cache_hash
  on public.external_market_search_cache (query_hash);
create index if not exists idx_external_market_cache_canonical
  on public.external_market_search_cache (canonical_product_id, expires_at desc);
create index if not exists idx_external_market_cache_expires
  on public.external_market_search_cache (expires_at);

create index if not exists idx_external_market_evidence_canonical
  on public.external_market_evidence (canonical_product_id, captured_at desc);
create index if not exists idx_external_market_evidence_offer
  on public.external_market_evidence (offer_id, captured_at desc);
create index if not exists idx_external_market_evidence_cache
  on public.external_market_evidence (search_cache_id);
create index if not exists idx_external_market_evidence_included
  on public.external_market_evidence (canonical_product_id, included_in_comparison, captured_at desc);
create index if not exists idx_external_market_evidence_marketplace
  on public.external_market_evidence (marketplace);

alter table public.external_market_search_cache enable row level security;
alter table public.external_market_evidence enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'external_market_search_cache',
    'external_market_evidence'
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
