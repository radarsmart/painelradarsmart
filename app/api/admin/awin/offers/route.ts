import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { fetchAwinOffers } from "@/lib/awin/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const page = Number(req.nextUrl.searchParams.get("page") || "1");
    const pageSize = Number(req.nextUrl.searchParams.get("pageSize") || "20");
    const advertiserId = String(req.nextUrl.searchParams.get("advertiserId") ?? "").trim();
    const membership = String(req.nextUrl.searchParams.get("membership") ?? "joined") as "joined" | "notJoined" | "all";
    const status = String(req.nextUrl.searchParams.get("status") ?? "active") as "active" | "expiringSoon" | "upcoming";
    const type = String(req.nextUrl.searchParams.get("type") ?? "all") as "promotion" | "voucher" | "all";
    const regionCode = String(req.nextUrl.searchParams.get("regionCode") ?? "BR").trim().toUpperCase();

    const offers = await fetchAwinOffers({
      page,
      pageSize,
      advertiserId,
      membership,
      status,
      type,
      regionCode,
    });

    return NextResponse.json({ ok: true, offers, page, pageSize });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        offers: [],
        error: error instanceof Error ? error.message : "Falha ao consultar ofertas da AWIN.",
      },
      { status: 500 },
    );
  }
}
