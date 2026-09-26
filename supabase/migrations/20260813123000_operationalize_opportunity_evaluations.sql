-- Radar Smart Opportunity Engine - operacionalizacao.
-- Mantem opportunity_evaluations como historico de snapshots e adiciona
-- current_state + fila leve para processamento assincrono.

alter table public.opportunity_evaluations
  add column if not exists job_id uuid,
  add column if not exists normalization_status text,
  add column if not exists match_score integer,
  add column if not exists match_status text,
  add column if not exists regular_price numeric,
  add column if not exists pix_price numeric,
  add column if not exists card_price numeric,
  add column if not exists effective_price numeric,
  add column if not exists shipping_cost numeric,
  add column if not exists market_lowest_price numeric,
  add column if not exists market_average_price numeric,
  add column if not exists market_median_price numeric,
  add column if not exists marketplace_count integer,
  add column if not exists comparison_confidence text,
  add column if not exists marketplace_discount numeric,
  add column if not exists payment_attractiveness_score integer,
  add column if not exists internal_performance_score integer,
  add column if not exists affiliate_commission_score numeric,
  add column if not exists opportunity_confidence integer not null default 0,
  add column if not exists data_completeness_score integer not null default 0,
  add column if not exists blocking_reasons jsonb not null default '[]'::jsonb,
  add column if not exists score_components jsonb not null default '{}'::jsonb,
  add column if not exists engine_mode text not null default 'off',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.opportunity_current_state (
  offer_id uuid primary key references public.offers(id) on delete cascade,
  latest_evaluation_id uuid references public.opportunity_evaluations(id) on delete set null,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  title text,
  marketplace text,
  category text,
  image_url text,
  affiliate_url text,
  regular_price numeric,
  pix_price numeric,
  card_price numeric,
  effective_price numeric,
  shipping_cost numeric,
  installment_count integer,
  installment_amount numeric,
  installment_interest_free boolean,
  market_lowest_price numeric,
  market_average_price numeric,
  market_median_price numeric,
  marketplace_count integer,
  comparison_confidence text,
  marketplace_discount numeric,
  radar_real_discount numeric,
  trend_score integer,
  purchase_intent_score integer,
  payment_attractiveness_score integer,
  internal_performance_score integer,
  affiliate_commission_score numeric,
  match_score integer,
  match_status text,
  opportunity_score integer not null default 0,
  opportunity_confidence integer not null default 0,
  data_completeness_score integer not null default 0,
  classification text not null default 'WATCH',
  publishing_gate_status text not null default 'REVIEW_REQUIRED',
  reasons jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  blocking_reasons jsonb not null default '[]'::jsonb,
  score_components jsonb not null default '{}'::jsonb,
  engine_mode text not null default 'off',
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_evaluation_jobs (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  dedupe_key text not null default 'latest',
  reason text not null default 'offer_saved',
  status text not null default 'queued',
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  locked_until timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, dedupe_key)
);

create index if not exists idx_opportunity_evaluations_score
  on public.opportunity_evaluations (opportunity_score desc);
create index if not exists idx_opportunity_evaluations_confidence
  on public.opportunity_evaluations (opportunity_confidence desc);
create index if not exists idx_opportunity_evaluations_classification
  on public.opportunity_evaluations (classification);
create index if not exists idx_opportunity_evaluations_gate
  on public.opportunity_evaluations (publishing_gate_status);
create index if not exists idx_opportunity_evaluations_evaluated_at
  on public.opportunity_evaluations (evaluated_at desc);
create index if not exists idx_opportunity_evaluations_canonical
  on public.opportunity_evaluations (canonical_product_id, evaluated_at desc);

create index if not exists idx_opportunity_current_state_score
  on public.opportunity_current_state (opportunity_score desc);
create index if not exists idx_opportunity_current_state_confidence
  on public.opportunity_current_state (opportunity_confidence desc);
create index if not exists idx_opportunity_current_state_classification
  on public.opportunity_current_state (classification);
create index if not exists idx_opportunity_current_state_gate
  on public.opportunity_current_state (publishing_gate_status);
create index if not exists idx_opportunity_current_state_marketplace
  on public.opportunity_current_state (marketplace);
create index if not exists idx_opportunity_current_state_evaluated
  on public.opportunity_current_state (evaluated_at desc);

create index if not exists idx_opportunity_jobs_status_locked
  on public.opportunity_evaluation_jobs (status, locked_until, created_at);
create index if not exists idx_opportunity_jobs_offer
  on public.opportunity_evaluation_jobs (offer_id, created_at desc);

alter table public.opportunity_current_state enable row level security;
alter table public.opportunity_evaluation_jobs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'opportunity_current_state',
    'opportunity_evaluation_jobs'
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
