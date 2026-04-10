import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferDefaults = {
  id: string;
  title: string | null;
  price: number | string | null;
  old_price: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  marketplace: string | null;
};

type LandingPageRecord = {
  id: string;
  slug: string;
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNullableText(value: unknown): string | null {
  const text = toText(value);
  return text || null;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = toText(value)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  if (!raw) return null;
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => toText(item))
      .filter(Boolean);
  }

  return toText(value)
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSlug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

async function findLandingPageById(id: string): Promise<LandingPageRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("landing_pages")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao consultar landing page: ${error.message}`);
  }

  return (data as LandingPageRecord | null) ?? null;
}

async function ensureUniqueSlug(baseSlug: string, ignoreId?: string | null) {
  const cleanBase = buildSlug(baseSlug) || `landing-${Date.now()}`;
  let candidate = cleanBase;
  let counter = 2;

  while (true) {
    let query = supabaseAdmin
      .from("landing_pages")
      .select("id")
      .eq("slug", candidate)
      .limit(1);

    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw new Error(`Falha ao validar slug: ${error.message}`);
    }

    if (!data?.id) {
      return candidate;
    }

    candidate = `${cleanBase}-${counter}`;
    counter += 1;
  }
}

function normalizeStatus(value: unknown): "draft" | "published" | "archived" {
  const status = toText(value).toLowerCase();
  if (status === "published" || status === "archived") return status;
  return "draft";
}

async function getOfferDefaults(offerId: string | null): Promise<OfferDefaults | null> {
  if (!offerId) return null;

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,old_price,image_url,affiliate_url,marketplace")
    .eq("id", offerId)
    .maybeSingle();

  if (error) {
    throw new Error(`Falha ao consultar oferta vinculada: ${error.message}`);
  }

  return (data as OfferDefaults | null) ?? null;
}

async function listLinkedOffers() {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,marketplace,price,old_price,image_url,affiliate_url,updated_at")
    .not("affiliate_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (error) {
    throw new Error(`Falha ao carregar ofertas: ${error.message}`);
  }

  return data ?? [];
}

async function buildPayload(body: Record<string, unknown>) {
  const offerId = toNullableText(body.offer_id);
  const offerDefaults = await getOfferDefaults(offerId);

  const title = toText(body.title) || toText(offerDefaults?.title);
  if (!title) {
    throw new Error("title obrigatório");
  }

  const status = normalizeStatus(body.status);
  const affiliateUrl = toText(body.affiliate_url) || toText(offerDefaults?.affiliate_url);
  if (!affiliateUrl) {
    throw new Error("affiliate_url obrigatório");
  }

  const productTitle = toText(body.product_title) || toText(offerDefaults?.title) || title;
  const marketplace = toText(body.marketplace) || toText(offerDefaults?.marketplace) || null;
  const productPrice = toNumberOrNull(body.product_price) ?? toNumberOrNull(offerDefaults?.price);
  const productOldPrice =
    toNumberOrNull(body.product_old_price) ?? toNumberOrNull(offerDefaults?.old_price);

  return {
    offer_id: offerId,
    title,
    status,
    marketplace,
    headline: toText(body.headline) || title,
    subheadline: toNullableText(body.subheadline),
    badge_text: toNullableText(body.badge_text),
    hero_image_url: toNullableText(body.hero_image_url) ?? toNullableText(offerDefaults?.image_url),
    hero_video_url: toNullableText(body.hero_video_url),
    product_title: productTitle || null,
    product_price: productPrice,
    product_old_price: productOldPrice,
    affiliate_url: affiliateUrl,
    site_url: toNullableText(body.site_url),
    group_url: toNullableText(body.group_url),
    utm_source: toNullableText(body.utm_source),
    utm_medium: toNullableText(body.utm_medium),
    utm_campaign: toNullableText(body.utm_campaign),
    utm_content: toNullableText(body.utm_content),
    instagram_url: toNullableText(body.instagram_url),
    telegram_url: toNullableText(body.telegram_url),
    whatsapp_url: toNullableText(body.whatsapp_url),
    primary_cta_label:
      toText(body.primary_cta_label) || "Quero ver a oferta e comprar com seguranca",
    group_cta_label: toText(body.group_cta_label) || "Entrar grátis no Grupo VIP",
    site_cta_label: toText(body.site_cta_label) || "Conhecer o Radar Smart",
    price_note: toNullableText(body.price_note),
    benefits: toStringArray(body.benefits),
    technical_details: toStringArray(body.technical_details),
    social_proof: toStringArray(body.social_proof),
    disclaimer:
      toNullableText(body.disclaimer) ??
      "Oferta e condições sujeitas a alteração pelo lojista. Este conteúdo pode conter link de afiliado.",
    published_at:
      status === "published"
        ? toNullableText(body.published_at) ?? new Date().toISOString()
        : null,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const [landingPagesResult, offers] = await Promise.all([
      supabaseAdmin.from("landing_pages").select("*").order("updated_at", { ascending: false }),
      listLinkedOffers(),
    ]);

    if (landingPagesResult.error) {
      throw new Error(landingPagesResult.error.message);
    }

    return NextResponse.json({
      landingPages: landingPagesResult.data ?? [],
      offers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar landing pages" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const duplicateFromId = toText(body.duplicate_from_id);

    if (duplicateFromId) {
      const { data: duplicatedSource, error: duplicateError } = await supabaseAdmin
        .from("landing_pages")
        .select("*")
        .eq("id", duplicateFromId)
        .single();

      if (duplicateError || !duplicatedSource) {
        throw new Error(duplicateError?.message || "Landing page de origem não encontrada.");
      }

      const duplicatedTitle = `${toText(duplicatedSource.title)} cópia`;
      const duplicatedSlug = await ensureUniqueSlug(duplicatedTitle);
      const duplicatedBase = { ...(duplicatedSource as Record<string, unknown>) };
      delete duplicatedBase.id;
      const { data, error } = await supabaseAdmin
        .from("landing_pages")
        .insert({
          ...duplicatedBase,
          title: duplicatedTitle,
          slug: duplicatedSlug,
          status: "draft",
          published_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id, slug, status")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({
        success: true,
        id: data.id,
        slug: data.slug,
        status: data.status,
      });
    }

    const payload = await buildPayload(body);
    const slug = await ensureUniqueSlug(payload.title);

    const { data, error } = await supabaseAdmin
      .from("landing_pages")
      .insert({
        ...payload,
        slug,
        created_at: new Date().toISOString(),
      })
      .select("id, slug, status")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, id: data.id, slug: data.slug, status: data.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar landing page" },
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

    const isFullEdit =
      "title" in body ||
      "headline" in body ||
      "subheadline" in body ||
      "badge_text" in body ||
      "hero_image_url" in body ||
      "hero_video_url" in body ||
      "product_title" in body ||
      "product_price" in body ||
      "product_old_price" in body ||
      "affiliate_url" in body ||
      "site_url" in body ||
      "group_url" in body ||
      "utm_source" in body ||
      "utm_medium" in body ||
      "utm_campaign" in body ||
      "utm_content" in body ||
      "instagram_url" in body ||
      "telegram_url" in body ||
      "whatsapp_url" in body ||
      "primary_cta_label" in body ||
      "group_cta_label" in body ||
      "site_cta_label" in body ||
      "price_note" in body ||
      "benefits" in body ||
      "technical_details" in body ||
      "social_proof" in body ||
      "disclaimer" in body ||
      "offer_id" in body ||
      "marketplace" in body;

    if (isFullEdit) {
      const current = await findLandingPageById(id);
      if (!current) {
        return NextResponse.json({ error: "Landing page não encontrada" }, { status: 404 });
      }

      const payload = await buildPayload(body);
      const nextTitle = toText(body.title);
      const nextSlug =
        nextTitle && buildSlug(nextTitle) !== current.slug
          ? await ensureUniqueSlug(nextTitle, id)
          : current.slug;

      const { data, error } = await supabaseAdmin
        .from("landing_pages")
        .update({
          ...payload,
          slug: nextSlug,
        })
        .eq("id", id)
        .select("id, slug, status")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return NextResponse.json({
        success: true,
        id: data.id,
        slug: data.slug,
        status: data.status,
      });
    }

    const status = normalizeStatus(body.status);
    const { data, error } = await supabaseAdmin
      .from("landing_pages")
      .update({
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id, slug, status")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, id: data.id, slug: data.slug, status: data.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar landing page" },
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

    const { error } = await supabaseAdmin.from("landing_pages").delete().eq("id", id);
    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir landing page" },
      { status: 500 },
    );
  }
}
