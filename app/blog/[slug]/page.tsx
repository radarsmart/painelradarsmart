import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, MessageSquare, User } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BlogProductCard from "@/components/blog/BlogProductCard";
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

export const dynamic = "force-dynamic";

function resolveGroupUrl(): string {
  return (
    process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ||
    "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d"
  );
}

function formatPublishedDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("pt-BR");
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

async function getPost(slug: string): Promise<BlogPostRow | null> {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("id,slug,title,excerpt,content,content_md,published_at,status,is_published")
    .eq("slug", slug)
    .maybeSingle();

  return (data as BlogPostRow | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const post = await getPost(params.slug);
  if (!post) {
    return {
      title: "Post nao encontrado | Guia de Compra Radar Smart",
      description: "Este conteudo nao esta disponivel no momento.",
    };
  }

  return {
    title: `${post.title ?? "Guia de compra"} | Guia de Compra Radar Smart`,
    description:
      post.excerpt?.trim() ||
      "Conteudo estrategico da Radar Smart para decisao de compra inteligente.",
  };
}

export default async function PostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);
  if (!post || (!post.is_published && post.status !== "published")) {
    notFound();
  }

  const groupUrl = resolveGroupUrl();
  const contentRaw = (post.content || post.content_md || "").trim();
  const contentBlocks = splitContentWithProducts(contentRaw);

  return (
    <>
      <Header />
      <article className="min-h-screen bg-white pb-20 pt-28">
        <div className="mx-auto max-w-3xl px-4">
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar para o Blog
          </Link>

          <header className="mb-10">
            <h1 className="font-display text-3xl font-extrabold leading-tight text-navy md:text-5xl">
              {post.title}
            </h1>
            <div className="mt-6 flex items-center gap-6 border-y border-slate-100 py-4 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" /> {formatPublishedDate(post.published_at)}
              </div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4" /> Editorial Radar Smart
              </div>
            </div>
          </header>

          <div className="space-y-6">
            {contentBlocks.length > 0 ? (
              contentBlocks.map((block, index) => {
                if (block.type === "product") {
                  return (
                    <BlogProductCard
                      key={`product-${block.offerId}-${index}`}
                      offerId={block.offerId}
                    />
                  );
                }

                return (
                  <section
                    key={`html-${index}`}
                    className="prose prose-slate max-w-none prose-headings:text-navy prose-a:text-[#9e6a18]"
                    dangerouslySetInnerHTML={{ __html: block.value }}
                  />
                );
              })
            ) : (
              <section className="prose prose-slate max-w-none prose-headings:text-navy prose-a:text-[#9e6a18]">
                <p>Este conteudo ainda nao foi publicado.</p>
              </section>
            )}
          </div>

          <section className="mt-16 rounded-3xl bg-[#22223B] p-8 text-center text-white md:p-12">
            <h2 className="font-display text-2xl font-bold md:text-3xl">
              Gostou das dicas deste guia? ⚡
            </h2>
            <p className="mt-4 text-slate-300">
              Nossa equipe garimpa ofertas como as deste artigo 24h por dia.
              Nao perca a proxima queda de preco!
            </p>
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#9e6a18] px-8 py-4 text-lg font-bold transition-all hover:scale-105 hover:brightness-110"
            >
              ENTRAR NO GRUPO VIP AGORA <MessageSquare className="h-5 w-5" />
            </a>
            <p className="mt-4 text-xs text-slate-400">
              Link oficial: Radar Smart (Itapema/SC)
            </p>
          </section>
        </div>
      </article>
      <Footer />
    </>
  );
}

