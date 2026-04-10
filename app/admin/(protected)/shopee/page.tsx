"use client";

import StoryGeneratorButton from "@/components/admin/StoryGeneratorButton";
import { supabase } from "@/lib/supabase";
import {
  CheckCircle2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Store,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type DispatchAction = "telegram" | "whatsapp" | "site";
type SlotType = "flash" | "best" | "comparator";
type ClassificationFilter = "" | "Melhor Comissão" | "Oferta do Dia" | "Destaque";

type ShopeeHubProduct = {
  id?: string;
  title: string;
  price: number;
  commission_rate: number;
  image: string;
  link: string;
  shop_name: string;
  classification: string;
  synced_at?: string;
  hub_offer_id?: string;
  is_saved?: boolean;
  affiliate_url_manual?: string | null;
};

type ShopeeHubResponse = {
  ok: boolean;
  products: ShopeeHubProduct[];
  filters?: {
    classifications?: string[];
  };
  source?: string;
  warning?: string;
  stats?: {
    total: number;
    averageCommission: number;
    breakdown?: {
      bestCommission: number;
      dailyOffer: number;
      featured: number;
    };
  };
  synced_at?: string;
  sync_count?: number;
  error?: string;
};

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatSyncTime(value?: string | null) {
  if (!value) return "Nunca";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Nunca";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(parsed);
}

export default function ShopeeHubPage() {
  const [search, setSearch] = useState("");
  const [commissionMin, setCommissionMin] = useState(0);
  const [classification, setClassification] = useState<ClassificationFilter>("");
  const [products, setProducts] = useState<ShopeeHubProduct[]>([]);
  const [affiliateLinks, setAffiliateLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dispatching, setDispatching] = useState<string | null>(null);
  const [siteModalProduct, setSiteModalProduct] = useState<ShopeeHubProduct | null>(null);
  const [stats, setStats] = useState<ShopeeHubResponse["stats"]>();
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [availableClassifications, setAvailableClassifications] = useState<string[]>([
    "Melhor Comissão",
    "Oferta do Dia",
    "Destaque",
  ]);

  async function getAccessToken() {
    const { data, error } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (error || !token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    return token;
  }

  async function loadProducts(options?: {
    search?: string;
    commissionMin?: number;
    classification?: ClassificationFilter;
    sync?: boolean;
  }) {
    const nextSearch = options?.search ?? search;
    const nextCommissionMin = options?.commissionMin ?? commissionMin;
    const nextClassification = options?.classification ?? classification;
    const shouldSync = options?.sync ?? false;

    setLoading(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      const params = new URLSearchParams();
      if (nextSearch.trim()) params.set("q", nextSearch.trim());
      params.set("commission", String(nextCommissionMin));
      params.set("limit", "100");
      if (nextClassification) params.set("classification", nextClassification);
      if (shouldSync) params.set("sync", "1");

      const response = await fetch(`/api/admin/shopee/hub?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = (await response.json()) as ShopeeHubResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Falha ao sincronizar Shopee.");
      }

      setProducts(payload.products || []);
      setAffiliateLinks(
        Object.fromEntries(
          (payload.products || [])
            .filter((item) => item.affiliate_url_manual)
            .map((item) => [getProductKey(item), item.affiliate_url_manual as string]),
        ),
      );
      setStats(payload.stats);
      setSyncedAt(payload.synced_at || new Date().toISOString());
      setSource(payload.source || "");
      setAvailableClassifications(
        payload.filters?.classifications?.length
          ? payload.filters.classifications
          : ["Melhor Comissão", "Oferta do Dia", "Destaque"],
      );
      setFeedback(
        payload.products?.length
          ? payload.source === "offers_fallback"
            ? `${payload.products.length} ofertas da Shopee carregadas da base local. ${payload.warning ? `Staging indisponível: ${payload.warning}.` : ""}`.trim()
            : payload.source === "shopee_api"
              ? `${payload.sync_count ?? payload.products.length} ofertas sincronizadas da API Shopee. Exibindo ${payload.products.length} ofertas salvas no hub.`
              : payload.source === "hub_offers"
                ? `${payload.products.length} ofertas carregadas do catálogo salvo do hub.`
                : `${payload.products.length} ofertas da Shopee carregadas.`
          : payload.source === "offers_fallback"
            ? "Nenhuma oferta da Shopee encontrada na base local com os filtros atuais."
            : payload.source === "shopee_api"
              ? "Sincronização concluída, mas nenhuma oferta ficou salva com os filtros atuais."
              : payload.source === "hub_offers"
                ? "Nenhuma oferta salva no hub com os filtros atuais. Use sincronizar para minerar novas ofertas."
                : "Nenhuma oferta da Shopee encontrada com os filtros atuais.",
      );
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar produtos da Shopee.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getProductKey(product: ShopeeHubProduct) {
    return product.id || product.link;
  }

  function getAffiliateUrl(product: ShopeeHubProduct) {
    return affiliateLinks[getProductKey(product)]?.trim() || product.link;
  }

  async function persistAffiliateLink(product: ShopeeHubProduct) {
    if (!product.hub_offer_id) return;

    const accessToken = await getAccessToken();
    const response = await fetch("/api/admin/hub-offers", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        id: product.hub_offer_id,
        affiliate_url_manual: affiliateLinks[getProductKey(product)]?.trim() || null,
      }),
    });

    const payload = (await response.json()) as { success?: boolean; error?: string };
    if (!response.ok || !payload.success) {
      throw new Error(payload.error || "Falha ao salvar link de afiliado no hub.");
    }
  }

  async function handleDispatch(
    product: ShopeeHubProduct,
    action: DispatchAction,
    slotType?: SlotType,
  ) {
    setDispatching(`${action}:${product.link}`);
    setFeedback("");
    setError("");

    try {
      const accessToken = await getAccessToken();
      const affiliateUrl = getAffiliateUrl(product);
      const response = await fetch("/api/admin/extrator/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: product.title,
          price: product.price,
          old_price: null,
          image_url: product.image,
          product_url: product.link,
          affiliate_url: affiliateUrl,
          hub_offer_id: product.hub_offer_id,
          marketplace: "shopee",
          slot_type: slotType,
          channels:
            action === "site"
              ? []
              : action === "telegram"
                ? ["telegram"]
                : ["whatsapp"],
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || payload.message || "Falha ao despachar oferta da Shopee.");
      }

      const slotLabels: Record<SlotType, string> = {
        flash: "Ofertas Relâmpago",
        best: "Melhores Ofertas",
        comparator: "Comparador",
      };

      setFeedback(
        action === "site" && slotType
          ? `Enviado para: ${slotLabels[slotType]} ✅`
          : payload.message || "Oferta processada com sucesso.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao executar a ação.");
    } finally {
      setDispatching(null);
      setSiteModalProduct(null);
    }
  }

  const statsView = useMemo(
    () => ({
      total: String(stats?.total ?? products.length),
      averageCommission: `${stats?.averageCommission ?? 0}%`,
      bestCommission: String(stats?.breakdown?.bestCommission ?? 0),
      dailyOffer: String(stats?.breakdown?.dailyOffer ?? 0),
      featured: String(stats?.breakdown?.featured ?? 0),
    }),
    [products.length, stats],
  );

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Store className="text-[#EE4D2D]" />
            Shopee Hub
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Curadoria de Elite: foco em ofertas afiliadas com melhor comissão.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {source ? (
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
              Origem: {source === "shopee_api" ? "API Shopee" : source === "offers_fallback" ? "Fallback local" : source === "hub_offers" ? "Catálogo salvo" : source}
            </div>
          ) : null}
          <div className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
            Última atualização: {formatSyncTime(syncedAt)}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadProducts({ sync: true })}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Sincronizando..." : "Sincronizar Shopee"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <div className="min-w-[280px] flex-1 space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Minerar na Shopee
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void loadProducts({ search: event.currentTarget.value });
                }
              }}
              placeholder="Buscar produtos com boa comissão..."
              className="w-full rounded-2xl border border-gray-100 py-2.5 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-[#EE4D2D]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Comissão mínima
          </label>
          <select
            value={String(commissionMin)}
            onChange={(event) => setCommissionMin(Number(event.target.value))}
            className="w-full rounded-2xl border border-gray-100 px-4 py-2.5 text-sm font-bold outline-none"
          >
            <option value="0">Qualquer</option>
            <option value="5">+5%</option>
            <option value="10">+10%</option>
            <option value="15">+15%</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Classificação
          </label>
          <select
            value={classification}
            onChange={(event) => setClassification(event.target.value as ClassificationFilter)}
            className="w-full rounded-2xl border border-gray-100 px-4 py-2.5 text-sm font-bold outline-none"
          >
            <option value="">Todas</option>
            {availableClassifications.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => void loadProducts()}
          disabled={loading}
          className="rounded-2xl border border-[#EE4D2D]/30 bg-[#FFF1ED] px-4 py-2.5 text-sm font-bold text-[#C0381A] transition hover:bg-[#FFE4DC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aplicar filtros
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MiniCard title="Ofertas Ativas" value={statsView.total} color="bg-white text-gray-900" />
        <MiniCard title="Comissão Média" value={statsView.averageCommission} color="bg-orange-50 text-orange-700" />
        <MiniCard title="Melhor Comissão" value={statsView.bestCommission} color="bg-red-50 text-red-700" />
        <MiniCard title="Oferta do Dia" value={statsView.dailyOffer} color="bg-amber-50 text-amber-700" />
        <MiniCard title="Destaque" value={statsView.featured} color="bg-blue-50 text-blue-700" />
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

      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={`shopee-skeleton-${index}`} className="overflow-hidden rounded-3xl bg-white p-5 shadow-sm">
              <div className="h-48 animate-pulse rounded-2xl bg-gray-100" />
              <div className="mt-4 h-4 animate-pulse rounded bg-gray-100" />
              <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="mt-4 h-6 w-1/3 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ) : products.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product, index) => (
            <article
              key={`${product.link}-${index}`}
              className="overflow-hidden rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-2xl bg-[#F8FAFC]">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.image}
                      alt={product.title}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-gray-400">Sem imagem</div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
                      Shopee
                    </span>
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-red-700">
                      {product.classification}
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-3 text-sm font-bold leading-6 text-[#1A1A1A]">
                    {product.title}
                  </h3>

                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-2xl font-black text-[#111827]">{formatBRL(product.price)}</span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Comissão {product.commission_rate.toFixed(2)}%
                    </div>
                    <span className="text-xs text-gray-500">{product.shop_name || "Loja Shopee"}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-500">
                    <span>{product.is_saved ? "Salva no hub" : "Fallback local"}</span>
                    <span>{product.synced_at ? `Sincronizada em ${formatSyncTime(product.synced_at)}` : ""}</span>
                  </div>

                  <div className="mt-4 space-y-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Link de afiliado
                    </label>
                    <input
                      type="url"
                      value={affiliateLinks[getProductKey(product)] || ""}
                      onChange={(event) =>
                        setAffiliateLinks((current) => ({
                          ...current,
                          [getProductKey(product)]: event.target.value,
                        }))
                      }
                      onBlur={() => {
                        void persistAffiliateLink(product).catch((err) => {
                          setError(
                            err instanceof Error
                              ? err.message
                              : "Falha ao salvar link de afiliado no hub.",
                          );
                        });
                      }}
                      placeholder="Cole aqui o seu link de afiliado da Shopee"
                      className="w-full rounded-2xl border border-gray-100 px-4 py-2.5 text-sm outline-none transition-all focus:ring-2 focus:ring-[#EE4D2D]/20"
                    />
                    <p className="text-xs text-gray-500">
                      Se ficar vazio, o hub usa o link original do produto.
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Curadoria pronta
                    </div>

                    <a
                      href={getAffiliateUrl(product)}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-bold text-white transition hover:bg-black"
                    >
                      Minerar oferta
                    </a>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDispatch(product, "telegram")}
                      disabled={dispatching !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-600 disabled:opacity-60"
                    >
                      {dispatching === `telegram:${product.link}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Telegram
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDispatch(product, "whatsapp")}
                      disabled={dispatching !== null}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 disabled:opacity-60"
                    >
                      {dispatching === `whatsapp:${product.link}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      WhatsApp
                    </button>
                    <button
                      type="button"
                      onClick={() => setSiteModalProduct(product)}
                      disabled={dispatching !== null}
                      className="col-span-2 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-3 py-2 text-xs font-bold text-white transition hover:bg-black disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Aprovar no Radar (Site)
                    </button>
                  </div>

                  <StoryGeneratorButton
                    title={product.title}
                    imageUrl={product.image || null}
                    price={product.price}
                    oldPrice={null}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 bg-white p-12">
          <div className="mb-4 rounded-full bg-orange-50 p-5">
            <Store size={32} className="text-[#C0381A]" />
          </div>
          <h2 className="text-xl font-bold text-[#1A1A1A]">Pronto para minerar</h2>
          <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
            Use sincronizar para salvar no hub as últimas ofertas afiliadas da Shopee.
          </p>
        </div>
      )}

      {siteModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-bold text-gray-900">Escolha o bloco de destino</h3>
            <div className="space-y-3">
              {[
                { slot: "flash", emoji: "🔥", label: "Ofertas Relâmpago", tone: "bg-orange-100 text-orange-900" },
                { slot: "best", emoji: "⭐", label: "Melhores Ofertas", tone: "bg-blue-100 text-blue-900" },
                { slot: "comparator", emoji: "📊", label: "Comparador", tone: "bg-green-100 text-green-900" },
              ].map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  onClick={() =>
                    void handleDispatch(siteModalProduct, "site", item.slot as SlotType)
                  }
                  className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left hover:brightness-95 ${item.tone}`}
                >
                  <span className="text-2xl">{item.emoji}</span>
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
              className="mt-4 w-full rounded-2xl bg-gray-100 py-3 font-semibold text-gray-700 hover:bg-gray-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className={`${color} flex flex-col rounded-2xl p-5 shadow-sm`}>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</span>
      <span className="mt-1 text-xl font-black">{value}</span>
    </div>
  );
}
