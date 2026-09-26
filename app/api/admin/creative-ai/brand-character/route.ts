import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import { listBrandAssets } from "@/lib/brand-assets/repository";
import { CHARACTER_PRESETS } from "@/lib/creative-brain/character-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PERSONA_SELECT =
  "id,slug,name,archetype,avatar_image_url,is_official_brand_character,identity_locked," +
  "reference_images,allowed_variations,character_notes";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const [officialRes, personasRes, referencesRes] = await Promise.all([
      supabaseAdmin
        .from("ugc_personas")
        .select(PERSONA_SELECT)
        .eq("is_official_brand_character", true)
        .maybeSingle(),
      supabaseAdmin
        .from("ugc_personas")
        .select("id,slug,name,archetype,is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
      listBrandAssets("CHARACTER_REFERENCE"),
    ]);

    if (officialRes.error) throw new Error(officialRes.error.message);
    if (personasRes.error) throw new Error(personasRes.error.message);

    const primaryReference = referencesRes.find(
      (asset) => (asset.metadata as { isPrimary?: boolean })?.isPrimary,
    );

    return NextResponse.json({
      official: officialRes.data ?? null,
      availablePersonas: personasRes.data ?? [],
      references: referencesRes,
      primaryReference: primaryReference ?? null,
      allowedPresets: CHARACTER_PRESETS,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar Garota Radar." },
      { status: 500 },
    );
  }
}

/**
 * Marca uma persona existente como a Garota Radar oficial. Retira o status
 * de qualquer persona oficial anterior ANTES de marcar a nova - o indice
 * unico parcial em ugc_personas e a ultima defesa, nao a primeira.
 */
export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const personaId = toText(body.personaId);
    if (!personaId) {
      return NextResponse.json({ error: "personaId e obrigatorio." }, { status: 400 });
    }

    const target = await supabaseAdmin
      .from("ugc_personas")
      .select("id")
      .eq("id", personaId)
      .maybeSingle();

    if (target.error) throw new Error(target.error.message);
    if (!target.data) {
      return NextResponse.json({ error: "Persona nao encontrada." }, { status: 404 });
    }

    const clearPrevious = await supabaseAdmin
      .from("ugc_personas")
      .update({ is_official_brand_character: false, identity_locked: false, updated_at: new Date().toISOString() })
      .eq("is_official_brand_character", true)
      .neq("id", personaId);

    if (clearPrevious.error) {
      throw new Error(`Falha ao retirar persona oficial anterior: ${clearPrevious.error.message}`);
    }

    const { data, error } = await supabaseAdmin
      .from("ugc_personas")
      .update({
        is_official_brand_character: true,
        identity_locked: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", personaId)
      .select(PERSONA_SELECT)
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, official: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao definir Garota Radar oficial." },
      { status: 500 },
    );
  }
}
