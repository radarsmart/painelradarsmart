// Radar Creative AI - Character Pack Importer / Scanner
//
// Modulo fs-only (SEM Supabase) para poder ser testado com fixtures locais
// sem tocar banco nenhum. A checagem de duplicidade contra o banco real
// (por sha256) fica em character-pack-import.ts, que chama
// annotateDuplicates() aqui com os hashes ja existentes.

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

import { getCharacterImportRoot, resolveSafeImportPath } from "@/lib/brand-character/import-paths";
import type {
  CharacterCameraAngle,
  CharacterExpression,
  CharacterPose,
} from "@/lib/brand-character/character-types";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

const IGNORED_FILE_NAMES = new Set([".ds_store", "thumbs.db", "desktop.ini", "manifest.json"]);

export type ScanStatus = "READY" | "DUPLICATE" | "INVALID";

export type SuggestedMetadata = {
  referenceType?: string;
  expression?: CharacterExpression;
  pose?: CharacterPose;
  shot?: string;
  cameraAngle?: CharacterCameraAngle;
  // outfit/environment/tags so vem preenchidos quando ha override no
  // manifest.json - a inferencia automatica por pasta/nome nunca os seta
  // (nao ha regra definida pra isso, ver inferMetadata()).
  outfit?: string;
  environment?: string;
  tags?: string[];
  // generationSafe SO vem de override explicito no manifest.json (ou de
  // marcacao manual na UI) - inferMetadata() nunca seta este campo, nem
  // mesmo quando o environment sugerido contiver "NEUTRAL". Protecao
  // contra vazamento de marca e sempre uma decisao humana explicita.
  generationSafe?: boolean;
};

