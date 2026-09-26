// Radar Creative AI - Commercial Video Pipeline / Scene Asset Resolver
//
// UNICA responsabilidade: descobrir, pra cada sceneId, se ja existe um
// arquivo de video pronto - nunca chama nenhum provider pra preencher
// uma cena faltante. Hoje resolve contra um diretorio local
// (fixtures/mock ou assets ja baixados manualmente); amanha, quando o
// Generation Orchestrator passar a produzir GenerationResult por cena
// de verdade, este e o unico arquivo que precisaria mudar (ver
// "integracao futura" no relatorio).

import fs from "node:fs";
import path from "node:path";

/**
 * Resolve sceneId -> caminho do arquivo, tentando "<sceneId>.<ext>"
 * dentro de directory. null quando o arquivo nao existe - NUNCA inventa
 * um caminho nem cai para um asset generico.
 */
export function resolveSceneAssetsFromDirectory(
  sceneIds: string[],
  directory: string,
  extension = "mp4",
): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const sceneId of sceneIds) {
    const candidate = path.join(directory, `${sceneId}.${extension}`);
    map[sceneId] = fs.existsSync(candidate) ? candidate : null;
  }
  return map;
}

/**
 * Variante que aceita um mapa EXPLICITO (sceneId -> caminho) e so
 * confirma que cada caminho informado realmente existe no disco -
 * substitui por null qualquer caminho que nao exista (nunca finge que
 * um arquivo inexistente esta pronto).
 */
export function verifySceneAssetPaths(paths: Record<string, string | null>): Record<string, string | null> {
  const verified: Record<string, string | null> = {};
  for (const [sceneId, candidate] of Object.entries(paths)) {
    verified[sceneId] = candidate && fs.existsSync(candidate) ? candidate : null;
  }
  return verified;
}
