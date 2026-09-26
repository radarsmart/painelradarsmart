// Radar Creative AI - Garota Radar
//
// Cadastro idempotente da persona oficial da Radar Smart. NAO faz insert
// manual espalhado pelo resto do codigo - toda criacao passa por
// ensureGarotaRadarPersona(), chamada a partir de UM UNICO endpoint
// administrativo (app/api/admin/creative-ai/brand-character/garota-radar).

import { supabaseAdmin } from "@/lib/supabase";

export const GAROTA_RADAR_SLUG = "garota-radar";

export type GarotaRadarPersona = {
  id: string;
  slug: string;
  name: string;
  archetype: string;
  gender_presentation: string | null;
  visual_style: string | null;
  tone: string | null;
  energy: string | null;
  primary_use_cases: string[];
  is_active: boolean;
  is_default: boolean;
  is_official_brand_character: boolean;
  identity_locked: boolean;
  character_notes: string | null;
  avatar_image_url: string | null;
  reference_images: unknown;
  created_at: string;
  updated_at: string;
};

const PERSONA_SELECT =
  "id,slug,name,archetype,gender_presentation,visual_style,tone,energy,primary_use_cases," +
  "is_active,is_default,is_official_brand_character,identity_locked,character_notes," +
  "avatar_image_url,reference_images,created_at,updated_at";

// Definicao canonica aprovada. Usada SOMENTE na criacao - se a persona ja
// existir, nao sobrescrevemos campos descritivos que o admin possa ter
// editado manualmente depois (idempotencia == seguro chamar de novo, nao
// == "resetar sempre pro valor original").
const GAROTA_RADAR_DEFINITION = {
  slug: GAROTA_RADAR_SLUG,
  name: "Garota Radar",
  archetype: "brand-character",
  gender_presentation: "feminina",
  visual_style:
    "Apresentadora publicitaria moderna, elegante, confiavel e versatil, " +
    "com identidade visual premium alinhada a Radar Smart.",
  tone: "natural, simpatica, persuasiva e confiante",
  energy: "dinamica e envolvente",
  primary_use_cases: [
    "ofertas",
    "produtos",
    "reviews",
    "demonstracoes",
    "ugc",
    "social-commerce",
  ],
  is_active: true,
  is_default: false,
  character_notes:
    "Personagem oficial da Radar Smart.\n\n" +
    "Preservar identidade facial e caracteristicas reconheciveis da personagem em todas as campanhas.\n\n" +
    "Pode variar:\nroupa, penteado, maquiagem, acessorios, expressao, pose e cenario.\n\n" +
    "Nao alterar:\nidentidade facial, estrutura principal do rosto e aparencia reconhecivel.\n\n" +
    "A aparencia deve permanecer fotorrealista e consistente entre campanhas.",
};

/**
 * Retira o status de "oficial" de qualquer OUTRA persona (o indice unico
 * parcial em ugc_personas e a ultima defesa contra 2 oficiais, nao a
 * primeira - sempre desligamos antes de ligar).
 */
async function clearOtherOfficialPersonas(exceptPersonaId?: string): Promise<void> {
  let query = supabaseAdmin
    .from("ugc_personas")
    .update({
      is_official_brand_character: false,
      identity_locked: false,
      updated_at: new Date().toISOString(),
    })
    .eq("is_official_brand_character", true);

  if (exceptPersonaId) query = query.neq("id", exceptPersonaId);

  const { error } = await query;
  if (error) {
    throw new Error(`Falha ao retirar persona oficial anterior: ${error.message}`);
  }
}

/**
 * Garante que a persona "Garota Radar" existe e esta marcada como
 * personagem oficial. Idempotente: chamar varias vezes nunca cria
 * duplicata (checa por slug antes, e a coluna slug e UNIQUE no banco como
 * ultima defesa).
 */
export async function ensureGarotaRadarPersona(): Promise<{
  created: boolean;
  persona: GarotaRadarPersona;
}> {
  const existing = await supabaseAdmin
    .from("ugc_personas")
    .select(PERSONA_SELECT)
    .eq("slug", GAROTA_RADAR_SLUG)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`Falha ao verificar persona Garota Radar: ${existing.error.message}`);
  }

  if (existing.data) {
    const persona = existing.data as unknown as GarotaRadarPersona;
    if (persona.is_official_brand_character && persona.identity_locked) {
      return { created: false, persona };
    }

    // Ja existe mas por algum motivo perdeu o status oficial - so corrige
    // as flags, nao mexe nos campos descritivos.
    await clearOtherOfficialPersonas(persona.id);
    const { data, error } = await supabaseAdmin
      .from("ugc_personas")
      .update({
        is_official_brand_character: true,
        identity_locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", persona.id)
      .select(PERSONA_SELECT)
      .single();

    if (error) throw new Error(`Falha ao restaurar status oficial da Garota Radar: ${error.message}`);
    return { created: false, persona: data as unknown as GarotaRadarPersona };
  }

  await clearOtherOfficialPersonas();

  const { data, error } = await supabaseAdmin
    .from("ugc_personas")
    .insert({
      ...GAROTA_RADAR_DEFINITION,
      is_official_brand_character: true,
      identity_locked: true,
    })
    .select(PERSONA_SELECT)
    .single();

  if (error) {
    throw new Error(`Falha ao criar persona Garota Radar: ${error.message}`);
  }

  return { created: true, persona: data as unknown as GarotaRadarPersona };
}
