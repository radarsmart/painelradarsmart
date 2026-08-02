create or replace function public.touch_offer_expiry()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  -- Ofertas relampago tem urgencia real (tempo limitado) — prazo bem mais
  -- curto que o padrao de 48h usado por melhores ofertas/comparador.
  if new.slot_type = 'flash' then
    new.expires_at := now() + interval '6 hours';
  else
    new.expires_at := now() + interval '2 days';
  end if;
  new.updated_at := now();
  new.last_seen_at := now();
  return new;
end;
$function$;
