-- Dispara a Edge Function worker-ugc-video a cada minuto, mesmo padrao ja
-- usado pra worker-send-telegram/worker-send-whatsapp. Reaproveita
-- public._vault_get_secret ja criada em outra migration deste projeto.

create or replace function public.invoke_worker_ugc_video()
returns jsonb
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_jwt text;
  v_req_id bigint;
  v_internal text;
begin
  v_jwt := public._vault_get_secret(array[
    'service_role_jwt',
    'radar_service_role_key',
    'radar_service_role_jwt'
  ]);

  if v_jwt is null or length(v_jwt) < 20 then
    return jsonb_build_object('ok', false, 'error', 'missing_service_role_jwt');
  end if;

  v_internal := public._vault_get_secret(array[
    'radar_internal_api_key',
    'radar_internal_key',
    'internal_api_key',
    'INTERNAL_API_KEY',
    'radar_cron_token'
  ]);

  v_req_id := net.http_post(
    url := 'https://vhsfuoskndjebaheyobe.supabase.co/functions/v1/worker-ugc-video',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_jwt,
      'apikey', v_jwt,
      'x-internal-key', v_internal
    ),
    body := jsonb_build_object()
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', v_req_id,
    'note', 'request queued via pg_net; inspect net.http_response for details'
  );
end;
$$;

do $$
begin
  perform cron.schedule(
    'radar-worker-ugc-video',
    '* * * * *',
    'SELECT public.invoke_worker_ugc_video()'
  );
exception when others then
  null;
end $$;
