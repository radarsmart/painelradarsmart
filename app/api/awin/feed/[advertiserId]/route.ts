import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinAdvertiserFeedProducts } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = {
  params: {
    advertiserId: string;
  };
};

export async function GET(req: NextRequest, context: RouteContext) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const sortParam = req.nextUrl.searchParams.get("sort") ?? "";
    const products = await fetchAwinAdvertiserFeedProducts({
      advertiserId: context.params.advertiserId,
      search: req.nextUrl.searchParams.get("search") ?? "",
      category: req.nextUrl.searchParams.get("category") ?? "",
      page: Number(req.nextUrl.searchParams.get("page") ?? 1),
      sort: sortParam === "best_deals" || sortParam === "top_selling" ? sortParam : "",
    });

    return NextResponse.json(products, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        products: [],
        total: 0,
        page: Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1) || 1),
        categories: [],
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar feed AWIN.",
      },
      { status: 500 },
    );
  }
}
