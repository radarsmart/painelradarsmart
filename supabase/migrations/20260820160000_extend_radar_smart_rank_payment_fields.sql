-- Garante que a view usada por dashboards/home legada exponha os campos de
-- condicao comercial capturados pelo painel e pela extensao Garimpar.
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
  o.product_url,
  o.pix_price,
  o.cash_price,
  o.card_price,
  o.shipping_cost,
  o.installment_count,
  o.installment_amount,
  o.installment_interest_free,
  o.coupon_code,
  o.coupon_description,
  o.payment_information_original,
  0::numeric as momentum
from offers o
left join stores s on s.id = o.store_id
where o.status = 'active'::text
  and o.curations_status = 'approved'::text
  and o.affiliate_url is not null
order by (
  coalesce(o.score, 0::numeric) + coalesce(o.trend_score, 0::numeric) * 0.3 + coalesce(o.discount_pct, 0::numeric) * 0.2 +
    case when (o.ai_analysis ->> 'verdict'::text) = 'approve'::text then 10 else 0 end::numeric
) desc;
