create table if not exists public.whatsapp_groups (
  id text primary key,
  name text not null,
  member_count integer not null default 0,
  is_admin boolean not null default false,
  is_selected boolean not null default false,
  is_active boolean not null default true,
  invite_url text,
  niche text,
  last_synced_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  mode text not null default 'existing_groups' check (mode in ('existing_groups', 'auto_create')),
  current_index integer not null default 0,
  total_clicks integer not null default 0,
  total_members_joined integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_campaign_targets (
  campaign_id uuid not null references public.group_campaigns(id) on delete cascade,
  group_id text not null references public.whatsapp_groups(id) on delete cascade,
  position integer not null default 0,
  member_limit integer not null default 1024,
  joined_count integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (campaign_id, group_id)
);

create table if not exists public.group_join_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.group_campaigns(id) on delete set null,
  group_id text references public.whatsapp_groups(id) on delete set null,
  source text,
  user_agent text,
  ip_hash text,
  clicked_at timestamptz not null default now()
);

create table if not exists public.group_protection_settings (
  id text primary key default 'default',
  shield_enabled boolean not null default false,
  ddi_filter_enabled boolean not null default false,
  blocklist text[] not null default '{}'::text[],
  updated_at timestamptz not null default now()
);

insert into public.group_protection_settings (id)
values ('default')
on conflict (id) do nothing;

create index if not exists idx_whatsapp_groups_selected on public.whatsapp_groups (is_selected, is_active);
create index if not exists idx_group_campaigns_status on public.group_campaigns (status);
create index if not exists idx_group_campaign_targets_campaign on public.group_campaign_targets (campaign_id, position);
create index if not exists idx_group_join_events_campaign on public.group_join_events (campaign_id, clicked_at desc);

alter table public.whatsapp_groups enable row level security;
alter table public.group_campaigns enable row level security;
alter table public.group_campaign_targets enable row level security;
alter table public.group_join_events enable row level security;
alter table public.group_protection_settings enable row level security;

drop policy if exists "admins manage whatsapp groups" on public.whatsapp_groups;
create policy "admins manage whatsapp groups"
on public.whatsapp_groups
for all
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage group campaigns" on public.group_campaigns;
create policy "admins manage group campaigns"
on public.group_campaigns
for all
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage group campaign targets" on public.group_campaign_targets;
create policy "admins manage group campaign targets"
on public.group_campaign_targets
for all
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "admins read group join events" on public.group_join_events;
create policy "admins read group join events"
on public.group_join_events
for select
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));

drop policy if exists "admins manage group protection settings" on public.group_protection_settings;
create policy "admins manage group protection settings"
on public.group_protection_settings
for all
using (exists (select 1 from public.admins a where a.user_id = (select auth.uid())))
with check (exists (select 1 from public.admins a where a.user_id = (select auth.uid())));
