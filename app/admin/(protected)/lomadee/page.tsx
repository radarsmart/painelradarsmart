"use client";

import { useEffect, useMemo, useState } from "react";
import { 
  CheckCircle2, 
  Filter, 
  Loader2, 
  MessageSquare, 
  Search, 
  Send, 
  Sparkles, 
  X
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type LomadeeProduct = {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  price: number;
  original_price: number;
  discount_pct: number;
  image: string;
  link: string;
  seller: string;
  available: boolean;
  synced_at: string;
  deliveryCost?: number;
};

type ProductsResponse = {
  ok?: boolean;
  products?: LomadeeProduct[];
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  error?: string;
};

type DispatchAction = "telegram" | "whatsapp" | "site";
type SlotType = "flash" | "best" | "comparator";
type SortType = "" | "discount" | "price_asc" | "price_desc";

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function getProductKey(product: LomadeeProduct) {
  return `${product.organizationId}:${product.id}`;
}

export default function LomadeeHubPage() {
  const [search, setSearch] = useState("smartphone");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortType>("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [freeShipping, setFreeShipping] = useState(false);
  
  const [products, setProducts] = useState<LomadeeProduct[]>([]);
  const [meta, setMeta] = useState<ProductsResponse["meta"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [siteModalProduct, setSiteModalProduct] = useState<LomadeeProduct | null>(null);
  const [aiModalProduct, setAiModalProduct] = useState<LomadeeProduct | null>(null);
  const [tempCopy, setTempCopy] = useState("");
  
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [productCopies, setProductCopies] = useState<Record<string, string>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);

  const totalLabel = useMemo(() => {
    if (!meta) return String(products.length);
    return `${products.length} de ${meta.total}`;
  }, [meta, products.length]);

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    return token;
  }

  async function loadProducts(nextPage = page) {
    setLoading(true);
    setError("");
    setFeedback("");

    try {
      const token = await getAccessToken();
      const params = new URLSearchParams();
      params.set("page", String(nextPage));
      params.set("limit", "20");
      params.set("isAvailable", "true");
      if (search.trim()) params.set("q", search.trim());
      if (sort) params.set("sort", sort);
      if (priceMin) params.set("priceMin", priceMin);
      if (priceMax) params.set("priceMax", priceMax);
      if (freeShipping) params.set("freeShipping", "true");

      const response = await fetch(`/api/admin/lomadee/products?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as ProductsResponse;

      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || "Falha ao carregar produtos da Lomadee.");
      }

      setProducts(payload.products ?? []);
      setMeta(payload.meta);
      setPage(nextPage);
    } catch (err) {
      setProducts([]);
      setMeta(undefined);
      setError(err instanceof Error ? err.message : "Falha ao carregar produtos da Lomadee.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, freeShipping]);

  async function buildAffiliateUrl(product: LomadeeProduct) {
    const token = await getAccessToken();
    const response = await fetch("/api/admin/lomadee/shorten", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        url: product.link,
        organizationId: product.organizationId,
        productId: product.id,
      }),
    });
    const payload = (await response.json()) as { ok?: boolean; url?: string; error?: string };
    if (!response.ok || payload.ok === false || !payload.url) {
      throw new Error(payload.error || "Falha ao gerar link de afiliado Lomadee.");
    }
    return payload.url;
  }

  async function handleGenerateAICopy(product: LomadeeProduct) {
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
          productName: product.title,
          price: product.price,
          oldPrice: product.original_price,
          marketplace: product.seller || "Lomadee",
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
      setError(err instanceof Error ? err.message : "Erro na IA.");
    } finally {
      setAiLoading(null);
    }
  }

  async function handleDispatch(product: LomadeeProduct, action: DispatchAction, slotType?: SlotType, overrideCopy?: string) {
    const productKey = getProductKey(product);
    const dispatchKey = `${action}:${productKey}`;
    setDispatching(dispatchKey);
    setError("");
    setFeedback("");

    try {
      const token = await getAccessToken();
      const affiliateUrl = await buildAffiliateUrl(product);
      const copy = overrideCopy ?? productCopies[productKey] ?? "";

      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: product.title,
          price: product.price,
          old_price: product.original_price,
          image_url: product.image,
          product_url: product.link,
          affiliate_url: affiliateUrl,
          marketplace: "lomadee",
          slot_type: slotType || "best",
          copy_text: copy,
          raw_data: product,
          channels: action === "site" ? [] : [action],
        }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string; error?: string };

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Falha ao processar produto Lomadee.");
      }

      setFeedback(
        action === "site"
          ? "Produto aprovado para aparecer no site."
          : `${payload.message || "Produto enviado para o canal."}`,
      );
      setSiteModalProduct(null);
      setAiModalProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar produto Lomadee.");
    } finally {
      setDispatching(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">
            Lomadee Hub <span className="ml-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Brasil Ativo</span>
          </h1>
          <p className="text-sm text-rs-muted">
            Curadoria profunda via API Lomadee. Filtre preços, ordene e use IA para suas copies.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-rs-border bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadProducts(1);
              }}
              className="h-11 w-full rounded-2xl border border-slate-200 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-orange"
              placeholder="smartphone, ar condicionado, notebook..."
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortType)}
            className="h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange"
          >
            <option value="">Ordem Relevância</option>
            <option value="discount">Melhores Descontos</option>
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
              type="button"
              onClick={() => void loadProducts(1)}
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-navy px-5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60"
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
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                placeholder="0.00"
                className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange"
              />
              <span className="text-xs font-bold text-slate-500 uppercase">até</span>
              <input
                type="number"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                placeholder="999.00"
                className="h-10 w-24 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange"
              />
            </div>

            <div className="md:col-span-2">
               <div className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs font-semibold text-slate-500 italic">
                Total encontrado na API: {totalLabel}
              </div>
            </div>
            
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setPriceMin("");
                  setPriceMax("");
                  setSort("");
                  setFreeShipping(false);
                }}
                className="text-xs font-bold text-slate-400 hover:text-red-500 transition"
              >
                Limpar Filtros
              </button>
            </div>
          </div>
        )}
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 flex items-center justify-between">
          <span>{feedback}</span>
           <button onClick={() => setFeedback("")}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const productKey = getProductKey(product);
          const currentCopy = productCopies[productKey];
          const isAiBusy = aiLoading === productKey;

          return (
          <article
            key={productKey}
            className="flex flex-col rounded-3xl border border-rs-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex h-44 items-center justify-center overflow-hidden rounded-2xl bg-slate-50 relative">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt={product.title}
                  className="h-full w-full object-contain p-3"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                  Sem imagem
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-widest">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">Lomadee</span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 font-black">
                {product.discount_pct}% OFF
              </span>
            </div>

            <div className="mt-3 min-h-[56px]">
              <h2 className="line-clamp-2 text-sm font-bold leading-6 text-[#1A1A1A]">{product.title}</h2>
              <p className="mt-1 text-xs text-slate-400 font-medium">{product.seller}</p>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <p className="text-2xl font-black text-navy">{formatBRL(product.price)}</p>
              {product.original_price > product.price ? (
                <p className="text-xs text-slate-400 line-through">
                  {formatBRL(product.original_price)}
                </p>
              ) : null}
            </div>

            {currentCopy && (
                <div className="mt-3 rounded-2xl bg-[#FFDA00]/10 p-3 italic text-xs text-slate-700 border border-[#FFDA00]/20">
                  &ldquo;{currentCopy}&rdquo;
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

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={!!dispatching}
                  onClick={() => void handleDispatch(product, "telegram")}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#0088CC] px-2 py-2 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                >
                  {dispatching?.startsWith("telegram") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Telegram
                </button>
                <button
                  type="button"
                  disabled={!!dispatching}
                  onClick={() => void handleDispatch(product, "whatsapp")}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#25D366] px-2 py-2 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                >
                  {dispatching?.startsWith("whatsapp") ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  WhatsApp
                </button>
                <button
                  type="button"
                  disabled={!!dispatching}
                  onClick={() => setSiteModalProduct(product)}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-slate-900 px-2 py-2 text-xs font-bold text-white transition hover:bg-black disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Site
                </button>
              </div>
            </div>
          </article>
          );
        })}
      </section>

      <div className="flex items-center justify-between rounded-3xl bg-white p-4 shadow-sm">
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => void loadProducts(page - 1)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="text-sm font-semibold text-slate-600">
          Página {meta?.page ?? page} de {meta?.totalPages ?? 1}
        </span>
        <button
          type="button"
          disabled={loading || (meta?.totalPages ? page >= meta.totalPages : false)}
          onClick={() => void loadProducts(page + 1)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white hover:bg-black disabled:opacity-50"
        >
          Próxima
        </button>
      </div>

      {aiModalProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Sparkles className="text-orange h-5 w-5" /> Revisar Copy IA (Lomadee)
              </h3>
              <button onClick={() => setAiModalProduct(null)}><X className="h-6 w-6 text-gray-400" /></button>
            </div>
            
            <p className="mb-4 text-sm font-bold text-gray-700">{aiModalProduct.title}</p>
            
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
              {([
                { slot: "flash", label: "Ofertas Relâmpago", tone: "bg-orange-100 text-orange-900" },
                { slot: "best", label: "Melhores Ofertas", tone: "bg-blue-100 text-blue-900" },
                { slot: "comparator", label: "Comparador", tone: "bg-green-100 text-green-900" },
              ] as Array<{ slot: SlotType; label: string; tone: string }>).map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  disabled={!!dispatching}
                  onClick={() => void handleDispatch(siteModalProduct, "site", item.slot)}
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
