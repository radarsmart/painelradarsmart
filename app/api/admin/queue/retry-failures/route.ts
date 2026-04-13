import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getNextScheduledAt } from "@/lib/distribution/legacy-dispatch";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RetryFailuresBody = {
  channel?: string;
  limit?: number;
};

type RetryChannel = "whatsapp" | "telegram";

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json(
      { error: adminGuard.error },
      { status: adminGuard.status },
    );
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RetryFailuresBody;
    const channel = String(body.channel ?? "whatsapp").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200);

    if (!["whatsapp", "telegram"].includes(channel)) {
      return NextResponse.json(
        { error: "channel invalido. Use whatsapp ou telegram." },
        { status: 400 },
      );
    }
    const retryChannel = channel as RetryChannel;

    const { data: failedRows, error: readError } = await supabaseAdmin
      .from("post_queue")
      .select("id")
      .eq("status", "failed")
      .eq("channel", retryChannel)
      .order("id", { ascending: false })
      .limit(limit);

    if (readError) {
      return NextResponse.json(
        { error: `Falha ao carregar jobs com erro: ${readError.message}` },
        { status: 500 },
      );
    }

    const ids = (failedRows ?? []).map((row) => Number(row.id)).filter(Number.isFinite);
    if (!ids.length) {
      return NextResponse.json({
        success: true,
        retried: 0,
        message: `Nenhuma falha de ${channel.toUpperCase()} para reprocessar.`,
      });
    }

    let retried = 0;
    for (const id of ids) {
      const now = new Date().toISOString();
      const scheduledAt = await getNextScheduledAt(retryChannel);
      const dedupeBucket = scheduledAt.slice(0, 10);

      const { error: updateError } = await supabaseAdmin
        .from("post_queue")
        .update({
          status: "queued",
          attempt_count: 0,
          last_error: null,
          locked_until: null,
          sent_at: null,
          scheduled_at: scheduledAt,
          dedupe_bucket: dedupeBucket,
          updated_at: now,
        })
        .eq("id", id);

      if (updateError) {
        return NextResponse.json(
          { error: `Falha ao reprocessar jobs: ${updateError.message}` },
          { status: 500 },
        );
      }

      retried += 1;
    }

    return NextResponse.json({
      success: true,
      retried,
      message: `${retried} falha(s) de ${retryChannel.toUpperCase()} reagendada(s) conforme a janela da fila.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
