import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabaseAdmin } from "@/lib/supabase";

type BlogPostRow = {
  id: number | string;
  slug: string | null;
  title: string | null;
  excerpt: string | null;
  cover_image: string | null;
  published_at: string | null;
  created_at: string | null;
  status: string | null;
  is_published: boolean | null;
};

export const dynamic = "force-dynamic";

function formatPublishedDate(value: string | null): string {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function normalizePosts(rows: BlogPostRow[]) {
  return rows
    .map((post) => ({
      id: String(post.id),
      slug: post.slug?.trim() || "",
      title: post.title?.trim() || "Guia de compra Radar Smart",
      excerpt:
        post.excerpt?.trim() ||
        "Analises tecnicas e comparativos para voce comprar com mais seguranca e economizar.",
      coverImage:
        post.cover_image ||
        "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?w=1200",
      publishedAt: post.published_at || post.created_at,
    }))
    .filter((post) => Boolean(post.slug));
}

async function getPosts() {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("id,slug,title,excerpt,cover_image,published_at,created_at,status,is_published")
    .or("status.eq.published,is_published.eq.true")
    .order("published_at", { ascending: false })
    .order("created_at", { ascending: false });

  return normalizePosts((data ?? []) as BlogPostRow[]);
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <>
      <Header />
      <div className="min-h-screen bg-[#F8FAFC] pb-20 pt-28">
        <div className="mx-auto max-w-7xl px-4">
          <header className="mb-12 text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#9e6a18]">
              <Sparkles className="h-4 w-4" /> Inteligencia de Compra
            </span>
            <h1 className="mt-4 font-display text-4xl font-extrabold text-navy lg:text-5xl">
              Guias de Compra & Reviews
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-slate-500">
              Analises tecnicas e comparativos para voce nunca mais errar na hora de
              escolher seu proximo produto.
            </p>
          </header>

          {posts.length > 0 ? (
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group flex flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white transition-all hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="aspect-video w-full overflow-hidden">
                    <Image
                      src={post.coverImage}
                      width={900}
                      height={506}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      alt={post.title}
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <time className="text-xs font-semibold text-slate-400">
                      {formatPublishedDate(post.publishedAt)}
                    </time>
                    <h2 className="mt-3 font-display text-xl font-bold leading-tight text-navy group-hover:text-[#9e6a18]">
                      {post.title}
                    </h2>
                    <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500">
                      {post.excerpt}
                    </p>
                    <div className="mt-6 flex items-center gap-2 text-sm font-bold text-[#9e6a18]">
                      Ler Guia Completo <ArrowRight className="h-4 w-4" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
              Sem posts publicados no momento.
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}

