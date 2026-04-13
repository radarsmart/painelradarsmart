import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const search = toText(req.nextUrl.searchParams.get("q")).toLowerCase();

    const { data, error } = await supabaseAdmin
      .from("ugc_angles")
      .select(
        "id,slug,name,angle_type,description,pain_points,desire_points,proof_points,hook_starters,cta_options,is_active,sort_order,updated_at",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const angles = (data ?? []).filter((angle) => {
      if (!search) return true;
      const haystack = [
        toText(angle.name),
        toText(angle.slug),
        toText(angle.angle_type),
        toText(angle.description),
        Array.isArray(angle.pain_points) ? angle.pain_points.join(" ") : "",
        Array.isArray(angle.desire_points) ? angle.desire_points.join(" ") : "",
        Array.isArray(angle.proof_points) ? angle.proof_points.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

    return NextResponse.json({ angles });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar angulos de criativo.",
      },
      { status: 500 },
    );
  }
}
