create table if not exists public.ugc_personas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  archetype text not null,
  gender_presentation text null,
  age_range text null,
  visual_style text null,
  tone text null,
  energy text null,
  accent text null,
  primary_use_cases text[] not null default '{}'::text[],
  provider text null,
  provider_avatar_id text null,
  provider_voice_id text null,
  behavior_profile jsonb not null default '{}'::jsonb,
  camera_profile jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_personas_active_sort
  on public.ugc_personas(is_active, sort_order, created_at desc);

create table if not exists public.ugc_projects (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid null references public.offers(id) on delete set null,
  landing_page_id uuid null references public.landing_pages(id) on delete set null,
  persona_id uuid null references public.ugc_personas(id) on delete set null,
  campaign_name text not null,
  title text not null,
  marketplace text null,
  category text null,
  product_url text not null,
  affiliate_url text null,
  image_url text null,
  price numeric(12,2) null,
  original_price numeric(12,2) null,
  ugc_type text not null check (ugc_type in ('model-a', 'model-b', 'model-c')),
  voice_key text not null,
  objective text not null default 'conversion',
  status text not null default 'draft'
    check (status in ('draft', 'brief_ready', 'script_ready', 'approved', 'archived')),
  current_script jsonb not null default '{}'::jsonb,
  current_briefing jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  created_by_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ugc_projects_created_at
  on public.ugc_projects(created_at desc);

create index if not exists idx_ugc_projects_status
  on public.ugc_projects(status);

create index if not exists idx_ugc_projects_persona_id
  on public.ugc_projects(persona_id);

create index if not exists idx_ugc_projects_offer_id
  on public.ugc_projects(offer_id);

create index if not exists idx_ugc_projects_landing_page_id
  on public.ugc_projects(landing_page_id);

alter table public.ugc_creatives
  add column if not exists project_id uuid null references public.ugc_projects(id) on delete set null;

alter table public.ugc_creatives
  add column if not exists persona_id uuid null references public.ugc_personas(id) on delete set null;

create index if not exists idx_ugc_creatives_project_id
  on public.ugc_creatives(project_id);

create index if not exists idx_ugc_creatives_persona_id
  on public.ugc_creatives(persona_id);

insert into public.ugc_personas (
  slug,
  name,
  archetype,
  gender_presentation,
  age_range,
  visual_style,
  tone,
  energy,
  accent,
  primary_use_cases,
  provider,
  behavior_profile,
  camera_profile,
  sort_order,
  is_default
) values
  (
    'camila-casa-real',
    'Camila Casa Real',
    'creator-casa',
    'feminina',
    '28-36',
    'creator de rotina domestica, visual limpo e confiavel',
    'calorosa e objetiva',
    'media',
    'brasileiro neutro',
    array['casa', 'utilidades', 'organizacao', 'limpeza'],
    'heygen',
    '{"delivery":"natural", "imperfections":"pausas leves e sorriso sutil", "emotion":"confianca"}'::jsonb,
    '{"shot":"medio", "eye_contact":"alto", "gesture":"contido"}'::jsonb,
    10,
    true
  ),
  (
    'bruno-tech-review',
    'Bruno Tech Review',
    'creator-tech',
    'masculina',
    '25-35',
    'reviewer de tecnologia com fala direta e demonstrativa',
    'didatico e seguro',
    'media-alta',
    'brasileiro sudeste',
    array['tecnologia', 'gadgets', 'eletronicos'],
    'heygen',
    '{"delivery":"ritmo rapido com pausas curtas", "imperfections":"respiracao natural e micro reacoes", "emotion":"entusiasmo controlado"}'::jsonb,
    '{"shot":"medio-fechado", "eye_contact":"alto", "gesture":"moderado"}'::jsonb,
    20,
    false
  ),
  (
    'renata-oferta-vip',
    'Renata Oferta VIP',
    'creator-ofertas',
    'feminina',
    '30-40',
    'creator focada em economia, urgencia e descoberta de oportunidades',
    'rapida e persuasiva',
    'alta',
    'brasileiro neutro',
    array['ofertas', 'grupo vip', 'promocoes', 'shopping'],
    'heygen',
    '{"delivery":"falando como amiga que achou algo bom", "imperfections":"interjeicoes leves e quebra de frase", "emotion":"urgencia"}'::jsonb,
    '{"shot":"selfie", "eye_contact":"alto", "gesture":"expressivo"}'::jsonb,
    30,
    false
  ),
  (
    'marcos-demonstracao',
    'Marcos Demonstracao',
    'creator-demonstracao',
    'masculina',
    '32-45',
    'apresentador pratico com foco em uso do produto e credibilidade',
    'calmo e convincente',
    'media',
    'brasileiro neutro',
    array['ferramentas', 'casa', 'utilidades', 'fitness'],
    'heygen',
    '{"delivery":"natural com explicacao pratica", "imperfections":"pausas e retomadas leves", "emotion":"clareza"}'::jsonb,
    '{"shot":"medio", "eye_contact":"medio-alto", "gesture":"demonstrativo"}'::jsonb,
    40,
    false
  )
on conflict (slug) do update set
  name = excluded.name,
  archetype = excluded.archetype,
  gender_presentation = excluded.gender_presentation,
  age_range = excluded.age_range,
  visual_style = excluded.visual_style,
  tone = excluded.tone,
  energy = excluded.energy,
  accent = excluded.accent,
  primary_use_cases = excluded.primary_use_cases,
  provider = excluded.provider,
  behavior_profile = excluded.behavior_profile,
  camera_profile = excluded.camera_profile,
  sort_order = excluded.sort_order,
  is_default = excluded.is_default,
  is_active = true,
  updated_at = now();

alter table public.ugc_personas enable row level security;
alter table public.ugc_projects enable row level security;
