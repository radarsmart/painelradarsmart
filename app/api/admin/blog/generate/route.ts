import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function toText(v: unknown): string {
  return String(v ?? "").trim();
}

function buildSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

type GeneratedGuide = {
  title: string;
  excerpt: string;
  content: string;
  meta_title: string;
  meta_description: string;
  faq: Array<{ question: string; answer: string }>;
};

type OfferContext = {
  id: string;
  title: string;
  price: number | null;
  oldPrice: number | null;
  marketplace: string | null;
  category: string | null;
  imageUrl: string | null;
};

async function getOfferContext(offerId: string): Promise<OfferContext | null> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,old_price,original_price,marketplace,category,category_name,image_url")
    .eq("id", offerId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: String(data.id ?? ""),
    title: String(data.title ?? "").trim(),
    price: typeof data.price === "number" ? data.price : Number(data.price ?? 0) || null,
    oldPrice:
      typeof data.old_price === "number"
        ? data.old_price
        : typeof data.original_price === "number"
          ? data.original_price
          : Number(data.old_price ?? data.original_price ?? 0) || null,
    marketplace: String(data.marketplace ?? "").trim() || null,
    category: String(data.category ?? data.category_name ?? "").trim() || null,
    imageUrl: String(data.image_url ?? "").trim() || null,
  };
}

