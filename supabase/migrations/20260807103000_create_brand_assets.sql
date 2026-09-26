-- Radar Creative AI - Fase 5 (Brand Assets)
-- Cadastro dos ativos oficiais da marca (logo, MP4 de encerramento,
-- referencia da personagem, elementos graficos). Nesta fase so cadastro e
-- consulta (ex: buscar o defaultVideoOutro) - o pipeline de FFmpeg/Remotion
-- em lib/ugc e lib/tiktok-engine continua usando lib/ugc/brand-kit.ts como
-- fonte de verdade e nao e alterado aqui.

create table if not exists public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null
    check (type in (
      'LOGO', 'LOGO_TRANSPARENT', 'VIDEO_OUTRO', 'CHARACTER_REFERENCE', 'GRAPHIC_ELEMENT'
    )),
  file_url text not null,
  storage_path text null,
  mime_type text null,
  usage text null,
  is_default boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_assets_type
  on public.brand_assets(type, is_default);

-- No maximo um asset default por tipo (ex: 1 VIDEO_OUTRO default).
create unique index if not exists idx_brand_assets_single_default_per_type
  on public.brand_assets(type)
  where is_default = true;

alter table public.brand_assets enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'brand_assets'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.brand_assets
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end
$$;
