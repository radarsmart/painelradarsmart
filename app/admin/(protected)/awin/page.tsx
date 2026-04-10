"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Store,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type AwinStatus = {
  ok?: boolean;
  publisherId?: string;
  hasToken?: boolean;
  hasFeedListUrl?: boolean;
  hasProductFeedDownloadUrl?: boolean;
  masterTag?: string;
};

type AwinProgramme = {
  id: string;
  name: string;
  displayUrl: string;
  clickThroughUrl: string;
  logoUrl: string;
  status: string;
  currencyCode: string;
  region: string;
};

type AwinOffer = {
  id: string;
  type: string;
  title: string;
  description: string;
  terms: string;
  advertiserId: string;
  advertiserName: string;
  joined: boolean;
  startDate: string;
  endDate: string;
  url: string;
  trackingUrl: string;
  voucherCode: string;
};

type AwinFeed = {
  id: string;
  name: string;
  advertiserId: string;
  advertiserName: string;
  language: string;
  region: string;
  lastUpdated: string;
  downloadUrl: string;
};

type AwinProduct = {
  id: string;
  name: string;
  merchantProductId: string;
  merchantId: string;
  merchantName: string;
  categoryName: string;
  categoryId: string;
  price: number;
  displayPrice: string;
  currency: string;
  imageUrl: string;
  description: string;
  deepLink: string;
  merchantDeepLink: string;
  lastUpdated: string;
};

type JsonResponse<T> = T & {
  ok?: boolean;
  error?: string;
};

type DispatchAction = "telegram" | "whatsapp" | "site";
type SlotType = "flash" | "best" | "comparator";

const RELATIONSHIP_OPTIONS = [
  { value: "joined", label: "Aprovados" },
  { value: "pending", label: "Pendentes" },
  { value: "not joined", label: "Nao inscritos" },
];

const SLOT_OPTIONS: Array<{ slot: SlotType; label: string }> = [
  { slot: "flash", label: "Ofertas Relampago" },
  { slot: "best", label: "Melhores Ofertas" },
  { slot: "comparator", label: "Comparador" },
];

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

