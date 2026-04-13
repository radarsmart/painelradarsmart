import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { generateOfferCopyWithGemini } from "@/lib/ai/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status }
    );
  }

  try {
    const { productName, price, oldPrice, marketplace } = await req.json();

    if (!productName || !price) {
      return NextResponse.json(
        { error: "productName e price são obrigatórios." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY não configurada.");
    }

    const copy = await generateOfferCopyWithGemini({
      apiKey,
      model,
      productName,
      price,
      oldPrice,
      marketplace: marketplace || "Oferta Especial",
    });

    return NextResponse.json({ copy });
  } catch (error) {
    console.error("AI Copy Error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao gerar copy com IA.",
      },
      { status: 500 }
    );
  }
}
