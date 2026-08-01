alter table public.post_targets
  add column if not exists niche text;

alter table public.post_queue
  add column if not exists agent_id uuid references public.sales_agents(id) on delete set null;

create index if not exists post_queue_agent_id_dedupe_bucket_idx
  on public.post_queue (agent_id, dedupe_bucket);
