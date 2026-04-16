import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import {
  getDistributionFlags,
  updateDistributionFlags,
} from "@/lib/distribution/feature-flags";

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

  try {
    const flags = await getDistributionFlags();
    return NextResponse.json({ success: true, flags });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao carregar feature flags.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const updates = (await req.json()) as Record<string, unknown>;
    const flags = await updateDistributionFlags(updates);
    return NextResponse.json({ success: true, flags });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao atualizar feature flags.",
      },
      { status: 500 },
    );
  }
}
