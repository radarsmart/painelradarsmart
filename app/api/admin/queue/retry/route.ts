import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getNextScheduledAt } from "@/lib/distribution/legacy-dispatch";
import { supabaseAdmin } from "@/lib/supabase";

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

  try {
    const { id } = (await req.json()) as { id?: number | string };
    const queueId = Number(id);

    if (!Number.isFinite(queueId) || queueId <= 0) {
      return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
    }

    const { data: row, error: readError } = await supabaseAdmin
      .from("post_queue")
      .select("id,status,channel")
      .eq("id", queueId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json(
        { error: `Falha ao carregar job da fila: ${readError.message}` },
        { status: 500 },
      );
    }

    if (!row) {
      return NextResponse.json({ error: "Job nao encontrado." }, { status: 404 });
    }

    if (String(row.status ?? "").toLowerCase() !== "failed") {
      return NextResponse.json(
        { error: "Apenas jobs com falha podem ser reprocessados." },
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const channel = String(row.channel ?? "").toLowerCase();
    const scheduledAt =
      channel === "telegram" || channel === "whatsapp"
        ? await getNextScheduledAt(channel)
        : now;
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
      .eq("id", queueId);

    if (updateError) {
      return NextResponse.json(
        { error: `Falha ao reprocessar job: ${updateError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Job #${queueId} reprocessado para ${String(row.channel ?? "canal").toUpperCase()}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
