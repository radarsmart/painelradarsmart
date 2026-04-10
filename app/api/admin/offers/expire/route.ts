import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCron(req: NextRequest): boolean {
  if (String(req.headers.get("x-vercel-cron") ?? "").trim()) {
    return true;
  }

  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) return false;

  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(req: NextRequest) {
  const cronAuthorized = isAuthorizedCron(req);
  if (!cronAuthorized) {
    const adminGuard = await requireAdmin(req);
    if (!adminGuard.ok) {
      return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
    }
  }

  try {
    const nowIso = new Date().toISOString();

    const expiredQuery = await supabaseAdmin
      .from("offers")
      .select("id")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso);

    if (expiredQuery.error) {
      return NextResponse.json({ error: expiredQuery.error.message }, { status: 500 });
    }

    const ids = (expiredQuery.data ?? []).map((row) => String((row as { id: string }).id));
    if (!ids.length) {
      return NextResponse.json({
        success: true,
        expired_count: 0,
        checked_at: nowIso,
      });
    }

    let updateResult = await supabaseAdmin
      .from("offers")
      .update({
        status: "inactive",
        curations_status: "archived",
        updated_at: nowIso,
      })
      .in("id", ids)
      .select("id");

    if (updateResult.error && updateResult.error.message.includes("curations_status")) {
      updateResult = await supabaseAdmin
        .from("offers")
        .update({
          status: "inactive",
          updated_at: nowIso,
        })
        .in("id", ids)
        .select("id");
    }

    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    revalidatePath("/");
    revalidatePath("/ofertas");
    revalidatePath("/comparativo");

    return NextResponse.json({
      success: true,
      expired_count: updateResult.data?.length ?? ids.length,
      checked_at: nowIso,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao expirar ofertas.",
      },
      { status: 500 },
    );
  }
}
