-- Prepara o campo de modo de aprovacao por oferta (manual/auto). Ainda sem
-- executor automatico nem UI — so o schema, pra nao precisar de outra
-- migration quando construirmos o disparo automatico numa fase futura.
alter table public.offers
  add column if not exists approval_mode text not null default 'manual';

alter table public.offers
  drop constraint if exists offers_approval_mode_check;

alter table public.offers
  add constraint offers_approval_mode_check check (approval_mode in ('manual', 'auto'));
