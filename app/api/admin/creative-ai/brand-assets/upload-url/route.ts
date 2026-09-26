import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { isBrandAssetType, ALLOWED_MIME_BY_TYPE } from "@/lib/brand-assets/types";
import { createBrandAssetUploadUrl, BrandAssetValidationError } from "@/lib/brand-assets/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const type = toText(body.type);
    const mimeType = toText(body.mimeType);

    if (!isBrandAssetType(type)) {
      return NextResponse.json({ error: "type invalido para Brand Asset." }, { status: 400 });
    }

    if (!mimeType) {
      return NextResponse.json({ error: "mimeType e obrigatorio." }, { status: 400 });
    }

    if (!ALLOWED_MIME_BY_TYPE[type].includes(mimeType)) {
      return NextResponse.json(
        {
          error: `MIME type "${mimeType}" nao e permitido para ${type}. Permitidos: ${ALLOWED_MIME_BY_TYPE[type].join(", ")}.`,
        },
        { status: 400 },
      );
    }

    const { storagePath, signedUrl, token } = await createBrandAssetUploadUrl(type, mimeType);

    return NextResponse.json({ storagePath, signedUrl, token, bucket: "ugc-assets" });
  } catch (error) {
    const status = error instanceof BrandAssetValidationError ? 400 : 500;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao gerar signed upload URL.",
      },
      { status },
    );
  }
}
