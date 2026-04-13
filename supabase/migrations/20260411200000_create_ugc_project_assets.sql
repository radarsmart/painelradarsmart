create table if not exists public.ugc_project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ugc_projects(id) on delete cascade,
  creative_id uuid null references public.ugc_creatives(id) on delete set null,
  asset_type text not null
    check (asset_type in ('audio', 'video', 'image', 'avatar', 'screenshot', 'script')),
  provider text null,
  bucket_name text null,
  storage_path text null,
  public_url text null,
  mime_type text null,
  size_bytes bigint null,
  status text not null default 'ready'
    check (status in ('processing', 'ready', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_project_assets_project_id
  on public.ugc_project_assets(project_id, created_at desc);

create index if not exists idx_ugc_project_assets_type
  on public.ugc_project_assets(asset_type, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ugc-assets',
  'ugc-assets',
  true,
  52428800,
  array['audio/mpeg', 'audio/mp3', 'video/mp4', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public read for ugc-assets'
  ) then
    create policy "Public read for ugc-assets"
      on storage.objects
      for select
      using (bucket_id = 'ugc-assets');
  end if;
end
$$;

alter table public.ugc_project_assets enable row level security;
