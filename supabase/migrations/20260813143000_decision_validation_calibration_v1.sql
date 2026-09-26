-- Radar Smart Decision Validation & Calibration v1.
-- Audita decisoes do Opportunity Engine e compara predicao contra resultado real.

alter table public.opportunity_evaluations
  add column if not exists decision_expected_value numeric,
  add column if not exists decision_snapshot_id uuid,
  add column if not exists decision_validation_status text;

alter table public.opportunity_current_state
  add column if not exists decision_expected_value numeric,
  add column if not exists latest_decision_snapshot_id uuid,
  add column if not exists decision_validation_status text;

create table if not exists public.decision_snapshots (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid not null references public.opportunity_evaluations(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  opportunity_score integer not null,
  opportunity_confidence integer not null,
  classification text not null,
  publishing_gate_status text,
  engine_mode text not null default 'shadow',
  recommended_action text not null,
  expected_value numeric,
  expected_value_components jsonb not null default '{}'::jsonb,
  score_bucket text not null,
  confidence_bucket text not null,
  category text,
  marketplace text,
  channel text,
  published_at timestamptz,
  snapshot_payload jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (evaluation_id)
);

create table if not exists public.decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  decision_snapshot_id uuid not null references public.decision_snapshots(id) on delete cascade,
  evaluation_id uuid references public.opportunity_evaluations(id) on delete cascade,
  offer_id uuid not null references public.offers(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  evaluation_window text not null,
  window_started_at timestamptz not null,
  window_ended_at timestamptz not null,
  channel text not null default 'all',
  category text,
  marketplace text,
  impressions integer,
  views integer,
  clicks integer,
  affiliate_clicks integer,
  orders integer,
  units_sold integer,
  revenue numeric,
  commission numeric,
  ctr numeric,
  conversion_rate numeric,
  earnings_per_click numeric,
  revenue_per_click numeric,
  actual_value_score integer,
  expected_value numeric,
  prediction_score integer,
  prediction_confidence integer,
  prediction_bucket text,
  confidence_bucket text,
  outcome_status text not null default 'pending',
  prediction_result text,
  hit boolean,
  sample_confidence integer not null default 0,
  metrics_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_snapshot_id, evaluation_window, channel)
);

create table if not exists public.decision_calibration_runs (
  id uuid primary key default gen_random_uuid(),
  period_start timestamptz not null,
  period_end timestamptz not null,
  windows jsonb not null default '[]'::jsonb,
  score_bucket_accuracy jsonb not null default '[]'::jsonb,
  confidence_bucket_accuracy jsonb not null default '[]'::jsonb,
  channel_performance jsonb not null default '[]'::jsonb,
  category_performance jsonb not null default '[]'::jsonb,
  category_channel_performance jsonb not null default '[]'::jsonb,
  threshold_recommendations jsonb not null default '[]'::jsonb,
  expected_vs_actual jsonb not null default '{}'::jsonb,
  sample_size integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_decision_snapshots_offer_created
  on public.decision_snapshots (offer_id, created_at desc);
create index if not exists idx_decision_snapshots_score_confidence
  on public.decision_snapshots (score_bucket, confidence_bucket, created_at desc);
create index if not exists idx_decision_snapshots_category_channel
  on public.decision_snapshots (category, channel, created_at desc);

create index if not exists idx_decision_outcomes_snapshot_window
  on public.decision_outcomes (decision_snapshot_id, evaluation_window);
create index if not exists idx_decision_outcomes_bucket
  on public.decision_outcomes (prediction_bucket, confidence_bucket, evaluation_window);
create index if not exists idx_decision_outcomes_channel
  on public.decision_outcomes (channel, evaluation_window, updated_at desc);
create index if not exists idx_decision_outcomes_category_channel
  on public.decision_outcomes (category, channel, evaluation_window);

create index if not exists idx_decision_calibration_runs_created
  on public.decision_calibration_runs (created_at desc);

alter table public.decision_snapshots enable row level security;
alter table public.decision_outcomes enable row level security;
alter table public.decision_calibration_runs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'decision_snapshots',
    'decision_outcomes',
    'decision_calibration_runs'
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
