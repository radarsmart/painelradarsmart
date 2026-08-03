alter table public.sales_agents
  add column if not exists auto_paused_reason text;
