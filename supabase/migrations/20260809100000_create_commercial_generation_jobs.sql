-- Radar Creative AI - Commercial Generation Runner V1 / Job Persistence
--
-- Transforma runCommercialGeneration() (funcao pura em memoria) numa
-- entidade persistente e consultavel. Nesta fase so mode='DRY_RUN' e
-- aceito pela API (ver app/api/admin/creative-ai/commercial-jobs) -
-- EXECUTE continua bloqueado no codigo, esta tabela ja aceita o valor
-- para nao exigir migration nova quando EXECUTE for habilitado.
--
-- Detalhe por cena/asset/audio fica em runner_result/traceability (jsonb)
-- nesta V1 - tabelas normalizadas (commercial_job_scenes etc.) so se
-- provarem necessarias depois que o contrato estabilizar.

create table if not exists public.commercial_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.creative_campaigns(id) on delete cascade,
  offer_id uuid null references public.offers(id) on delete set null,

  mode text not null
    check (mode in ('DRY_RUN', 'EXECUTE')),

  status text not null default 'CREATED'
    check (status in (
      'CREATED', 'PREPARING', 'GENERATING_SCENES', 'RESOLVING_ASSETS',
      'BUILDING_NARRATION', 'GENERATING_NARRATION', 'COMPOSING_VIDEO',
      'MIXING_AUDIO', 'FINALIZING', 'COMPLETED', 'BLOCKED', 'FAILED'
    )),

  current_stage text null,
  progress_percent integer not null default 0
    check (progress_percent >= 0 and progress_percent <= 100),

  started_at timestamptz null,
  completed_at timestamptz null,
  failed_at timestamptz null,

  estimated_video_credits integer null,
  estimated_tts_credits integer null,

  -- Soma so dos componentes com custo REAL conhecido (ver
  -- CostPreview.videoCurrencyCostCentsKnown) - null quando algum
  -- componente tem custo desconhecido, nunca vira 0 nesse caso.
  known_cost_brl numeric null,
  cost_has_unknown_components boolean not null default false,

  quality_status text null
    check (quality_status is null or quality_status in ('PASS', 'PASS_WITH_OBSERVATIONS', 'FAIL', 'NOT_EVALUATED')),

  error_code text null,
  error_message text null,

  -- CommercialGenerationResult inteiro (sem secrets/API keys - ver
  -- commercial-job-repository.ts#toPersistableRunnerResult) e o array de
  -- traceability em separado pra consulta rapida sem reprocessar o jsonb
  -- inteiro.
  runner_result jsonb null,
  traceability jsonb null,

  created_by_user_id uuid null,
  created_by_email text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commercial_generation_jobs_campaign
  on public.commercial_generation_jobs(campaign_id, created_at desc);

create index if not exists idx_commercial_generation_jobs_status
  on public.commercial_generation_jobs(status, created_at desc);

-- Protecao de concorrencia/idempotencia: no maximo UM job "ativo" (ainda
-- nao terminal) por campanha+modo. Aplicado como indice unico parcial no
-- proprio Postgres (nao em SELECT-depois-INSERT na aplicacao) - garante
-- atomicidade real mesmo com dois POSTs simultaneos, porque o proprio
-- INSERT que perderia a corrida falha com unique_violation (23505) em vez
-- de criar um segundo job ativo. Ver commercial-job-repository.ts#createJob
-- para como esse erro e tratado (retorna o job ativo existente em vez de
-- propagar o erro).
create unique index if not exists idx_commercial_generation_jobs_active_per_campaign_mode
  on public.commercial_generation_jobs(campaign_id, mode)
  where status in (
    'CREATED', 'PREPARING', 'GENERATING_SCENES', 'RESOLVING_ASSETS',
    'BUILDING_NARRATION', 'GENERATING_NARRATION', 'COMPOSING_VIDEO',
    'MIXING_AUDIO', 'FINALIZING'
  );

alter table public.commercial_generation_jobs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'commercial_generation_jobs'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.commercial_generation_jobs
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end
$$;
