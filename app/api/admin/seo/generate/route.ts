import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateProductSEO } from "@/lib/ai/seo-generator";

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
    const body = (await req.json()) as {
      title?: unknown;
      category?: unknown;
      price?: unknown;
      features?: unknown;
    };

    const title = toText(body.title);
    const category = toText(body.category);
    const price = Number(body.price ?? 0);
    const features = Array.isArray(body.features)
      ? body.features.map((item) => toText(item)).filter(Boolean)
      : [];

    if (!title || !category || !Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { error: "title, category e price sao obrigatorios." },
        { status: 400 },
      );
    }

    const seo = await generateProductSEO({
      title,
      category,
      price,
      features,
    });

    return NextResponse.json({ success: true, seo });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao gerar SEO automaticamente.",
      },
      { status: 500 },
    );
  }
}
