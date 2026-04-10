import { NextRequest, NextResponse } from "next/server";
import { refreshMlProductsCache } from "@/lib/ml/products-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: NextRequest): boolean {
  const configuredSecret = process.env.ML_PRODUCTS_CRON_SECRET?.trim();
  if (!configuredSecret) return true;

  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${configuredSecret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ success: false, error: "Nao autorizado." }, { status: 401 });
  }

  try {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const products = await refreshMlProductsCache(limit);
    return NextResponse.json({
      success: true,
      count: products.length,
      refreshed_at: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Falha ao atualizar cache ML.",
      },
      { status: 500 },
    );
  }
}
