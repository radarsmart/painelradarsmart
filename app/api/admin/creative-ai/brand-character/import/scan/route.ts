import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { scanCharacterPackForImport } from "@/lib/brand-character/character-pack-import";
import { UnsafeImportPathError } from "@/lib/brand-character/import-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CHARACTER_SLUG = "garota-radar";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const characterSlug = toText(req.nextUrl.searchParams.get("characterSlug")) || DEFAULT_CHARACTER_SLUG;
    const assets = await scanCharacterPackForImport(characterSlug);

    return NextResponse.json({ characterSlug, assets });
  } catch (error) {
    const status = error instanceof UnsafeImportPathError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao escanear pasta do Character Pack." },
      { status },
    );
  }
}
