import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { extractTikTokShopProductInfo } from "@/lib/tiktok-shop/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: ["admin", "central_oferta"] });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as { url?: unknown };
  const url = toText(body.url);

  if (!url) {
    return NextResponse.json({ error: "url e obrigatorio." }, { status: 400 });
  }

  try {
    const info = await extractTikTokShopProductInfo(url);
    if (!info || (!info.title && !info.imageUrl)) {
      return NextResponse.json(
        {
          error:
            "Nao foi possivel extrair titulo/imagem automaticamente. Preencha os campos manualmente.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      success: true,
      title: info.title,
      image_url: info.imageUrl,
      product_url: info.finalUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao extrair dados do produto TikTok Shop.",
      },
      { status: 500 },
    );
  }
}
