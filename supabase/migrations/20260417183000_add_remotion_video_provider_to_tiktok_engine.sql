alter table if exists public.tiktok_engine_briefings
  add column if not exists product_image_urls jsonb not null default '[]'::jsonb;

alter table if exists public.tiktok_engine_briefings
  add column if not exists video_provider text not null default 'remotion';

alter table if exists public.tiktok_engine_jobs
  add column if not exists video_storage_path text;

alter table if exists public.tiktok_engine_jobs
  add column if not exists video_provider text;

alter table if exists public.tiktok_engine_jobs
  add column if not exists render_metadata jsonb;

alter table if exists public.tiktok_engine_briefings
  drop constraint if exists tiktok_engine_briefings_video_provider_chk;

alter table if exists public.tiktok_engine_briefings
  add constraint tiktok_engine_briefings_video_provider_chk
  check (video_provider in ('remotion', 'heygen'));

alter table if exists public.tiktok_engine_jobs
  drop constraint if exists tiktok_engine_jobs_status_chk;

alter table if exists public.tiktok_engine_jobs
  add constraint tiktok_engine_jobs_status_chk
  check (
    status in (
      'pending',
      'script_generating',
      'script_done',
      'script_failed',
      'script',
      'audio',
      'avatar',
      'processing',
      'rendering_video',
      'video_uploading',
      'video_submitted',
      'video_rendering',
      'completed',
      'failed'
    )
  );
