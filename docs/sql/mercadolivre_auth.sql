-- Radar Smart - OAuth Mercado Livre
-- Estrutura com linha unica fixa (id = 'default')

create table if not exists public.mercadolivre_auth (
  id text primary key default 'default',
  access_token text not null,
  refresh_token text,
  token_type text default 'bearer',
  scope text,
  user_id text,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint mercadolivre_auth_singleton_chk check (id = 'default')
);

create unique index if not exists mercadolivre_auth_singleton_idx
  on public.mercadolivre_auth (id);

alter table public.mercadolivre_auth enable row level security;

drop policy if exists "mercadolivre_auth_read_authenticated" on public.mercadolivre_auth;
create policy "mercadolivre_auth_read_authenticated"
  on public.mercadolivre_auth
  for select
  to authenticated
  using (true);

drop policy if exists "mercadolivre_auth_write_authenticated" on public.mercadolivre_auth;
create policy "mercadolivre_auth_write_authenticated"
  on public.mercadolivre_auth
  for all
  to authenticated
  using (true)
  with check (true);

-- Garantir que sempre exista a linha singleton
insert into public.mercadolivre_auth (id, access_token, refresh_token)
values ('default', 'pending', null)
on conflict (id) do nothing;

