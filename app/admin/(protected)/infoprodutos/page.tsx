"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Edit3,
  ExternalLink,
  Loader2,
  Package,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type Platform =
  | "hotmart"
  | "kiwify"
  | "monetizze"
  | "eduzz"
  | "braip"
  | "outro";

type Infoproduct = {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string | null;
  benefits: string[] | null;
  platform: Platform;
  affiliate_url: string;
  cover_image: string | null;
  price: number | null;
  commission_pct: number | null;
  niche: string | null;
  status: "active" | "paused" | "archived";
  clicks: number;
  created_at: string;
  updated_at: string;
};

type InfoproductResponse = {
  products?: Infoproduct[];
  error?: string;
  success?: boolean;
  id?: string;
  slug?: string;
};

type FormState = {
  name: string;
  headline: string;
  description: string;
  benefits: string;
  platform: Platform;
  affiliate_url: string;
  cover_image: string;
  price: string;
  commission_pct: string;
  niche: string;
};

const INITIAL_FORM: FormState = {
  name: "",
  headline: "",
  description: "",
  benefits: "",
  platform: "hotmart",
  affiliate_url: "",
  cover_image: "",
  price: "",
  commission_pct: "",
  niche: "",
};

const PLATFORM_LABEL: Record<Platform, string> = {
  hotmart: "Hotmart",
  kiwify: "Kiwify",
  monetizze: "Monetizze",
  eduzz: "Eduzz",
  braip: "Braip",
  outro: "Outro",
};

function formatBRL(value?: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return token;
}

