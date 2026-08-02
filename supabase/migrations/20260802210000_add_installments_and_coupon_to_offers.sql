alter table public.offers
  add column if not exists installment_count integer,
  add column if not exists installment_amount numeric,
  add column if not exists installment_interest_free boolean,
  add column if not exists coupon_code text,
  add column if not exists coupon_description text;
