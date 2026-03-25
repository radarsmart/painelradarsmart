import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Calendar, Info, Share2, Tag } from "lucide-react";
import { notFound } from "next/navigation";

import BlogProductCard from "@/components/blog/BlogProductCard";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";
import { formatBRL } from "@/lib/formatters";
import { supabaseAdmin } from "@/lib/supabase";

type BlogPostRow = {
  id: number | string;
  slug: string | null;
  title: string | null;
  excerpt: string | null;
  content: string | null;
  content_md: string | null;
  published_at: string | null;
  status: string | null;
  is_published: boolean | null;
};

type ContentBlock =
  | { type: "html"; value: string }
  | { type: "product"; offerId: string };

type OfferRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  marketplace: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  status: string | null;
};

export const dynamic = "force-dynamic";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatPublishedDate(value: string | null): string {
  if (!value) return "Data nao informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Data nao informada";

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function estimateReadingTime(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function resolveBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ||
    "https://radar-smart.vercel.app"
  ).replace(/\/$/, "");
}

function resolveShareUrl(slug: string, title: string): string {
  const articleUrl = `${resolveBaseUrl()}/blog/${slug}`;
  const params = new URLSearchParams({
    url: articleUrl,
    text: title,
  });

  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

function inferCategory(title: string): string {
  const normalized = title.toLowerCase();
  if (
    normalized.includes("iphone") ||
    normalized.includes("notebook") ||
    normalized.includes("smartphone") ||
    normalized.includes("tecnologia")
  ) {
    return "Reviews & Tecnologia";
  }

  return "Guia de Compras";
}

function resolveOfferPricing(offer: OfferRow) {
  const price = toNumber(offer.price) ?? 0;
  const oldRaw =
    toNumber(offer.old_price) ??
    toNumber(offer.original_price) ??
    toNumber(offer.price_old);
  const oldPrice = oldRaw !== null && oldRaw > price ? oldRaw : null;

  return { price, oldPrice };
}

function splitContentWithProducts(rawContent: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const regex = /\[\[product:([a-zA-Z0-9-]+)\]\]/g;

  let cursor = 0;
  let match: RegExpExecArray | null = regex.exec(rawContent);
  while (match) {
    const index = match.index;
    const token = match[0];
    const offerId = match[1];

    if (index > cursor) {
      const htmlChunk = rawContent.slice(cursor, index).trim();
      if (htmlChunk) blocks.push({ type: "html", value: htmlChunk });
    }

    blocks.push({ type: "product", offerId });
    cursor = index + token.length;
    match = regex.exec(rawContent);
  }

  const tail = rawContent.slice(cursor).trim();
  if (tail) blocks.push({ type: "html", value: tail });

  if (blocks.length === 0 && rawContent.trim()) {
    blocks.push({ type: "html", value: rawContent.trim() });
  }

  return blocks;
}

function formatInlineMarkdown(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function markdownToHtml(markdown: string): string {
  const sections = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return sections
    .map((block) => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (!lines.length) return "";

      if (lines.every((line) => line.startsWith("- "))) {
        return `<ul>${lines
          .map((line) => `<li>${formatInlineMarkdown(line.slice(2))}</li>`)
          .join("")}</ul>`;
      }

      const firstLine = lines[0];
      if (firstLine.startsWith("### ")) {
        return `<h3>${formatInlineMarkdown(firstLine.slice(4))}</h3>`;
      }
      if (firstLine.startsWith("## ")) {
        return `<h2>${formatInlineMarkdown(firstLine.slice(3))}</h2>`;
      }
      if (firstLine.startsWith("# ")) {
        return `<h1>${formatInlineMarkdown(firstLine.slice(2))}</h1>`;
      }

      return `<p>${formatInlineMarkdown(lines.join(" "))}</p>`;
    })
    .join("");
}

function formatContentToHtml(value: string): string {
  const normalized = value.trim();
  if (!normalized) return "";
  if (/<[a-z][\s\S]*>/i.test(normalized)) {
    return normalized;
  }
  return markdownToHtml(normalized);
}

async function getPost(slug: string): Promise<BlogPostRow | null> {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("id,slug,title,excerpt,content,content_md,published_at,status,is_published")
    .eq("slug", slug)
    .maybeSingle();

  return (data as BlogPostRow | null) ?? null;
}

async function getOffer(offerId: string): Promise<OfferRow | null> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(
      "id,title,image_url,affiliate_url,product_url,marketplace,price,old_price,original_price,price_old,status",
    )
    .eq("id", offerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as OfferRow;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) {
    return {
      title: "Post nao encontrado | Radar Smart Blog",
      description: "Este conteudo nao esta disponivel no momento.",
    };
  }

  return {
    title: `${post.title ?? "Guia de compra"} | Radar Smart Blog`,
    description:
      post.excerpt?.trim() ||
      "Analise de compra e oportunidade de preco no ecossistema Radar Smart.",
  };
}

