-- ============================================================
-- Radar Smart - Scrape Observability Queries
-- Tabela base: public.scrape_attempt_events
-- Uso: cole no Supabase SQL Editor e rode query por query.
-- Janela padrao: ultimas 24 horas (ajuste em params.window_interval).
-- ============================================================

-- ------------------------------------------------------------------
-- [ESSENCIAL 1] Taxa de sucesso por source + marketplace (24h)
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
),
final_events as (
  select request_id, source, marketplace, final_outcome
  from public.scrape_attempt_events
  where method = 'final_outcome'
    and created_at >= now() - (select window_interval from params)
)
select
  source,
  marketplace,
  count(*) as total_requests,
  count(*) filter (where final_outcome = 'success') as success_requests,
  round(
    100.0 * count(*) filter (where final_outcome = 'success')
    / nullif(count(*), 0),
    2
  ) as success_rate_pct
from final_events
group by source, marketplace
order by success_rate_pct desc nulls last, total_requests desc;

-- ------------------------------------------------------------------
-- [ESSENCIAL 2] Taxa de sucesso por method (tentativas)
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
),
attempt_events as (
  select method, status
  from public.scrape_attempt_events
  where method <> 'final_outcome'
    and created_at >= now() - (select window_interval from params)
)
select
  method,
  count(*) as total_attempts,
  count(*) filter (where status = 'ok') as success_attempts,
  round(
    100.0 * count(*) filter (where status = 'ok')
    / nullif(count(*), 0),
    2
  ) as success_rate_pct
from attempt_events
group by method
order by success_rate_pct desc nulls last, total_attempts desc;

-- ------------------------------------------------------------------
-- [ESSENCIAL 3] Top error_category (24h)
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
)
select
  coalesce(error_category, 'unknown') as error_category,
  count(*) as failures
from public.scrape_attempt_events
where status = 'fail'
  and method <> 'final_outcome'
  and created_at >= now() - (select window_interval from params)
group by coalesce(error_category, 'unknown')
order by failures desc;

-- ------------------------------------------------------------------
-- [ESSENCIAL 4] p95 duration_ms por method
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
)
select
  method,
  count(*) as samples,
  round(avg(duration_ms)::numeric, 2) as avg_duration_ms,
  percentile_cont(0.95) within group (order by duration_ms) as p95_duration_ms
from public.scrape_attempt_events
where method <> 'final_outcome'
  and created_at >= now() - (select window_interval from params)
group by method
order by p95_duration_ms desc nulls last;

-- ------------------------------------------------------------------
-- [ESSENCIAL 5] Profundidade media de fallback por source
-- depth = maior attempt por request_id (exclui final_outcome)
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
),
per_request_depth as (
  select
    request_id,
    source,
    max(attempt) as fallback_depth
  from public.scrape_attempt_events
  where method <> 'final_outcome'
    and created_at >= now() - (select window_interval from params)
  group by request_id, source
)
select
  source,
  count(*) as requests,
  round(avg(fallback_depth)::numeric, 2) as avg_fallback_depth,
  max(fallback_depth) as max_fallback_depth
from per_request_depth
group by source
order by avg_fallback_depth desc;

-- ------------------------------------------------------------------
-- [ESSENCIAL 6] Requests failed mais recentes
-- ------------------------------------------------------------------
select
  request_id,
  source,
  source_context,
  marketplace,
  product_url,
  duration_ms as total_duration_ms,
  created_at
from public.scrape_attempt_events
where method = 'final_outcome'
  and final_outcome = 'failed'
order by created_at desc
limit 50;

-- ------------------------------------------------------------------
-- [ESSENCIAL 7] Detalhamento completo por request_id
-- Troque o valor abaixo pelo request_id desejado.
-- ------------------------------------------------------------------
select
  request_id,
  source,
  source_context,
  marketplace,
  product_url,
  layer,
  method,
  attempt,
  status,
  duration_ms,
  error_category,
  http_status,
  final_outcome,
  created_at
from public.scrape_attempt_events
where request_id = '00000000-0000-0000-0000-000000000000'
order by created_at asc;

-- ============================================================
-- DIAGNOSTICO MERCADO LIVRE (ML)
-- ============================================================

-- ------------------------------------------------------------------
-- [ML 1] Percentual de requests ML resolvidos em html_cheerio
-- (sucesso final e html_cheerio com status ok)
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
),
ml_final as (
  select request_id, final_outcome
  from public.scrape_attempt_events
  where source = 'mercadolivre'
    and method = 'final_outcome'
    and created_at >= now() - (select window_interval from params)
),
ml_html_success as (
  select distinct request_id
  from public.scrape_attempt_events
  where source = 'mercadolivre'
    and method = 'html_cheerio'
    and status = 'ok'
    and created_at >= now() - (select window_interval from params)
)
select
  count(*) as total_ml_requests,
  count(*) filter (
    where final_outcome = 'success'
      and request_id in (select request_id from ml_html_success)
  ) as solved_by_html_cheerio,
  round(
    100.0 * count(*) filter (
      where final_outcome = 'success'
        and request_id in (select request_id from ml_html_success)
    ) / nullif(count(*), 0),
    2
  ) as solved_by_html_cheerio_pct
from ml_final;

-- ------------------------------------------------------------------
-- [ML 2] Percentual de ML com falha 403 em ml_api_official
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
),
ml_requests as (
  select distinct request_id
  from public.scrape_attempt_events
  where source = 'mercadolivre'
    and method = 'final_outcome'
    and created_at >= now() - (select window_interval from params)
),
ml_api_403 as (
  select distinct request_id
  from public.scrape_attempt_events
  where source = 'mercadolivre'
    and method = 'ml_api_official'
    and status = 'fail'
    and (http_status = 403 or error_category = 'http_403')
    and created_at >= now() - (select window_interval from params)
)
select
  (select count(*) from ml_requests) as total_ml_requests,
  (select count(*) from ml_api_403) as requests_with_ml_api_403,
  round(
    100.0 * (select count(*) from ml_api_403)
    / nullif((select count(*) from ml_requests), 0),
    2
  ) as ml_api_403_pct;

-- ------------------------------------------------------------------
-- [ML 3] Comparacao ml_api_official vs html_cheerio por sucesso
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
),
ml_attempts as (
  select method, status
  from public.scrape_attempt_events
  where source = 'mercadolivre'
    and method in ('ml_api_official', 'html_cheerio')
    and created_at >= now() - (select window_interval from params)
)
select
  method,
  count(*) as total_attempts,
  count(*) filter (where status = 'ok') as success_attempts,
  round(
    100.0 * count(*) filter (where status = 'ok')
    / nullif(count(*), 0),
    2
  ) as success_rate_pct
from ml_attempts
group by method
order by method;

-- ------------------------------------------------------------------
-- [ML 4] Distribuicao de falhas ML por categoria
-- ------------------------------------------------------------------
with params as (
  select interval '24 hours' as window_interval
)
select
  coalesce(error_category, 'unknown') as error_category,
  count(*) as failures
from public.scrape_attempt_events
where source = 'mercadolivre'
  and status = 'fail'
  and method <> 'final_outcome'
  and created_at >= now() - (select window_interval from params)
group by coalesce(error_category, 'unknown')
order by failures desc;
