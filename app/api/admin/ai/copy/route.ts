import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { generateOfferCopyWithGemini } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function formatPrice(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "consulte o preco";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numeric);
}

function toPositiveNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function buildFallbackCopy(params: {
  productName: string;
  marketplace?: string;
  price: unknown;
}) {
  const lines = [
    `🔥 ${params.productName}`,
    `💰 Por: ${formatPrice(params.price)}`,
    `🛒 Oferta ativa em ${params.marketplace || "Radar Smart"}.`,
    "⚡ Aproveite enquanto estiver disponivel.",
  ];

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    productName?: unknown;
    price?: unknown;
    oldPrice?: unknown;
    marketplace?: unknown;
  };

  const productName = String(body.productName ?? "").trim();
  const price = toPositiveNumber(body.price);
  const oldPrice = toPositiveNumber(body.oldPrice);
  const marketplace = String(body.marketplace ?? "Oferta Especial").trim();

  if (!productName || price <= 0) {
    return NextResponse.json(
      { error: "productName e price sao obrigatorios." },
      { status: 400 },
    );
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!apiKey) {
      return NextResponse.json({
        copy: buildFallbackCopy({ productName, marketplace, price }),
        source: "fallback",
        warning:
          "IA indisponivel (GEMINI_API_KEY nao configurada). Copy basica gerada para edicao manual.",
      });
    }

    const copy = await generateOfferCopyWithGemini({
      apiKey,
      model,
      productName,
      price,
      oldPrice,
      marketplace: marketplace || "Oferta Especial",
    });

    return NextResponse.json({ copy, source: "ai" });
  } catch (error) {
    console.error("AI Copy Error:", error);
    return NextResponse.json({
      copy: buildFallbackCopy({ productName, marketplace, price }),
      source: "fallback",
      warning:
        error instanceof Error
          ? `IA indisponivel: ${error.message}`
          : "IA indisponivel. Copy basica gerada para nao travar o fluxo.",
    });
  }
}
