-- Radar Creative AI - Fase 4 (Garota-propaganda oficial)
-- Reaproveita ugc_personas em vez de criar brand_characters: a persona
-- oficial da marca e so uma linha marcada is_official_brand_character=true.
-- Nenhuma coluna existente e alterada, apenas colunas novas aditivas.
-- Geracao da personagem fica para uma fase futura - aqui e so schema.

alter table public.ugc_personas
  add column if not exists is_official_brand_character boolean not null default false;

alter table public.ugc_personas
  add column if not exists identity_locked boolean not null default false;

alter table public.ugc_personas
  add column if not exists reference_images jsonb not null default '[]'::jsonb;

alter table public.ugc_personas
  add column if not exists allowed_variations jsonb not null default '[]'::jsonb;

alter table public.ugc_personas
  add column if not exists character_notes text null;

-- No maximo uma persona oficial ativa por vez.
create unique index if not exists idx_ugc_personas_single_official_brand_character
  on public.ugc_personas(is_official_brand_character)
  where is_official_brand_character = true;
