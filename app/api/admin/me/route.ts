import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: ["admin", "central_oferta"] });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  return NextResponse.json({ email: adminGuard.email, role: adminGuard.role });
}
