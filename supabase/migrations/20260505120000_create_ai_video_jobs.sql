create table if not exists public.ai_video_jobs (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  status text not null default 'draft',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  status_events jsonb not null default '[]'::jsonb,
  error text,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_video_jobs_status_check check (
    status in (
      'draft',
      'preview_generating',
      'preview_ready',
      'render_queued',
      'rendering',
      'rendered',
      'uploading',
      'published',
      'failed',
      'cancelled'
    )
  )
);

alter table public.ai_video_jobs enable row level security;

drop policy if exists "admins can read ai video jobs" on public.ai_video_jobs;
create policy "admins can read ai video jobs"
on public.ai_video_jobs
for select
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists "admins can write ai video jobs" on public.ai_video_jobs;
create policy "admins can write ai video jobs"
on public.ai_video_jobs
for all
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

create index if not exists ai_video_jobs_status_idx on public.ai_video_jobs (status);
create index if not exists ai_video_jobs_created_at_idx on public.ai_video_jobs (created_at desc);
