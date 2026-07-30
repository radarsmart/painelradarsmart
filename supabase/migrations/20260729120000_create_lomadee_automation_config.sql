create table if not exists public.lomadee_automation_config (
  id uuid primary key default '00000000-0000-4000-8000-000000000002'::uuid,
  search text,
  organization_ids text,
  sort text not null default 'discount',
  "limit" integer not null default 10,
  slot_type text not null default 'flash',
  price_min numeric not null default 0,
  price_max numeric,
  active boolean not null default false,
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  last_run_result jsonb,
  constraint lomadee_automation_config_singleton
    check (id = '00000000-0000-4000-8000-000000000002'::uuid),
  constraint lomadee_automation_config_sort_check
    check (sort in ('discount', 'price_asc', 'price_desc')),
  constraint lomadee_automation_config_limit_check
    check ("limit" between 1 and 100),
  constraint lomadee_automation_config_slot_type_check
    check (slot_type in ('flash', 'best', 'comparator')),
  constraint lomadee_automation_config_price_min_check
    check (price_min >= 0),
  constraint lomadee_automation_config_price_max_check
    check (price_max is null or price_max >= price_min)
);

alter table public.lomadee_automation_config enable row level security;

revoke all on table public.lomadee_automation_config from anon;
revoke all on table public.lomadee_automation_config from authenticated;

insert into public.lomadee_automation_config (
  id,
  search,
  organization_ids,
  sort,
  "limit",
  slot_type,
  price_min,
  price_max,
  active,
  updated_at
)
values (
  '00000000-0000-4000-8000-000000000002'::uuid,
  null,
  null,
  'discount',
  10,
  'flash',
  0,
  null,
  false,
  now()
)
on conflict (id) do nothing;
