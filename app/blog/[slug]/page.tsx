import type { Metadata } from "next";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const { data } = await supabaseAdmin
    .from("blog_posts")
    .select("title, seo_title, seo_desc")
    .eq("slug", params.slug)
    .maybeSingle();

  return {
    title: data?.seo_title ?? data?.title ?? "Blog Radar Smart",
    description: data?.seo_desc ?? "Conteúdo Radar Smart",
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: { slug: string };
}) {
  const { data: post } = await supabaseAdmin
    .from("blog_posts")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <p className="text-xs uppercase tracking-wide text-rs-muted">
          {post?.category ?? "Blog"}
        </p>
        <h1 className="mt-2 font-display text-4xl font-bold text-navy">
          {post?.title ?? "Post não encontrado"}
        </h1>
        <article className="prose prose-slate mt-6 max-w-none rounded-xl border border-rs-border bg-white p-6">
          {post?.content ? (
            <div dangerouslySetInnerHTML={{ __html: post.content }} />
          ) : (
            <p>Este conteúdo ainda não foi publicado.</p>
          )}
        </article>
      </main>
      <Footer />
    </>
  );
}
