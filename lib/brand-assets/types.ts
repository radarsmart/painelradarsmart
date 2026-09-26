// Radar Creative AI - Brand Assets
// Tipos para o cadastro de ativos oficiais da marca (logo, MP4 de
// encerramento, referencias da Garota Radar, elementos graficos).

import type {
  CharacterCameraAngle,
  CharacterExpression,
  CharacterPose,
  CharacterShot,
} from "@/lib/brand-character/character-types";

export type BrandAssetType =
  | "LOGO"
  | "LOGO_TRANSPARENT"
  | "VIDEO_OUTRO"
  | "CHARACTER_REFERENCE"
  | "GRAPHIC_ELEMENT";

export const BRAND_ASSET_TYPES: BrandAssetType[] = [
  "LOGO",
  "LOGO_TRANSPARENT",
  "VIDEO_OUTRO",
  "CHARACTER_REFERENCE",
  "GRAPHIC_ELEMENT",
];

export type CharacterReferenceType =
  | "PRIMARY"
  | "FRONT"
  | "THREE_QUARTER"
  | "PROFILE"
  | "HALF_BODY"
  | "FULL_BODY"
  | "EXPRESSION"
  | "OTHER";

export const CHARACTER_REFERENCE_TYPES: CharacterReferenceType[] = [
  "PRIMARY",
  "FRONT",
  "THREE_QUARTER",
  "PROFILE",
  "HALF_BODY",
  "FULL_BODY",
  "EXPRESSION",
  "OTHER",
];

export type CharacterReferenceMetadata = {
  referenceType: CharacterReferenceType;
  description: string;
  isPrimary: boolean;

  // Metadados opcionais - permitem ao Creative Brain escolher a melhor
  // referencia automaticamente (ver lib/brand-character/character-pack.ts).
  // Referencias criadas antes desta fase (ex: a PRIMARY ja cadastrada) nao
  // tem esses campos e continuam validas - tudo aqui e opcional.
  characterId?: string;
  characterSlug?: string;
  expression?: CharacterExpression;
  pose?: CharacterPose;
  shot?: CharacterShot;
  cameraAngle?: CharacterCameraAngle;
  genderPresentation?: string;
  // outfit/environment sao string livre de proposito (crescimento futuro
  // sem precisar mudar tipo) - ver instrucao do dono.
  outfit?: string;
  environment?: string;
  tags?: string[];

  // Preenchido pelo Character Pack Importer para deteccao de duplicidade
  // (ver lib/brand-character/importer.ts). Nunca gerado para uploads
  // manuais via BrandAssetsManager.
  sha256?: string;

  // Metadata CONTROLADA e explicita: marca uma referencia como segura para
  // ser enviada a um provider generativo real (sem logo/texto/marca no
  // fundo). Nunca inferido automaticamente (nem por keyword, nem por
  // environment conter "NEUTRAL") - so fica true quando um humano marca
  // isso explicitamente na importacao ou edicao. Referencias antigas sem
  // este campo continuam validas para o uso normal (Creative Brain/Scene
  // Plan) - so ficam de fora quando o criterio de selecao pedir
  // generationSafe=true (ver character-pack-scoring.ts).
  generationSafe?: boolean;
};

export type BrandAsset = {
  id: string;
  name: string;
  type: BrandAssetType;
  fileUrl: string;
  storagePath: string | null;
  mimeType: string | null;
  usage: string | null;
  isDefault: boolean;
  metadata: Record<string, unknown>;
  createdByUserId: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

// MIME permitido por tipo de asset - a extensao fisica do arquivo no
// Storage e sempre derivada daqui, nunca do nome enviado pelo navegador.
export const ALLOWED_MIME_BY_TYPE: Record<BrandAssetType, string[]> = {
  LOGO: ["image/jpeg", "image/png", "image/webp"],
  LOGO_TRANSPARENT: ["image/png", "image/webp"],
  VIDEO_OUTRO: ["video/mp4"],
  CHARACTER_REFERENCE: ["image/jpeg", "image/png", "image/webp"],
  GRAPHIC_ELEMENT: ["image/jpeg", "image/png", "image/webp"],
};

// Tetos por tipo - o bucket ugc-assets ja limita fisicamente em 50MB;
// isso so evita, por exemplo, alguem tentar subir uma "logo" de 40MB.
export const MAX_UPLOAD_BYTES_BY_TYPE: Record<BrandAssetType, number> = {
  LOGO: 5 * 1024 * 1024,
  LOGO_TRANSPARENT: 5 * 1024 * 1024,
  VIDEO_OUTRO: 50 * 1024 * 1024,
  CHARACTER_REFERENCE: 10 * 1024 * 1024,
  GRAPHIC_ELEMENT: 10 * 1024 * 1024,
};

export function isBrandAssetType(value: unknown): value is BrandAssetType {
  return typeof value === "string" && (BRAND_ASSET_TYPES as string[]).includes(value);
}

export function isCharacterReferenceType(value: unknown): value is CharacterReferenceType {
  return typeof value === "string" && (CHARACTER_REFERENCE_TYPES as string[]).includes(value);
}
