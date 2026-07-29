alter table if exists public.tiktok_engine_jobs
  add column if not exists script_text_final text;

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
      'completed',
      'failed'
    )
  );
