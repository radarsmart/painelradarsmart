import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { getLandingBundleById } from "@/lib/landing-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const bundle = await getLandingBundleById(params.id);
  if (!bundle) {
    return NextResponse.json({ error: "Landing page não encontrada" }, { status: 404 });
  }

  return NextResponse.json({ bundle });
}
