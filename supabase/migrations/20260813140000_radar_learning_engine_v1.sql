-- Radar Smart Learning Engine v1.
-- Eventos internos, agregacao diaria e segmentos historicos por audiencia real.

alter table public.opportunity_evaluations
  add column if not exists internal_performance_confidence integer,
  add column if not exists internal_performance_base jsonb not null default '{}'::jsonb,
  add column if not exists historical_segment_score integer,
  add column if not exists historical_segment_confidence integer,
  add column if not exists performance_segment_key text,
  add column if not exists performance_status text;

alter table public.opportunity_current_state
  add column if not exists internal_performance_confidence integer,
  add column if not exists internal_performance_base jsonb not null default '{}'::jsonb,
  add column if not exists historical_segment_score integer,
  add column if not exists historical_segment_confidence integer,
  add column if not exists performance_segment_key text,
  add column if not exists performance_status text;

alter table public.opportunity_evaluation_jobs
  add column if not exists force_learning_refresh boolean not null default false;

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.offers(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  publication_id text,
  campaign_id text,
  event_type text not null,
  channel text,
  source text,
  session_id text,
  quantity integer,
  revenue numeric,
  commission numeric,
  currency text not null default 'BRL',
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  referrer text,
  created_at timestamptz not null default now()
);

create table if not exists public.offer_performance_daily (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  canonical_product_id uuid references public.canonical_products(id) on delete set null,
  performance_date date not null,
  channel text not null default 'all',
  marketplace text,
  publication_id text,
  campaign_id text,
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
  internal_performance_score integer,
  internal_performance_confidence integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (offer_id, performance_date, channel)
);

create table if not exists public.performance_segments (
  segment_key text primary key,
  segment_level text not null,
  category text not null,
  marketplace text,
  channel text,
  price_range text not null,
  discount_range text not null,
  payment_profile text not null,
  hour_bucket text,
  day_of_week integer,
  performance_score integer,
  confidence integer not null default 0,
  sample_impressions integer,
  sample_clicks integer,
  sample_orders integer,
  sample_revenue numeric,
  sample_commission numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_offer_created
  on public.analytics_events (offer_id, created_at desc);
create index if not exists idx_analytics_events_canonical_created
  on public.analytics_events (canonical_product_id, created_at desc);
create index if not exists idx_analytics_events_type_channel
  on public.analytics_events (event_type, channel, created_at desc);
create index if not exists idx_analytics_events_campaign
  on public.analytics_events (campaign_id, created_at desc);

create index if not exists idx_offer_performance_daily_canonical
  on public.offer_performance_daily (canonical_product_id, performance_date desc);
create index if not exists idx_offer_performance_daily_channel
  on public.offer_performance_daily (channel, performance_date desc);
create index if not exists idx_offer_performance_daily_score
  on public.offer_performance_daily (internal_performance_score desc);

create index if not exists idx_performance_segments_category
  on public.performance_segments (category, confidence desc);
create index if not exists idx_performance_segments_marketplace_channel
  on public.performance_segments (marketplace, channel, confidence desc);
create index if not exists idx_performance_segments_score
  on public.performance_segments (performance_score desc);

alter table public.analytics_events enable row level security;
alter table public.offer_performance_daily enable row level security;
alter table public.performance_segments enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'analytics_events',
    'offer_performance_daily',
    'performance_segments'
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

  drop policy if exists anon_insert_analytics_events on public.analytics_events;
  create policy anon_insert_analytics_events
    on public.analytics_events
    for insert
    to anon
    with check (
      event_type in ('impression', 'view', 'click', 'affiliate_click', 'order', 'purchase', 'conversion')
    );
end
$$;
