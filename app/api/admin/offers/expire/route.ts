import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLASH_RENEW_WINDOW_HOURS = 48;

function isAuthorizedCron(req: NextRequest): boolean {
  if (String(req.headers.get("x-vercel-cron") ?? "").trim()) {
    return true;
  }

  const cronSecret = String(process.env.CRON_SECRET ?? "").trim();
  if (!cronSecret) return false;

  const authHeader = String(req.headers.get("authorization") ?? "").trim();
  return authHeader === `Bearer ${cronSecret}`;
}

function computeRenewedFlashExpiry(now = new Date()): string {
  return new Date(now.getTime() + FLASH_RENEW_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
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
      .select("id,slot_type")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", nowIso);

    if (expiredQuery.error) {
      return NextResponse.json({ error: expiredQuery.error.message }, { status: 500 });
    }

    const rows = (expiredQuery.data ?? []) as Array<{ id: string; slot_type?: string | null }>;
    const flashIds = rows
      .filter((row) => String(row.slot_type ?? "").trim().toLowerCase() === "flash")
      .map((row) => String(row.id));
    const ids = rows
      .filter((row) => String(row.slot_type ?? "").trim().toLowerCase() !== "flash")
      .map((row) => String(row.id));

    let renewedCount = 0;
    if (flashIds.length) {
      const renewResult = await supabaseAdmin
        .from("offers")
        .update({
          expires_at: computeRenewedFlashExpiry(new Date(nowIso)),
          updated_at: nowIso,
        })
        .in("id", flashIds)
        .select("id");

      if (renewResult.error) {
        return NextResponse.json({ error: renewResult.error.message }, { status: 500 });
      }

      renewedCount = renewResult.data?.length ?? flashIds.length;
    }

    if (!ids.length) {
      revalidatePath("/");
      revalidatePath("/ofertas");
      revalidatePath("/ofertas-relampago");
      revalidatePath("/comparativo");

      return NextResponse.json({
        success: true,
        expired_count: 0,
        renewed_flash_count: renewedCount,
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
    revalidatePath("/ofertas-relampago");
    revalidatePath("/comparativo");

    return NextResponse.json({
      success: true,
      expired_count: updateResult.data?.length ?? ids.length,
      renewed_flash_count: renewedCount,
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
