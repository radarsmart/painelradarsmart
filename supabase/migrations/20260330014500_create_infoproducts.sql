create table if not exists public.infoproducts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  headline text not null,
  description text,
  benefits text[],
  platform text not null check (platform in ('hotmart','kiwify','monetizze','eduzz','braip','outro')),
  affiliate_url text not null,
  cover_image text,
  price numeric,
  commission_pct numeric,
  niche text,
  status text default 'active' check (status in ('active','paused','archived')),
  clicks integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.infoproducts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'infoproducts'
      and policyname = 'public read'
  ) then
    create policy "public read"
      on public.infoproducts
      for select
      using (status = 'active');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'infoproducts'
      and policyname = 'service full'
  ) then
    create policy "service full"
      on public.infoproducts
      for all
      using (true)
      with check (true);
  end if;
end $$;

create or replace function public.increment_infoproduct_clicks(product_id uuid)
returns void as $$
  update public.infoproducts
  set clicks = clicks + 1,
      updated_at = now()
  where id = product_id;
$$ language sql;
