import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { createMlAuthStartToken } from "@/lib/ml-auth-ott";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  if (!adminGuard.userId) {
    return NextResponse.json(
      { error: "Este fluxo exige autenticacao real de administrador." },
      { status: 401 },
    );
  }

  const token = createMlAuthStartToken(adminGuard.userId);
  return NextResponse.json({ url: `/api/admin/ml/auth?ott=${encodeURIComponent(token)}` });
}
