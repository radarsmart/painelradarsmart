import { generateProductSEO } from "@/lib/ai/seo-generator";
import { supabaseAdmin } from "@/lib/supabase";

type OfferRow = {
  id: string;
  title: string | null;
  category: string | null;
  price: number | null;
  image_url: string | null;
  score: number | null;
  curations_status: string | null;
  status: string | null;
  manual_copy: string | null;
  raw_data: Record<string, unknown> | null;
};

type BlogPostRow = {
  slug: string | null;
  content: string | null;
  content_md: string | null;
};

type SyncBlogResult = {
  success: boolean;
  message?: string;
  error?: string;
  created?: number;
  skipped?: number;
};

const ELITE_BLOG_SCORE_THRESHOLD = 90;
const MAX_DAILY_POSTS = 5;

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function slugify(value: string): string {
  return toText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function extractOfferIdsFromContent(value: string): string[] {
  const matches = value.match(/\[\[product:([a-zA-Z0-9-]+)\]\]/g) ?? [];
  return matches
    .map((token) => token.match(/\[\[product:([a-zA-Z0-9-]+)\]\]/)?.[1] ?? "")
    .filter(Boolean);
}

function readFeatureList(offer: OfferRow): string[] {
  const rawData = offer.raw_data ?? {};
  const featureCandidates = [
    rawData.features,
    rawData.highlights,
    rawData.bullets,
  ];

  for (const candidate of featureCandidates) {
    if (Array.isArray(candidate)) {
      const features = candidate
        .map((item) => toText(item))
        .filter(Boolean)
        .slice(0, 4);
      if (features.length) return features;
    }
  }

  const description =
    toText(rawData.description) ||
    toText(rawData.short_description) ||
    toText(offer.manual_copy);

  return description ? [description] : [];
}

function buildUniqueSlug(
  baseSlug: string,
  existingSlugs: Set<string>,
  offerId: string,
): string {
  const normalizedBase = slugify(baseSlug) || `radar-smart-${offerId.slice(0, 8).toLowerCase()}`;

  if (!existingSlugs.has(normalizedBase)) {
    existingSlugs.add(normalizedBase);
    return normalizedBase;
  }

  const suffix = offerId.slice(0, 8).toLowerCase();
  const withSuffix = `${normalizedBase}-${suffix}`;
  if (!existingSlugs.has(withSuffix)) {
    existingSlugs.add(withSuffix);
    return withSuffix;
  }

  let counter = 2;
  while (existingSlugs.has(`${withSuffix}-${counter}`)) {
    counter += 1;
  }

  const candidate = `${withSuffix}-${counter}`;
  existingSlugs.add(candidate);
  return candidate;
}

function buildBlogMarkdown(offer: OfferRow, snippet: string): string {
  const title = toText(offer.title) || "Oferta em destaque";
  const price = toNumber(offer.price);
  const category = toText(offer.category) || "Tecnologia";

  return [
    `[[product:${offer.id}]]`,
    "",
    snippet,
    "",
    "## O que faz essa oferta entrar no Radar Elite?",
    `O ${title} apareceu no topo do Radar Smart com score acima de ${ELITE_BLOG_SCORE_THRESHOLD}. Isso indica combinacao forte entre preco, apelo de categoria e potencial de clique.`,
    "",
    "## Vale a pena comprar agora?",
    `Na faixa de R$ ${price.toFixed(2).replace(".", ",")}, esta oferta chama atencao dentro de ${category}. Nosso monitoramento sugere agir enquanto a janela de preco continua favoravel.`,
  ].join("\n");
}

async function getExistingBlogRefs() {
  const { data, error } = await supabaseAdmin
    .from("blog_posts")
    .select("slug,content,content_md");

  if (error) {
    throw new Error(`Falha ao ler blog_posts: ${error.message}`);
  }

  const slugs = new Set<string>();
  const offerIds = new Set<string>();

  for (const row of (data ?? []) as BlogPostRow[]) {
    const slug = toText(row.slug);
    if (slug) slugs.add(slug);

    const content = `${toText(row.content)}\n${toText(row.content_md)}`.trim();
    for (const offerId of extractOfferIdsFromContent(content)) {
      offerIds.add(offerId);
    }
  }

  return { slugs, offerIds };
}

export async function syncDailyBlogElite(): Promise<SyncBlogResult> {
  try {
    const [offersResult, existingRefs] = await Promise.all([
      supabaseAdmin
        .from("offers")
        .select(
          "id,title,category,price,image_url,score,curations_status,status,manual_copy,raw_data",
        )
        .gt("score", ELITE_BLOG_SCORE_THRESHOLD)
        .eq("curations_status", "approved")
        .eq("status", "active")
        .order("score", { ascending: false })
        .limit(20),
      getExistingBlogRefs(),
    ]);

    if (offersResult.error) {
      throw new Error(`Falha ao ler offers: ${offersResult.error.message}`);
    }

    const eligibleOffers = ((offersResult.data ?? []) as OfferRow[])
      .filter((offer) => !existingRefs.offerIds.has(offer.id))
      .slice(0, MAX_DAILY_POSTS);

    if (!eligibleOffers.length) {
      return {
        success: true,
        message: "Nenhuma oferta de elite nova disponivel para o blog hoje.",
        created: 0,
        skipped: 0,
      };
    }

    const blogPosts = await Promise.all(
      eligibleOffers.map(async (offer) => {
        const seoData = await generateProductSEO({
          title: toText(offer.title) || "Oferta Radar Smart",
          category: toText(offer.category) || "Tecnologia",
          price: toNumber(offer.price),
          features: readFeatureList(offer),
        });

        const slug = buildUniqueSlug(seoData.slug, existingRefs.slugs, offer.id);
        const contentMd = buildBlogMarkdown(offer, seoData.content_snippet);
        const publishedAt = new Date().toISOString();

        return {
          title: seoData.seo_title,
          slug,
          excerpt: seoData.meta_description,
          content: null,
          content_md: contentMd,
          cover_image: toText(offer.image_url) || null,
          featured_image: toText(offer.image_url) || null,
          status: "published",
          is_published: true,
          published_at: publishedAt,
        };
      }),
    );

    const { error: insertError } = await supabaseAdmin.from("blog_posts").insert(blogPosts);
    if (insertError) {
      throw new Error(`Falha ao inserir blog_posts: ${insertError.message}`);
    }

    return {
      success: true,
      message: `${blogPosts.length} novos artigos de elite publicados automaticamente!`,
      created: blogPosts.length,
      skipped: Math.max(0, ((offersResult.data ?? []) as OfferRow[]).length - eligibleOffers.length),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Erro ao sincronizar artigos de elite.",
    };
  }
}

export type { SyncBlogResult };
