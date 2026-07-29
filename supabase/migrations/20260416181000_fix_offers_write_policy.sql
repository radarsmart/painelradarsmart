-- Corrige offers_write para nao depender de auth.users.

begin;

drop policy if exists offers_write on public.offers;

create policy offers_write
  on public.offers
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.admins
      where admins.user_id = auth.uid()
         or lower(admins.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  )
  with check (
    exists (
      select 1
      from public.admins
      where admins.user_id = auth.uid()
         or lower(admins.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

commit;

