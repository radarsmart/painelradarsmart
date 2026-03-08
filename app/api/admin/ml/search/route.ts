import { NextRequest, NextResponse } from "next/server";
import { normalizeMlProducts } from "@/lib/mercadolivre";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const mattId = process.env.ML_AFFILIATE_ID ?? "";
  if (!q.trim()) {
    return NextResponse.json({ products: [] });
  }

  try {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(
        q,
      )}&limit=10`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `ML API ${res.status}: ${errText}` },
        { status: 500 },
      );
    }

    const data = await res.json();
    const products = normalizeMlProducts(data, mattId);
    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Falha na busca Mercado Livre" },
      { status: 500 },
    );
  }
}