async function generateContent(params: {
  keyword: string;
  context: string;
  offer?: OfferContext | null;
}): Promise<GeneratedGuide> {
  const systemPrompt = `Você é um especialista em SEO, GEO e curadoria de ofertas do Brasil.
Escreva guias de compra otimizados para:
- SEO tradicional (Google)
- GEO (ChatGPT, Perplexity, Gemini)
- AEO (respostas diretas)
- Rich Snippets (FAQPage, Article)

Regras obrigatórias:
- Português brasileiro, tom direto e prático
- Se houver um produto selecionado, use esse produto como base para inferir a melhor keyword de compra
- Estruture o conteúdo com lógica AIDA: atenção no título e abertura, interesse com critérios claros, desejo com benefícios reais, ação com CTA natural
- Título com keyword principal no início
- H2s com perguntas que usuários realmente fazem
- FAQ com 4 perguntas e respostas completas (mín. 60 palavras cada)
- CTA natural para grupo de ofertas ao final
- Conteúdo mínimo: 600 palavras
- Formato: JSON puro, sem markdown externo

Retorne APENAS JSON válido com os campos: title, excerpt, content (markdown completo), meta_title (máx 60 chars), meta_description (máx 155 chars), faq (array de {question, answer}).`;

  const userPrompt = [
    params.keyword
      ? `Keyword principal informada: "${params.keyword}"`
      : "A keyword principal deve ser inferida por você a partir do produto selecionado.",
    params.offer
      ? `Produto selecionado:\n- Título: ${params.offer.title}\n- Marketplace: ${params.offer.marketplace ?? "não informado"}\n- Categoria: ${params.offer.category ?? "não informada"}\n- Preço atual: ${params.offer.price ?? "não informado"}\n- Preço anterior: ${params.offer.oldPrice ?? "não informado"}`
      : "",
    params.context ? `Contexto adicional: ${params.context}` : "",
    "Gere um guia de compra completo e otimizado para essa intenção de compra.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 3000,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${response.status}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  return JSON.parse(data.choices[0].message.content) as GeneratedGuide;
}

async function saveGeneratedGuide(params: {
  generated: GeneratedGuide;
  coverImage: string | null;
  slug: string;
  schemaOrg: Record<string, unknown>;
  source: "auto" | "manual";
  offerId: unknown;
}) {
  const nowIso = new Date().toISOString();
  const basePayload: Record<string, unknown> = {
    title: params.generated.title,
    slug: params.slug,
    excerpt: params.generated.excerpt,
    content: params.generated.content,
    content_md: params.generated.content,
    featured_image: params.coverImage,
    meta_title: params.generated.meta_title,
    meta_description: params.generated.meta_description,
    faq: params.generated.faq,
    schema_org: params.schemaOrg,
    status: "draft",
    is_published: false,
    source: params.source,
    offer_id: params.offerId ?? null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  const nextPayload: Record<string, unknown> = {
    ...basePayload,
    cover_image: params.coverImage,
  };

  for (;;) {
    const result = await supabaseAdmin
      .from("blog_posts")
      .upsert(nextPayload, { onConflict: "slug" })
      .select("id, slug, featured_image")
      .single();

    if (!result.error) {
      return result;
    }

    const message = result.error.message.toLowerCase();
    if (message.includes("cover_image")) {
      delete nextPayload.cover_image;
      continue;
    }
    if (message.includes("meta_title") || message.includes("meta_description")) {
      delete nextPayload.meta_title;
      delete nextPayload.meta_description;
      continue;
    }
    if (message.includes("faq")) {
      delete nextPayload.faq;
      continue;
    }
    if (message.includes("schema_org")) {
      delete nextPayload.schema_org;
      continue;
    }
    if (message.includes("source")) {
      delete nextPayload.source;
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

    return result;
  }
}

async function syncPrimaryOffer(postId: string, offerId: string) {
  const nowIso = new Date().toISOString();

  await supabaseAdmin
    .from("blog_post_offers")
    .update({
      is_primary: false,
      updated_at: nowIso,
    })
    .eq("post_id", postId);

  await supabaseAdmin.from("blog_post_offers").upsert(
    {
      post_id: postId,
      offer_id: offerId,
      sort_order: 0,
      is_primary: true,
      updated_at: nowIso,
    },
    { onConflict: "post_id,offer_id" },
  );
}

async function generateCoverImage(
  title: string,
  offer?: OfferContext | null,
): Promise<string | null> {
  if (offer?.imageUrl) {
    return offer.imageUrl;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: `Brazilian e-commerce editorial cover for "${title}". Show the central product as the clear hero object, large in frame, realistic product photography, premium marketplace aesthetic, desire-driven composition inspired by AIDA, clean background, no books, no magazines, no visible text, no watermarks.`,
        n: 1,
        size: "1792x1024",
        quality: "standard",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { data: Array<{ url: string }> };
    return data.data[0]?.url ?? null;
  } catch {
    return null;
  }
}

function buildSchemaOrg(params: {
  title: string;
  excerpt: string;
  slug: string;
  coverImage: string | null;
  faq: Array<{ question: string; answer: string }>;
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: params.title,
        description: params.excerpt,
        image: params.coverImage ?? undefined,
        url: `https://radarsmart.vercel.app/blog/${params.slug}`,
        publisher: {
          "@type": "Organization",
          name: "Radar Smart",
          url: "https://radarsmart.vercel.app",
        },
      },
      {
        "@type": "FAQPage",
        mainEntity: params.faq.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      },
    ],
  };
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await req.json()) as {
      keyword?: unknown;
      context?: unknown;
      offer_id?: unknown;
      auto?: unknown;
    };

    const keyword = toText(body.keyword);
    const linkedOfferId = toText(body.offer_id);
    const offerContext = linkedOfferId ? await getOfferContext(linkedOfferId) : null;

    if (!keyword && !offerContext) {
      return NextResponse.json(
        { error: "Informe uma keyword ou selecione uma oferta principal." },
        { status: 400 },
      );
    }

    const context = toText(body.context);
    const generated = await generateContent({
      keyword,
      context,
      offer: offerContext,
    });
    const coverImage = await generateCoverImage(generated.title, offerContext);

    const slug = buildSlug(generated.title);
    const schemaOrg = buildSchemaOrg({
      title: generated.title,
      excerpt: generated.excerpt,
      slug,
      coverImage,
      faq: generated.faq,
    });

    const { data, error } = await saveGeneratedGuide({
      generated,
      coverImage,
      slug,
      schemaOrg,
      source: body.auto ? "auto" : "manual",
      offerId: linkedOfferId || null,
    });

    if (error) {
      throw new Error(error.message);
    }

    if (linkedOfferId) {
      await syncPrimaryOffer(String(data.id), linkedOfferId);
    }

    return NextResponse.json({
      success: true,
      id: data.id,
      slug: data.slug,
      title: generated.title,
      cover_image: coverImage,
      featured_image: data.featured_image ?? coverImage,
      preview_url: `/admin/blog/preview/${data.id}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar guia." },
      { status: 500 },
    );
  }
}
