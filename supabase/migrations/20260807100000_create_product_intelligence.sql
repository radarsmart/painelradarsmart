-- Radar Creative AI - Fase 1 (Product Intelligence)
-- Guarda a analise de publico/dor/desejo/objecoes/motivacao gerada para uma
-- oferta antes de montar um criativo. Uma oferta pode ter varias versoes de
-- analise ao longo do tempo (reanalisar nao apaga a anterior) - a versao
-- e calculada em app (select max(version)+1) igual ao resto do projeto,
-- que nao usa triggers SQL para isso.

create table if not exists public.product_intelligence (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers(id) on delete cascade,
  version integer not null default 1,

  category text null,
  subcategory text null,

  target_audience jsonb not null default '{}'::jsonb,
  pain_points jsonb not null default '[]'::jsonb,
  desires jsonb not null default '[]'::jsonb,
  objections jsonb not null default '[]'::jsonb,
  purchase_motivations jsonb not null default '[]'::jsonb,

  key_benefits jsonb not null default '[]'::jsonb,
  emotional_benefits jsonb not null default '[]'::jsonb,
  functional_benefits jsonb not null default '[]'::jsonb,

  recommended_angles jsonb not null default '[]'::jsonb,
  recommended_frameworks jsonb not null default '[]'::jsonb,

  summary text null,

  source text not null default 'mock',
  model text null,

  created_by_user_id uuid null,
  created_by_email text null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (offer_id, version)
);

create index if not exists idx_product_intelligence_offer_id
  on public.product_intelligence(offer_id, version desc);

create index if not exists idx_product_intelligence_created_at
  on public.product_intelligence(created_at desc);

alter table public.product_intelligence enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_intelligence'
      and policyname = 'service_role_full_access'
  ) then
    create policy service_role_full_access on public.product_intelligence
      for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
  end if;
end
$$;
