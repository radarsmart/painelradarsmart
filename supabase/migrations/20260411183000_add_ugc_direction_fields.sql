alter table public.ugc_projects
  add column if not exists voice_direction jsonb not null default '{}'::jsonb;

alter table public.ugc_projects
  add column if not exists behavior_direction jsonb not null default '{}'::jsonb;

alter table public.ugc_creatives
  add column if not exists voice_direction jsonb not null default '{}'::jsonb;

alter table public.ugc_creatives
  add column if not exists behavior_direction jsonb not null default '{}'::jsonb;
