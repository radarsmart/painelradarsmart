-- O bloco "APROVACAO AUTOMATICA" de auto_curate_offer() aprovava sozinho
-- qualquer oferta com score/desconto/comissao acima de um limiar, sem
-- nenhuma curadoria humana ou avaliacao do Opportunity Engine — e uma causa
-- provavel das ofertas com preco errado/sem credibilidade que motivaram a
-- pausa do disparo automatico. Regras de rejeicao/revisao (1-5) continuam
-- como rede de seguranca; so a aprovacao automatica sai. Daqui pra frente
-- curations_status so vira 'approved' por acao humana explicita (Regra 0)
-- ou, futuramente, por um executor dedicado do Opportunity Engine.
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

  -- Passou nas regras de seguranca, mas aprovacao automatica por
  -- score/desconto/comissao foi desativada — fica em inbox aguardando
  -- curadoria humana (painel de oportunidades) ou aprovacao explicita.
  if new.curations_status = 'inbox' or new.curations_status is null then
    new.curations_status := 'inbox';
  end if;

  return new;
end;
$function$;
