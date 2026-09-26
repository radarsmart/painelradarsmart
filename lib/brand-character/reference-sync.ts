// Radar Creative AI - Garota Radar / Reference Sync
//
// brand_assets (CHARACTER_REFERENCE) e a FONTE DA VERDADE.
// ugc_personas.reference_images e so um espelho/cache denormalizado.
//
// syncOfficialCharacterReferences() SEMPRE reconstroi o array inteiro a
// partir de brand_assets - nunca faz append/remove incremental. Isso
// evita o cenario de uma foto ser apagada do Storage/brand_assets e a URL
// antiga continuar presa dentro da persona.
//
// Import proposital: essa camada le direto de public.brand_assets via
// supabaseAdmin (nao importa lib/brand-assets/repository.ts) para nao
// criar um ciclo de import, ja que e o repository de brand-assets que
// chama esta funcao depois de qualquer create/update/delete.

import { supabaseAdmin } from "@/lib/supabase";
import { CHARACTER_REFERENCE_TYPES, type CharacterReferenceType } from "@/lib/brand-assets/types";

type ReferenceMirrorItem = {
  brandAssetId: string;
  url: string;
  referenceType: CharacterReferenceType | "OTHER";
  isPrimary: boolean;
};

type CharacterReferenceRow = {
  id: string;
  file_url: string;
  metadata: { referenceType?: string; isPrimary?: boolean } | null;
  created_at: string;
};

function referenceTypeRank(referenceType: string | undefined): number {
  const index = CHARACTER_REFERENCE_TYPES.indexOf(referenceType as CharacterReferenceType);
  return index === -1 ? CHARACTER_REFERENCE_TYPES.length : index;
}

function sortReferencesDeterministically(rows: CharacterReferenceRow[]): CharacterReferenceRow[] {
  return [...rows].sort((a, b) => {
    const aPrimary = Boolean(a.metadata?.isPrimary);
    const bPrimary = Boolean(b.metadata?.isPrimary);
    if (aPrimary !== bPrimary) return aPrimary ? -1 : 1;

    const rankDiff = referenceTypeRank(a.metadata?.referenceType) - referenceTypeRank(b.metadata?.referenceType);
    if (rankDiff !== 0) return rankDiff;

    return a.created_at.localeCompare(b.created_at);
  });
}

/**
 * Localiza a persona oficial atual e reconstroi completamente
 * ugc_personas.reference_images a partir dos brand_assets
 * CHARACTER_REFERENCE existentes. Se nao houver persona oficial, nao faz
 * nada (nao ha onde espelhar).
 */
export async function syncOfficialCharacterReferences(): Promise<void> {
  const official = await supabaseAdmin
    .from("ugc_personas")
    .select("id")
    .eq("is_official_brand_character", true)
    .maybeSingle();

  if (official.error) {
    throw new Error(`Falha ao localizar persona oficial: ${official.error.message}`);
  }
  if (!official.data) return;

  const references = await supabaseAdmin
    .from("brand_assets")
    .select("id,file_url,metadata,created_at")
    .eq("type", "CHARACTER_REFERENCE");

  if (references.error) {
    throw new Error(`Falha ao listar referencias da personagem: ${references.error.message}`);
  }

  const sorted = sortReferencesDeterministically((references.data ?? []) as CharacterReferenceRow[]);

  const mirror: ReferenceMirrorItem[] = sorted.map((row) => ({
    brandAssetId: row.id,
    url: row.file_url,
    referenceType: (row.metadata?.referenceType as CharacterReferenceType | undefined) ?? "OTHER",
    isPrimary: Boolean(row.metadata?.isPrimary),
  }));

  const { error } = await supabaseAdmin
    .from("ugc_personas")
    .update({ reference_images: mirror, updated_at: new Date().toISOString() })
    .eq("id", official.data.id);

  if (error) {
    throw new Error(`Falha ao sincronizar reference_images: ${error.message}`);
  }
}
