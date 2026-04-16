import { NextRequest, NextResponse } from "next/server";

import { getDistributionFlags } from "@/lib/distribution/feature-flags";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 20;

function isValidCronSecret(req: NextRequest): boolean {
  const expected = String(process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const headerToken =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  return String(headerToken).trim() === expected;
}

export async function GET(req: NextRequest) {
  if (!isValidCronSecret(req)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  try {
    const flags = await getDistributionFlags();
    if (!flags.distribution_enabled) {
      return NextResponse.json({
        ok: true,
        message: "Distribuicao desativada",
        processed: 0,
      });
    }

    const now = new Date().toISOString();
    const limit = Math.max(1, Math.min(flags.scheduling.max_posts_per_day, DEFAULT_BATCH_SIZE));

    const due = await supabaseAdmin
      .from("tiktok_engine_scheduled_posts")
      .select("id,distribution_id,channel,scheduled_for,status")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (due.error) {
      throw new Error(`Falha ao buscar posts agendados: ${due.error.message}`);
    }

    const rows = due.data ?? [];
    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
      const channel = String(row.channel ?? "").toLowerCase();
      const channelEnabled =
        (channel === "telegram" && flags.channels.telegram.enabled) ||
        (channel === "whatsapp" && flags.channels.whatsapp.enabled) ||
        (channel === "instagram" && flags.channels.instagram.enabled);

      if (!channelEnabled) {
        skipped += 1;
        await supabaseAdmin
          .from("tiktok_engine_scheduled_posts")
          .update({
            status: "cancelled",
            error_message: `Canal ${channel} desativado via feature flag`,
            updated_at: now,
          })
          .eq("id", row.id);

        await supabaseAdmin
          .from("tiktok_engine_distributions")
          .update({
            status: "cancelled",
            error_message: `Canal ${channel} desativado via feature flag`,
            updated_at: now,
          })
          .eq("id", row.distribution_id);
        continue;
      }

      processed += 1;
      await supabaseAdmin
        .from("tiktok_engine_scheduled_posts")
        .update({
          status: "processing",
          updated_at: now,
        })
        .eq("id", row.id);

      await supabaseAdmin
        .from("tiktok_engine_distributions")
        .update({
          status: "scheduled",
          updated_at: now,
        })
        .eq("id", row.distribution_id);
    }

    return NextResponse.json({
      ok: true,
      processed,
      skipped,
      total_due: rows.length,
      message: "Cron de distribuicao executado.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro no cron de distribuicao.",
      },
      { status: 500 },
    );
  }
}
