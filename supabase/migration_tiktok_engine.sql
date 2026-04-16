-- Radar Smart - TikTok Engine
-- Executar no SQL Editor do Supabase

create extension if not exists pgcrypto;

create table if not exists public.tiktok_engine_briefings (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  product_price text not null,
  product_discount text,
  product_category text,
  product_benefits text not null,
  product_pain text not null,
  competitor_name text,
  competitor_price text,
  shop_url text,
  model_ids jsonb not null default '[]'::jsonb,
  voice_id text,
  avatar_id text not null,
  webhook_url text,
  status text not null default 'pending',
  last_error text,
  created_by_user_id uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiktok_engine_briefings_status_chk
    check (status in ('pending', 'processing', 'completed', 'partial_failed', 'failed'))
);

create index if not exists tiktok_engine_briefings_status_idx
  on public.tiktok_engine_briefings(status);
create index if not exists tiktok_engine_briefings_created_at_idx
  on public.tiktok_engine_briefings(created_at desc);

create table if not exists public.tiktok_engine_jobs (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.tiktok_engine_briefings(id) on delete cascade,
  model_id integer not null,
  model_name text not null,
  status text not null default 'pending',
  script_json jsonb,
  script_title text,
  audio_storage_path text,
  audio_url text,
  heygen_video_id text,
  video_url text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tiktok_engine_jobs_status_chk
    check (status in ('pending', 'script', 'audio', 'avatar', 'processing', 'completed', 'failed'))
);

create index if not exists tiktok_engine_jobs_briefing_idx
  on public.tiktok_engine_jobs(briefing_id);
create index if not exists tiktok_engine_jobs_status_idx
  on public.tiktok_engine_jobs(status);
create unique index if not exists tiktok_engine_jobs_heygen_video_id_uidx
  on public.tiktok_engine_jobs(heygen_video_id)
  where heygen_video_id is not null;

create or replace function public.tiktok_engine_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tiktok_engine_briefings_updated on public.tiktok_engine_briefings;
create trigger trg_tiktok_engine_briefings_updated
before update on public.tiktok_engine_briefings
for each row execute function public.tiktok_engine_set_updated_at();

drop trigger if exists trg_tiktok_engine_jobs_updated on public.tiktok_engine_jobs;
create trigger trg_tiktok_engine_jobs_updated
before update on public.tiktok_engine_jobs
for each row execute function public.tiktok_engine_set_updated_at();

alter table public.tiktok_engine_briefings enable row level security;
alter table public.tiktok_engine_jobs enable row level security;

drop policy if exists tiktok_engine_briefings_admin_read on public.tiktok_engine_briefings;
create policy tiktok_engine_briefings_admin_read
on public.tiktok_engine_briefings
for select
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists tiktok_engine_briefings_admin_write on public.tiktok_engine_briefings;
create policy tiktok_engine_briefings_admin_write
on public.tiktok_engine_briefings
for all
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists tiktok_engine_jobs_admin_read on public.tiktok_engine_jobs;
create policy tiktok_engine_jobs_admin_read
on public.tiktok_engine_jobs
for select
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists tiktok_engine_jobs_admin_write on public.tiktok_engine_jobs;
create policy tiktok_engine_jobs_admin_write
on public.tiktok_engine_jobs
for all
to authenticated
using (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tiktok-engine-assets',
  'tiktok-engine-assets',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'video/mp4']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists tiktok_engine_assets_public_read on storage.objects;
create policy tiktok_engine_assets_public_read
on storage.objects
for select
to public
using (bucket_id = 'tiktok-engine-assets');

drop policy if exists tiktok_engine_assets_admin_insert on storage.objects;
create policy tiktok_engine_assets_admin_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'tiktok-engine-assets'
  and exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists tiktok_engine_assets_admin_update on storage.objects;
create policy tiktok_engine_assets_admin_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'tiktok-engine-assets'
  and exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'tiktok-engine-assets'
  and exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);

drop policy if exists tiktok_engine_assets_admin_delete on storage.objects;
create policy tiktok_engine_assets_admin_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'tiktok-engine-assets'
  and exists (
    select 1
    from public.admins a
    where a.user_id = (select auth.uid())
  )
);
