-- Commercial Review & Approval UI V1
--
-- Menor extensao possivel: a revisao humana pertence ao job final de
-- geracao comercial. Nao cria tabela nova nem publica nada; apenas
-- registra a decisao humana antes de uma futura etapa de publish.

alter table public.commercial_generation_jobs
  add column if not exists review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED')),
  add column if not exists reviewed_at timestamptz null,
  add column if not exists reviewed_by_user_id uuid null,
  add column if not exists reviewed_by_email text null,
  add column if not exists review_notes text null,
  add column if not exists human_acknowledged_observations boolean not null default false;

create index if not exists idx_commercial_generation_jobs_review_status
  on public.commercial_generation_jobs(review_status, updated_at desc);
