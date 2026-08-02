import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { ensureOfferShortCode } from "@/lib/offers/short-link";
import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";
import { toAbsoluteSiteUrl } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase";

const WHATSAPP_GROUP_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ??
  "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";

async function resolveOfferLink(offerId: string): Promise<string> {
  const shortCode = await ensureOfferShortCode(supabaseAdmin, offerId);
  return toAbsoluteSiteUrl(`/go/${shortCode}`);
}

function fillLinkPlaceholders(text: string, offerLink: string | null): string {
  return text
    .replaceAll("{{LINK_OFERTA}}", offerLink ?? toAbsoluteSiteUrl("/ofertas"))
    .replaceAll("{{LINK_GRUPO}}", WHATSAPP_GROUP_URL);
}

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
  const systemPrompt = `Você é um redator sênior de conteúdo comercial, do time editorial de um site de curadoria de ofertas no Brasil (Radar Smart). Seu texto é lido por gente decidindo se compra algo AGORA — não é um blog genérico, é conteúdo que precisa converter leitura em clique de compra, do jeito que sites grandes de review/afiliado (tipo Wirecutter, Buzzfeed Shopping, "Melhores Produtos") fazem, adaptado pro público brasileiro.

Por que esses sites vendem mais que um blog comum:
1. Respondem a pergunta ANTES de explicar — quem só quer a resposta rápida encontra ela nas primeiras linhas.
2. Não empurram um produto único como "o melhor pra todo mundo" — apresentam 2-4 cenários reais ("melhor custo-benefício", "melhor pra quem viaja", "vale mais a pena se você já tem X") pra que o leitor se reconheça em um deles. Cada cenário é um novo momento de decisão de compra.
3. Explicam o CRITÉRIO de escolha (o "como avaliar"), não só o resultado — isso constrói autoridade e reduz o medo de errar na compra.
4. Admitem um ponto fraco real de cada opção. Textos que só elogiam soam patrocinados e convertem pior; um texto honesto com 1 ressalva por item converte melhor porque parece imparcial.
5. Usam número específico em vez de elogio vago ("economiza cerca de 40% comparado ao preço médio" bate muito mais forte que "ótimo custo-benefício").
6. Fecham CADA recomendação com uma frase de ação natural (não só no final do texto todo) — o call-to-action fica espalhado nos momentos de decisão, não empilhado só na conclusão.

Escreva guias otimizados para SEO tradicional (Google), GEO (ChatGPT/Perplexity/Gemini citando o conteúdo) e AEO (aparecer como resposta direta / rich snippet).

Estrutura obrigatória do conteúdo (markdown):
1. Título com a keyword principal logo no início, prometendo algo concreto (não use "Guia completo sobre X" — prometa um resultado: "os 3 melhores X por menos de R$Y", "como não errar na hora de comprar X").
2. Logo após o título, um bloco "## Resposta rápida" com 2-3 frases cravando a recomendação principal — isso é o que motores de IA e o Google extraem primeiro.
3. Uma seção explicando os critérios que importam pra escolher bem (H2 em formato de pergunta real que gente digita no Google).
4. 2-4 subseções (H3), cada uma um cenário/perfil diferente de quem compra, cada uma terminando com uma frase de call-to-action natural.
5. Pelo menos 1 ressalva/contra honesto em algum ponto do texto.
6. FAQ com 4 perguntas e respostas completas (mín. 60 palavras cada), respondendo objeções reais de compra.
7. Fechamento curto com CTA pro grupo de ofertas.

Regra crítica sobre links (NUNCA quebre isso):
- Só existe UM produto real com link de compra disponível: o produto informado abaixo (se houver).
- Toda vez que recomendar ESSE produto, use exatamente \`{{LINK_OFERTA}}\` como o link em markdown normal, sem codificar os caracteres (ex.: \`[Confira o preço atual]({{LINK_OFERTA}})\` — não invente URL, não use "#").
- NÃO invente nomes de marcas/modelos concorrentes específicos como se fossem produtos à venda — isso cria links quebrados e reduz a confiança do leitor. Os 2-4 cenários/perfis devem girar em torno de COMO USAR ou PRA QUEM SERVE o produto informado (ex.: "ideal se você viaja com frequência", "vale mais a pena se seu aparelho já usa USB-C"), não em comparar com produtos que não vendemos.
- Se não houver produto informado, não crie nenhum link de compra — fale em termos de características a procurar, sem nome de marca específica, e no fechamento direcione pro grupo de ofertas (link \`{{LINK_GRUPO}}\`) pra ver as opções atualizadas.

Regras obrigatórias:
- Português brasileiro, tom direto, de quem entende do assunto e já comprou o produto — nunca robótico ou genérico.
- Se houver um produto selecionado, use-o como a recomendação central de todo o texto, inferindo a keyword principal a partir dele.
- Conteúdo mínimo: 700 palavras.
- O campo "excerpt" é texto puro (sem markdown, sem link, sem colchetes) — os links com {{LINK_OFERTA}}/{{LINK_GRUPO}} só aparecem dentro de "content".
- Formato: JSON puro, sem markdown externo ao redor do JSON.

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

async function uploadGeneratedCover(b64: string): Promise<string | null> {
  // gpt-image-1 sempre devolve a imagem em base64 (nao tem mais URL pronta
  // como o dall-e-3 antigo) — precisa subir pro Storage pra virar uma URL
  // publica que a coluna featured_image possa guardar.
  const buffer = Buffer.from(b64, "base64");
  const storagePath = `blog-covers/${randomUUID()}.png`;
  const bucket = "ugc-assets";

  const { error: uploadError } = await supabaseAdmin.storage
    .from(bucket)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });

  if (uploadError) return null;

  const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  return publicUrlData.publicUrl ?? null;
}

async function fetchImageBuffer(src: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!isValidRemoteImageUrl(src)) return null;
  try {
    const upstream = await fetch(src, {
      redirect: "follow",
      headers: {
        accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      },
      cache: "no-store",
    });
    if (!upstream.ok) return null;
    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await upstream.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  }
}

// Pega a foto real do produto e pede pra IA recompor numa cena editorial,
// mantendo o produto reconhecivel — em vez de so descrever o produto por
// texto e deixar a IA "imaginar" como ele e (o que gera algo parecido, mas
// nao o produto de verdade que a pessoa vai receber).
async function generateCoverFromProductPhoto(
  title: string,
  offer: OfferContext,
): Promise<string | null> {
  const productImage = await fetchImageBuffer(offer.imageUrl ?? "");
  if (!productImage) return null;

  try {
    const form = new FormData();
    form.append("model", "gpt-image-1");
    form.append(
      "prompt",
      `Turn the attached product photo into a premium editorial blog cover for a Brazilian shopping article titled "${title}". Keep the exact product from the photo — same shape, color, branding and design — completely recognizable and unchanged. Place it as the hero subject in a realistic lifestyle scene that fits how it's used, warm natural light, shallow depth of field, magazine-quality composition. No added text, no watermark, no collage, no other products.`,
    );
    form.append("size", "1536x1024");
    form.append("quality", "medium");
    form.append(
      "image[]",
      new Blob([new Uint8Array(productImage.buffer)], { type: productImage.contentType }),
      "product.jpg",
    );

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { data: Array<{ b64_json?: string }> };
    const b64 = data.data[0]?.b64_json;
    if (!b64) return null;

    return uploadGeneratedCover(b64);
  } catch {
    return null;
  }
}

