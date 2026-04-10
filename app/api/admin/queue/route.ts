import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
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

    const { error } = await supabaseAdmin
      .from("post_queue")
      .delete()
      .eq("id", queueId);

    if (error) {
      return NextResponse.json(
        { error: `Falha ao excluir job da fila: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `Job #${queueId} removido da fila.`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      { status: 500 },
    );
  }
}
