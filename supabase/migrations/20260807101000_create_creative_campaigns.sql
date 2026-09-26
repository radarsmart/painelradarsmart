-- Radar Creative AI - Fase 3 (Creative Campaigns)
-- Agrupador de campanha: liga uma oferta + uma analise de Product
-- Intelligence + o brief montado pelo Creative Brain. Nesta fase o
-- pipeline para em "brief_ready" - roteiro/storyboard/geracao ficam para
-- fases futuras, os campos ja existem para nao exigir migration nova depois.

create table if not exists public.creative_campaigns (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid null references public.offers(id) on delete set null,
  product_intelligence_id uuid null references public.product_intelligence(id) on delete set null,

  name text not null,

  objective text not null default 'conversion',
  platform text not null default 'tiktok',
  duration integer null,
  aspect_ratio text not null default '9:16',

  status text not null default 'draft'
    check (status in (
      'draft', 'analyzing', 'brief_ready', 'script_ready',
      'approved', 'generating', 'completed', 'failed'
    )),

  selected_framework text null,
  selected_angle text null,
  selected_persona_id uuid null references public.ugc_personas(id) on delete set null,

  creative_brief jsonb not null default '{}'::jsonb,

  hook text null,
  script jsonb null,
  storyboard jsonb null,
  generation_prompt text null,

  caption text null,
  cta text null,
  hashtags jsonb null,

  approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),

  created_by_user_id uuid null,
  created_by_email text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creative_campaigns_offer_id
  on public.creative_campaigns(offer_id);

create index if not exists idx_creative_campaigns_status
  on public.creative_campaigns(status, created_at desc);

create index if not exists idx_creative_campaigns_created_at
  on public.creative_campaigns(created_at desc);

alter table public.creative_campaigns enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'creative_campaigns'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.creative_campaigns
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end
$$;
