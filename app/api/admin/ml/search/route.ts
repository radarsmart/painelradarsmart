import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  return NextResponse.json({
    products: [],
    public_offers: [],
    items: [],
    source: "manual_only",
    sniper_disabled: true,
    message:
      "Busca automática Mercado Livre desativada temporariamente. Use o Radar Builder em /admin/ofertas/nova.",
  });
}
