"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/formatters";

type Offer = {
  id: string;
  title: string;
  marketplace?: string;
  price: number;
  status?: string;
};

export default function TabelaOfertas({ initialOffers }: { initialOffers: Offer[] }) {
  const [offers, setOffers] = useState(initialOffers);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const updateStatus = async (id: string, status: "active" | "inactive") => {
    setLoadingId(id);
    try {
      const res = await fetch("/api/admin/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar status");
      setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
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
      setOffers((prev) => prev.filter((o) => o.id !== id));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-rs-border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100 text-navy">
          <tr>
            <th className="px-4 py-3">Título</th>
            <th className="px-4 py-3">Marketplace</th>
            <th className="px-4 py-3">Preço</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => (
            <tr key={offer.id} className="border-t border-slate-200">
              <td className="px-4 py-3">{offer.title}</td>
              <td className="px-4 py-3">{offer.marketplace ?? "-"}</td>
              <td className="px-4 py-3 font-mono">{formatBRL(offer.price)}</td>
              <td className="px-4 py-3">{offer.status ?? "active"}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={loadingId === offer.id}
                    onClick={() =>
                      updateStatus(
                        offer.id,
                        offer.status === "active" ? "inactive" : "active",
                      )
                    }
                    className="rounded-md border border-rs-border px-3 py-1 text-xs font-semibold"
                  >
                    {offer.status === "active" ? "Pausar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === offer.id}
                    onClick={() => removeOffer(offer.id)}
                    className="rounded-md bg-rs-red px-3 py-1 text-xs font-semibold text-white"
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
  );
}
