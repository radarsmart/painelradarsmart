do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offers_pix_price_lte_price_chk'
      and conrelid = 'public.offers'::regclass
  ) then
    alter table public.offers
      add constraint offers_pix_price_lte_price_chk
      check (
        pix_price is null
        or price is null
        or pix_price <= price + 0.01
      ) not valid;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'offers_cash_price_lte_price_chk'
      and conrelid = 'public.offers'::regclass
  ) then
    alter table public.offers
      add constraint offers_cash_price_lte_price_chk
      check (
        cash_price is null
        or price is null
        or cash_price <= price + 0.01
      ) not valid;
  end if;
end $$;
