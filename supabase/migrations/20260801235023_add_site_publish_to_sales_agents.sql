alter table public.sales_agents
  add column if not exists publish_to_site boolean not null default true;

alter table public.sales_agents
  add column if not exists site_slot_type text not null default 'best'
    check (site_slot_type in ('flash', 'best', 'comparator'));
