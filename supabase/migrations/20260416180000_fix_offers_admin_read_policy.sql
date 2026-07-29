-- Corrige policy de leitura admin em offers sem depender de auth.users.

begin;

drop policy if exists offers_admin_read on public.offers;

create policy offers_admin_read
  on public.offers
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admins
      where admins.user_id = auth.uid()
         or lower(admins.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

commit;

