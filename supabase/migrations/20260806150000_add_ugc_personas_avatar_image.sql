-- Foto de referencia da "garota propaganda" (ou qualquer persona) usada
-- pelo OmniHuman 1.5 (Freepik/Magnific) pra gerar a cena dela falando,
-- sincronizada com o audio da narracao (hook/cta). Sem essa foto a persona
-- so pode ser usada no fluxo antigo (so produto, sem avatar falando).
alter table public.ugc_personas
  add column if not exists avatar_image_url text null;
