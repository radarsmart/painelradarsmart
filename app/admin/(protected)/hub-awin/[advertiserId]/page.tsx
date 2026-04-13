"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  MessageSquare,
  PackagePlus,
  Search,
  Send,
  Sparkles,
  Truck,
  X,
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
  deliveryCost?: number;
};

type FeedResponse = {
  products: AwinProduct[];
  total: number;
  page: number;
  categories?: string[];
  error?: string;
};

type SlotType = "flash" | "best" | "comparator";
type SortType = "" | "best_deals" | "top_selling" | "price_asc" | "price_desc";

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(value || 0);
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
  const sort = (searchParams.get("sort") ?? "") as SortType;
  const priceMin = searchParams.get("priceMin") ?? "";
  const priceMax = searchParams.get("priceMax") ?? "";
  const freeShipping = searchParams.get("freeShipping") === "true";

  const [products, setProducts] = useState<AwinProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dispatching, setDispatching] = useState<string | null>(null);
  
  const [siteModalProduct, setSiteModalProduct] = useState<AwinProduct | null>(null);
  const [aiModalProduct, setAiModalProduct] = useState<AwinProduct | null>(null);
  const [tempCopy, setTempCopy] = useState("");
  
  const [addedProducts, setAddedProducts] = useState<Record<string, boolean>>({});
  
  const [searchDraft, setSearchDraft] = useState(search);
  const [categoryDraft, setCategoryDraft] = useState(category);
  const [sortDraft, setSortDraft] = useState<SortType>(sort);
  const [priceMinDraft, setPriceMinDraft] = useState(priceMin);
  const [priceMaxDraft, setPriceMaxDraft] = useState(priceMax);
  const [freeShippingDraft, setFreeShippingDraft] = useState(freeShipping);

  const [categories, setCategories] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [productCopies, setProductCopies] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(priceMin || priceMax || freeShipping ? true : false);

  function buildUrl(nextParams: {
    search?: string;
    category?: string;
    sort?: SortType;
    priceMin?: string;
    priceMax?: string;
    freeShipping?: boolean;
    page?: number;
  }) {
    const query = new URLSearchParams();
    
    const nextSearch = nextParams.search ?? search;
    const nextCategory = nextParams.category ?? category;
    const nextSort = nextParams.sort ?? sort;
    const nextPriceMin = nextParams.priceMin ?? priceMin;
    const nextPriceMax = nextParams.priceMax ?? priceMax;
    const nextFreeShipping = nextParams.freeShipping ?? freeShipping;
    const nextPage = nextParams.page ?? page;

    if (nextSearch.trim()) query.set("search", nextSearch.trim());
    if (nextCategory.trim()) query.set("category", nextCategory.trim());
    if (nextSort) query.set("sort", nextSort);
    if (nextPriceMin) query.set("priceMin", nextPriceMin);
    if (nextPriceMax) query.set("priceMax", nextPriceMax);
    if (nextFreeShipping) query.set("freeShipping", "true");
    if (nextPage > 1) query.set("page", String(nextPage));

    const queryString = query.toString();
    return `/admin/hub-awin/${advertiserId}${queryString ? `?${queryString}` : ""}`;
  }

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessão expirada. Faça login novamente.");
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
      if (priceMin) query.set("priceMin", priceMin);
      if (priceMax) query.set("priceMax", priceMax);
      if (freeShipping) query.set("freeShipping", "true");
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
    router.push(buildUrl({ 
      search: searchDraft, 
      category: categoryDraft, 
      sort: sortDraft, 
      priceMin: priceMinDraft,
      priceMax: priceMaxDraft,
      freeShipping: freeShippingDraft,
      page: 1 
    }));
  }

  async function handleGenerateAICopy(product: AwinProduct) {
    const productKey = getProductKey(product);
    setAiLoading(productKey);
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/ai/copy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productName: product.productName,
          price: product.searchPrice,
          oldPrice: product.originalSearchPrice,
          marketplace: product.merchantName || "AWIN",
        }),
      });

      const payload = (await response.json()) as { copy?: string; error?: string };
      if (!response.ok || !payload.copy) {
        throw new Error(payload.error || "Falha ao gerar copy com IA.");
      }

      setProductCopies((prev) => ({ ...prev, [productKey]: payload.copy! }));
      setTempCopy(payload.copy);
      setAiModalProduct(product);
    } catch (err) {
      console.error("AI Copy Error:", err);
      setError(err instanceof Error ? err.message : "Erro na IA.");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleDispatch(product: AwinProduct, action: "telegram" | "whatsapp" | "site", slotType?: SlotType, overrideCopy?: string) {
    const productKey = getProductKey(product);
    const dispatchKey = `${action}:${productKey}`;
    setDispatching(dispatchKey);
    setFeedback("");
    setError("");

    try {
      const token = await getAccessToken();
      const copy = overrideCopy ?? productCopies[productKey] ?? "";

      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: product.productName,
          price: product.searchPrice,
          old_price: product.originalSearchPrice,
          image_url: product.merchantImageUrl,
          product_url: product.awDeepLink,
          affiliate_url: product.awDeepLink,
          marketplace: "awin",
          slot_type: slotType || "best",
          copy_text: copy,
          channels: action === "site" ? [] : [action],
        }),
      });

      const payload = (await response.json()) as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.message || "Falha no despacho.");
      }

      if (action === "site") {
        setAddedProducts((current) => ({ ...current, [productKey]: true }));
      }
      
      const successMsg = `Sucesso: ${payload.message || "Oferta processada"}`;
      setFeedback(successMsg);
      // Opcional: alert(successMsg); 
    } catch (err) {
      console.error("Dispatch Error:", err);
      setError(err instanceof Error ? err.message : "Falha no despacho.");
    } finally {
      setDispatching(null);
      setSiteModalProduct(null);
      setAiModalProduct(null);
    }
  }

  useEffect(() => {
    setSearchDraft(search);
    setCategoryDraft(category);
    setSortDraft(sort);
    setPriceMinDraft(priceMin);
    setPriceMaxDraft(priceMax);
    setFreeShippingDraft(freeShipping);
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advertiserId, search, category, sort, priceMin, priceMax, freeShipping, page]);

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
            Produtos AWIN <span className="ml-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Brasil Ativo</span>
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Curadoria profunda: filtre por anunciante, categoria, preço e frete.
          </p>
        </div>

        <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
          Pagina {page} {total ? `- ${total} produtos` : ""}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-3xl bg-white p-6 shadow-sm"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_240px_220px_auto]">
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
            {categories.map((item) => (
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
            <option value="price_asc">Menor preço</option>
            <option value="price_desc">Maior preço</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border transition ${showAdvanced ? "bg-orange-50 border-orange text-orange" : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"}`}
            >
              <Filter className="h-5 w-5" />
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#1A1A1A] px-5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Filtrar
            </button>
          </div>
        </div>

        {showAdvanced && (
          <div className="grid gap-4 border-t border-slate-100 pt-4 md:grid-cols-4 md:items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Preço de</span>
              <input
                type="number"
                value={priceMinDraft}
                onChange={(e) => setPriceMinDraft(e.target.value)}
                placeholder="0.00"
                className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange"
              />
              <span className="text-xs font-bold text-slate-500 uppercase">até</span>
              <input
                type="number"
                value={priceMaxDraft}
                onChange={(e) => setPriceMaxDraft(e.target.value)}
                placeholder="999.00"
                className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange"
              />
            </div>

            <div className="md:col-span-2">
              <label className="inline-flex items-center cursor-pointer gap-3">
                <input
                  type="checkbox"
                  checked={freeShippingDraft}
                  onChange={(e) => setFreeShippingDraft(e.target.checked)}
                  className="peer sr-only"
                />
                <div className="relative h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none dark:border-gray-600 dark:bg-gray-700 forced-colors:hidden"></div>
                <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
                  <Truck className="h-4 w-4" />
                  Frete Grátis
                </div>
              </label>
            </div>
            
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setPriceMinDraft("");
                  setPriceMaxDraft("");
                  setFreeShippingDraft(false);
                }}
                className="text-xs font-bold text-slate-400 hover:text-red-500 transition"
              >
                Limpar Filtros Avançados
              </button>
            </div>
          </div>
        )}
      </form>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700 flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback("")}><X className="h-4 w-4" /></button>
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
            const isDispatching = dispatching?.includes(productKey);
            const isAiBusy = aiLoading === productKey;
            const currentCopy = productCopies[productKey];
            const isFreeShipping = product.deliveryCost === 0;

            return (
            <article
              key={productKey}
              className="flex flex-col rounded-3xl border border-rs-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex h-48 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 relative">
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
                
                {isFreeShipping && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black uppercase text-emerald-700 shadow-sm border border-emerald-200/50">
                    <Truck className="h-3 w-3" />
                    Frete Grátis
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
                <span className="rounded-full bg-orange/10 px-2.5 py-1 text-orange">
                  {product.merchantName || "AWIN"}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 line-clamp-1">
                  {product.categoryName || "Sem categoria"}
                </span>
              </div>

              <h2 className="mt-3 line-clamp-2 text-sm font-bold leading-6 text-[#1A1A1A]">
                {product.productName}
              </h2>

              <div className="mt-2 flex items-baseline gap-2">
                <p className="text-2xl font-black text-navy">
                  {formatMoney(product.searchPrice, product.currency)}
                </p>
                {product.originalSearchPrice > product.searchPrice && (
                   <p className="text-xs text-slate-400 line-through">
                    {formatMoney(product.originalSearchPrice, product.currency)}
                  </p>
                )}
              </div>
              
              {currentCopy && (
                <div className="mt-3 rounded-2xl bg-[#FFDA00]/10 p-3 italic text-xs text-slate-700">
                  "{currentCopy}"
                </div>
              )}

              <div className="mt-5 grid gap-2">
                <button
                  type="button"
                  onClick={() => void handleGenerateAICopy(product)}
                  disabled={isAiBusy || !!dispatching}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-100 text-sm font-bold text-orange-900 transition hover:bg-orange-200 disabled:opacity-50"
                >
                  {isAiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {currentCopy ? "Revisar/Regerar Copy" : "Gerar Copy IA"}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDispatch(product, "telegram")}
                    disabled={!!dispatching}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0088CC] text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                  >
                    {dispatching === `telegram:${productKey}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Telegram
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDispatch(product, "whatsapp")}
                    disabled={!!dispatching}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                  >
                    {dispatching === `whatsapp:${productKey}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                    WhatsApp
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setSiteModalProduct(product)}
                  disabled={isAdded || !!dispatching}
                  className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed ${
                    isAdded
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-900 text-white hover:bg-black disabled:bg-slate-100 disabled:text-slate-500"
                  }`}
                >
                  {dispatching === `site:${productKey}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isAdded ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <PackagePlus className="h-4 w-4" />
                  )}
                  {isAdded ? "Adicionado" : "Aprovar no Site"}
                </button>
              </div>
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
            Tente ajustar os filtros, o preço ou a busca para encontrar o que deseja.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => router.push(buildUrl({ page: Math.max(1, page - 1) }))}
          disabled={page <= 1}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold ${
            page <= 1
              ? "bg-slate-100 text-slate-400"
              : "bg-slate-900 text-white hover:bg-black"
          }`}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </button>
        <span className="text-sm font-semibold text-slate-600">Página {page}</span>
        <button
          type="button"
          onClick={() => router.push(buildUrl({ page: page + 1 }))}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-black"
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {aiModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="text-orange h-5 w-5" /> Revisar Copy Gerada
              </h3>
              <button onClick={() => setAiModalProduct(null)}><X className="h-6 w-6 text-gray-400" /></button>
            </div>
            
            <p className="mb-4 text-sm font-bold text-gray-700">{aiModalProduct.productName}</p>
            
            <textarea
              className="w-full h-48 rounded-2xl border border-slate-200 p-4 text-sm font-medium focus:border-orange outline-none resize-none"
              value={tempCopy}
              onChange={(e) => setTempCopy(e.target.value)}
              placeholder="Digite sua copy aqui..."
            />
            
            <div className="mt-6 grid grid-cols-2 gap-3">
               <button
                  type="button"
                  onClick={() => void handleGenerateAICopy(aiModalProduct)}
                  disabled={!!aiLoading}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-slate-100 py-4 font-bold text-slate-700 hover:bg-slate-200"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Regerar com IA
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pk = getProductKey(aiModalProduct);
                    setProductCopies(prev => ({ ...prev, [pk]: tempCopy }));
                    setAiModalProduct(null);
                  }}
                  className="rounded-2xl bg-[#1A1A1A] py-4 font-bold text-white hover:bg-black uppercase tracking-widest text-xs"
                >
                  Salvar Copy
                </button>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-3 uppercase font-black">Enviar Direto:</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => void handleDispatch(aiModalProduct, "telegram", undefined, tempCopy)}
                  disabled={!!dispatching}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-[#0088CC] py-4 font-bold text-white hover:brightness-95"
                >
                  {dispatching?.startsWith("telegram") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Telegram
                </button>
                <button
                  onClick={() => void handleDispatch(aiModalProduct, "whatsapp", undefined, tempCopy)}
                  disabled={!!dispatching}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-4 font-bold text-white hover:brightness-95"
                >
                  {dispatching?.startsWith("whatsapp") ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />}
                  Enviar WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {siteModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Escolha o bloco de destino</h3>
            <div className="space-y-3">
              {[
                { slot: "flash", label: "Ofertas Relâmpago", tone: "bg-orange-100 text-orange-900" },
                { slot: "best", label: "Melhores Ofertas", tone: "bg-blue-100 text-blue-900" },
                { slot: "comparator", label: "Comparador", tone: "bg-green-100 text-green-900" },
              ].map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  onClick={() => handleDispatch(siteModalProduct, "site", item.slot as SlotType)}
                  disabled={!!dispatching}
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
              disabled={!!dispatching}
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
