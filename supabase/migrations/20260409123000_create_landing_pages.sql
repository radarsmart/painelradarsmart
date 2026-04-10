create table if not exists public.landing_pages (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid references public.offers(id) on delete set null,
  title text not null,
  slug text not null unique,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  marketplace text,
  headline text not null,
  subheadline text,
  badge_text text,
  hero_image_url text,
  hero_video_url text,
  product_title text,
  product_price numeric,
  product_old_price numeric,
  affiliate_url text not null,
  site_url text,
  group_url text,
  instagram_url text,
  telegram_url text,
  whatsapp_url text,
  primary_cta_label text not null default 'Quero ver a oferta e comprar com seguranca',
  group_cta_label text not null default 'Entrar gratis no Grupo VIP',
  site_cta_label text not null default 'Conhecer o Radar Smart',
  price_note text,
  benefits jsonb not null default '[]'::jsonb,
  technical_details jsonb not null default '[]'::jsonb,
  social_proof jsonb not null default '[]'::jsonb,
  disclaimer text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists landing_pages_status_updated_at_idx
  on public.landing_pages (status, updated_at desc);

create index if not exists landing_pages_offer_id_idx
  on public.landing_pages (offer_id);

alter table public.landing_pages enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'landing_pages'
      and policyname = 'public read published landing pages'
  ) then
    create policy "public read published landing pages"
      on public.landing_pages
      for select
      using (status = 'published');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'landing_pages'
      and policyname = 'service full landing pages'
  ) then
    create policy "service full landing pages"
      on public.landing_pages
      for all
      using (true)
      with check (true);
  end if;
end $$;
