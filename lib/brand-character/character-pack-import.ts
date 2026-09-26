// Radar Creative AI - Character Pack Importer / Orchestration
//
// Unico arquivo do importador que toca Supabase (Storage + banco). Todo o
// resto (scanner, manifest, path-safety) e fs-only e testavel sem rede.
//
// Reaproveita deliberadamente:
// - lib/brand-assets/storage.ts (bucket, path builder, public URL)
// - lib/brand-assets/repository.ts (createBrandAsset - ja dispara
//   syncOfficialCharacterReferences() sozinho para CHARACTER_REFERENCE)
// - lib/brand-character/character-pack.ts (getCharacterReferences, para
//   descobrir hashes ja existentes)
//
// Desvio deliberado do fluxo de upload manual: o upload manual usa signed
// URL porque o arquivo esta no NAVEGADOR do admin. Aqui o arquivo ja esta
// em disco no proprio servidor (temp-brand-assets/), entao subimos direto
// via supabaseAdmin (service role) sem o passo de signed URL - eliminar
// esse round-trip nao muda nenhuma garantia de seguranca (o service role
// ja e usado nos dois casos) e evita 2 chamadas de rede por arquivo.

import { supabaseAdmin } from "@/lib/supabase";
import { BRAND_ASSETS_BUCKET, buildBrandAssetStoragePath, getBrandAssetPublicUrl } from "@/lib/brand-assets/storage";
import { createBrandAsset } from "@/lib/brand-assets/repository";
import { getCharacterReferences } from "@/lib/brand-character/character-pack";
import {
  annotateDuplicates,
  readValidatedImportFile,
  scanCharacterImportDirectory,
  type ScannedCharacterAsset,
} from "@/lib/brand-character/importer";
import {
  applyManifestOverride,
  indexManifestByPath,
  loadImportManifest,
} from "@/lib/brand-character/import-manifest";

export type ScannedCharacterAssetWithManifest = ScannedCharacterAsset & {
  name: string;
};

/**
 * Coleta os sha256 ja cadastrados em brand_assets para o personagem, para
 * a deteccao de duplicidade (comparacao pura acontece em
 * importer.annotateDuplicates).
 */
export async function getExistingCharacterReferenceHashes(characterSlug: string): Promise<Set<string>> {
  const references = await getCharacterReferences(characterSlug);
  const hashes = new Set<string>();
  for (const reference of references) {
    const sha256 = reference.metadata.sha256;
    if (sha256) hashes.add(sha256);
  }
  return hashes;
}

/**
 * Escaneia a pasta local, aplica manifest.json (se existir) por cima da
 * sugestao automatica, e marca duplicatas contra o banco real. Nao grava
 * nada - so leitura.
 */
export async function scanCharacterPackForImport(
  characterSlug: string,
): Promise<ScannedCharacterAssetWithManifest[]> {
  const scanned = scanCharacterImportDirectory(characterSlug);
  const manifest = loadImportManifest(characterSlug);
  const manifestIndex = indexManifestByPath(manifest);
  const existingHashes = await getExistingCharacterReferenceHashes(characterSlug);

  const withDuplicates = annotateDuplicates(scanned, existingHashes);

  return withDuplicates.map((item) => {
    const manifestEntry = manifestIndex.get(item.relativePath);
    const overridden = applyManifestOverride(item.suggestedMetadata, manifestEntry);

    return {
      ...item,
      suggestedMetadata: {
        referenceType: overridden.referenceType,
        expression: overridden.expression,
        pose: overridden.pose,
        shot: overridden.shot,
        cameraAngle: overridden.cameraAngle,
        outfit: overridden.outfit,
        environment: overridden.environment,
        tags: overridden.tags,
        generationSafe: overridden.generationSafe,
      },
      name: overridden.name ?? item.fileName,
    };
  });
}

export type ImportSelection = {
  relativePath: string;
  name: string;
  referenceType: string;
  description?: string;
  expression?: string;
  pose?: string;
  shot?: string;
  cameraAngle?: string;
  outfit?: string;
  environment?: string;
  tags?: string[];
  // Explicito - nunca inferido. Ver lib/brand-assets/types.ts.
  generationSafe?: boolean;
  // Aceito no payload so para podermos detectar e BLOQUEAR a tentativa -
  // nunca e realmente usado para marcar isPrimary=true.
  isPrimary?: boolean;
};

export type ImportResultStatus = "SUCCESS" | "SKIPPED_DUPLICATE" | "FAILED";

export type ImportResult = {
  relativePath: string;
  status: ImportResultStatus;
  brandAssetId?: string;
  error?: string;
};

/**
 * Importa os arquivos selecionados, um de cada vez (concorrencia baixa
 * proposital). Um erro em um arquivo nao interrompe os demais - cada item
 * tem seu proprio try/catch e resultado independente.
 */
export async function importSelectedCharacterAssets(
  characterSlug: string,
  selections: ImportSelection[],
  creator: { userId?: string | null; email?: string | null },
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  const knownHashes = await getExistingCharacterReferenceHashes(characterSlug);

  for (const selection of selections) {
    try {
      if (selection.isPrimary) {
        results.push({
          relativePath: selection.relativePath,
          status: "FAILED",
          error:
            "Este importador nao pode definir PRIMARY. Use o fluxo especifico de troca de PRIMARY " +
            "(upload manual em Brand Assets com isPrimary=true) para isso.",
        });
        continue;
      }

      const { buffer, mimeType, sha256 } = readValidatedImportFile(characterSlug, selection.relativePath);

      if (knownHashes.has(sha256)) {
        results.push({ relativePath: selection.relativePath, status: "SKIPPED_DUPLICATE" });
        continue;
      }

      const storagePath = buildBrandAssetStoragePath("CHARACTER_REFERENCE", mimeType);

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BRAND_ASSETS_BUCKET)
        .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

      if (uploadError) {
        throw new Error(`Falha no upload ao Storage: ${uploadError.message}`);
      }

      const fileUrl = getBrandAssetPublicUrl(storagePath);

      const asset = await createBrandAsset({
        name: selection.name,
        type: "CHARACTER_REFERENCE",
        fileUrl,
        storagePath,
        mimeType,
        usage: null,
        isDefault: false,
        createdByUserId: creator.userId ?? null,
        createdByEmail: creator.email ?? null,
        metadata: {
          referenceType: selection.referenceType || "OTHER",
          description: selection.description ?? "",
          isPrimary: false,
          characterSlug,
          expression: selection.expression || undefined,
          pose: selection.pose || undefined,
          shot: selection.shot || undefined,
          cameraAngle: selection.cameraAngle || undefined,
          outfit: selection.outfit || undefined,
          environment: selection.environment || undefined,
          tags: selection.tags?.length ? selection.tags : undefined,
          generationSafe: selection.generationSafe === true ? true : undefined,
          sha256,
        },
      });

      knownHashes.add(sha256);
      results.push({ relativePath: selection.relativePath, status: "SUCCESS", brandAssetId: asset.id });
    } catch (error) {
      results.push({
        relativePath: selection.relativePath,
        status: "FAILED",
        error: error instanceof Error ? error.message : "Erro desconhecido ao importar.",
      });
    }
  }

  return results;
}
