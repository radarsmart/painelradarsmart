import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchLomadeeProducts } from "@/lib/lomadee/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const search = String(req.nextUrl.searchParams.get("q") ?? "").trim();
    const page = Number(req.nextUrl.searchParams.get("page") || "1");
    const limit = Number(req.nextUrl.searchParams.get("limit") || "20");
    const price = String(req.nextUrl.searchParams.get("price") ?? "").trim();
    const organizationIds = String(req.nextUrl.searchParams.get("organizationIds") ?? "").trim();
    const isAvailableParam = req.nextUrl.searchParams.get("isAvailable");

    const result = await fetchLomadeeProducts({
      search,
      page,
      limit,
      price,
      organizationIds,
      isAvailable: isAvailableParam === null ? true : isAvailableParam === "true",
    });

    return NextResponse.json({
      ok: true,
      products: result.products,
      meta: result.meta,
      source: "lomadee_api",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        products: [],
        error:
          error instanceof Error
            ? error.message
            : "Falha ao consultar produtos da Lomadee.",
      },
      { status: 500 },
    );
  }
}
