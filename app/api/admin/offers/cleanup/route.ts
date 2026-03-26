import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

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
    let mode: "older_than_today" | "all" = "older_than_today";
    try {
      const body = (await req.json()) as { mode?: string };
      if (body?.mode === "all") mode = "all";
    } catch {
      // no body: fallback to default mode
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const query = supabaseAdmin.from("offers").delete();
    const { data, error } =
      mode === "all"
        ? await query.neq("id", "00000000-0000-0000-0000-000000000000").select("id")
        : await query.lt("created_at", todayStart.toISOString()).select("id");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deleted: data?.length ?? 0,
      mode,
      cutoff: todayStart.toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 },
    );
  }
}
