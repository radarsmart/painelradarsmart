create table if not exists public.ugc_creatives (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid null references public.offers(id) on delete set null,
  landing_page_id uuid null references public.landing_pages(id) on delete set null,
  campaign_name text not null,
  ugc_type text not null check (ugc_type in ('model-a', 'model-b', 'model-c')),
  voice_key text not null,
  title text not null,
  marketplace text null,
  category text null,
  product_url text not null,
  price numeric(12,2) null,
  original_price numeric(12,2) null,
  generated_script jsonb not null default '{}'::jsonb,
  briefing jsonb not null default '{}'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_creatives_created_at
  on public.ugc_creatives(created_at desc);

create index if not exists idx_ugc_creatives_offer_id
  on public.ugc_creatives(offer_id);

create index if not exists idx_ugc_creatives_landing_page_id
  on public.ugc_creatives(landing_page_id);

create index if not exists idx_ugc_creatives_ugc_type
  on public.ugc_creatives(ugc_type);

alter table public.ugc_creatives enable row level security;
