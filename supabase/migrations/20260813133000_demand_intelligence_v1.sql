-- Radar Smart Demand Intelligence v1.
-- Snapshots auditaveis de demanda, tendencia, velocidade e intencao comercial.

alter table public.opportunity_evaluation_jobs
  add column if not exists force_demand_refresh boolean not null default false;

alter table public.opportunity_evaluations
  add column if not exists trend_velocity numeric,
  add column if not exists demand_confidence_score integer,
  add column if not exists demand_provider_count integer,
  add column if not exists demand_snapshot_count integer,
  add column if not exists demand_status text,
  add column if not exists demand_query text,
  add column if not exists demand_cached boolean not null default false,
  add column if not exists demand_snapshots jsonb not null default '[]'::jsonb;

alter table public.opportunity_current_state
  add column if not exists trend_velocity numeric,
  add column if not exists demand_confidence_score integer,
  add column if not exists demand_provider_count integer,
  add column if not exists demand_snapshot_count integer,
  add column if not exists demand_status text,
  add column if not exists demand_query text,
  add column if not exists demand_cached boolean not null default false,
  add column if not exists demand_snapshots jsonb not null default '[]'::jsonb;

create table if not exists public.demand_snapshots (
  id uuid primary key default gen_random_uuid(),
  canonical_product_id uuid references public.canonical_products(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade,
  provider text not null,
  provider_type text not null,
  query text not null,
  query_intent text not null,
  interest_score integer,
  search_demand_score integer,
  marketplace_popularity_score integer,
  social_score integer,
  trend_score integer,
  trend_velocity numeric,
  purchase_intent_score integer,
  confidence integer,
  status text not null default 'available',
  captured_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_demand_snapshots_canonical_captured
  on public.demand_snapshots (canonical_product_id, captured_at desc);
create index if not exists idx_demand_snapshots_provider_query
  on public.demand_snapshots (provider, query, captured_at desc);
create index if not exists idx_demand_snapshots_offer
  on public.demand_snapshots (offer_id, captured_at desc);
create index if not exists idx_demand_snapshots_trend
  on public.demand_snapshots (trend_score desc);
create index if not exists idx_demand_snapshots_purchase_intent
  on public.demand_snapshots (purchase_intent_score desc);
create index if not exists idx_demand_snapshots_velocity
  on public.demand_snapshots (trend_velocity desc);

alter table public.demand_snapshots enable row level security;

do $$
begin
  drop policy if exists service_role_full_access on public.demand_snapshots;
  create policy service_role_full_access on public.demand_snapshots
    for all
    using ((select auth.role()) = 'service_role')
    with check ((select auth.role()) = 'service_role');

  drop policy if exists admin_full_access on public.demand_snapshots;
  create policy admin_full_access on public.demand_snapshots
    for all
    using (exists (select 1 from public.admins a where a.id = (select auth.uid())))
    with check (exists (select 1 from public.admins a where a.id = (select auth.uid())));
end
$$;
