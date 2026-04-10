import { NextRequest, NextResponse } from "next/server";

import { getHomePageData } from "@/lib/home/get-home-page-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const categorySlug = req.nextUrl.searchParams.get("categoria") ?? undefined;
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "18");
  const offersLimit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 48)
    : 18;

  try {
    const data = await getHomePageData({
      categorySlug,
      offersLimit,
    });

    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar payload da home.",
      },
      { status: 500 },
    );
  }
}
