import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MlSearchResult = {
  id?: string;
  title?: string;
  price?: number | string | null;
  permalink?: string;
  official_store_name?: string | null;
  seller?: {
    nickname?: string | null;
  } | null;
  status?: string | null;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const query = normalizeQuery(toText(req.nextUrl.searchParams.get("q")));
  if (query.length < 3) {
    return NextResponse.json({ error: "Parametro q invalido." }, { status: 400 });
  }

  const response = await fetch(
    `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(query)}&limit=5`,
    {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    },
  );

  const payload = (await response.json().catch(() => ({}))) as {
    results?: MlSearchResult[];
    message?: string;
    error?: string;
  };

  if (!response.ok) {
    return NextResponse.json(
      {
        error:
          toText(payload.message) ||
          toText(payload.error) ||
          "Falha ao consultar concorrente no Mercado Livre.",
      },
      { status: response.status },
    );
  }

  const results = Array.isArray(payload.results) ? payload.results : [];
  const activeResults = results.filter((item) => {
    const price = toNumber(item.price);
    const status = toText(item.status).toLowerCase();
    return price > 0 && (!status || status === "active");
  });

  const bestMatch = [...activeResults].sort((a, b) => toNumber(a.price) - toNumber(b.price))[0];
  if (!bestMatch) {
    return NextResponse.json({
      found: false,
      query,
      store: "Mercado Livre",
    });
  }

  return NextResponse.json({
    found: true,
    query,
    store:
      toText(bestMatch.official_store_name) ||
      toText(bestMatch.seller?.nickname) ||
      "Mercado Livre",
    title: toText(bestMatch.title) || "Oferta concorrente",
    price: toNumber(bestMatch.price),
    url: toText(bestMatch.permalink) || "https://www.mercadolivre.com.br/",
    external_id: toText(bestMatch.id),
  });
}
