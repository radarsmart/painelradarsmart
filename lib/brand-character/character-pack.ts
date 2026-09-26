// Radar Creative AI - Character Pack Service
//
// Camada com I/O (Supabase) que organiza e seleciona referencias visuais
// de um personagem. Arquitetura reutilizavel: nada aqui menciona "Garota
// Radar" no codigo - qualquer characterSlug funciona, contanto que exista
// uma persona com esse slug em ugc_personas.
//
// brand_assets continua sendo a FONTE DA VERDADE (nao ha cache local
// aqui). Import proposital: le direto via supabaseAdmin, sem importar
// lib/brand-assets/repository.ts, para nao criar ciclo (repository.ts ja
// depende de lib/brand-character/reference-sync.ts).

import { supabaseAdmin } from "@/lib/supabase";
import {
  rankCharacterReferences,
  selectBestFromCandidates,
} from "@/lib/brand-character/character-pack-scoring";
import type {
  CharacterReferenceCandidate,
  CharacterReferenceCriteria,
  ScoredCharacterReference,
} from "@/lib/brand-character/character-types";

export type CharacterReferenceAsset = CharacterReferenceCandidate & {
  name: string;
  fileUrl: string;
  createdAt: string;
};

type BrandAssetRow = {
  id: string;
  name: string;
  file_url: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type PersonaLookup = {
  id: string;
  slug: string;
  is_official_brand_character: boolean;
};

async function getPersonaBySlug(characterSlug: string): Promise<PersonaLookup | null> {
  const { data, error } = await supabaseAdmin
    .from("ugc_personas")
    .select("id,slug,is_official_brand_character")
    .eq("slug", characterSlug)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar personagem "${characterSlug}": ${error.message}`);
  return data as PersonaLookup | null;
}

function rowToAsset(row: BrandAssetRow): CharacterReferenceAsset {
  return {
    id: row.id,
    name: row.name,
    fileUrl: row.file_url,
    createdAt: row.created_at,
    metadata: (row.metadata ?? {}) as CharacterReferenceAsset["metadata"],
  };
}

/**
 * Todas as CHARACTER_REFERENCE de um personagem (inclui a PRIMARY).
 *
 * Compatibilidade: referencias criadas ANTES desta fase nao tem
 * metadata.characterSlug (ex: a PRIMARY ja cadastrada da Garota Radar).
 * Para essas, assumimos que pertencem a persona oficial ATUAL - e
 * exatamente o comportamento que ja existia (syncOfficialCharacterReferences
 * sempre tratou "toda CHARACTER_REFERENCE" como sendo da persona oficial).
 * Referencias novas devem vir com characterSlug preenchido.
 */
export async function getCharacterReferences(characterSlug: string): Promise<CharacterReferenceAsset[]> {
  const persona = await getPersonaBySlug(characterSlug);

  const { data, error } = await supabaseAdmin
    .from("brand_assets")
    .select("id,name,file_url,metadata,created_at")
    .eq("type", "CHARACTER_REFERENCE");

  if (error) throw new Error(`Falha ao listar referencias de "${characterSlug}": ${error.message}`);

  const rows = (data ?? []) as BrandAssetRow[];

  return rows
    .filter((row) => {
      const rowSlug = (row.metadata as { characterSlug?: string } | null)?.characterSlug;
      if (rowSlug) return rowSlug === characterSlug;
      return Boolean(persona?.is_official_brand_character);
    })
    .map(rowToAsset);
}

export async function getCharacterPrimaryReference(
  characterSlug: string,
): Promise<CharacterReferenceAsset | null> {
  const references = await getCharacterReferences(characterSlug);
  return references.find((reference) => reference.metadata.isPrimary) ?? null;
}

/**
 * Referencias "compativeis" com o personagem - ou seja, do personagem
 * certo, excluindo a PRIMARY (que nunca compete como support reference,
 * conforme definido: ela e identity reference, nao candidata a
 * pose/expressao). O casamento fino de expression/pose/shot/etc acontece
 * no scoring (selectBestCharacterReference), nao aqui.
 */
export async function findCharacterReferences(
  criteria: CharacterReferenceCriteria,
): Promise<CharacterReferenceAsset[]> {
  if (!criteria.characterSlug) {
    throw new Error("characterSlug e obrigatorio para buscar referencias de personagem.");
  }

  const references = await getCharacterReferences(criteria.characterSlug);
  return references.filter((reference) => !reference.metadata.isPrimary);
}

export async function rankCharacterReferenceCandidates(
  criteria: CharacterReferenceCriteria,
): Promise<ScoredCharacterReference<CharacterReferenceAsset>[]> {
  const candidates = await findCharacterReferences(criteria);
  return rankCharacterReferences(candidates, criteria);
}

export async function selectBestCharacterReference(
  criteria: CharacterReferenceCriteria,
): Promise<ScoredCharacterReference<CharacterReferenceAsset> | null> {
  const candidates = await findCharacterReferences(criteria);
  return selectBestFromCandidates(candidates, criteria);
}

export type CharacterReferencePair = {
  identityReference: CharacterReferenceAsset | null;
  supportReference: CharacterReferenceAsset | null;
  supportMatch: ScoredCharacterReference<CharacterReferenceAsset> | null;
};

/**
 * Combina identity reference (sempre a PRIMARY) com a melhor support
 * reference encontrada para o criterio pedido. A PRIMARY NUNCA e
 * substituida pela support reference - sao papeis diferentes.
 */
export async function selectCharacterReferencePair(
  criteria: CharacterReferenceCriteria,
): Promise<CharacterReferencePair> {
  if (!criteria.characterSlug) {
    throw new Error("characterSlug e obrigatorio para montar o par de referencias.");
  }

  const [identityReference, supportMatch] = await Promise.all([
    getCharacterPrimaryReference(criteria.characterSlug),
    selectBestCharacterReference(criteria),
  ]);

  return {
    identityReference,
    supportReference: supportMatch?.asset ?? null,
    supportMatch,
  };
}
