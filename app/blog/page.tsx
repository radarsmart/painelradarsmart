import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getBlogPosts } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  let posts: any[] = [];
  try {
    posts = await getBlogPosts(20);
  } catch {
    posts = [];
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold text-navy">Blog Radar Smart</h1>
        <p className="mt-2 text-sm text-rs-muted">
          Estratégias de compra, análise de preço e guias de afiliados.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <article key={post.id} className="rounded-xl border border-rs-border bg-white p-4 shadow-card">
              <p className="text-xs uppercase tracking-wide text-rs-muted">
                {post.category ?? "Conteúdo"}
              </p>
              <h2 className="mt-2 line-clamp-2 text-lg font-semibold text-navy">
                {post.title}
              </h2>
              <p className="mt-2 line-clamp-2 text-sm text-rs-muted">
                {post.seo_desc ?? "Ler conteúdo completo no Radar Smart."}
              </p>
              <Link
                href={`/blog/${post.slug}`}
                className="mt-4 inline-flex rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white"
              >
                Ler artigo
              </Link>
            </article>
          ))}
          {posts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-rs-border bg-white p-6 text-sm text-rs-muted">
              Sem posts publicados.
            </div>
          ) : null}
        </div>
      </main>
      <Footer />
    </>
  );
}
