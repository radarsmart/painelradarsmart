import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

async function resolvePostSlug(postId: string) {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("slug")
    .eq("id", postId)
    .maybeSingle();

  return String(data?.slug ?? "").trim() || null;
}

async function fetchPostOffers(postId: string) {
  const { data: links, error: linksError } = await supabaseAdmin
    .from("blog_post_offers")
    .select("offer_id,is_primary,sort_order")
    .eq("post_id", postId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  if (linksError) {
    throw new Error(linksError.message);
  }

  const typedLinks =
    ((links ?? []) as Array<{
      offer_id: string;
      is_primary: boolean;
      sort_order: number;
    }>) ?? [];

  const ids = typedLinks.map((item) => item.offer_id).filter(Boolean);
  if (!ids.length) {
    return [];
  }

  const { data: offers, error: offersError } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,image_url,marketplace")
    .in("id", ids);

  if (offersError) {
    throw new Error(offersError.message);
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const offer of (offers ?? []) as Array<Record<string, unknown>>) {
    byId.set(String(offer.id ?? ""), offer);
  }

  return typedLinks
    .map((link) => {
      const offer = byId.get(link.offer_id);
      if (!offer) return null;
      return {
        offer_id: link.offer_id,
        is_primary: link.is_primary,
        sort_order: link.sort_order,
        title: String(offer.title ?? "Oferta sem título"),
        price:
          typeof offer.price === "number"
            ? offer.price
            : Number(offer.price ?? 0) || null,
        image_url: String(offer.image_url ?? "").trim() || null,
        marketplace: String(offer.marketplace ?? "").trim() || null,
      };
    })
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const postId = toText(req.nextUrl.searchParams.get("post_id"));
    if (!postId) {
      return NextResponse.json({ error: "post_id obrigatório." }, { status: 400 });
    }

    const offers = await fetchPostOffers(postId);
    return NextResponse.json({ success: true, offers });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao carregar ofertas do guia.",
      },
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
    const body = (await req.json()) as { post_id?: unknown; offer_id?: unknown };
    const postId = toText(body.post_id);
    const offerId = toText(body.offer_id);

    if (!postId) {
      return NextResponse.json({ error: "post_id obrigatório." }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    const { error: postError } = await supabaseAdmin
      .from("blog_posts")
      .update({
        offer_id: offerId || null,
        updated_at: nowIso,
      })
      .eq("id", postId);

    if (postError) {
      throw new Error(postError.message);
    }

    const { error: clearPrimaryError } = await supabaseAdmin
      .from("blog_post_offers")
      .update({
        is_primary: false,
        updated_at: nowIso,
      })
      .eq("post_id", postId);

    if (clearPrimaryError) {
      throw new Error(clearPrimaryError.message);
    }

    if (offerId) {
      const { error: upsertError } = await supabaseAdmin
        .from("blog_post_offers")
        .upsert(
          {
            post_id: postId,
            offer_id: offerId,
            sort_order: 0,
            is_primary: true,
            updated_at: nowIso,
          },
          { onConflict: "post_id,offer_id" },
        );

      if (upsertError) {
        throw new Error(upsertError.message);
      }
    }

    const slug = await resolvePostSlug(postId);
    revalidatePath("/blog");
    if (slug) {
      revalidatePath(`/blog/${slug}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao atualizar a oferta principal.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as {
      post_id?: unknown;
      offers?: Array<{ offer_id?: unknown; sort_order?: unknown; is_primary?: unknown }>;
    };

    const postId = toText(body.post_id);
    const incomingOffers = Array.isArray(body.offers) ? body.offers : [];

    if (!postId) {
      return NextResponse.json({ error: "post_id obrigatório." }, { status: 400 });
    }

    const normalizedOffers = incomingOffers
      .map((item, index) => ({
        post_id: postId,
        offer_id: toText(item.offer_id),
        sort_order: Number(item.sort_order ?? index) || index,
        is_primary: Boolean(item.is_primary),
        updated_at: new Date().toISOString(),
      }))
      .filter((item) => item.offer_id);

    const primaryOffer = normalizedOffers.find((item) => item.is_primary) ?? normalizedOffers[0] ?? null;
    const finalOffers = normalizedOffers.map((item) => ({
      ...item,
      is_primary: primaryOffer ? item.offer_id === primaryOffer.offer_id : false,
    }));

    const { error: deleteError } = await supabaseAdmin
      .from("blog_post_offers")
      .delete()
      .eq("post_id", postId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (finalOffers.length) {
      const { error: insertError } = await supabaseAdmin
        .from("blog_post_offers")
        .insert(finalOffers);

      if (insertError) {
        throw new Error(insertError.message);
      }
    }

    const { error: postError } = await supabaseAdmin
      .from("blog_posts")
      .update({
        offer_id: primaryOffer?.offer_id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (postError) {
      throw new Error(postError.message);
    }

    const slug = await resolvePostSlug(postId);
    revalidatePath("/blog");
    if (slug) {
      revalidatePath(`/blog/${slug}`);
    }

    return NextResponse.json({ success: true, offers: await fetchPostOffers(postId) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao salvar ofertas do guia.",
      },
      { status: 500 },
    );
  }
}
