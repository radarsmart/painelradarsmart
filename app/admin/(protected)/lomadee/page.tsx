"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, Search, Send } from "lucide-react";

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

const SLOT_OPTIONS: Array<{ slot: SlotType; label: string }> = [
  { slot: "flash", label: "Oferta Relampago" },
  { slot: "best", label: "Melhores Ofertas" },
  { slot: "comparator", label: "Comparador" },
];

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
  const [products, setProducts] = useState<LomadeeProduct[]>([]);
  const [meta, setMeta] = useState<ProductsResponse["meta"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [siteModalProduct, setSiteModalProduct] = useState<LomadeeProduct | null>(null);

  const totalLabel = useMemo(() => {
    if (!meta) return String(products.length);
    return `${products.length} de ${meta.total}`;
  }, [meta, products.length]);

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
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
      setFeedback(
        payload.products?.length
          ? `${payload.products.length} produtos carregados da Lomadee.`
          : "Nenhum produto encontrado para a busca atual.",
      );
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
  }, []);

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

  async function handleDispatch(product: LomadeeProduct, action: DispatchAction, slotType?: SlotType) {
    const dispatchKey = `${action}:${getProductKey(product)}`;
    setDispatching(dispatchKey);
    setError("");
    setFeedback("");

    try {
      const token = await getAccessToken();
      const affiliateUrl = await buildAffiliateUrl(product);
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
          raw_data: product,
          channels:
            action === "site"
              ? []
              : action === "telegram"
                ? ["telegram"]
                : ["whatsapp"],
        }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string; error?: string };

      if (!response.ok || payload.success === false) {
        throw new Error(payload.error || "Falha ao processar produto Lomadee.");
      }

      setFeedback(
        action === "site"
          ? "Produto aprovado para aparecer no site."
          : `${payload.message || "Produto enviado para o canal."} Para aparecer no site, use Aprovar no Radar.`,
      );
      setSiteModalProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar produto Lomadee.");
    } finally {
      setDispatching(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Lomadee Hub</h1>
        <p className="text-sm text-rs-muted">
          Busque produtos da API Lomadee, gere links de afiliado e aprove manualmente para a vitrine.
        </p>
      </div>

      <section className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Buscar produto
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void loadProducts(1);
              }}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
              placeholder="smartphone, ar condicionado, notebook..."
            />
          </label>

          <button
            type="button"
            onClick={() => void loadProducts(1)}
            disabled={loading}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar
          </button>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
            Total: {totalLabel}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          A API Lomadee exige <code>LOMADEE_API_KEY</code> no servidor. Telegram/WhatsApp nao publicam no site automaticamente.
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article
            key={getProductKey(product)}
            className="flex flex-col rounded-2xl border border-rs-border bg-white p-4 shadow-sm"
          >
            <div className="flex gap-4">
              {product.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image}
                  alt={product.title}
                  className="h-24 w-24 rounded-xl border border-slate-200 object-contain"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                  Sem imagem
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-sm font-bold text-navy">{product.title}</p>
                <p className="mt-1 text-xs text-slate-500">{product.seller}</p>
                <p className="mt-2 text-2xl font-black text-navy">{formatBRL(product.price)}</p>
                {product.original_price > product.price ? (
                  <p className="text-xs text-slate-500 line-through">
                    {formatBRL(product.original_price)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-1">Lomadee</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">
                {product.discount_pct}% OFF
              </span>
              <span className="rounded-full bg-slate-100 px-2 py-1">
                {product.available ? "Disponivel" : "Indisponivel"}
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              <a
                href={product.link}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-slate-300 px-3 py-2 text-center text-sm font-semibold text-slate-700"
              >
                Ver produto
              </a>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={Boolean(dispatching)}
                  onClick={() => void handleDispatch(product, "telegram")}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-sky-500 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  <Send className="h-3.5 w-3.5" />
                  Telegram
                </button>
                <button
                  type="button"
                  disabled={Boolean(dispatching)}
                  onClick={() => void handleDispatch(product, "whatsapp")}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  WhatsApp
                </button>
                <button
                  type="button"
                  disabled={Boolean(dispatching)}
                  onClick={() => setSiteModalProduct(product)}
                  className="inline-flex items-center justify-center gap-1 rounded-xl bg-green-700 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Site
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={loading || page <= 1}
          onClick={() => void loadProducts(page - 1)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Anterior
        </button>
        <span className="text-sm text-slate-500">
          Pagina {meta?.page ?? page} de {meta?.totalPages ?? 1}
        </span>
        <button
          type="button"
          disabled={loading || (meta?.totalPages ? page >= meta.totalPages : false)}
          onClick={() => void loadProducts(page + 1)}
          className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          Proxima
        </button>
      </div>

      {siteModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-navy">Publicar no site</h2>
            <p className="mt-2 text-sm text-slate-600">
              Escolha onde este produto da Lomadee vai aparecer na vitrine publica.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {SLOT_OPTIONS.map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  disabled={Boolean(dispatching)}
                  onClick={() => void handleDispatch(siteModalProduct, "site", item.slot)}
                  className="rounded-xl bg-green-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setSiteModalProduct(null)}
              className="mt-4 w-full rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
