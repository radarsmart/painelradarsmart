// Radar Creative AI - Commercial Video Pipeline / Asset Materializer
//
// UNICO lugar que baixa bytes de uma URL remota (GenerationResult.outputUrl)
// pra disco antes do FFmpeg conseguir usa-la. Nunca confia so na URL: valida
// HTTP ok, Content-Type de video e tamanho > 0 antes de aceitar o arquivo.
// Cache por hash da URL evita baixar o MESMO asset duas vezes, tanto entre
// execucoes (cache em disco) quanto dentro da MESMA execucao (mapa em
// memoria, resolvido sequencialmente por real-scene-asset-resolver.ts -
// nunca em paralelo, entao nao ha corrida entre duas cenas com a mesma URL).

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type MaterializeResult =
  | { ok: true; localPath: string; cacheHit: boolean; byteSize: number; contentType: string | null }
  | { ok: false; error: string };

export function computeCacheKey(url: string): string {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
}

function guessExtension(url: string, contentType: string | null): string {
  if (contentType?.includes("mp4")) return ".mp4";
  if (contentType?.includes("webm")) return ".webm";
  const match = url.match(/\.([a-z0-9]{2,4})(?:\?|$)/i);
  return match ? `.${match[1].toLowerCase()}` : ".mp4";
}

function findCachedFile(cacheDir: string, key: string): string | null {
  if (!fs.existsSync(cacheDir)) return null;
  const match = fs.readdirSync(cacheDir).find((entry) => entry.startsWith(key));
  return match ? path.join(cacheDir, match) : null;
}

/**
 * inFlightCache e um Map<url, localPath> mantido pelo CHAMADOR, valido
 * apenas durante UMA execucao de resolveRealSceneAssets - garante "zero
 * downloads duplicados na mesma execucao" mesmo antes do arquivo em cache
 * de disco existir fisicamente (nao ha necessidade de lock/race handling
 * porque a resolucao e sempre sequencial, nunca paralela).
 */
export async function materializeRemoteAsset(
  url: string,
  cacheDir: string,
  inFlightCache: Map<string, string>,
): Promise<MaterializeResult> {
  const fromMemory = inFlightCache.get(url);
  if (fromMemory && fs.existsSync(fromMemory)) {
    return { ok: true, localPath: fromMemory, cacheHit: true, byteSize: fs.statSync(fromMemory).size, contentType: null };
  }

  const key = computeCacheKey(url);
  const fromDisk = findCachedFile(cacheDir, key);
  if (fromDisk) {
    inFlightCache.set(url, fromDisk);
    return { ok: true, localPath: fromDisk, cacheHit: true, byteSize: fs.statSync(fromDisk).size, contentType: null };
  }

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    return { ok: false, error: `Falha de rede ao baixar asset: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!response.ok) {
    return { ok: false, error: `HTTP ${response.status} ao baixar asset de ${url}.` };
  }

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.startsWith("video/")) {
    return { ok: false, error: `MIME invalido (esperado video/*, recebido "${contentType ?? "desconhecido"}").` };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    return { ok: false, error: "Asset baixado tem 0 bytes." };
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  const localPath = path.join(cacheDir, `${key}${guessExtension(url, contentType)}`);
  fs.writeFileSync(localPath, buffer);
  inFlightCache.set(url, localPath);

  return { ok: true, localPath, cacheHit: false, byteSize: buffer.byteLength, contentType };
}

/**
 * Pre-popula o cache de disco com um arquivo JA existente (usado quando o
 * outputUrl remoto ja foi baixado manualmente em uma sessao anterior - ver
 * relatorio, "materializacao com cache pre-existente"). Nunca inventa
 * conteudo: falha se o arquivo de origem nao existir.
 */
export function seedMaterializerCache(url: string, cacheDir: string, existingFilePath: string): string {
  if (!fs.existsSync(existingFilePath)) {
    throw new Error(`Arquivo de seed nao encontrado: ${existingFilePath}`);
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const key = computeCacheKey(url);
  const ext = path.extname(existingFilePath) || ".mp4";
  const destPath = path.join(cacheDir, `${key}${ext}`);
  fs.copyFileSync(existingFilePath, destPath);
  return destPath;
}
