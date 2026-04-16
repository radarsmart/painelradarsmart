-- Radar Smart - TikTok Engine Distribution Tables
-- Creates missing distribution tables with RLS + policies

create table if not exists public.tiktok_engine_config (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique,
  config_value jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tiktok_engine_distributions (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid references public.tiktok_engine_briefings(id) on delete set null,
  job_id uuid references public.tiktok_engine_jobs(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'telegram', 'instagram', 'tiktok', 'site')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'sent', 'failed', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tiktok_engine_scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  distribution_id uuid references public.tiktok_engine_distributions(id) on delete cascade,
  briefing_id uuid references public.tiktok_engine_briefings(id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'telegram', 'instagram', 'tiktok', 'site')),
  scheduled_for timestamptz not null,
  post_content text,
  media_url text,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'posted', 'failed', 'cancelled')),
  posted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tiktok_engine_distributions_status_idx
  on public.tiktok_engine_distributions(status);
create index if not exists tiktok_engine_distributions_channel_idx
  on public.tiktok_engine_distributions(channel);
create index if not exists tiktok_engine_distributions_briefing_idx
  on public.tiktok_engine_distributions(briefing_id);
create index if not exists tiktok_engine_scheduled_posts_status_idx
  on public.tiktok_engine_scheduled_posts(status);
create index if not exists tiktok_engine_scheduled_posts_channel_idx
  on public.tiktok_engine_scheduled_posts(channel);
create index if not exists tiktok_engine_scheduled_posts_scheduled_for_idx
  on public.tiktok_engine_scheduled_posts(scheduled_for);

alter table public.tiktok_engine_config enable row level security;
alter table public.tiktok_engine_distributions enable row level security;
alter table public.tiktok_engine_scheduled_posts enable row level security;

drop policy if exists "Admin full access" on public.tiktok_engine_config;
create policy "Admin full access"
on public.tiktok_engine_config
for all
using (true)
with check (true);

drop policy if exists "Admin full access" on public.tiktok_engine_distributions;
create policy "Admin full access"
on public.tiktok_engine_distributions
for all
using (true)
with check (true);

drop policy if exists "Admin full access" on public.tiktok_engine_scheduled_posts;
create policy "Admin full access"
on public.tiktok_engine_scheduled_posts
for all
using (true)
with check (true);
