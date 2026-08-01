alter table public.sales_agents
  add column if not exists send_window_start_minute integer not null default 0
    check (send_window_start_minute between 0 and 59),
  add column if not exists send_window_end_minute integer not null default 0
    check (send_window_end_minute between 0 and 59);
