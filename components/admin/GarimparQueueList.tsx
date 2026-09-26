"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Send, Star, Tag, Trash2 } from "lucide-react";

import { formatBRL, formatCompactNumber } from "@/lib/formatters";
import { supabase } from "@/lib/supabase-browser";

export type GarimparQueueItem = {
  id: string;
  title: string | null;
  marketplace: string | null;
  image_url: string | null;
  price: number | string | null;
  old_price: number | string | null;
  product_url: string | null;
  affiliate_url: string | null;
  rating: number | string | null;
  sales: number | string | null;
  coupon_code: string | null;
  created_at: string | null;
};

export const GARIMPAR_SELECTION_KEY = "garimpar_selected_ids";

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function marketplaceBadge(marketplace: string | null) {
  const key = String(marketplace ?? "").toLowerCase();
  if (key.includes("mercado")) {
    return { label: "Mercado Livre", className: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200" };
  }
  if (key.includes("amazon")) {
    return { label: "Amazon", className: "bg-orange-50 text-orange-700 ring-1 ring-orange-200" };
  }
  if (key.includes("shopee")) {
    return { label: "Shopee", className: "bg-red-50 text-red-700 ring-1 ring-red-200" };
  }
  if (key.includes("aliexpress")) {
    return { label: "AliExpress", className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" };
  }
  if (key === "awin") {
    return { label: "AWIN", className: "bg-violet-50 text-violet-700 ring-1 ring-violet-200" };
  }
  return { label: marketplace || "-", className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200" };
}

function OfferThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [imgSrc, setImgSrc] = useState(src && src.trim() ? src : "/logo.png");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      onError={() => setImgSrc("/logo.png")}
      className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover"
    />
  );
}

export default function GarimparQueueList({ items }: { items: GarimparQueueItem[] }) {
  const router = useRouter();
  const [offers, setOffers] = useState(items);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyBulk, setBusyBulk] = useState(false);

  const allSelected = offers.length > 0 && selected.size === offers.length;

  const selectedCount = selected.size;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(offers.map((o) => o.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const discardOne = async (id: string) => {
    setBusyId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/offers", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Falha ao descartar item.");
      }
      setOffers((prev) => prev.filter((o) => o.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao descartar item.");
    } finally {
      setBusyId(null);
    }
  };

  const clearQueue = async () => {
    if (!offers.length) return;
    const confirmed = window.confirm(`Descartar todos os ${offers.length} itens da fila? Esta acao nao pode ser desfeita.`);
    if (!confirmed) return;

    setBusyBulk(true);
    try {
      const headers = await getAuthHeaders();
      const ids = offers.map((o) => o.id);
      for (const id of ids) {
        await fetch("/api/admin/offers", { method: "DELETE", headers, body: JSON.stringify({ id }) });
      }
      setOffers([]);
      setSelected(new Set());
    } finally {
      setBusyBulk(false);
    }
  };

  const saveCoupon = async (id: string, couponCode: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/offers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ id, coupon_code: couponCode || null }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Falha ao salvar cupom.");
      }
      setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, coupon_code: couponCode || null } : o)));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Falha ao salvar cupom.");
    }
  };

  const copyLink = async (item: GarimparQueueItem) => {
    const link = item.affiliate_url || item.product_url || "";
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopiedId(item.id);
    window.setTimeout(() => setCopiedId((prev) => (prev === item.id ? null : prev)), 1500);
  };

  const goToDispatch = () => {
    if (!selectedCount) return;
    window.sessionStorage.setItem(GARIMPAR_SELECTION_KEY, JSON.stringify(Array.from(selected)));
    router.push("/admin/garimpar/disparo");
  };

  const summary = useMemo(() => {
    if (!selectedCount) return "Nenhum item selecionado";
    return `${selectedCount} selecionado${selectedCount === 1 ? "" : "s"}`;
  }, [selectedCount]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            disabled={!offers.length}
            className="h-4 w-4 rounded border-slate-300"
          />
          Selecionar tudo
        </label>

        <div className="flex flex-1 items-center justify-end gap-2 text-sm">
          <span className="text-slate-500">{summary}</span>
          <button
            type="button"
            onClick={clearQueue}
            disabled={busyBulk || !offers.length}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            Limpar fila
          </button>
          <button
            type="button"
            onClick={goToDispatch}
            disabled={!selectedCount}
            className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Ir para Disparos
          </button>
        </div>
      </div>

      {!offers.length ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Fila vazia. Capture produtos com a extensao para eles aparecerem aqui.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {offers.map((item) => {
            const badge = marketplaceBadge(item.marketplace);
            const price = toNumber(item.price);
            const oldPrice = toNumber(item.old_price);
            const link = item.affiliate_url || item.product_url || "";
            const rating = toNumber(item.rating);
            const sales = toNumber(item.sales);

            return (
              <div key={item.id} className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300"
                />

                <OfferThumb src={item.image_url} alt={item.title ?? "Produto"} />

                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${badge.className}`}>
                  {badge.label}
                </span>

                {rating > 0 || sales > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    {rating > 0 ? (
                      <span className="flex items-center gap-0.5">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {rating.toFixed(1)}
                      </span>
                    ) : null}
                    {sales > 0 ? <span>{formatCompactNumber(sales)} vendidos</span> : null}
                  </span>
                ) : null}

                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[#22223B]">
                  {item.title ?? "Produto sem titulo"}
                </p>

                <div className="shrink-0 text-right">
                  {oldPrice > price && oldPrice > 0 ? (
                    <p className="text-xs text-slate-400 line-through">{formatBRL(oldPrice)}</p>
                  ) : null}
                  <p className="font-mono text-sm font-bold text-[#22223B]">{formatBRL(price)}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5">
                  <Tag className="h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    defaultValue={item.coupon_code ?? ""}
                    placeholder="cupom"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (value !== (item.coupon_code ?? "")) void saveCoupon(item.id, value);
                    }}
                    className="w-20 border-none bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400"
                  />
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                      title="Abrir link"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => copyLink(item)}
                    disabled={!link}
                    className="rounded-lg border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
                    title="Copiar link"
                  >
                    {copiedId === item.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => discardOne(item.id)}
                    disabled={busyId === item.id}
                    className="rounded-lg border border-slate-200 p-2 text-red-600 transition hover:bg-red-50 disabled:opacity-40"
                    title="Descartar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
