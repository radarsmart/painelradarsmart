"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackagePlus,
  Search,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type AwinProduct = {
  id: string;
  productName: string;
  description: string;
  merchantProductId: string;
  merchantImageUrl: string;
  awDeepLink: string;
  searchPrice: number;
  currency: string;
  originalSearchPrice: number;
  originalCurrency: string;
  merchantName: string;
  categoryName: string;
};

type FeedResponse = {
  products: AwinProduct[];
  total: number;
  page: number;
  categories?: string[];
  error?: string;
};

type SlotType = "flash" | "best" | "comparator";
type SortType = "" | "best_deals" | "top_selling";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(value || 0);
}

function formatOriginalMoney(product: AwinProduct) {
  if (!product.originalCurrency || product.originalCurrency === "BRL") return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: product.originalCurrency,
  }).format(product.originalSearchPrice || 0);
}

function getProductKey(product: AwinProduct) {
  return `${product.id}:${product.merchantProductId}`;
}

export default function HubAwinProductsPage() {
  const params = useParams<{ advertiserId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const advertiserId = String(params.advertiserId ?? "");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const search = searchParams.get("search") ?? "";
  const category = searchParams.get("category") ?? "";
  const sort = (searchParams.get("sort") === "best_deals" || searchParams.get("sort") === "top_selling"
    ? searchParams.get("sort")
    : "") as SortType;

  const [products, setProducts] = useState<AwinProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [siteModalProduct, setSiteModalProduct] = useState<AwinProduct | null>(null);
  const [addedProducts, setAddedProducts] = useState<Record<string, boolean>>({});
  const [searchDraft, setSearchDraft] = useState(search);
  const [categoryDraft, setCategoryDraft] = useState(category);
  const [sortDraft, setSortDraft] = useState<SortType>(sort);
  const [categories, setCategories] = useState<string[]>([]);

  function buildUrl(nextParams: {
    search?: string;
    category?: string;
    sort?: SortType;
    page?: number;
  }) {
    const query = new URLSearchParams();
    const nextSearch = nextParams.search ?? search;
    const nextCategory = nextParams.category ?? category;
    const nextSort = nextParams.sort ?? sort;
    const nextPage = nextParams.page ?? page;

    if (nextSearch.trim()) query.set("search", nextSearch.trim());
    if (nextCategory.trim()) query.set("category", nextCategory.trim());
    if (nextSort) query.set("sort", nextSort);
    if (nextPage > 1) query.set("page", String(nextPage));

    const queryString = query.toString();
    return `/admin/hub-awin/${advertiserId}${queryString ? `?${queryString}` : ""}`;
  }

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return token;
  }

  async function loadProducts() {
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      const query = new URLSearchParams();
      if (search.trim()) query.set("search", search.trim());
      if (category.trim()) query.set("category", category.trim());
      if (sort) query.set("sort", sort);
      query.set("page", String(page));

      const response = await fetch(
        `/api/awin/feed/${advertiserId}?${query.toString()}`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const payload = (await response.json()) as FeedResponse;

      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar produtos AWIN.");
      }

      setProducts(payload.products ?? []);
      setTotal(payload.total ?? 0);
      setCategories(payload.categories ?? []);
    } catch (err) {
      setProducts([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : "Falha ao carregar produtos AWIN.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildUrl({ search: searchDraft, category: categoryDraft, sort: sortDraft, page: 1 }));
  }

  async function handleAddToOffer(product: AwinProduct, slotType: SlotType) {
    const productKey = getProductKey(product);
    setDispatching(productKey);
    setFeedback("");
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: product.productName,
          price: product.searchPrice,
          image_url: product.merchantImageUrl,
          product_url: product.awDeepLink,
          affiliate_url: product.awDeepLink,
          marketplace: "awin",
          slot_type: slotType,
          channels: [],
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.message || "Falha ao adicionar produto AWIN a oferta.");
      }

      const slotLabels: Record<SlotType, string> = {
        flash: "Ofertas Relampago",
        best: "Melhores Ofertas",
        comparator: "Comparador",
      };

      setAddedProducts((current) => ({ ...current, [productKey]: true }));
      setFeedback(`Enviado para: ${slotLabels[slotType]}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao adicionar produto AWIN a oferta.");
    } finally {
      setDispatching(null);
      setSiteModalProduct(null);
    }
  }

  useEffect(() => {
    setSearchDraft(search);
    setCategoryDraft(category);
    setSortDraft(sort);
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advertiserId, search, category, sort, page]);

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <Link
            href="/admin/hub-awin"
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-navy"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para anunciantes
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-[#1A1A1A]">
            Produtos AWIN
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Feed do anunciante ID {advertiserId}. Selecione um produto e escolha o bloco de destino.
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
          Pagina {page} {total ? `- ${total} produtos` : ""}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-3 rounded-3xl bg-white p-6 shadow-sm md:grid-cols-[1fr_240px_220px_auto]"
      >
        <div className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <input
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Buscar por nome do produto"
            className="h-11 w-full rounded-2xl border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-orange"
          />
        </div>
        <select
          value={categoryDraft}
          onChange={(event) => setCategoryDraft(event.target.value)}
          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange"
        >
          <option value="">Todas as categorias</option>
          {category ? <option value={category}>{category}</option> : null}
          {categories
            .filter((item) => item !== category)
            .map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
        </select>
        <select
          value={sortDraft}
          onChange={(event) => setSortDraft(event.target.value as SortType)}
          className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange"
        >
          <option value="">Ordem do feed</option>
          <option value="best_deals">Melhores ofertas</option>
          <option value="top_selling">Mais vendidos</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#1A1A1A] px-5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Filtrar
        </button>
      </form>

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

      {loading ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`awin-product-skeleton-${index}`}
              className="rounded-3xl bg-white p-5 shadow-sm"
            >
              <div className="h-44 animate-pulse rounded-2xl bg-slate-100" />
              <div className="mt-4 h-4 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="mt-5 h-11 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const productKey = getProductKey(product);
            const isAdded = Boolean(addedProducts[productKey]);
            const isDispatching = dispatching === productKey;

            return (
            <article
              key={productKey}
              className="rounded-3xl border border-rs-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex h-48 items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
                {product.merchantImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.merchantImageUrl}
                    alt={product.productName}
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <div className="text-xs font-semibold text-slate-400">Sem imagem</div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                <span className="rounded-full bg-orange/10 px-2.5 py-1 text-orange">
                  {product.merchantName || "AWIN"}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                  {product.categoryName || "Sem categoria"}
                </span>
              </div>

              <h2 className="mt-3 line-clamp-3 min-h-[72px] text-sm font-bold leading-6 text-[#1A1A1A]">
                {product.productName}
              </h2>

              <p className="mt-3 text-2xl font-black text-navy">
                {formatMoney(product.searchPrice, product.currency)}
              </p>
              {product.originalCurrency && product.originalCurrency !== "BRL" ? (
                <p className="mt-1 text-xs font-semibold text-slate-500">
                  Convertido de {formatOriginalMoney(product)}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => setSiteModalProduct(product)}
                disabled={isAdded || dispatching !== null}
                className={`mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  isAdded
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-900 text-white hover:bg-black disabled:bg-slate-100 disabled:text-slate-500"
                }`}
              >
                {isDispatching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isAdded ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <PackagePlus className="h-4 w-4" />
                )}
                {isAdded ? "Adicionado" : "Adicionar a Oferta"}
              </button>
            </article>
            );
          })}
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <PackagePlus className="mb-4 h-10 w-10 text-slate-400" />
          <h2 className="text-xl font-bold text-[#1A1A1A]">
            Nenhum produto encontrado
          </h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Ajuste a busca ou limpe o filtro de categoria para tentar novamente.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
        <Link
          href={buildUrl({ page: Math.max(1, page - 1) })}
          aria-disabled={page <= 1}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold ${
            page <= 1
              ? "pointer-events-none bg-slate-100 text-slate-400"
              : "bg-slate-900 text-white hover:bg-black"
          }`}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Link>
        <span className="text-sm font-semibold text-slate-600">Pagina {page}</span>
        <Link
          href={buildUrl({ page: page + 1 })}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-black"
        >
          Proxima
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {siteModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Escolha o bloco de destino</h3>
            <div className="space-y-3">
              {[
                { slot: "flash", label: "Ofertas Relampago", tone: "bg-orange-100 text-orange-900" },
                { slot: "best", label: "Melhores Ofertas", tone: "bg-blue-100 text-blue-900" },
                { slot: "comparator", label: "Comparador", tone: "bg-green-100 text-green-900" },
              ].map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  onClick={() => void handleAddToOffer(siteModalProduct, item.slot as SlotType)}
                  disabled={dispatching !== null}
                  className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 ${item.tone}`}
                >
                  <CheckCircle2 className="h-5 w-5" />
                  <div>
                    <p className="font-semibold">{item.label}</p>
                    <p className="text-sm opacity-70">{item.slot}</p>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSiteModalProduct(null)}
              disabled={dispatching !== null}
              className="mt-4 w-full rounded-2xl bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
