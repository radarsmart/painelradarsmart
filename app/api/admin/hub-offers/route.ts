import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return null;
}

export async function PATCH(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as {
      id?: unknown;
      affiliate_url_manual?: unknown;
      selected_for_distribution?: unknown;
    };

    const id = toText(body.id);
    if (!id) {
      return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
    }

    const payload: Record<string, unknown> = {};
    if ("affiliate_url_manual" in body) {
      const affiliateUrl = toText(body.affiliate_url_manual);
      payload.affiliate_url_manual = affiliateUrl || null;
    }

    const selectedForDistribution = toBoolean(body.selected_for_distribution);
    if (selectedForDistribution !== null) {
      payload.selected_for_distribution = selectedForDistribution;
    }

    if (!Object.keys(payload).length) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar." }, { status: 400 });
    }

    payload.updated_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("hub_offers")
      .update(payload)
      .eq("id", id)
      .select("id, affiliate_url_manual, selected_for_distribution")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, item: data });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Falha ao atualizar item salvo do hub.",
      },
      { status: 500 },
    );
  }
}
