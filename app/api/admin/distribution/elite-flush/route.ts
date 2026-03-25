import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { autoFlushEliteOffers } from "@/lib/distribution/elite-auto-flush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  const result = await autoFlushEliteOffers();

  return NextResponse.json(result, {
    status: result.success ? 200 : 500,
  });
}
