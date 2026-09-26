// Radar Creative AI - Character Pack Importer / Manifest
//
// Le temp-brand-assets/{characterSlug}/manifest.json (opcional) e aplica
// como override sobre a sugestao automatica do scanner. Modulo fs-only
// (sem Supabase), testavel com fixture local.

import fs from "node:fs";
import path from "node:path";

import { getCharacterImportRoot } from "@/lib/brand-character/import-paths";
import type { SuggestedMetadata } from "@/lib/brand-character/importer";

export type ManifestEntry = {
  file: string;
  name?: string;
  referenceType?: string;
  expression?: string;
  pose?: string;
  shot?: string;
  cameraAngle?: string;
  outfit?: string;
  environment?: string;
  tags?: string[];
  // Explicito e opcional - nunca inferido a partir de outros campos (ver
  // importer.ts). Omitir do manifest = comportamento antigo (sem o flag).
  generationSafe?: boolean;
};

export type ImportManifest = {
  characterSlug?: string;
  assets: ManifestEntry[];
};

function normalizeManifestPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Carrega o manifest.json se existir. Retorna null se o arquivo nao
 * existir - manifest e sempre opcional. Lanca erro so se o arquivo
 * existir mas for JSON invalido ou tiver formato incorreto (melhor falhar
 * alto do que importar com dado errado silenciosamente).
 */
export function loadImportManifest(characterSlug: string): ImportManifest | null {
  const root = getCharacterImportRoot(characterSlug);
  const manifestPath = path.join(root, "manifest.json");

  if (!fs.existsSync(manifestPath)) return null;

  const raw = fs.readFileSync(manifestPath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`manifest.json invalido (JSON malformado): ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as ImportManifest).assets)) {
    throw new Error('manifest.json precisa ter o formato { "assets": [...] }.');
  }

  const manifest = parsed as ImportManifest;
  for (const entry of manifest.assets) {
    if (!entry || typeof entry.file !== "string" || !entry.file.trim()) {
      throw new Error('Cada item de manifest.assets precisa ter "file" (string) preenchido.');
    }
  }

  return manifest;
}

/**
 * Indexa o manifest por relativePath normalizado, para lookup O(1) ao
 * anotar os resultados do scanner.
 */
export function indexManifestByPath(manifest: ImportManifest | null): Map<string, ManifestEntry> {
  const index = new Map<string, ManifestEntry>();
  if (!manifest) return index;

  for (const entry of manifest.assets) {
    index.set(normalizeManifestPath(entry.file), entry);
  }
  return index;
}

/**
 * Manifest SOBRESCREVE a sugestao automatica campo a campo - so os
 * campos presentes no manifest substituem; os demais continuam vindo da
 * inferencia por nome/pasta.
 */
export function applyManifestOverride(
  suggested: SuggestedMetadata,
  manifestEntry: ManifestEntry | undefined,
): SuggestedMetadata & {
  name?: string;
  outfit?: string;
  environment?: string;
  tags?: string[];
  generationSafe?: boolean;
} {
  if (!manifestEntry) return suggested;

  return {
    referenceType: manifestEntry.referenceType ?? suggested.referenceType,
    expression: (manifestEntry.expression as SuggestedMetadata["expression"]) ?? suggested.expression,
    pose: (manifestEntry.pose as SuggestedMetadata["pose"]) ?? suggested.pose,
    shot: manifestEntry.shot ?? suggested.shot,
    cameraAngle: (manifestEntry.cameraAngle as SuggestedMetadata["cameraAngle"]) ?? suggested.cameraAngle,
    name: manifestEntry.name,
    outfit: manifestEntry.outfit,
    environment: manifestEntry.environment,
    tags: manifestEntry.tags,
    generationSafe: manifestEntry.generationSafe,
  };
}
