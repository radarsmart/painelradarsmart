-- A curadoria manual (ex.: admin clica em "Publicar" na Central de Oferta,
-- que grava curations_status = 'approved' diretamente) precisa valer sobre
-- as regras automaticas de qualidade abaixo (preco/desconto/comissao/score
-- minimos). Essas regras continuam protegendo o fluxo automatico (ex.:
-- ofertas que entram sozinhas via scraping/agentes), mas uma aprovacao
-- explicita do humano curador nao deve ser rebaixada de volta pra
-- needs_review/rejected so por nao bater um desconto/score minimo.
create or replace function public.auto_curate_offer()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_rejection_reason text := null;
begin
  -- Se já foi manualmente curado, não mexe
  if old.curations_status is distinct from 'inbox'
     and new.curations_status = old.curations_status
  then
    return new;
  end if;

  -- REGRA 0 (aprovação manual vence): se o pedido de gravação já é uma
  -- aprovação explícita (ex.: Central de Oferta) e a oferta tem link, isso é
  -- decisão humana e não deve ser sobrescrita pelas regras automáticas
  -- abaixo. Oferta sem nenhum link continua caindo na REGRA 1.
  if new.curations_status = 'approved'
     and (new.affiliate_url is not null or new.origin_url is not null)
  then
    return new;
  end if;

  -- REGRA 1: Precisa ter link
  if new.affiliate_url is null and new.origin_url is null then
    v_rejection_reason := 'Sem link de afiliado';
    new.curations_status := 'rejected';
    new.raw := jsonb_set(
      coalesce(new.raw, '{}'::jsonb),
      '{auto_curation_reason}',
      to_jsonb(v_rejection_reason::text)
    );
    return new;
  end if;

  -- REGRA 2: Preço mínimo R$15
  if new.price is not null and new.price < 15 then
    v_rejection_reason := 'Preço muito baixo (< R$15)';
    new.curations_status := 'rejected';
    new.raw := jsonb_set(
      coalesce(new.raw, '{}'::jsonb),
      '{auto_curation_reason}',
      to_jsonb(v_rejection_reason::text)
    );
    return new;
  end if;

  -- REGRA 3: Comissão mínima 2%
  if new.commission_rate is not null and new.commission_rate < 0.02 then
    v_rejection_reason := 'Comissão muito baixa (< 2%)';
    new.curations_status := 'needs_review';
    new.raw := jsonb_set(
      coalesce(new.raw, '{}'::jsonb),
      '{auto_curation_reason}',
      to_jsonb(v_rejection_reason::text)
    );
    return new;
  end if;

  -- REGRA 4: Desconto mínimo 15%
  if new.discount_pct is not null and new.discount_pct < 15 then
    v_rejection_reason := 'Desconto insuficiente (< 15%)';
    new.curations_status := 'needs_review';
    new.raw := jsonb_set(
      coalesce(new.raw, '{}'::jsonb),
      '{auto_curation_reason}',
      to_jsonb(v_rejection_reason::text)
    );
    return new;
  end if;

  -- REGRA 5: Score mínimo 40
  if new.score < 40 then
    v_rejection_reason := 'Score muito baixo (< 40)';
    new.curations_status := 'rejected';
    new.raw := jsonb_set(
      coalesce(new.raw, '{}'::jsonb),
      '{auto_curation_reason}',
      to_jsonb(v_rejection_reason::text)
    );
    return new;
  end if;

  -- APROVAÇÃO AUTOMÁTICA
  if new.score >= 70
     and (new.discount_pct is null or new.discount_pct >= 25)
     and (new.commission_rate is null or new.commission_rate >= 0.04)
     and new.price >= 30
  then
    new.curations_status := 'approved';
    new.raw := jsonb_set(
      coalesce(new.raw, '{}'::jsonb),
      '{auto_curation_reason}',
      '"Auto-aprovado: Score alto + desconto + comissão boa"'::jsonb
    );
    return new;
  end if;

  -- Casos intermediários ficam inbox
  if new.curations_status = 'inbox' or new.curations_status is null then
    new.curations_status := 'inbox';
  end if;

  return new;
end;
$function$;
