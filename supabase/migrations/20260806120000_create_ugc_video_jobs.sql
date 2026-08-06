-- Fila assiciona de geracao de video (fase 1 da "fabrica de criativos").
-- Substitui o fluxo sincrono de app/api/admin/criativos/video/route.ts, que
-- rodava tudo (Freepik + ffmpeg) numa unica requisicao HTTP com timeout de
-- 5 minutos — fragil e sem retry de verdade. Segue o mesmo padrao ja usado
-- em post_queue: fila + "reivindicar proximo passo" + cron de 1 em 1 minuto.
--
-- Job = 1 video completo. Scene = 1 cena dentro do job (cada cena e
-- submetida/consultada separadamente no Freepik pela Edge Function
-- worker-ugc-video, ja que a espera do Kling nao cabe numa unica invocacao).

create table if not exists public.ugc_video_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ugc_projects(id) on delete cascade,
  creative_id uuid null references public.ugc_creatives(id) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'composing', 'completed', 'failed', 'cancelled')),
  scene_plan jsonb not null default '[]'::jsonb,
  attempt_number int not null default 1,
  original_job_id uuid null references public.ugc_video_jobs(id) on delete set null,
  cost_estimate_cents int null,
  output_url text null,
  error text null,
  locked_until timestamptz null,
  created_by_user_id uuid null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_video_jobs_status
  on public.ugc_video_jobs(status, created_at);

create index if not exists idx_ugc_video_jobs_project
  on public.ugc_video_jobs(project_id, created_at desc);

create table if not exists public.ugc_video_job_scenes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ugc_video_jobs(id) on delete cascade,
  scene_index int not null,
  scene_type text not null
    check (scene_type in ('freepik-animate', 'freepik-text2video', 'pexels-stock', 'ffmpeg-text', 'heygen-avatar')),
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'polling', 'ready', 'stock_fallback', 'failed')),
  provider text null,
  provider_task_id text null,
  attempts int not null default 0,
  prompt text null,
  result_url text null,
  fallback_reason text null,
  locked_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, scene_index)
);

create index if not exists idx_ugc_video_job_scenes_job
  on public.ugc_video_job_scenes(job_id, scene_index);

create index if not exists idx_ugc_video_job_scenes_status
  on public.ugc_video_job_scenes(status, locked_until);

create table if not exists public.ugc_video_job_events (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.ugc_video_jobs(id) on delete cascade,
  scene_id uuid null references public.ugc_video_job_scenes(id) on delete cascade,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ugc_video_job_events_job
  on public.ugc_video_job_events(job_id, created_at);

alter table public.ugc_video_jobs enable row level security;
alter table public.ugc_video_job_scenes enable row level security;
alter table public.ugc_video_job_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ugc_video_jobs'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.ugc_video_jobs
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ugc_video_job_scenes'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.ugc_video_job_scenes
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ugc_video_job_events'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.ugc_video_job_events
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end
$$;