async function generateCoverFromScratch(
  title: string,
  offer?: OfferContext | null,
): Promise<string | null> {
  const subject = offer?.title || title;
  const category = offer?.category ? ` da categoria ${offer.category}` : "";

  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `Editorial blog cover photo for a Brazilian shopping/deals article titled "${title}", about "${subject}"${category}. Professional lifestyle product photography, the product as clear hero subject shot in real-world context (not floating on plain white), warm inviting light, premium e-commerce magazine aesthetic, shallow depth of field. No text, no logos, no watermarks, no collage, no books or laptops unless they are literally the product.`,
        n: 1,
        size: "1536x1024",
        quality: "medium",
      }),
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { data: Array<{ b64_json?: string }> };
    const b64 = data.data[0]?.b64_json;
    if (!b64) return null;

    return uploadGeneratedCover(b64);
  } catch {
    return null;
  }
}

async function generateCoverImage(
  title: string,
  offer?: OfferContext | null,
): Promise<string | null> {
  if (offer?.imageUrl) {
    const fromPhoto = await generateCoverFromProductPhoto(title, offer);
    if (fromPhoto) return fromPhoto;
  }

  // Sem produto real (ou a edicao a partir da foto falhou): gera do zero.
  return generateCoverFromScratch(title, offer);
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

    const offerLink = linkedOfferId ? await resolveOfferLink(linkedOfferId) : null;
    generated.content = fillLinkPlaceholders(generated.content, offerLink);
    generated.excerpt = fillLinkPlaceholders(generated.excerpt, offerLink);

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
