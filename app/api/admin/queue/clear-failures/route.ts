import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
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

  const { data, error } = await supabaseAdmin
    .from("post_queue")
    .delete()
    .eq("status", "failed")
    .select("id");

  if (error) {
    return NextResponse.json(
      { error: `Falha ao limpar jobs com erro: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    deleted: data?.length ?? 0,
    message: `${data?.length ?? 0} falha(s) removida(s) da fila.`,
  });
}
