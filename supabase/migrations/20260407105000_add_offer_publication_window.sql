alter table if exists public.offers
  add column if not exists published_at timestamptz;

alter table if exists public.offers
  add column if not exists expires_at timestamptz;

update public.offers
set published_at = coalesce(updated_at, created_at, now())
where published_at is null
  and lower(coalesce(status, '')) = 'active'
  and lower(coalesce(curations_status, '')) = 'approved'
  and slot_type in ('flash', 'best', 'comparator');

update public.offers
set expires_at = published_at + interval '48 hours'
where expires_at is null
  and published_at is not null
  and lower(coalesce(status, '')) = 'active'
  and lower(coalesce(curations_status, '')) = 'approved'
  and slot_type in ('flash', 'best', 'comparator');
