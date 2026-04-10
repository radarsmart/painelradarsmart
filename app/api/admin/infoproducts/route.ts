import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(v: unknown): string {
  return String(v ?? "").trim();
}

function buildSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const { data, error } = await supabaseAdmin
    .from("infoproducts")
    .select("*")
    .order("clicks", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ products: data });
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = toText(body.name);
    if (!name) {
      return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
    }

    const slug = buildSlug(name);
    const { data, error } = await supabaseAdmin
      .from("infoproducts")
      .upsert(
        {
          name,
          slug,
          headline: toText(body.headline),
          description: toText(body.description),
          benefits: Array.isArray(body.benefits) ? body.benefits : [],
          platform: toText(body.platform) || "hotmart",
          affiliate_url: toText(body.affiliate_url),
          cover_image: toText(body.cover_image) || null,
          price: Number(body.price) || null,
          commission_pct: Number(body.commission_pct) || null,
          niche: toText(body.niche) || null,
          status: "active",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "slug" },
      )
      .select("id, slug")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, id: data.id, slug: data.slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar produto" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const id = toText(body.id);
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const status = toText(body.status);
    const isFullEdit =
      "name" in body ||
      "headline" in body ||
      "description" in body ||
      "benefits" in body ||
      "platform" in body ||
      "affiliate_url" in body ||
      "cover_image" in body ||
      "price" in body ||
      "commission_pct" in body ||
      "niche" in body;

    if (isFullEdit) {
      const name = toText(body.name);
      if (!name) {
        return NextResponse.json({ error: "name obrigatório" }, { status: 400 });
      }

      const slug = buildSlug(name);
      const { data, error } = await supabaseAdmin
        .from("infoproducts")
        .update({
          name,
          slug,
          headline: toText(body.headline),
          description: toText(body.description),
          benefits: Array.isArray(body.benefits) ? body.benefits : [],
          platform: toText(body.platform) || "hotmart",
          affiliate_url: toText(body.affiliate_url),
          cover_image: toText(body.cover_image) || null,
          price: Number(body.price) || null,
          commission_pct: Number(body.commission_pct) || null,
          niche: toText(body.niche) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id, slug")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({ success: true, id: data.id, slug: data.slug });
    }

    const { error } = await supabaseAdmin
      .from("infoproducts")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar produto" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as { id?: string };
    const id = toText(body.id);
    if (!id) {
      return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("infoproducts").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir produto" },
      { status: 500 },
    );
  }
}
