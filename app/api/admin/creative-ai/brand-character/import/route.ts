import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  importSelectedCharacterAssets,
  type ImportSelection,
} from "@/lib/brand-character/character-pack-import";
import { UnsafeImportPathError } from "@/lib/brand-character/import-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CHARACTER_SLUG = "garota-radar";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeSelection(raw: unknown): ImportSelection | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const relativePath = toText(item.relativePath);
  if (!relativePath) return null;

  return {
    relativePath,
    name: toText(item.name) || relativePath,
    referenceType: toText(item.referenceType) || "OTHER",
    description: toText(item.description) || undefined,
    expression: toText(item.expression) || undefined,
    pose: toText(item.pose) || undefined,
    shot: toText(item.shot) || undefined,
    cameraAngle: toText(item.cameraAngle) || undefined,
    outfit: toText(item.outfit) || undefined,
    environment: toText(item.environment) || undefined,
    tags: Array.isArray(item.tags) ? item.tags.map((tag) => String(tag)) : undefined,
    generationSafe: item.generationSafe === true ? true : undefined,
    isPrimary: Boolean(item.isPrimary),
  };
}

/**
 * Executa a importacao dos arquivos selecionados. Todos viram
 * CHARACTER_REFERENCE com isPrimary=false SEMPRE - este endpoint nunca
 * define PRIMARY (ver character-pack-import.ts).
 */
export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const characterSlug = toText(body.characterSlug) || DEFAULT_CHARACTER_SLUG;
    const rawSelections = Array.isArray(body.selections) ? body.selections : [];
    const selections = rawSelections.map(normalizeSelection).filter((item): item is ImportSelection => item !== null);

    if (!selections.length) {
      return NextResponse.json({ error: "Nenhum arquivo valido selecionado para importar." }, { status: 400 });
    }

    const results = await importSelectedCharacterAssets(characterSlug, selections, {
      userId: adminGuard.userId,
      email: adminGuard.email,
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    const status = error instanceof UnsafeImportPathError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao importar Character Pack." },
      { status },
    );
  }
}
