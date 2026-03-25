import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { syncDailyBlogElite } from "@/lib/automation/sync-blog-elite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasCronAccess(req: NextRequest): boolean {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return false;

  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  const querySecret = req.nextUrl.searchParams.get("secret") ?? "";

  return bearer === secret || querySecret === secret;
}

async function handleSync(req: NextRequest) {
  if (!hasCronAccess(req)) {
    const adminGuard = await requireAdmin(req);
    if (!adminGuard.ok) {
      return NextResponse.json(
        { error: adminGuard.error },
        { status: adminGuard.status },
      );
    }
  }

  const result = await syncDailyBlogElite();
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET(req: NextRequest) {
  return handleSync(req);
}

export async function POST(req: NextRequest) {
  return handleSync(req);
}
