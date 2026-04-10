"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Loader2, Save } from "lucide-react";

import { supabase } from "@/lib/supabase";

type BlogPostForm = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  meta_title: string;
  meta_description: string;
  featured_image: string;
  status: string | null;
  is_published: boolean | null;
};

export default function AdminBlogEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [form, setForm] = useState<BlogPostForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    return token;
  }

  useEffect(() => {
    async function loadPost() {
      setLoading(true);
      setError("");

      try {
        const accessToken = await getAccessToken();
        const response = await fetch(`/api/admin/blog/manage?id=${encodeURIComponent(params.id)}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as {
          success?: boolean;
          post?: Record<string, unknown>;
          error?: string;
        };

        if (!response.ok || !payload.success || !payload.post) {
          throw new Error(payload.error || "Falha ao carregar guia.");
        }

        setForm({
          id: String(payload.post.id ?? ""),
          title: String(payload.post.title ?? ""),
          slug: String(payload.post.slug ?? ""),
          excerpt: String(payload.post.excerpt ?? ""),
          content: String(payload.post.content ?? ""),
          meta_title: String(payload.post.meta_title ?? ""),
          meta_description: String(payload.post.meta_description ?? ""),
          featured_image: String(payload.post.featured_image ?? ""),
          status: String(payload.post.status ?? "") || null,
          is_published: Boolean(payload.post.is_published),
        });
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar guia.");
      } finally {
        setLoading(false);
      }
    }

    void loadPost();
  }, [params.id]);

  async function handleSave() {
    if (!form) return;

    setSaving(true);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/manage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          id: form.id,
          action: "update",
          title: form.title,
          slug: form.slug,
          excerpt: form.excerpt,
          content: form.content,
          meta_title: form.meta_title,
          meta_description: form.meta_description,
          featured_image: form.featured_image,
        }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao salvar guia.");
      }

      setFeedback("Guia atualizado com sucesso.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar guia.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#1A1A1A]">Editar guia</h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Atualize título, slug, conteúdo e SEO do guia publicado ou rascunho.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/blog")}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          {form ? (
            <Link
              href={
                form.is_published || form.status === "published"
                  ? `/blog/${form.slug}`
                  : `/admin/blog/preview/${form.id}`
              }
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              {form.is_published || form.status === "published" ? "Ver post" : "Ver preview"}
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {!error && feedback ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {feedback}
        </div>
      ) : null}

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        {loading || !form ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando guia...
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Título</label>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(event) => setForm({ ...form, slug: event.target.value })}
                className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Resumo</label>
              <textarea
                value={form.excerpt}
                onChange={(event) => setForm({ ...form, excerpt: event.target.value })}
                rows={3}
                className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
              />
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Conteúdo</label>
              <textarea
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
                rows={18}
                className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Meta title</label>
                <input
                  type="text"
                  value={form.meta_title}
                  onChange={(event) => setForm({ ...form, meta_title: event.target.value })}
                  className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
                />
              </div>
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Meta description</label>
                <input
                  type="text"
                  value={form.meta_description}
                  onChange={(event) => setForm({ ...form, meta_description: event.target.value })}
                  className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">Imagem de capa</label>
              <input
                type="text"
                value={form.featured_image}
                onChange={(event) => setForm({ ...form, featured_image: event.target.value })}
                className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar alterações
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
