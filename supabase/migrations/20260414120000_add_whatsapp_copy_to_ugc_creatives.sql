alter table public.ugc_creatives
  add column if not exists whatsapp_copy jsonb not null default '{}'::jsonb;

