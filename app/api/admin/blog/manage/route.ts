import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

async function resolveSlugById(id: string) {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("slug")
    .eq("id", id)
    .maybeSingle();

  return String(data?.slug ?? "").trim() || null;
}

async function getPostById(id: string) {
  let query = await supabaseAdmin
    .from("blog_posts")
    .select(
      "id,title,slug,excerpt,content,content_md,meta_title,meta_description,featured_image,status,is_published,created_at,updated_at,published_at,offer_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (query.error && query.error.message.toLowerCase().includes("content_md")) {
    query = await supabaseAdmin
      .from("blog_posts")
      .select(
        "id,title,slug,excerpt,content,meta_title,meta_description,featured_image,status,is_published,created_at,updated_at,published_at,offer_id",
      )
      .eq("id", id)
      .maybeSingle();
  }

  if (
    query.error &&
    (query.error.message.toLowerCase().includes("meta_title") ||
      query.error.message.toLowerCase().includes("meta_description"))
  ) {
    query = await supabaseAdmin
      .from("blog_posts")
      .select(
        "id,title,slug,excerpt,content,featured_image,status,is_published,created_at,updated_at,published_at,offer_id",
      )
      .eq("id", id)
      .maybeSingle();
  }

  if (query.error && query.error.message.toLowerCase().includes("offer_id")) {
    query = await supabaseAdmin
      .from("blog_posts")
      .select(
        "id,title,slug,excerpt,content,featured_image,status,is_published,created_at,updated_at,published_at",
      )
      .eq("id", id)
      .maybeSingle();
  }

  if (query.error) {
    throw new Error(query.error.message);
  }

  if (!query.data) {
    return null;
  }

  return {
    ...(query.data ?? {}),
    content:
      (query.data as Record<string, unknown> | null)?.content ??
      (query.data as Record<string, unknown> | null)?.content_md ??
      null,
    meta_title: (query.data as Record<string, unknown> | null)?.meta_title ?? null,
    meta_description:
      (query.data as Record<string, unknown> | null)?.meta_description ?? null,
    offer_id: (query.data as Record<string, unknown> | null)?.offer_id ?? null,
  };
}

async function updatePostWithSchemaFallback(
  id: string,
  payload: Record<string, unknown>,
) {
  const nextPayload = { ...payload };

  for (;;) {
    const result = await supabaseAdmin.from("blog_posts").update(nextPayload).eq("id", id);
    if (!result.error) {
      return result;
    }

    const message = result.error.message.toLowerCase();
    if (message.includes("meta_title") || message.includes("meta_description")) {
      delete nextPayload.meta_title;
      delete nextPayload.meta_description;
      continue;
    }
    if (message.includes("offer_id")) {
      delete nextPayload.offer_id;
      continue;
    }
    if (message.includes("content_md")) {
      delete nextPayload.content_md;
      continue;
    }

    throw new Error(result.error.message);
  }
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const id = toText(req.nextUrl.searchParams.get("id"));
    if (!id) {
      return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
    }

    const data = await getPostById(id);
    if (!data) {
      return NextResponse.json({ error: "Guia não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, post: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar guia." },
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
    const body = (await req.json()) as {
      id?: unknown;
      action?: unknown;
      title?: unknown;
      slug?: unknown;
      excerpt?: unknown;
      content?: unknown;
      meta_title?: unknown;
      meta_description?: unknown;
      featured_image?: unknown;
    };

    const id = toText(body.id);
    const action = toText(body.action);
    if (!id) {
      return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
    }

    const previousSlug = await resolveSlugById(id);
    const nowIso = new Date().toISOString();

    if (action === "pause") {
      await updatePostWithSchemaFallback(id, {
          status: "draft",
          is_published: false,
          updated_at: nowIso,
      });
    } else if (action === "update") {
      const nextTitle = toText(body.title);
      const nextSlug = toText(body.slug);
      if (!nextTitle || !nextSlug) {
        return NextResponse.json(
          { error: "title e slug são obrigatórios para edição." },
          { status: 400 },
        );
      }

      await updatePostWithSchemaFallback(id, {
          title: nextTitle,
          slug: nextSlug,
          excerpt: toText(body.excerpt) || null,
          content: toText(body.content) || null,
          content_md: toText(body.content) || null,
          meta_title: toText(body.meta_title) || null,
          meta_description: toText(body.meta_description) || null,
          featured_image: toText(body.featured_image) || null,
          updated_at: nowIso,
      });
    } else {
      return NextResponse.json({ error: "action inválida." }, { status: 400 });
    }

    const nextSlug = await resolveSlugById(id);
    revalidatePath("/blog");
    if (previousSlug) revalidatePath(`/blog/${previousSlug}`);
    if (nextSlug && nextSlug !== previousSlug) revalidatePath(`/blog/${nextSlug}`);
    if (nextSlug === previousSlug && nextSlug) revalidatePath(`/blog/${nextSlug}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar guia." },
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
    const body = (await req.json()) as { id?: unknown; all?: unknown };
    const id = toText(body.id);
    const deleteAll = Boolean(body.all);

    if (!deleteAll && !id) {
      return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
    }

    if (deleteAll) {
      const { error: linksError } = await supabaseAdmin
        .from("blog_post_offers")
        .delete()
        .not("post_id", "is", null);
      if (linksError) throw new Error(linksError.message);

      const { error: postsError } = await supabaseAdmin
        .from("blog_posts")
        .delete()
        .not("id", "is", null);
      if (postsError) throw new Error(postsError.message);

      revalidatePath("/blog");
      return NextResponse.json({ success: true });
    }

    const previousSlug = await resolveSlugById(id);

    const { error: linksError } = await supabaseAdmin
      .from("blog_post_offers")
      .delete()
      .eq("post_id", id);
    if (linksError) throw new Error(linksError.message);

    const { error: postError } = await supabaseAdmin
      .from("blog_posts")
      .delete()
      .eq("id", id);
    if (postError) throw new Error(postError.message);

    revalidatePath("/blog");
    if (previousSlug) revalidatePath(`/blog/${previousSlug}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir guia." },
      { status: 500 },
    );
  }
}
