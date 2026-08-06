import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateAiProductImage } from "@/lib/ai/product-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: ["admin", "central_oferta"] });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as {
    image_url?: unknown;
    prompt?: unknown;
  };

  const imageUrl = toText(body.image_url);
  if (!imageUrl) {
    return NextResponse.json({ error: "image_url e obrigatorio." }, { status: 400 });
  }

  try {
    const result = await generateAiProductImage({
      imageUrl,
      prompt: toText(body.prompt),
    });

    return NextResponse.json({ success: true, image_url: result.imageUrl });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao gerar imagem com IA.",
      },
      { status: 500 },
    );
  }
}
