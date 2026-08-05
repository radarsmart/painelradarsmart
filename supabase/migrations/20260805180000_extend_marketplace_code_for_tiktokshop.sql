do $$
begin
  if exists (
    select 1
    from pg_type
    where typnamespace = 'public'::regnamespace
      and typname = 'marketplace_code'
  ) then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typnamespace = 'public'::regnamespace
        and t.typname = 'marketplace_code'
        and e.enumlabel = 'tiktokshop'
    ) then
      alter type public.marketplace_code add value 'tiktokshop';
    end if;
  end if;
end $$;
