alter table public.ai_video_jobs
  add column if not exists status_events jsonb not null default '[]'::jsonb;

create index if not exists ai_video_jobs_status_events_gin_idx
  on public.ai_video_jobs using gin (status_events);
