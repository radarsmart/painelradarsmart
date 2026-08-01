alter table public.sales_agents
  add column if not exists text_mode text not null default 'ai'
    check (text_mode in ('ai', 'custom')),
  add column if not exists custom_text_template text,
  add column if not exists ai_image_prompt text;
