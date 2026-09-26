import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";

import { requireAdmin } from "@/lib/admin-auth";
import { resolveSafeImportPath, UnsafeImportPathError } from "@/lib/brand-character/import-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CHARACTER_SLUG = "garota-radar";

const MIME_BY_SIGNATURE: Array<{ mime: string; check: (buffer: Buffer) => boolean }> = [
  {
    mime: "image/png",
    check: (buffer) =>
      buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: "image/jpeg",
    check: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mime: "image/webp",
    check: (buffer) =>
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Serve o BYTE do arquivo local (somente leitura) para preview no painel.
 * Nunca aceita caminho absoluto - so relativePath, revalidado do zero
 * contra a raiz permitida a cada chamada.
 */
export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const characterSlug = toText(req.nextUrl.searchParams.get("characterSlug")) || DEFAULT_CHARACTER_SLUG;
    const relativePath = toText(req.nextUrl.searchParams.get("relativePath"));
    if (!relativePath) {
      return NextResponse.json({ error: "relativePath e obrigatorio." }, { status: 400 });
    }

    const fullPath = resolveSafeImportPath(characterSlug, relativePath);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      return NextResponse.json({ error: "Arquivo nao encontrado." }, { status: 404 });
    }

    const buffer = fs.readFileSync(fullPath);
    const match = MIME_BY_SIGNATURE.find(({ check }) => check(buffer));
    if (!match) {
      return NextResponse.json({ error: "Arquivo nao e uma imagem PNG/JPEG/WEBP valida." }, { status: 415 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": match.mime,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const status = error instanceof UnsafeImportPathError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao ler arquivo para preview." },
      { status },
    );
  }
}
