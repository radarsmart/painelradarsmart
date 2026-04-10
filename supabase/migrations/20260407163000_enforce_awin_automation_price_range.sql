alter table public.awin_automation_config
  drop constraint if exists awin_automation_config_price_min_check;

alter table public.awin_automation_config
  add constraint awin_automation_config_price_min_check
  check (price_min between 80 and 5000);

alter table public.awin_automation_config
  drop constraint if exists awin_automation_config_price_max_check;

alter table public.awin_automation_config
  add constraint awin_automation_config_price_max_check
  check (price_max is null or (price_max >= price_min and price_max <= 5000));
