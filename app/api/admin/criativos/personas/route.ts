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
      .from("ugc_personas")
      .select(
        "id,slug,name,archetype,gender_presentation,age_range,visual_style,tone,energy,accent,primary_use_cases,provider,provider_avatar_id,provider_voice_id,avatar_image_url,behavior_profile,camera_profile,is_active,is_default,sort_order,updated_at",
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const personas = (data ?? []).filter((persona) => {
      if (!search) return true;

      const haystack = [
        toText(persona.name),
        toText(persona.slug),
        toText(persona.archetype),
        toText(persona.visual_style),
        Array.isArray(persona.primary_use_cases)
          ? persona.primary_use_cases.join(" ")
          : "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    });

    return NextResponse.json({ personas });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar personas de criativo.",
      },
      { status: 500 },
    );
  }
}
