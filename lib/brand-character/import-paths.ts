// Radar Creative AI - Character Pack Importer / Paths
//
// Modulo PURO de seguranca de caminho - zero dependencia de Supabase.
// Toda leitura de arquivo do Character Pack Importer passa por aqui antes
// de tocar o disco. O frontend NUNCA envia caminho absoluto - so o
// relativePath que o proprio scanner devolveu, e mesmo assim este modulo
// revalida do zero no servidor (nunca confia em nada vindo do cliente).

import fs from "node:fs";
import path from "node:path";

export class UnsafeImportPathError extends Error {}

/**
 * Raiz permitida para um personagem: temp-brand-assets/{characterSlug}/.
 * O slug precisa ser um identificador simples (sem barra, sem "..") -
 * como isso vem de configuracao interna (nao do usuario final por rota
 * publica), ainda assim validamos.
 */
export function getCharacterImportRoot(characterSlug: string): string {
  if (!/^[a-z0-9-]+$/.test(characterSlug)) {
    throw new UnsafeImportPathError(`characterSlug invalido: "${characterSlug}".`);
  }
  return path.join(process.cwd(), "temp-brand-assets", characterSlug);
}

/**
 * Resolve e valida um relativePath contra a raiz do personagem.
 * Bloqueia:
 * - ".." em qualquer segmento (path traversal)
 * - caminho absoluto (POSIX "/" ou drive letter do Windows "C:")
 * - resultado que caia fora da raiz apos normalizacao
 * - symlink (arquivo ou diretorio intermediario) que aponte para fora da
 *   raiz real (fs.realpathSync)
 *
 * Lanca UnsafeImportPathError em qualquer violacao - nunca retorna um
 * caminho "meio validado".
 */
export function resolveSafeImportPath(characterSlug: string, relativePath: string): string {
  const root = getCharacterImportRoot(characterSlug);

  const normalizedInput = relativePath.replace(/\\/g, "/");
  if (
    !normalizedInput ||
    normalizedInput.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalizedInput) ||
    normalizedInput.split("/").includes("..")
  ) {
    throw new UnsafeImportPathError(`relativePath invalido: "${relativePath}".`);
  }

  const resolved = path.resolve(root, normalizedInput);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;

  if (resolved !== root && !resolved.startsWith(rootWithSep)) {
    throw new UnsafeImportPathError(`relativePath escapa da raiz permitida: "${relativePath}".`);
  }

  if (fs.existsSync(resolved)) {
    const realRoot = fs.realpathSync(fs.existsSync(root) ? root : path.dirname(root));
    const realResolved = fs.realpathSync(resolved);
    const realRootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

    if (realResolved !== realRoot && !realResolved.startsWith(realRootWithSep)) {
      throw new UnsafeImportPathError(
        `relativePath resolve (via symlink) para fora da raiz permitida: "${relativePath}".`,
      );
    }
  }

  return resolved;
}

export function importRootExists(characterSlug: string): boolean {
  return fs.existsSync(getCharacterImportRoot(characterSlug));
}
