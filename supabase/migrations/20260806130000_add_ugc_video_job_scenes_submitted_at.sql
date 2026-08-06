-- Marca quando uma cena foi submetida pela ultima vez a um provedor
-- assincrono (Freepik Kling/Mystic) — usado pela Edge Function
-- worker-ugc-video pra decidir quando desistir de esperar (o provedor pode
-- ficar preso em "in progress" sem nunca responder DONE/FAILED) e cair pro
-- fallback de estoque, no lugar de fazer polling pra sempre.
alter table public.ugc_video_job_scenes
  add column if not exists submitted_at timestamptz null;
