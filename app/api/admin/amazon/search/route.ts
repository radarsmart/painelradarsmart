import { NextRequest, NextResponse } from "next/server";
import { normalizeAmazonProducts } from "@/lib/amazon";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ products: [] });
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const tag = process.env.AMAZON_AFFILIATE_TAG ?? "radarsmart-20";

  if (!rapidApiKey) {
    return NextResponse.json(
      { error: "RAPIDAPI_KEY não configurada" },
      { status: 500 },
    );
  }

  const url = `https://real-time-amazon-data.p.rapidapi.com/search?query=${encodeURIComponent(
    q,
  )}&country=BR`;

  try {
    const res = await fetch(url, {
      headers: {
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": "real-time-amazon-data.p.rapidapi.com",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Amazon API ${res.status}: ${errText}` },
        { status: 500 },
      );
    }

    const data = await res.json();
    const products = normalizeAmazonProducts(data, tag);
    return NextResponse.json({ products });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message ?? "Falha na busca Amazon" },
      { status: 500 },
    );
  }
}