export default async function BlogPostDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const post = await getPost(params.slug);
  if (!post || (!post.is_published && post.status !== "published")) {
    notFound();
  }

  const title = toText(post.title) || "Guia de compra Radar Smart";
  const excerpt =
    toText(post.excerpt) ||
    "Conteudo editorial com sinais de preco, contexto de compra e oportunidades monitoradas.";
  const contentRaw = toText(post.content) || toText(post.content_md);
  const contentBlocks = splitContentWithProducts(contentRaw);
  const firstProductIndex = contentBlocks.findIndex((block) => block.type === "product");
  const featuredOfferId =
    firstProductIndex >= 0 && contentBlocks[firstProductIndex]?.type === "product"
      ? (contentBlocks[firstProductIndex] as { type: "product"; offerId: string }).offerId
      : null;
  const articleBlocks =
    firstProductIndex >= 0
      ? contentBlocks.filter((_, index) => index !== firstProductIndex)
      : contentBlocks;
  const featuredOffer = featuredOfferId ? await getOffer(featuredOfferId) : null;
  const readingTime = estimateReadingTime(contentRaw || excerpt);
  const category = inferCategory(title);
  const shareUrl = resolveShareUrl(params.slug, title);
  const pricing = featuredOffer ? resolveOfferPricing(featuredOffer) : null;
  const featuredHref =
    featuredOffer?.affiliate_url?.trim() || featuredOffer?.product_url?.trim() || "#";
  const featuredMarketplace = toText(featuredOffer?.marketplace).toUpperCase() || "OFERTA";

  return (
    <>
      <Header />
      <article className="min-h-screen bg-white pb-20 pt-24">
        <header className="mx-auto mb-12 max-w-4xl px-4 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600">
            <Link href="/blog" className="hover:text-blue-800">
              Blog
            </Link>
            <span className="text-gray-300">/</span>
            <span>{category}</span>
          </div>

          <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600">
            <Tag size={12} />
            {category}
          </div>

          <h1 className="mb-6 text-3xl font-black leading-tight text-[#1A1A1A] md:text-5xl">
            {title}
          </h1>

          <div className="flex flex-col gap-4 border-y border-gray-100 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFC300] text-xs font-black">
                RS
              </div>
              <div>
                <p className="text-xs font-bold text-[#1A1A1A]">Equipe Radar Smart</p>
                <p className="text-[10px] text-gray-400">
                  {formatPublishedDate(post.published_at)} • {readingTime} min de leitura
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-2">
                <Calendar size={14} />
                Conteudo fresco para SEO
              </span>
              <a
                href={shareUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-gray-50 p-2 text-gray-400 transition-colors hover:text-[#1A1A1A]"
                aria-label="Compartilhar artigo"
              >
                <Share2 size={18} />
              </a>
            </div>
          </div>
        </header>

        {featuredOffer && pricing ? (
          <section className="mx-auto mb-16 max-w-4xl px-4">
            <div className="flex flex-col items-center gap-8 rounded-[40px] border-2 border-[#FFC300] bg-[#FDFCFB] p-6 shadow-xl shadow-[#FFC300]/5 md:flex-row md:p-8">
              <div className="h-48 w-48 shrink-0 rounded-3xl bg-white p-4 shadow-sm">
                <Image
                  src={featuredOffer.image_url || "/placeholder.svg"}
                  width={320}
                  height={320}
                  alt={featuredOffer.title || "Oferta destaque"}
                  className="h-full w-full object-contain"
                />
              </div>

              <div className="flex-1 space-y-4">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-emerald-700">
                  Melhor Preco Detectado
                </span>
                <h3 className="text-2xl font-black text-[#1A1A1A]">
                  {featuredOffer.title || "Oferta em destaque"}
                </h3>

                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-[#1A1A1A]">
                    {formatBRL(pricing.price)}
                  </span>
                  {pricing.oldPrice ? (
                    <span className="text-sm text-gray-400 line-through">
                      {formatBRL(pricing.oldPrice)}
                    </span>
                  ) : null}
                </div>

                <BotaoAfiliado
                  offerId={featuredOffer.id}
                  href={featuredHref}
                  source="blog_featured_offer"
                  label={`VER OFERTA NA ${featuredMarketplace}`}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl bg-[#1A1A1A] px-8 py-4 text-sm font-black text-white transition-all hover:scale-105 hover:bg-black md:w-auto"
                />
              </div>
            </div>
          </section>
        ) : null}

        <main className="mx-auto max-w-3xl px-4">
          <div className="mb-10 rounded-3xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-white p-2">
                <Info className="h-4 w-4" />
              </div>
              <p className="leading-relaxed">
                Este review combina contexto editorial, sinais de preco e links de afiliado para
                acelerar sua decisao de compra com transparencia.
              </p>
            </div>
          </div>

          <div className="prose prose-slate max-w-none prose-headings:font-black prose-p:leading-relaxed prose-img:rounded-3xl">
            <p className="text-xl leading-relaxed text-gray-700">{excerpt}</p>
          </div>

          <div className="mt-8 space-y-6">
            {articleBlocks.length > 0 ? (
              articleBlocks.map((block, index) => {
                if (block.type === "product") {
                  return (
                    <BlogProductCard key={`product-${block.offerId}-${index}`} offerId={block.offerId} />
                  );
                }

                return (
                  <section
                    key={`html-${index}`}
                    className="prose prose-slate max-w-none prose-headings:font-black prose-p:leading-relaxed prose-img:rounded-3xl"
                    dangerouslySetInnerHTML={{ __html: formatContentToHtml(block.value) }}
                  />
                );
              })
            ) : (
              <section className="prose prose-slate max-w-none prose-headings:font-black prose-p:leading-relaxed">
                <p>Este conteudo ainda nao foi publicado.</p>
              </section>
            )}
          </div>
        </main>
      </article>
      <Footer />
    </>
  );
}
