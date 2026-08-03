alter table public.sales_agents
  add column if not exists content_category text;
