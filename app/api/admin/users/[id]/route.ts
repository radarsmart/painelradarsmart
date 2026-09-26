import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ADMIN_ROLE } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const adminGuard = await requireAdmin(req, { allowRoles: [ADMIN_ROLE] });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
  }

  const { data: target, error: findError } = await supabaseAdmin
    .from("admins")
    .select("id, user_id, email")
    .eq("id", id)
    .maybeSingle();

  if (findError) {
    return NextResponse.json({ error: findError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });
  }
  if (target.user_id && target.user_id === adminGuard.userId) {
    return NextResponse.json(
      { error: "Voce nao pode revogar o proprio acesso" },
      { status: 400 },
    );
  }

  const { error: deleteError } = await supabaseAdmin
    .from("admins")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
