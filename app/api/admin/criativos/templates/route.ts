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
      .from("ugc_templates")
      .select(
        "id,slug,name,objective,description,hook_framework,structure_steps,recommended_duration,cta_style,editing_notes,is_active,sort_order,updated_at",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const templates = (data ?? []).filter((template) => {
      if (!search) return true;
      const haystack = [
        toText(template.name),
        toText(template.slug),
        toText(template.objective),
        toText(template.description),
        toText(template.hook_framework),
        Array.isArray(template.structure_steps) ? template.structure_steps.join(" ") : "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar templates de criativo.",
      },
      { status: 500 },
    );
  }
}
