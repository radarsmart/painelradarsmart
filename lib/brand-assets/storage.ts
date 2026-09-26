// Radar Creative AI - Brand Assets / Storage
//
// Reaproveita o bucket "ugc-assets" ja existente (publico, ja aceita
// image/png|jpeg|webp e video/mp4, limite de 50MB) - nao cria bucket novo
// e nao altera a configuracao do bucket.
//
// O caminho fisico do arquivo (pasta + nome) e SEMPRE calculado aqui no
// servidor a partir de um enum fixo + um uuid + a extensao derivada do
// MIME type validado. O frontend nunca escolhe o storage_path - isso
// elimina path traversal e nomes de arquivo maliciosos por construcao.

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import {
  ALLOWED_MIME_BY_TYPE,
  MAX_UPLOAD_BYTES_BY_TYPE,
  type BrandAssetType,
} from "@/lib/brand-assets/types";

export const BRAND_ASSETS_BUCKET = "ugc-assets";

const NAMESPACE = "brand-assets";

const FOLDER_BY_TYPE: Record<BrandAssetType, string> = {
  LOGO: "logo",
  LOGO_TRANSPARENT: "logo-transparent",
  VIDEO_OUTRO: "video-outro",
  CHARACTER_REFERENCE: "character-reference",
  GRAPHIC_ELEMENT: "graphic-element",
};

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};

export class BrandAssetValidationError extends Error {}

function assertValidMime(type: BrandAssetType, mimeType: string): void {
  const allowed = ALLOWED_MIME_BY_TYPE[type];
  if (!allowed.includes(mimeType)) {
    throw new BrandAssetValidationError(
      `MIME type "${mimeType}" nao e permitido para o tipo ${type}. Permitidos: ${allowed.join(", ")}.`,
    );
  }
}

function folderForType(type: BrandAssetType): string {
  return `${NAMESPACE}/${FOLDER_BY_TYPE[type]}`;
}

/**
 * Calcula o storage_path completo. Nunca aceita entrada do usuario alem
 * do type (ja validado contra enum) e do mimeType (ja validado contra a
 * lista permitida) - o nome fisico e sempre um UUID novo.
 */
export function buildBrandAssetStoragePath(type: BrandAssetType, mimeType: string): string {
  assertValidMime(type, mimeType);
  const extension = EXTENSION_BY_MIME[mimeType];
  return `${folderForType(type)}/${randomUUID()}.${extension}`;
}

/**
 * Confirma que um storage_path pertence ao namespace esperado para o tipo
 * declarado. Usado ao confirmar o registro apos o upload, pra rejeitar
 * qualquer path que nao tenha vindo do fluxo autorizado desta camada.
 */
export function isPathInExpectedNamespace(type: BrandAssetType, storagePath: string): boolean {
  const expectedPrefix = `${folderForType(type)}/`;
  return storagePath.startsWith(expectedPrefix) && !storagePath.includes("..");
}

export async function createBrandAssetUploadUrl(
  type: BrandAssetType,
  mimeType: string,
): Promise<{ storagePath: string; signedUrl: string; token: string }> {
  const storagePath = buildBrandAssetStoragePath(type, mimeType);

  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_ASSETS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(`Falha ao gerar signed upload URL: ${error?.message ?? "erro desconhecido"}`);
  }

  return { storagePath, signedUrl: data.signedUrl, token: data.token };
}

export type UploadedObjectInfo = {
  exists: boolean;
  sizeBytes: number | null;
  mimeType: string | null;
};

/**
 * Confere no proprio Storage (nao confia no que o navegador diz) se o
 * objeto realmente existe e devolve seu tamanho/mimetype reais.
 */
export async function inspectUploadedObject(storagePath: string): Promise<UploadedObjectInfo> {
  const lastSlash = storagePath.lastIndexOf("/");
  const folder = lastSlash >= 0 ? storagePath.slice(0, lastSlash) : "";
  const fileName = lastSlash >= 0 ? storagePath.slice(lastSlash + 1) : storagePath;

  const { data, error } = await supabaseAdmin.storage
    .from(BRAND_ASSETS_BUCKET)
    .list(folder, { search: fileName, limit: 1 });

  if (error) {
    throw new Error(`Falha ao consultar objeto no Storage: ${error.message}`);
  }

  const found = data?.find((item) => item.name === fileName);
  if (!found) {
    return { exists: false, sizeBytes: null, mimeType: null };
  }

  const metadata = (found.metadata ?? {}) as { size?: number; mimetype?: string };
  return {
    exists: true,
    sizeBytes: typeof metadata.size === "number" ? metadata.size : null,
    mimeType: typeof metadata.mimetype === "string" ? metadata.mimetype : null,
  };
}

export function getBrandAssetPublicUrl(storagePath: string): string {
  return supabaseAdmin.storage.from(BRAND_ASSETS_BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

export async function removeBrandAssetObject(storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(BRAND_ASSETS_BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`Falha ao remover arquivo do Storage: ${error.message}`);
  }
}

/**
 * Valida um upload confirmado contra o tipo declarado: namespace correto,
 * objeto existe de verdade, MIME e tamanho reais batem com o permitido.
 * Lanca BrandAssetValidationError com mensagem especifica em caso de
 * qualquer inconsistencia.
 */
export async function assertConfirmedUpload(
  type: BrandAssetType,
  storagePath: string,
): Promise<UploadedObjectInfo> {
  if (!isPathInExpectedNamespace(type, storagePath)) {
    throw new BrandAssetValidationError(
      `storage_path "${storagePath}" nao pertence ao namespace esperado para o tipo ${type}.`,
    );
  }

  const info = await inspectUploadedObject(storagePath);
  if (!info.exists) {
    throw new BrandAssetValidationError(
      "O arquivo nao foi encontrado no Storage - confirme que o upload direto terminou antes de registrar o asset.",
    );
  }

  if (info.mimeType && !ALLOWED_MIME_BY_TYPE[type].includes(info.mimeType)) {
    throw new BrandAssetValidationError(
      `O arquivo enviado tem MIME type "${info.mimeType}", que nao e permitido para ${type}.`,
    );
  }

  const maxBytes = MAX_UPLOAD_BYTES_BY_TYPE[type];
  if (info.sizeBytes !== null && info.sizeBytes > maxBytes) {
    throw new BrandAssetValidationError(
      `O arquivo tem ${(info.sizeBytes / 1024 / 1024).toFixed(1)}MB, acima do limite de ${(maxBytes / 1024 / 1024).toFixed(0)}MB para ${type}.`,
    );
  }

  return info;
}
