import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { ADMIN_ROLE, getEffectiveAdminRole, getRoleLabel } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req, { allowRoles: [ADMIN_ROLE] });
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const { data, error } = await supabaseAdmin
    .from("admins")
    .select("id, email, role, user_id")
    .order("email");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (data ?? []).map((row) => {
    const effectiveRole = getEffectiveAdminRole({ email: row.email, role: row.role });
    return {
      id: row.id,
      email: row.email,
      role: effectiveRole,
      roleLabel: getRoleLabel(effectiveRole),
      isSelf: row.user_id === adminGuard.userId,
    };
  });

  return NextResponse.json({ users });
}
