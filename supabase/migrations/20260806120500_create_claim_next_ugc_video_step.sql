-- Reivindica o proximo passo de trabalho da fila de video: ou uma cena
-- pendente/pra consultar (submit/poll), ou — quando todas as cenas de um
-- job ja estao num estado terminal (ready/stock_fallback/failed) — o
-- proprio job pronto pra composicao final (ffmpeg, roda no lado Node).
-- Mesmo padrao de "for update skip locked" ja usado em
-- claim_next_post_queue_job.
create or replace function public.claim_next_ugc_video_step(p_lock_seconds int default 50)
returns table(
  action text,
  job_id uuid,
  scene_id uuid,
  scene_index int,
  scene_type text,
  scene_status text,
  provider_task_id text,
  prompt text,
  attempts int
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_scene_id uuid;
  v_job_id uuid;
  v_scene_index int;
  v_scene_type text;
  v_scene_status text;
  v_provider_task_id text;
  v_prompt text;
  v_attempts int;
  v_action text;
begin
  -- 1) Cena pendente ou em polling com o lock vencido.
  select s.id into v_scene_id
  from public.ugc_video_job_scenes s
  join public.ugc_video_jobs j on j.id = s.job_id
  where j.status in ('queued', 'running')
    and s.status in ('pending', 'submitted', 'polling')
    and (s.locked_until is null or s.locked_until < now())
  order by s.created_at asc
  for update of s skip locked
  limit 1;

  if v_scene_id is not null then
    update public.ugc_video_job_scenes s
    set
      locked_until = now() + make_interval(secs => p_lock_seconds),
      updated_at = now()
    where s.id = v_scene_id
    returning
      (case when s.status = 'pending' then 'submit_scene' else 'poll_scene' end),
      s.job_id, s.scene_index, s.scene_type, s.status, s.provider_task_id, s.prompt, s.attempts
    into v_action, v_job_id, v_scene_index, v_scene_type, v_scene_status, v_provider_task_id, v_prompt, v_attempts;

    update public.ugc_video_jobs
      set status = 'running', updated_at = now()
      where id = v_job_id and status = 'queued';

    return query
      select v_action, v_job_id, v_scene_id, v_scene_index, v_scene_type, v_scene_status,
             v_provider_task_id, v_prompt, v_attempts;
    return;
  end if;

  -- 2) Nenhuma cena pra trabalhar — ve se algum job tem todas as cenas
  -- terminais (e ao menos uma pronta de verdade, nao so falhas) e ainda
  -- nao foi enviado pra composicao final.
  select j.id into v_job_id
  from public.ugc_video_jobs j
  where j.status = 'running'
    and (j.locked_until is null or j.locked_until < now())
    and not exists (
      select 1 from public.ugc_video_job_scenes s
      where s.job_id = j.id
        and s.status not in ('ready', 'stock_fallback', 'failed')
    )
    and exists (
      select 1 from public.ugc_video_job_scenes s
      where s.job_id = j.id
        and s.status in ('ready', 'stock_fallback')
    )
  order by j.created_at asc
  for update of j skip locked
  limit 1;

  if v_job_id is not null then
    update public.ugc_video_jobs
      set
        status = 'composing',
        locked_until = now() + make_interval(secs => p_lock_seconds * 2),
        updated_at = now()
      where id = v_job_id;

    return query
      select 'compose_job'::text, v_job_id, null::uuid, null::int, null::text, null::text,
             null::text, null::text, null::int;
    return;
  end if;

  return;
end;
$function$;
