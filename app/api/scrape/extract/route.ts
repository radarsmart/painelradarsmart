import { NextRequest, NextResponse } from "next/server";

import { extractProduct } from "@/lib/scraper/waterfall-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url?: unknown };
    const sourceUrl = String(url ?? "").trim();

    if (!sourceUrl) {
      return NextResponse.json({ error: "URL e obrigatorio" }, { status: 400 });
    }

    try {
      new URL(sourceUrl);
    } catch {
      return NextResponse.json({ error: "URL invalida" }, { status: 400 });
    }

    const result = await extractProduct(sourceUrl);

    console.log(
      `[Extractor] ${sourceUrl} -> ${result.success ? "OK" : "FAIL"} | Metodo: ${
        result.product?.extraction_method || "nenhum"
      } | ${result.total_duration_ms}ms | Tentativas: ${result.attempts
        .map((attempt) => `${attempt.method}:${attempt.success ? "OK" : "FAIL"}`)
        .join(", ")}`,
    );

    if (result.success && result.product) {
      return NextResponse.json({
        success: true,
        product: result.product,
        meta: {
          extraction_method: result.product.extraction_method,
          attempts: result.attempts,
          total_duration_ms: result.total_duration_ms,
        },
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: "Todas as camadas de extracao falharam",
        attempts: result.attempts,
        total_duration_ms: result.total_duration_ms,
      },
      { status: 422 },
    );
  } catch (error) {
    console.error("[Extractor] Erro:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha interna na extracao.",
      },
      { status: 500 },
    );
  }
}

