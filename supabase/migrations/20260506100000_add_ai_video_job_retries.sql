alter table public.ai_video_jobs
  add column if not exists original_job_id uuid references public.ai_video_jobs(id) on delete set null,
  add column if not exists attempt_number integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_video_jobs_attempt_number_check'
      and conrelid = 'public.ai_video_jobs'::regclass
  ) then
    alter table public.ai_video_jobs
      add constraint ai_video_jobs_attempt_number_check check (attempt_number >= 1);
  end if;
end $$;

create index if not exists ai_video_jobs_original_job_id_idx
  on public.ai_video_jobs (original_job_id);
