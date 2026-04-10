create table if not exists public.awin_automation_config (
  id uuid primary key default '00000000-0000-4000-8000-000000000001'::uuid,
  advertiser_id text not null default '18879',
  category text,
  sort text not null default 'best_deals',
  "limit" integer not null default 5,
  slot_type text not null default 'flash',
  price_min numeric not null default 20,
  price_max numeric,
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_run_result jsonb,
  constraint awin_automation_config_singleton
    check (id = '00000000-0000-4000-8000-000000000001'::uuid),
  constraint awin_automation_config_sort_check
    check (sort in ('best_deals', 'top_selling')),
  constraint awin_automation_config_limit_check
    check ("limit" between 1 and 20),
  constraint awin_automation_config_slot_type_check
    check (slot_type in ('flash', 'best', 'comparator')),
  constraint awin_automation_config_price_min_check
    check (price_min >= 0),
  constraint awin_automation_config_price_max_check
    check (price_max is null or price_max >= price_min)
);

alter table public.awin_automation_config enable row level security;

revoke all on table public.awin_automation_config from anon;
revoke all on table public.awin_automation_config from authenticated;

insert into public.awin_automation_config (
  id,
  advertiser_id,
  category,
  sort,
  "limit",
  slot_type,
  price_min,
  price_max,
  active,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000001'::uuid,
  '18879',
  null,
  'best_deals',
  5,
  'flash',
  20,
  null,
  false,
  now()
)
on conflict (id) do nothing;
