-- Ate agora o acesso admin era binario: existir na tabela admins = acesso
-- total. Adiciona um papel pra permitir logins restritos (ex: colaborador
-- que so acessa a Central de Oferta, sem publicar/disparar nada sozinho).
-- Default 'admin' garante que toda linha existente continua com acesso
-- total sem nenhuma acao manual.
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

    if not exists (
      select 1
      from pg_constraint
      where conname = 'admins_role_check'
    ) then
      alter table public.admins
        add constraint admins_role_check check (role in ('admin', 'central_oferta'));
    end if;
  end if;
end $$;
