-- Permite um operador com acesso operacional limitado:
-- Garimpar, Central de Oferta, Ofertas Publicadas, Painel de Envios e Canais.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'admins'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'admins'
        and column_name = 'role'
    ) then
      alter table public.admins add column role text not null default 'admin';
    end if;

    alter table public.admins
      drop constraint if exists admins_role_check;

    alter table public.admins
      add constraint admins_role_check
      check (role in ('admin', 'central_oferta', 'operador_ofertas'));
  end if;
end $$;
