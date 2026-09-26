import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { isBrandAssetType } from "@/lib/brand-assets/types";
import { assertConfirmedUpload, BrandAssetValidationError, getBrandAssetPublicUrl } from "@/lib/brand-assets/storage";
import { createBrandAsset, listBrandAssets } from "@/lib/brand-assets/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const typeParam = toText(req.nextUrl.searchParams.get("type"));
    const type = isBrandAssetType(typeParam) ? typeParam : undefined;

    const assets = await listBrandAssets(type);
    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar Brand Assets." },
      { status: 500 },
    );
  }
}

/**
 * Confirma um upload ja feito direto no Storage (via signed URL) e cria o
 * registro em brand_assets. NAO confia em mimeType/tamanho informados pelo
 * corpo da requisicao - revalida tudo direto no objeto do Storage.
 */
export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const type = toText(body.type);
    const storagePath = toText(body.storagePath);
    const name = toText(body.name);

    if (!isBrandAssetType(type)) {
      return NextResponse.json({ error: "type invalido para Brand Asset." }, { status: 400 });
    }
    if (!storagePath) {
      return NextResponse.json({ error: "storagePath e obrigatorio." }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "name e obrigatorio." }, { status: 400 });
    }

    const info = await assertConfirmedUpload(type, storagePath);
    const fileUrl = getBrandAssetPublicUrl(storagePath);

    const asset = await createBrandAsset({
      name,
      type,
      fileUrl,
      storagePath,
      mimeType: (info.mimeType ?? toText(body.mimeType)) || "application/octet-stream",
      usage: toText(body.usage) || null,
      metadata: normalizeMetadata(body.metadata),
      isDefault: Boolean(body.isDefault),
      createdByUserId: adminGuard.userId,
      createdByEmail: adminGuard.email,
    });

    return NextResponse.json({ success: true, asset });
  } catch (error) {
    const status = error instanceof BrandAssetValidationError ? 400 : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao registrar Brand Asset." },
      { status },
    );
  }
}