export default function AdminInfoproductsPage() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [products, setProducts] = useState<Infoproduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [savedSlug, setSavedSlug] = useState("");

  async function loadProducts() {
    setLoading(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/infoproducts", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json()) as InfoproductResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar infoprodutos.");
      }

      setProducts(Array.isArray(payload.products) ? payload.products : []);
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar infoprodutos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
  }, []);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setFeedback("");
    setSavedSlug("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/infoproducts", {
        method: editingProductId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...(editingProductId ? { id: editingProductId } : {}),
          ...form,
          benefits: form.benefits
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean),
        }),
      });

      const payload = (await response.json()) as InfoproductResponse;
      if (!response.ok || !payload.success || !payload.slug) {
        throw new Error(payload.error || "Falha ao salvar produto.");
      }

      setSavedSlug(payload.slug);
      setFeedback(
        editingProductId
          ? "Infoproduto atualizado com sucesso."
          : "Infoproduto salvo com sucesso.",
      );
      setForm(INITIAL_FORM);
      setEditingProductId(null);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar produto.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(product: Infoproduct) {
    setEditingProductId(product.id);
    setSavedSlug(product.slug);
    setError("");
    setFeedback(`Editando: ${product.name}`);
    setForm({
      name: product.name,
      headline: product.headline,
      description: product.description ?? "",
      benefits: Array.isArray(product.benefits) ? product.benefits.join("\n") : "",
      platform: product.platform,
      affiliate_url: product.affiliate_url,
      cover_image: product.cover_image ?? "",
      price: product.price ? String(product.price) : "",
      commission_pct: product.commission_pct ? String(product.commission_pct) : "",
      niche: product.niche ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelEdit() {
    setEditingProductId(null);
    setSavedSlug("");
    setError("");
    setFeedback("");
    setForm(INITIAL_FORM);
  }

  async function handleToggleStatus(product: Infoproduct) {
    setUpdatingId(product.id);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const nextStatus = product.status === "active" ? "paused" : "active";
      const response = await fetch("/api/admin/infoproducts", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: product.id, status: nextStatus }),
      });

      const payload = (await response.json()) as InfoproductResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao atualizar status.");
      }

      setFeedback(
        nextStatus === "active"
          ? "Infoproduto ativado com sucesso."
          : "Infoproduto pausado com sucesso.",
      );
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(product: Infoproduct) {
    const confirmed = window.confirm(`Excluir "${product.name}"? Essa ação não pode ser desfeita.`);
    if (!confirmed) return;

    setUpdatingId(product.id);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/infoproducts", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: product.id }),
      });

      const payload = (await response.json()) as InfoproductResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao excluir produto.");
      }

      if (editingProductId === product.id) {
        handleCancelEdit();
      }
      setFeedback("Infoproduto excluído com sucesso.");
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir produto.");
    } finally {
      setUpdatingId(null);
    }
  }

  const stats = useMemo(() => {
    const total = products.length;
    const active = products.filter((product) => product.status === "active").length;
    const champion = products[0];
    return {
      total,
      active,
      championName: champion?.name || "Nenhum ainda",
      championClicks: champion?.clicks || 0,
    };
  }, [products]);

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Sparkles className="text-[#9e6a18]" />
            Infoprodutos
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Cadastre, publique e acompanhe a performance das suas landing pages.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadProducts()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-[#1A1A1A]">
          <Package className="h-5 w-5 text-[#9e6a18]" />
          {editingProductId ? "Editar infoproduto" : "Cadastro de infoproduto"}
        </h2>
        {editingProductId ? (
          <p className="mt-2 text-sm font-medium text-[#9e6a18]">
            Você está atualizando um produto existente.
          </p>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Nome"
            value={form.name}
            onChange={(value) => updateField("name", value)}
            placeholder="Ex: Método completo para vender no perpétuo"
          />
          <Field
            label="Headline"
            value={form.headline}
            onChange={(value) => updateField("headline", value)}
            placeholder="Ex: Aprenda a vender todos os dias com estratégia prática"
          />
          <Field
            label="URL de afiliado"
            value={form.affiliate_url}
            onChange={(value) => updateField("affiliate_url", value)}
            placeholder="https://..."
          />
          <Field
            label="Imagem de capa"
            value={form.cover_image}
            onChange={(value) => updateField("cover_image", value)}
            placeholder="https://..."
          />
          <Field
            label="Preço"
            value={form.price}
            onChange={(value) => updateField("price", value)}
            placeholder="Ex: 297"
          />
          <Field
            label="Comissão (%)"
            value={form.commission_pct}
            onChange={(value) => updateField("commission_pct", value)}
            placeholder="Ex: 60"
          />
          <Field
            label="Nicho"
            value={form.niche}
            onChange={(value) => updateField("niche", value)}
            placeholder="Ex: marketing digital"
          />
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Plataforma
            </label>
            <select
              value={form.platform}
              onChange={(event) => updateField("platform", event.target.value as Platform)}
              className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm font-semibold outline-none"
            >
              {Object.entries(PLATFORM_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <TextAreaField
            label="Descrição"
            value={form.description}
            onChange={(value) => updateField("description", value)}
            placeholder="Resumo direto do produto, promessa central e público."
          />
          <TextAreaField
            label="Benefícios"
            value={form.benefits}
            onChange={(value) => updateField("benefits", value)}
            placeholder={"Cada linha vira um benefício do array.\nEx: Método validado\nEx: Aulas passo a passo"}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : editingProductId ? "Atualizar produto" : "Salvar produto"}
          </button>

          {editingProductId ? (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
            >
              Cancelar edição
            </button>
          ) : null}

          {savedSlug ? (
            <Link
              href={`/p/${savedSlug}`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-[#1A1A1A] bg-white px-5 py-3 text-sm font-semibold text-[#1A1A1A] transition hover:bg-slate-50"
            >
              Ver landing page
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniCard title="Produtos cadastrados" value={String(stats.total)} color="bg-white text-gray-900" />
        <MiniCard title="Ativos" value={String(stats.active)} color="bg-emerald-50 text-emerald-700" />
        <MiniCard
          title="Campeão atual"
          value={`${stats.championName} (${stats.championClicks} cliques)`}
          color="bg-amber-50 text-amber-700"
        />
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
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A1A]">Produtos cadastrados</h2>
            <p className="mt-1 text-sm text-slate-500">
              Ordenados por cliques para destacar o que está performando melhor.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`infoproduct-skeleton-${index}`} className="rounded-3xl bg-[#F8FAFC] p-5">
                <div className="h-36 animate-pulse rounded-2xl bg-gray-200" />
                <div className="mt-4 h-4 animate-pulse rounded bg-gray-200" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product, index) => {
              const isChampion = index === 0 && product.clicks > 0;
              const landingHref = `/p/${product.slug}`;
              const isBusy = updatingId === product.id;

              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-3xl border border-slate-100 bg-[#FCFCFD] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white">
                      {product.cover_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.cover_image}
                          alt={product.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="text-xs text-gray-400">Sem capa</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                          {PLATFORM_LABEL[product.platform] ?? product.platform}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                            product.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {product.status === "active" ? "Ativo" : "Pausado"}
                        </span>
                        {isChampion ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#F6C453]/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#9e6a18]">
                            <Crown className="h-3.5 w-3.5" />
                            Campeão
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 line-clamp-2 text-base font-bold leading-6 text-[#1A1A1A]">
                        {product.name}
                      </h3>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <p>
                          <span className="font-semibold text-slate-900">Cliques:</span>{" "}
                          {product.clicks}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-900">Comissão:</span>{" "}
                          {product.commission_pct ? `${product.commission_pct}%` : "—"}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-900">Preço:</span>{" "}
                          {formatBRL(product.price)}
                        </p>
                        <p>
                          <span className="font-semibold text-slate-900">Criado em:</span>{" "}
                          {formatDate(product.created_at)}
                        </p>
                      </div>

                      <Link
                        href={landingHref}
                        target="_blank"
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#9e6a18] hover:underline"
                      >
                        {landingHref}
                        <ExternalLink className="h-4 w-4" />
                      </Link>

                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEdit(product)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                        >
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(product)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {product.status === "active" ? "Pausar" : "Ativar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(product)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                        <Link
                          href={landingHref}
                          target="_blank"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                        >
                          Ver
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 bg-[#FCFCFD] p-12">
            <div className="mb-4 rounded-full bg-[#F6C453]/15 p-5">
              <Package size={32} className="text-[#9e6a18]" />
            </div>
            <h2 className="text-xl font-bold text-[#1A1A1A]">Nenhum infoproduto cadastrado</h2>
            <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
              Cadastre o primeiro produto acima para começar a criar landing pages e medir cliques.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#1A1A1A]/10"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#1A1A1A]/10"
      />
    </div>
  );
}

function MiniCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className={`${color} flex flex-col rounded-2xl p-5 shadow-sm`}>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</span>
      <span className="mt-1 text-xl font-black">{value}</span>
    </div>
  );
}
