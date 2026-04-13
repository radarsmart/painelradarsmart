create table if not exists public.ugc_templates (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  objective text null,
  description text null,
  hook_framework text null,
  structure_steps text[] not null default '{}'::text[],
  recommended_duration text null,
  cta_style text null,
  editing_notes jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_templates_active_sort
  on public.ugc_templates(is_active, sort_order, created_at desc);

create table if not exists public.ugc_angles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  angle_type text null,
  description text null,
  pain_points text[] not null default '{}'::text[],
  desire_points text[] not null default '{}'::text[],
  proof_points text[] not null default '{}'::text[],
  hook_starters text[] not null default '{}'::text[],
  cta_options text[] not null default '{}'::text[],
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_angles_active_sort
  on public.ugc_angles(is_active, sort_order, created_at desc);

alter table public.ugc_projects
  add column if not exists template_id uuid null references public.ugc_templates(id) on delete set null;

alter table public.ugc_projects
  add column if not exists angle_id uuid null references public.ugc_angles(id) on delete set null;

create index if not exists idx_ugc_projects_template_id
  on public.ugc_projects(template_id);

create index if not exists idx_ugc_projects_angle_id
  on public.ugc_projects(angle_id);

alter table public.ugc_creatives
  add column if not exists template_id uuid null references public.ugc_templates(id) on delete set null;

alter table public.ugc_creatives
  add column if not exists angle_id uuid null references public.ugc_angles(id) on delete set null;

create index if not exists idx_ugc_creatives_template_id
  on public.ugc_creatives(template_id);

create index if not exists idx_ugc_creatives_angle_id
  on public.ugc_creatives(angle_id);

insert into public.ugc_templates (
  slug,
  name,
  objective,
  description,
  hook_framework,
  structure_steps,
  recommended_duration,
  cta_style,
  editing_notes,
  sort_order
) values
  (
    'oferta-direta',
    'Oferta direta',
    'conversion',
    'Criativo curto para clique imediato em oferta com prova de valor e CTA direto.',
    'Choque de preco ou beneficio + prova rapida + CTA',
    array['Hook forte', 'Contexto curto', 'Prova visual', 'CTA direto'],
    '10 a 15 segundos',
    'imperativo direto',
    '{"captions":"grandes", "cut_pace":"alto", "visual_proof":"preco + produto"}'::jsonb,
    10
  ),
  (
    'grupo-secreto',
    'Grupo secreto',
    'lead_capture',
    'Criativo orientado a levar o usuario para o grupo da Radar Smart.',
    'Curiosidade + exclusividade + CTA para grupo',
    array['Hook de descoberta', 'Oferta escondida', 'Prova de oportunidade', 'CTA grupo'],
    '12 a 18 segundos',
    'convite exclusivo',
    '{"captions":"grandes", "cut_pace":"medio-alto", "visual_proof":"print do grupo + oferta"}'::jsonb,
    20
  ),
  (
    'review-curto',
    'Review curto',
    'conversion',
    'Creator explicando em poucos segundos porque o produto vale o clique.',
    'Dor + beneficio + prova pratica + CTA',
    array['Dor principal', 'Beneficio central', 'Demonstracao', 'CTA'],
    '15 a 20 segundos',
    'recomendacao casual',
    '{"captions":"medias", "cut_pace":"medio", "visual_proof":"uso real do produto"}'::jsonb,
    30
  ),
  (
    'comparacao-preco',
    'Comparacao de preco',
    'conversion',
    'Criativo focado em economia e contraste com preco normal.',
    'Comparacao + economia + urgencia + CTA',
    array['Comparacao', 'Economia percebida', 'Urgencia', 'CTA'],
    '10 a 15 segundos',
    'urgencia objetiva',
    '{"captions":"grandes", "cut_pace":"alto", "visual_proof":"preco antigo x atual"}'::jsonb,
    40
  ),
  (
    'demonstracao-curta',
    'Demonstracao curta',
    'conversion',
    'Mostra visual do produto em uso com narracao enxuta.',
    'Hook visual + uso do produto + CTA',
    array['Hook visual', 'Demonstracao', 'Resultado', 'CTA'],
    '12 a 20 segundos',
    'demonstrativo',
    '{"captions":"medias", "cut_pace":"medio-alto", "visual_proof":"antes/depois ou uso claro"}'::jsonb,
    50
  )
on conflict (slug) do update set
  name = excluded.name,
  objective = excluded.objective,
  description = excluded.description,
  hook_framework = excluded.hook_framework,
  structure_steps = excluded.structure_steps,
  recommended_duration = excluded.recommended_duration,
  cta_style = excluded.cta_style,
  editing_notes = excluded.editing_notes,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.ugc_angles (
  slug,
  name,
  angle_type,
  description,
  pain_points,
  desire_points,
  proof_points,
  hook_starters,
  cta_options,
  sort_order
) values
  (
    'economia-real',
    'Economia real',
    'economia',
    'Foco em pagar menos e mostrar oportunidade clara de preco.',
    array['pagar caro demais', 'comprar na hora errada'],
    array['economizar agora', 'comprar melhor que a media'],
    array['preco abaixo do normal', 'comparacao direta de valor'],
    array['Olha esse preco...', 'Nao faz sentido pagar mais nisso', 'Eu nao esperava ver esse valor'],
    array['Clica antes que mude', 'Entra no Radar Smart agora'],
    10
  ),
  (
    'descoberta-escondida',
    'Descoberta escondida',
    'descoberta',
    'Foco em novidade, descoberta e oportunidade que pouca gente viu.',
    array['nao conhecer oportunidades boas', 'perder ofertas escondidas'],
    array['descobrir antes de todo mundo', 'achar algo diferente'],
    array['oferta pouco comentada', 'produto util com valor percebido alto'],
    array['Quase ninguem viu isso ainda', 'Achei uma oferta muito escondida', 'Isso aqui passou batido'],
    array['Entra no grupo para ver antes', 'Clica e confere enquanto ainda esta no ar'],
    20
  ),
  (
    'urgencia-curta',
    'Urgencia curta',
    'urgencia',
    'Foco em janela curta de oportunidade e decisao rapida.',
    array['deixar para depois e perder', 'ver preco subir depois'],
    array['garantir antes que acabe', 'agir no momento certo'],
    array['historico de oferta curta', 'preco sujeito a alteracao'],
    array['Se voce deixar para depois, ja era', 'Isso aqui nao costuma durar', 'Esse tipo de oferta some rapido'],
    array['Clica agora', 'Entra no grupo e acompanha em tempo real'],
    30
  ),
  (
    'beneficio-direto',
    'Beneficio direto',
    'beneficio',
    'Foco no ganho pratico do produto sem enrolacao.',
    array['problema recorrente do dia a dia', 'solucao ineficiente atual'],
    array['resolver rapido', 'ter mais praticidade'],
    array['produto mostra utilidade imediata', 'uso facil de entender'],
    array['Se voce precisa de praticidade, olha isso', 'Isso aqui resolve uma dor chata bem rapido', 'Faz sentido demais para o dia a dia'],
    array['Ve o produto no link', 'Confere a oferta no Radar Smart'],
    40
  ),
  (
    'grupo-vip',
    'Grupo VIP',
    'comunidade',
    'Foco em captacao para o grupo como fonte continua de oportunidades.',
    array['chegar tarde nas melhores ofertas', 'depender de procurar manualmente'],
    array['receber antes', 'ter curadoria pronta'],
    array['Radar Smart ja separa o que vale o clique', 'grupo recebe oportunidades cedo'],
    array['Quer achar isso antes de todo mundo?', 'Tem gente vendo essas ofertas primeiro', 'Esse tipo de oportunidade vai para o grupo'],
    array['Entra gratis no grupo VIP', 'Vem para o Radar Smart agora'],
    50
  )
on conflict (slug) do update set
  name = excluded.name,
  angle_type = excluded.angle_type,
  description = excluded.description,
  pain_points = excluded.pain_points,
  desire_points = excluded.desire_points,
  proof_points = excluded.proof_points,
  hook_starters = excluded.hook_starters,
  cta_options = excluded.cta_options,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

alter table public.ugc_templates enable row level security;
alter table public.ugc_angles enable row level security;
