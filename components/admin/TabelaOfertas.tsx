"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/formatters";
import {
  hasManualSiteOverride,
  isOfferVisibleOnSite,
} from "@/lib/offers/site-visibility";
import { supabase } from "@/lib/supabase";

type Offer = {
  id: string;
  title: string;
  marketplace?: string | null;
  image_url?: string | null;
  price?: number | null;
  old_price?: number | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
  expires_at?: string | null;
  price_updated_at?: string | null;
  price_previous?: number | null;
  price_trend?: string | null;
  curations_status?: string | null;
  affiliate_url?: string | null;
  slot_type?: string | null;
  manual_copy?: unknown;
};

function OfferThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [imgSrc, setImgSrc] = useState(src && src.trim() ? src : "/logo.png");
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imgSrc}
      alt={alt}
      onError={() => setImgSrc("/logo.png")}
      className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
    />
  );
}

export default function TabelaOfertas({ initialOffers }: { initialOffers: Offer[] }) {
  const [offers, setOffers] = useState(initialOffers);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const getIsActive = (offer: Offer) => (offer.status ?? "active") === "active";
  const isApprovedForSite = (offer: Offer) => isOfferVisibleOnSite(offer);
  const getSlotLabel = (slot?: string | null) => {
    if (slot === "flash") return "Relampago";
    if (slot === "comparator") return "Comparador";
    return "Melhores";
  };
  const getSiteStatusLabel = (offer: Offer) => {
    if (!isApprovedForSite(offer)) return "Nao publicada";
    if (String(offer.curations_status ?? "").trim().toLowerCase() === "approved") {
      return `Aprovada - ${getSlotLabel(offer.slot_type)}`;
    }
    if (hasManualSiteOverride(offer)) {
      return `Publicada manualmente - ${getSlotLabel(offer.slot_type)}`;
    }
    return `Aprovada - ${getSlotLabel(offer.slot_type)}`;
  };
  const getTrendLabel = (offer: Offer) => {
    const trend = String(offer.price_trend ?? "").trim().toLowerCase();
    const previousPrice = Number(offer.price_previous ?? 0);
    if (trend === "down" && previousPrice > 0) {
      return `Caiu de ${formatBRL(previousPrice)}`;
    }
    if (trend === "up" && previousPrice > 0) {
      return `Subiu de ${formatBRL(previousPrice)}`;
    }
    return null;
  };
  const formatOfferDate = (offer: Offer) => {
    const dateValue = offer.published_at ?? offer.updated_at ?? offer.created_at;
    return dateValue ? new Date(dateValue).toLocaleString("pt-BR") : "sem data";
  };
  const formatPriceCheckDate = (offer: Offer) => {
    const dateValue = offer.price_updated_at;
    return dateValue ? new Date(dateValue).toLocaleString("pt-BR") : "Ainda nao verificado";
  };

  const getMarketplaceBadge = (marketplace?: string | null) => {
    const key = String(marketplace ?? "").toLowerCase();
    if (key.includes("mercado")) {
      return {
        label: "Mercado Livre",
        className: "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200",
      };
    }
    if (key.includes("amazon")) {
      return {
        label: "Amazon",
        className: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
      };
    }
    if (key.includes("shopee")) {
      return {
        label: "Shopee",
        className: "bg-red-50 text-red-700 ring-1 ring-red-200",
      };
    }
    return {
      label: marketplace || "-",
      className: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
    };
  };

  const updateStatus = async (id: string, nextActive: boolean) => {
    setLoadingId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/offers", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          id,
          is_active: nextActive,
          status: nextActive ? "active" : "inactive",
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || "Falha ao atualizar status");
      }

      setOffers((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: nextActive ? "active" : "inactive" }
            : item,
        ),
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Falha ao atualizar status",
      );
    } finally {
      setLoadingId(null);
    }
  };

  const removeOffer = async (id: string) => {
    const confirmed = window.confirm(
      "Excluir esta oferta permanentemente? Esta acao nao pode ser desfeita.",
    );
    if (!confirmed) return;

    setLoadingId(id);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/offers", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ id }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) throw new Error(payload.error || "Falha ao remover oferta");
      setOffers((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Falha ao remover oferta",
      );
    } finally {
      setLoadingId(null);
    }
  };

  if (!offers.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        Nenhuma oferta cadastrada ainda.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-3 p-3 md:hidden">
        {offers.map((offer) => (
          <article
            key={offer.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <OfferThumb src={offer.image_url} alt={offer.title} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[#22223B]">{offer.title}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatOfferDate(offer)}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getMarketplaceBadge(offer.marketplace).className}`}
                >
                  {getMarketplaceBadge(offer.marketplace).label}
                </span>
                <p className="mt-2 font-mono text-lg font-bold text-[#22223B]">
                  {formatBRL(Number(offer.price ?? 0))}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {formatPriceCheckDate(offer)}
                </p>
                {getTrendLabel(offer) ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700">
                    {getTrendLabel(offer)}
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-semibold text-slate-500">
                  {isApprovedForSite(offer)
                    ? getSiteStatusLabel(offer)
                    : "Fora do site"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                disabled={loadingId === offer.id}
                onClick={() => updateStatus(offer.id, !getIsActive(offer))}
                className={`relative inline-flex h-8 w-16 items-center rounded-full transition-all ${
                  getIsActive(offer) ? "bg-emerald-500" : "bg-slate-300"
                }`}
                aria-label="Alternar status da oferta"
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-all ${
                    getIsActive(offer) ? "translate-x-9" : "translate-x-1"
                  }`}
                />
              </button>

              <div className="flex gap-2">
                <Link
                  href={`/admin/ofertas/nova?id=${offer.id}`}
                  className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                >
                  Editar
                </Link>
                <button
                  type="button"
                  disabled={loadingId === offer.id}
                  onClick={() => removeOffer(offer.id)}
                  className="inline-flex h-10 items-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white"
                >
                  Excluir
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-slate-50 text-[#22223B]">
            <tr>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Loja</th>
              <th className="px-4 py-3">Preco</th>
              <th className="px-4 py-3">Atualizada</th>
              <th className="px-4 py-3">Site</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((offer) => (
              <tr key={offer.id} className="border-t border-slate-200">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <OfferThumb src={offer.image_url} alt={offer.title} />
                    <p className="max-w-[380px] truncate font-semibold text-[#22223B]">
                      {offer.title}
                    </p>
                  </div>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getMarketplaceBadge(offer.marketplace).className}`}
                  >
                    {getMarketplaceBadge(offer.marketplace).label}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <div>
                    <span className="font-mono text-base font-bold text-[#22223B]">
                      {formatBRL(Number(offer.price ?? 0))}
                    </span>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {formatPriceCheckDate(offer)}
                    </p>
                    {getTrendLabel(offer) ? (
                      <p className="mt-1 text-[11px] font-medium text-emerald-700">
                        {getTrendLabel(offer)}
                      </p>
                    ) : null}
                  </div>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {formatOfferDate(offer)}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                      isApprovedForSite(offer)
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                    }`}
                  >
                    {isApprovedForSite(offer)
                      ? getSiteStatusLabel(offer)
                      : "Nao publicada"}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <button
                    type="button"
                    disabled={loadingId === offer.id}
                    onClick={() => updateStatus(offer.id, !getIsActive(offer))}
                    className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all ${
                      getIsActive(offer) ? "bg-emerald-500" : "bg-slate-300"
                    }`}
                    aria-label="Alternar status da oferta"
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-all ${
                        getIsActive(offer) ? "translate-x-8" : "translate-x-1"
                      }`}
                    />
                  </button>
                </td>

                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/ofertas/nova?id=${offer.id}`}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Editar
                    </Link>
                    <button
                      type="button"
                      disabled={loadingId === offer.id}
                      onClick={() => removeOffer(offer.id)}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                    >
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
