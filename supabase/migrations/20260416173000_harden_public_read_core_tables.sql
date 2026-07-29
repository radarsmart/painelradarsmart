-- Radar Smart - Hardening RLS (public read by exception)
-- Objetivo: reduzir leitura anon/public nas tabelas core sem quebrar vitrine publica.

begin;

-- 1) Garantir RLS ligado nas 22 tabelas core
alter table if exists public.offers enable row level security;
alter table if exists public.post_queue enable row level security;
alter table if exists public.post_targets enable row level security;
alter table if exists public.ai_analysis_logs enable row level security;
alter table if exists public.ml_products_cache enable row level security;
alter table if exists public.blog_post_offers enable row level security;
alter table if exists public.infoproducts enable row level security;
alter table if exists public.awin_automation_config enable row level security;
alter table if exists public.awin_product_enrichment_cache enable row level security;
alter table if exists public.landing_pages enable row level security;
alter table if exists public.landing_page_clicks enable row level security;
alter table if exists public.ugc_creatives enable row level security;
alter table if exists public.ugc_personas enable row level security;
alter table if exists public.ugc_projects enable row level security;
alter table if exists public.ugc_templates enable row level security;
alter table if exists public.ugc_angles enable row level security;
alter table if exists public.ugc_project_assets enable row level security;
alter table if exists public.tiktok_engine_briefings enable row level security;
alter table if exists public.tiktok_engine_jobs enable row level security;
alter table if exists public.tiktok_engine_distributions enable row level security;
alter table if exists public.tiktok_engine_scheduled_posts enable row level security;
alter table if exists public.tiktok_engine_config enable row level security;

-- 2) offers: remover exposicao ampla para public/anon
drop policy if exists offers_read on public.offers;
drop policy if exists offers_own on public.offers;
drop policy if exists "public read offers" on public.offers;
drop policy if exists leitura_autenticada on public.offers;

-- Recria apenas leitura anon minima para vitrine publica.
-- Observacao: mantemos somente status='active' para preservar compatibilidade imediata da home client-side.
create policy offers_public_active_read
  on public.offers
  for select
  to anon
  using (status = 'active');

-- Leitura via JWT autenticado restrita a admins do painel.
create policy offers_admin_read
  on public.offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admins
      where admins.email = (
        select users.email
        from auth.users
        where users.id = auth.uid()
      )::text
    )
  );

-- 3) Tabelas com leitura publica desnecessaria para operacao atual
-- (site usa server-side/service_role para essas consultas)
drop policy if exists "public read" on public.infoproducts;
drop policy if exists "public read published landing pages" on public.landing_pages;
drop policy if exists anon_insert_tracking on public.landing_page_clicks;

-- 4) Garantir policy explicita service_role nas tabelas sem policy
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ml_products_cache'
      and policyname = 'service_role_full_access'
  ) then
    execute 'create policy service_role_full_access on public.ml_products_cache for all to service_role using (true) with check (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'landing_page_clicks'
      and policyname = 'service_role_full_access'
  ) then
    execute 'create policy service_role_full_access on public.landing_page_clicks for all to service_role using (true) with check (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ugc_creatives'
      and policyname = 'service_role_full_access'
  ) then
    execute 'create policy service_role_full_access on public.ugc_creatives for all to service_role using (true) with check (true)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ugc_projects'
      and policyname = 'service_role_full_access'
  ) then
    execute 'create policy service_role_full_access on public.ugc_projects for all to service_role using (true) with check (true)';
  end if;
end $$;

commit;
