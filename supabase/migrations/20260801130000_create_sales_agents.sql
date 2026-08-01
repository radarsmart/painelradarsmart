create table if not exists public.sales_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source text not null check (source in ('awin', 'lomadee', 'shopee', 'amazon', 'mercadolivre')),
  advertiser_id text,
  search_query text,
  category text,
  price_min numeric,
  price_max numeric,
  min_discount_pct integer not null default 0,
  aav_filter_enabled boolean not null default true,
  ai_image_enabled boolean not null default false,
  ai_instructions text,
  send_window_start_hour integer not null default 8,
  send_window_end_hour integer not null default 22,
  timezone text not null default 'America/Sao_Paulo',
  max_sends_per_day integer not null default 10,
  min_interval_minutes integer not null default 20,
  active boolean not null default false,
  last_run_at timestamptz,
  last_run_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_agents_price_range_check
    check (price_max is null or price_min is null or price_max >= price_min),
  constraint sales_agents_min_discount_check
    check (min_discount_pct between 0 and 99),
  constraint sales_agents_window_check
    check (send_window_start_hour between 0 and 23 and send_window_end_hour between 0 and 23),
  constraint sales_agents_max_sends_check
    check (max_sends_per_day between 1 and 200),
  constraint sales_agents_interval_check
    check (min_interval_minutes between 1 and 1440)
);

create index if not exists sales_agents_active_idx
  on public.sales_agents (active);

create table if not exists public.sales_agent_targets (
  agent_id uuid not null references public.sales_agents(id) on delete cascade,
  target_id text not null references public.post_targets(id) on delete cascade,
  primary key (agent_id, target_id)
);

alter table public.sales_agents enable row level security;
alter table public.sales_agent_targets enable row level security;

revoke all on table public.sales_agents from anon;
revoke all on table public.sales_agents from authenticated;
revoke all on table public.sales_agent_targets from anon;
revoke all on table public.sales_agent_targets from authenticated;