export type ScannedCharacterAsset = {
  fileName: string;
  relativePath: string;
  folder: string;
  mimeType: AllowedMimeType | null;
  size: number;
  sha256: string | null;
  status: ScanStatus;
  invalidReason?: string;
  suggestedMetadata: SuggestedMetadata;
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function normalizeToken(value: string): string {
  return stripAccents(value).toLowerCase();
}

/**
 * Detecta o MIME real pelos primeiros bytes do arquivo (magic bytes) - a
 * extensao do nome do arquivo nunca e usada como fonte de verdade sozinha,
 * so como dica inicial.
 */
function sniffImageMime(buffer: Buffer): AllowedMimeType | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function sha256File(filePath: string): string {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

// --- Inferencia de metadata (sem IA) ---------------------------------

const EXPRESSION_KEYWORDS: Record<string, CharacterExpression> = {
  confiante: "CONFIDENT",
  sorrindo: "SMILING",
  sorriso: "SMILING",
  feliz: "HAPPY",
  surpresa: "SURPRISED",
  surpreendida: "SURPRISED",
  piscando: "WINKING",
  piscadela: "WINKING",
  serio: "SERIOUS",
  seria: "SERIOUS",
  pensativa: "THOUGHTFUL",
  pensativo: "THOUGHTFUL",
  animada: "EXCITED",
  empolgada: "EXCITED",
  convidativa: "INVITING",
  neutra: "NEUTRAL",
  neutro: "NEUTRAL",
};

const POSE_KEYWORDS: Record<string, CharacterPose> = {
  apontando: "POINTING",
  "apontando-cima": "POINTING_UP",
  "apontando-baixo": "POINTING_DOWN",
  "bracos-cruzados": "ARMS_CROSSED",
  bracoscruzados: "ARMS_CROSSED",
  "maos-no-bolso": "HANDS_IN_POCKETS",
  maosnobolso: "HANDS_IN_POCKETS",
  apresentando: "PRESENTING",
  convidando: "INVITING",
  polegar: "THUMBS_UP",
  joinha: "THUMBS_UP",
  "mao-no-queixo": "HAND_ON_CHIN",
  comemorando: "CELEBRATING",
  andando: "WALKING",
  caminhando: "WALKING",
  apoiada: "LEANING",
  encostada: "LEANING",
};

const ANGLE_KEYWORDS: Record<string, CharacterCameraAngle> = {
  front: "FRONT",
  frontal: "FRONT",
  "three-quarter": "THREE_QUARTER",
  threequarter: "THREE_QUARTER",
  "3-4": "THREE_QUARTER",
  "tres-quartos": "THREE_QUARTER",
  profile: "PROFILE",
  perfil: "PROFILE",
};

function matchKeyword<T extends string>(token: string, table: Record<string, T>): T | undefined {
  if (table[token]) return table[token];
  for (const [keyword, value] of Object.entries(table)) {
    if (token.includes(keyword)) return value;
  }
  return undefined;
}

/**
 * Infere metadata SOMENTE quando pasta/nome da evidencia clara - nunca
 * inventa valor sem base no nome real do arquivo. Regras documentadas na
 * especificacao: expressions/poses/angles/fullbody tem regra definida;
 * corporate/lifestyle/digital/other nao tem (ficam sem sugestao).
 */
function inferMetadata(folder: string, fileNameWithoutExtension: string): SuggestedMetadata {
  const token = normalizeToken(fileNameWithoutExtension);
  const topFolder = folder.split("/")[0] ?? "";

  if (topFolder === "expressions") {
    const expression = matchKeyword(token, EXPRESSION_KEYWORDS);
    return expression ? { referenceType: "EXPRESSION", expression } : {};
  }

  if (topFolder === "poses") {
    const pose = matchKeyword(token, POSE_KEYWORDS);
    return pose ? { pose } : {};
  }

  if (topFolder === "angles") {
    const angle = matchKeyword(token, ANGLE_KEYWORDS);
    return angle ? { referenceType: angle, cameraAngle: angle } : {};
  }

  if (topFolder === "fullbody") {
    return { referenceType: "FULL_BODY", shot: "FULL_BODY" };
  }

  // corporate/lifestyle/digital/other/qualquer pasta desconhecida: sem
  // regra definida, nao inventamos metadata.
  return {};
}

function isSymlinkEscapingRoot(fullPath: string, realRootWithSep: string, realRoot: string): boolean {
  const realPath = fs.realpathSync(fullPath);
  return realPath !== realRoot && !realPath.startsWith(realRootWithSep);
}

/**
 * Varre recursivamente a pasta do personagem. NUNCA segue symlink para
 * fora da raiz (verificado via fs.realpathSync a cada entrada). Arquivos
 * ocultos/de sistema sao ignorados silenciosamente; arquivos com MIME nao
 * permitido aparecem com status INVALID (para o admin entender por que
 * nao podem ser importados), nao sao simplesmente omitidos.
 */
export function scanCharacterImportDirectory(characterSlug: string): ScannedCharacterAsset[] {
  const root = getCharacterImportRoot(characterSlug);
  if (!fs.existsSync(root)) return [];

  const realRoot = fs.realpathSync(root);
  const realRootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

  const results: ScannedCharacterAsset[] = [];

  function walk(currentDir: string, relativeFolder: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (IGNORED_FILE_NAMES.has(entry.name.toLowerCase())) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (isSymlinkEscapingRoot(fullPath, realRootWithSep, realRoot)) {
        continue;
      }

      if (entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(fullPath).isDirectory())) {
        walk(fullPath, relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name);
        continue;
      }

      if (!entry.isFile() && !entry.isSymbolicLink()) continue;

      const relativePath = relativeFolder ? `${relativeFolder}/${entry.name}` : entry.name;
      const stats = fs.statSync(fullPath);
      const extension = path.extname(entry.name).toLowerCase();
      const nameWithoutExtension = path.basename(entry.name, extension);

      const header = Buffer.alloc(16);
      const fd = fs.openSync(fullPath, "r");
      const bytesRead = fs.readSync(fd, header, 0, 16, 0);
      fs.closeSync(fd);

      const sniffedMime = sniffImageMime(header.subarray(0, bytesRead));

      if (!sniffedMime) {
        results.push({
          fileName: entry.name,
          relativePath,
          folder: relativeFolder,
          mimeType: null,
          size: stats.size,
          sha256: null,
          status: "INVALID",
          invalidReason: "Arquivo nao e PNG/JPEG/WEBP valido (assinatura de bytes nao reconhecida).",
          suggestedMetadata: {},
        });
        continue;
      }

      results.push({
        fileName: entry.name,
        relativePath,
        folder: relativeFolder,
        mimeType: sniffedMime,
        size: stats.size,
        sha256: sha256File(fullPath),
        status: "READY",
        suggestedMetadata: inferMetadata(relativeFolder, nameWithoutExtension),
      });
    }
  }

  walk(root, "");
  return results;
}

/**
 * Marca como DUPLICATE qualquer item cujo sha256 ja exista no conjunto de
 * hashes ja cadastrados em brand_assets (calculado por
 * character-pack-import.ts, que tem acesso ao banco). Puro - nao acessa
 * banco nem disco.
 */
export function annotateDuplicates(
  items: ScannedCharacterAsset[],
  existingHashes: ReadonlySet<string>,
): ScannedCharacterAsset[] {
  return items.map((item) => {
    if (item.status !== "READY") return item;
    if (item.sha256 && existingHashes.has(item.sha256)) {
      return { ...item, status: "DUPLICATE" as const };
    }
    return item;
  });
}

/**
 * Le um unico arquivo ja validado pelo path-safety para upload (usada
 * pela rota de import, nunca pelo scanner).
 */
export function readValidatedImportFile(
  characterSlug: string,
  relativePath: string,
): { buffer: Buffer; mimeType: AllowedMimeType; sha256: string } {
  const fullPath = resolveSafeImportPath(characterSlug, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`Arquivo nao encontrado: "${relativePath}".`);
  }

  const buffer = fs.readFileSync(fullPath);
  const mimeType = sniffImageMime(buffer.subarray(0, 16));
  if (!mimeType) {
    throw new Error(`Arquivo "${relativePath}" nao e PNG/JPEG/WEBP valido.`);
  }

  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  return { buffer, mimeType, sha256 };
}

export { ALLOWED_MIME_TYPES };
export type { AllowedMimeType };
