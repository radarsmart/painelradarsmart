create table if not exists public.landing_page_clicks (
  id uuid primary key default gen_random_uuid(),
  landing_page_id uuid not null references public.landing_pages(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  slug text not null,
  cta_type text not null,
  destination_url text not null,
  utm_params jsonb not null default '{}'::jsonb,
  referrer text,
  user_agent text,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists landing_page_clicks_landing_page_id_idx
  on public.landing_page_clicks (landing_page_id, created_at desc);

create index if not exists landing_page_clicks_cta_type_idx
  on public.landing_page_clicks (cta_type, created_at desc);

alter table public.landing_page_clicks enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'landing_page_clicks'
      and policyname = 'service full landing page clicks'
  ) then
    create policy "service full landing page clicks"
      on public.landing_page_clicks
      for all
      using (true)
      with check (true);
  end if;
end $$;
