-- auto_paused_until: cooldown baseado em tempo pra motivos de pausa que nao
-- tem uma sondagem barata e segura pra saber quando a fonte voltou (ex.:
-- rate-limit do gerador de link do ML — sondar de novo cedo demais so
-- estenderia o bloqueio). auto_paused_reason continua sendo usado pelos
-- motivos que TEM sondagem real (ex.: awin_feed_500).
alter table public.sales_agents
  add column if not exists auto_paused_until timestamptz;
