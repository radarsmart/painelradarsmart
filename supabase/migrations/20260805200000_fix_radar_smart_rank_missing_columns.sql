-- A view radar_smart_rank (usada pela home em lib/supabase.ts:getOfertas)
-- nao selecionava slot_type, affiliate_url, marketplace nem product_url.
-- Sem slot_type, o filtro de secao da home (flash/best/comparator em
-- lib/home/get-home-page-data.ts) nunca batia com nada, entao as secoes
-- "Melhores Ofertas"/"Ofertas Relampago"/"Comparador" ficavam sempre vazias
-- pra qualquer marketplace. Tambem adiciona affiliate_url IS NOT NULL ao
-- filtro, pra nao listar cards sem link de compra (mesma regra ja aplicada
-- em lib/offers/site-visibility.ts).
--
-- CREATE OR REPLACE VIEW so aceita ADICIONAR colunas no final da lista
-- (nao pode inserir no meio nem reordenar as existentes), entao as colunas
-- novas vao apendadas depois de "rank".
create or replace view public.radar_smart_rank as
select
  o.id,
  o.item_id,
  o.title,
  o.slug,
  o.price,
  o.original_price,
  o.price_old,
  o.discount_pct,
  o.image_url,
  o.shop_name,
  o.store,
  o.category,
  o.views_count,
  o.expires_at,
  coalesce(s.name, o.seller_name, o.shop_name, o.store) as store_name,
  calculate_store_score(s.reclame_aqui_score, s.taxa_resolucao, s.tempo_mercado, s.volume_vendas, coalesce(s.ssl_valid, true)) as store_score,
  coalesce(o.score, 0::numeric) as score_inteligente,
  coalesce(o.score, 0::numeric) + coalesce(o.trend_score, 0::numeric) * 0.3 + coalesce(o.discount_pct, 0::numeric) * 0.2 +
    case when (o.ai_analysis ->> 'verdict'::text) = 'approve'::text then 10 else 0 end::numeric as rank_score,
  coalesce(o.score, 0::numeric) + coalesce(o.trend_score, 0::numeric) * 0.3 + coalesce(o.discount_pct, 0::numeric) * 0.2 +
    case when (o.ai_analysis ->> 'verdict'::text) = 'approve'::text then 10 else 0 end::numeric as rank,
  o.slot_type,
  o.affiliate_url,
  o.marketplace,
  o.product_url
from offers o
left join stores s on s.id = o.store_id
where o.status = 'active'::text
  and o.curations_status = 'approved'::text
  and o.affiliate_url is not null
order by (
  coalesce(o.score, 0::numeric) + coalesce(o.trend_score, 0::numeric) * 0.3 + coalesce(o.discount_pct, 0::numeric) * 0.2 +
    case when (o.ai_analysis ->> 'verdict'::text) = 'approve'::text then 10 else 0 end::numeric
) desc;
