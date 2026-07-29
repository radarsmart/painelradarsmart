-- ============================================================
-- Radar Smart - Scrape Attempt Events (observability v1)
-- Objetivo: trilha persistida por tentativa/camada do waterfall.
-- Segurança: sem acesso anon/authenticated; escrita/leitura via service_role.
--
-- Retencao sugerida:
--   remover eventos > 30 dias em job diario (pg_cron ou cron externo),
--   por exemplo: delete from public.scrape_attempt_events
--                where created_at < now() - interval '30 days';
-- ============================================================

create table if not exists public.scrape_attempt_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  source text not null,
  source_context text not null default 'unknown',
  entity_id text null,
  offer_id uuid null,
  product_url text not null,
  marketplace text not null,
  layer text not null,
  method text not null,
  attempt integer not null default 1 check (attempt >= 1),
  status text not null check (status in ('ok', 'fail')),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  error_category text null,
  http_status integer null check (http_status between 100 and 599),
  error_message text null,
  final_outcome text null check (final_outcome in ('success', 'failed', 'partial')),
  created_at timestamptz not null default now()
);

create index if not exists idx_scrape_attempt_events_request_id
  on public.scrape_attempt_events (request_id, created_at desc);

create index if not exists idx_scrape_attempt_events_source_created
  on public.scrape_attempt_events (source, source_context, created_at desc);

create index if not exists idx_scrape_attempt_events_marketplace_created
  on public.scrape_attempt_events (marketplace, created_at desc);

create index if not exists idx_scrape_attempt_events_final_outcome_created
  on public.scrape_attempt_events (final_outcome, created_at desc);

alter table public.scrape_attempt_events enable row level security;

drop policy if exists "service_role_manage_scrape_attempt_events" on public.scrape_attempt_events;
create policy "service_role_manage_scrape_attempt_events"
  on public.scrape_attempt_events
  for all
  to service_role
  using (true)
  with check (true);