export default function AwinHubPage() {
  const [status, setStatus] = useState<AwinStatus>();
  const [relationship, setRelationship] = useState("joined");
  const [programmes, setProgrammes] = useState<AwinProgramme[]>([]);
  const [offers, setOffers] = useState<AwinOffer[]>([]);
  const [feeds, setFeeds] = useState<AwinFeed[]>([]);
  const [products, setProducts] = useState<AwinProduct[]>([]);
  const [feedSearch, setFeedSearch] = useState("");
  const [advertiserId, setAdvertiserId] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [loading, setLoading] = useState("");
  const [dispatching, setDispatching] = useState("");
  const [siteModalProduct, setSiteModalProduct] = useState<AwinProduct | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const configLabel = useMemo(() => {
    if (!status) return "Carregando";
    return status.hasToken ? "API token configurado" : "AWIN_API_TOKEN ausente";
  }, [status]);

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return token;
  }

  async function fetchJson<T>(url: string, init?: RequestInit) {
    const token = await getAccessToken();
    const response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
    const payload = (await response.json()) as JsonResponse<T>;
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Falha na API AWIN.");
    }
    return payload;
  }

  async function loadStatus() {
    try {
      const payload = await fetchJson<AwinStatus>("/api/admin/awin/status");
      setStatus(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar status AWIN.");
    }
  }

  async function loadProgrammes() {
    setLoading("programmes");
    setError("");
    setFeedback("");

    try {
      const params = new URLSearchParams();
      params.set("relationship", relationship);
      params.set("countryCode", "BR");
      const payload = await fetchJson<{ programmes: AwinProgramme[] }>(
        `/api/admin/awin/programmes?${params.toString()}`,
      );
      setProgrammes(payload.programmes ?? []);
      setFeedback(`${payload.programmes?.length ?? 0} programas carregados da AWIN.`);
    } catch (err) {
      setProgrammes([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar programas AWIN.");
    } finally {
      setLoading("");
    }
  }

  async function loadOffers() {
    setLoading("offers");
    setError("");
    setFeedback("");

    try {
      const params = new URLSearchParams();
      params.set("membership", "joined");
      params.set("status", "active");
      params.set("type", "all");
      params.set("regionCode", "BR");
      params.set("page", "1");
      params.set("pageSize", "20");
      if (advertiserId.trim()) params.set("advertiserId", advertiserId.trim());

      const payload = await fetchJson<{ offers: AwinOffer[] }>(
        `/api/admin/awin/offers?${params.toString()}`,
      );
      setOffers(payload.offers ?? []);
      setFeedback(`${payload.offers?.length ?? 0} ofertas/coupons carregados da AWIN.`);
    } catch (err) {
      setOffers([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar ofertas AWIN.");
    } finally {
      setLoading("");
    }
  }

  async function loadFeedList() {
    setLoading("feeds");
    setError("");
    setFeedback("");

    try {
      const payload = await fetchJson<{ feeds: AwinFeed[] }>("/api/admin/awin/feed-list");
      setFeeds(payload.feeds ?? []);
      setFeedback(`${payload.feeds?.length ?? 0} feeds carregados da AWIN.`);
    } catch (err) {
      setFeeds([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar feeds AWIN.");
    } finally {
      setLoading("");
    }
  }

  async function loadProducts() {
    setLoading("products");
    setError("");
    setFeedback("");

    try {
      const params = new URLSearchParams();
      params.set("limit", "30");
      if (feedSearch.trim()) params.set("q", feedSearch.trim());
      const payload = await fetchJson<{ products: AwinProduct[] }>(
        `/api/admin/awin/products?${params.toString()}`,
      );
      setProducts(payload.products ?? []);
      setFeedback(`${payload.products?.length ?? 0} produtos carregados do feed AWIN.`);
    } catch (err) {
      setProducts([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar produtos AWIN.");
    } finally {
      setLoading("");
    }
  }

  async function generateLink() {
    setLoading("link");
    setError("");
    setFeedback("");
    setGeneratedUrl("");

    try {
      const payload = await fetchJson<{ url?: string; shortUrl?: string }>("/api/admin/awin/link", {
        method: "POST",
        body: JSON.stringify({
          advertiserId,
          destinationUrl,
          campaign: "radar-smart",
          clickref: "radar-smart",
        }),
      });
      const url = payload.shortUrl || payload.url || "";
      setGeneratedUrl(url);
      setFeedback(url ? "Link AWIN gerado com sucesso." : "AWIN respondeu sem URL rastreavel.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar link AWIN.");
    } finally {
      setLoading("");
    }
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
    setFeedback("Link copiado.");
  }

  async function dispatchProduct(
    product: AwinProduct,
    action: DispatchAction,
    slotType?: SlotType,
  ) {
    const dispatchKey = `${action}:${product.id}:${product.merchantId}`;
    setDispatching(dispatchKey);
    setError("");
    setFeedback("");

    try {
      const affiliateUrl = product.deepLink || product.merchantDeepLink;
      const productUrl = product.merchantDeepLink || product.deepLink;
      if (!affiliateUrl || !productUrl) {
        throw new Error("Produto AWIN sem link para publicar.");
      }

      const payload = await fetchJson<{ success?: boolean; message?: string }>(
        "/api/admin/extrator/dispatch",
        {
          method: "POST",
          body: JSON.stringify({
            title: product.name,
            price: product.price,
            old_price: 0,
            image_url: product.imageUrl,
            product_url: productUrl,
            affiliate_url: affiliateUrl,
            marketplace: "awin",
            slot_type: slotType || "best",
            raw_data: product,
            channels:
              action === "site"
                ? []
                : action === "telegram"
                  ? ["telegram"]
                  : ["whatsapp"],
          }),
        },
      );

      setFeedback(
        action === "site"
          ? "Produto AWIN aprovado para aparecer no site."
          : payload.message || "Produto AWIN enviado para o canal.",
      );
      setSiteModalProduct(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar produto AWIN.");
    } finally {
      setDispatching("");
    }
  }

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">AWIN Hub</h1>
        <p className="text-sm text-rs-muted">
          Gerencie MasterTag, programas, ofertas e links rastreaveis da AWIN.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Publisher ID</p>
          <p className="mt-2 text-2xl font-black text-navy">{status?.publisherId || "2843910"}</p>
        </div>
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">API</p>
          <p className={status?.hasToken ? "mt-2 font-bold text-emerald-600" : "mt-2 font-bold text-amber-700"}>
            {configLabel}
          </p>
        </div>
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">MasterTag</p>
          <p className="mt-2 text-sm font-semibold text-emerald-700">Instalado no site</p>
        </div>
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Product Feed</p>
          <p
            className={
              status?.hasProductFeedDownloadUrl
                ? "mt-2 font-bold text-emerald-600"
                : "mt-2 font-bold text-amber-700"
            }
          >
            {status?.hasProductFeedDownloadUrl ? "Feed configurado" : "URL do feed ausente"}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Script ativo: <code>https://www.dwin2.com/pub.2843910.min.js</code>. Ative no painel AWIN os plugins
        recomendados: Publisher Disclosure, Bounceless Tracking e Convert-a-Link.
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {feedback ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          {feedback}
        </div>
      ) : null}

      <section className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Produtos do feed AWIN</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use a URL manual de download do feed para buscar produtos com link profundo AWIN.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
          <input
            value={feedSearch}
            onChange={(event) => setFeedSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void loadProducts();
            }}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            placeholder="smartphone, tv, notebook..."
          />
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={Boolean(loading)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading === "products" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar produtos
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Programas</span>
            <select
              value={relationship}
              onChange={(event) => setRelationship(event.target.value)}
              className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            >
              {RELATIONSHIP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void loadProgrammes()}
            disabled={Boolean(loading)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-navy px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading === "programmes" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
            Carregar programas
          </button>
          <button
            type="button"
            onClick={() => void loadOffers()}
            disabled={Boolean(loading)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading === "offers" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Ofertas ativas
          </button>
          <button
            type="button"
            onClick={() => void loadFeedList()}
            disabled={Boolean(loading)}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            {loading === "feeds" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Lista de feeds
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-navy">Gerador de link AWIN</h2>
        <p className="mt-1 text-sm text-slate-500">
          Use o ID do anunciante e a URL final do produto para criar um link rastreavel.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <input
            value={advertiserId}
            onChange={(event) => setAdvertiserId(event.target.value)}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            placeholder="Advertiser ID"
          />
          <input
            value={destinationUrl}
            onChange={(event) => setDestinationUrl(event.target.value)}
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange"
            placeholder="https://loja.com/produto"
          />
          <button
            type="button"
            onClick={() => void generateLink()}
            disabled={Boolean(loading) || !advertiserId.trim() || !destinationUrl.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Gerar link
          </button>
        </div>
        {generatedUrl ? (
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm md:flex-row md:items-center">
            <code className="min-w-0 flex-1 break-all text-slate-700">{generatedUrl}</code>
            <button
              type="button"
              onClick={() => void copyText(generatedUrl)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 font-semibold text-slate-700"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {programmes.map((programme) => (
          <article key={programme.id} className="rounded-2xl border border-rs-border bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              {programme.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={programme.logoUrl} alt={programme.name} className="h-16 w-16 rounded-xl object-contain" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                  AWIN
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-navy">{programme.name}</p>
                <p className="text-xs text-slate-500">ID {programme.id} • {programme.region || "sem regiao"}</p>
                <p className="text-xs text-slate-500">{programme.status} {programme.currencyCode}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdvertiserId(programme.id)}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Usar ID
              </button>
              <a
                href={programme.clickThroughUrl || programme.displayUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Abrir
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {feeds.map((feed) => (
          <article key={`${feed.id}-${feed.downloadUrl}`} className="rounded-2xl border border-rs-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-1">{feed.language || "idioma nao informado"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">{feed.region || "regiao nao informada"}</span>
            </div>
            <h3 className="mt-3 font-bold text-navy">{feed.name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {feed.advertiserName || "Anunciante AWIN"} {feed.advertiserId ? `- ID ${feed.advertiserId}` : ""}
            </p>
            <p className="mt-3 text-xs text-slate-500">
              Ultima atualizacao: {feed.lastUpdated || "-"}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAdvertiserId(feed.advertiserId)}
                disabled={!feed.advertiserId}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Usar ID
              </button>
              <button
                type="button"
                disabled={!feed.downloadUrl}
                onClick={() => void copyText(feed.downloadUrl)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copiar feed
              </button>
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => (
          <article key={`${product.id}-${product.merchantId}`} className="rounded-2xl border border-rs-border bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              {product.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.imageUrl} alt={product.name} className="h-20 w-20 rounded-xl object-contain" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">
                  AWIN
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-3 font-bold text-navy">{product.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {product.merchantName} - ID {product.merchantId}
                </p>
                <p className="mt-2 text-2xl font-black text-navy">{formatBRL(product.price)}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-1">{product.currency || "BRL"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">{product.categoryName || "sem categoria"}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdvertiserId(product.merchantId);
                  setDestinationUrl(product.merchantDeepLink || product.deepLink);
                }}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Usar no gerador
              </button>
              <button
                type="button"
                disabled={!product.deepLink}
                onClick={() => void copyText(product.deepLink)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copiar link
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={Boolean(dispatching)}
                onClick={() => void dispatchProduct(product, "telegram")}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-sky-500 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {dispatching === `telegram:${product.id}:${product.merchantId}` ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Telegram
              </button>
              <button
                type="button"
                disabled={Boolean(dispatching)}
                onClick={() => void dispatchProduct(product, "whatsapp")}
                className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-500 px-2 py-2 text-xs font-bold text-white disabled:opacity-60"
              >
                {dispatching === `whatsapp:${product.id}:${product.merchantId}` ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5" />
                )}
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
          </article>
        ))}
      </section>

      {siteModalProduct ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-xl font-bold text-navy">Publicar AWIN no site</h2>
            <p className="mt-2 text-sm text-slate-600">
              Escolha onde este produto AWIN vai aparecer na vitrine publica.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {SLOT_OPTIONS.map((item) => (
                <button
                  key={item.slot}
                  type="button"
                  disabled={Boolean(dispatching)}
                  onClick={() => void dispatchProduct(siteModalProduct, "site", item.slot)}
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

      <section className="grid gap-4 md:grid-cols-2">
        {offers.map((offer) => (
          <article key={offer.id} className="rounded-2xl border border-rs-border bg-white p-4 shadow-sm">
            <div className="flex flex-wrap gap-2 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-1">{offer.type}</span>
              <span className="rounded-full bg-slate-100 px-2 py-1">
                {offer.joined ? "Programa aprovado" : "Nao aprovado"}
              </span>
              {offer.voucherCode ? (
                <span className="rounded-full bg-green-50 px-2 py-1 font-bold text-green-700">
                  Cupom {offer.voucherCode}
                </span>
              ) : null}
            </div>
            <h3 className="mt-3 font-bold text-navy">{offer.title}</h3>
            <p className="mt-1 text-sm text-slate-500">{offer.advertiserName} • ID {offer.advertiserId}</p>
            <p className="mt-2 line-clamp-3 text-sm text-slate-600">{offer.description || offer.terms}</p>
            <p className="mt-3 text-xs text-slate-500">
              Validade: {formatDate(offer.startDate)} ate {formatDate(offer.endDate)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdvertiserId(offer.advertiserId);
                  setDestinationUrl(offer.url);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                Usar oferta
              </button>
              <button
                type="button"
                disabled={!offer.trackingUrl}
                onClick={() => void copyText(offer.trackingUrl)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copiar link
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
