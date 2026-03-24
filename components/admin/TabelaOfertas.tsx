"use client";

import { useState } from "react";
import Link from "next/link";
import { formatBRL } from "@/lib/formatters";

type Offer = {
  id: string;
  title: string;
  marketplace?: string | null;
  image_url?: string | null;
  price?: number | null;
  status?: string | null;
  created_at?: string | null;
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

  const getIsActive = (offer: Offer) => (offer.status ?? "active") === "active";

  const getMarketplaceBadge = (marketplace?: string | null) => {
    const key = String(marketplace ?? "").toLowerCase();
    if (key.includes("mercado")) {
      return {
        label: "Mercado Livre",
        className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
      };
    }
    if (key.includes("amazon")) {
      return {
        label: "Amazon",
        className: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
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
      const res = await fetch("/api/admin/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          is_active: nextActive,
          status: nextActive ? "active" : "inactive",
        }),
      });

      if (!res.ok) throw new Error("Falha ao atualizar status");

      setOffers((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: nextActive ? "active" : "inactive" }
            : item,
        ),
      );
    } finally {
      setLoadingId(null);
    }
  };

  const removeOffer = async (id: string) => {
    setLoadingId(id);
    try {
      const res = await fetch("/api/admin/offers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("Falha ao remover oferta");
      setOffers((prev) => prev.filter((item) => item.id !== id));
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
                  {offer.created_at
                    ? new Date(offer.created_at).toLocaleDateString("pt-BR")
                    : "sem data"}
                </p>
                <span
                  className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getMarketplaceBadge(offer.marketplace).className}`}
                >
                  {getMarketplaceBadge(offer.marketplace).label}
                </span>
                <p className="mt-2 font-mono text-lg font-bold text-[#22223B]">
                  {formatBRL(Number(offer.price ?? 0))}
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
              <th className="px-4 py-3">Data</th>
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
                  <span className="font-mono text-base font-bold text-[#22223B]">
                    {formatBRL(Number(offer.price ?? 0))}
                  </span>
                </td>

                <td className="px-4 py-3 text-slate-600">
                  {offer.created_at
                    ? new Date(offer.created_at).toLocaleDateString("pt-BR")
                    : "sem data"}
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
