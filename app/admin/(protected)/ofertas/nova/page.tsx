"use client";

import { useMemo, useState } from "react";
import BuscaAmazon, { ProdutoAmazon } from "@/components/admin/BuscaAmazon";
import BuscaMercadoLivre, {
  ProdutoML,
} from "@/components/admin/BuscaMercadoLivre";
import { formatBRL } from "@/lib/formatters";

type ProdutoSelecionado = (ProdutoAmazon & { marketplace: "amazon" }) | (ProdutoML & { marketplace: "mercadolivre" });

export default function AdminNovaOfertaPage() {
  const [selected, setSelected] = useState<ProdutoSelecionado | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const desconto = useMemo(() => {
    if (!selected) return 0;
    const original = Number((selected as any).original_price ?? selected.price);
    const current = Number(selected.price ?? 0);
    return original > current ? Math.round(((original - current) / original) * 100) : 0;
  }, [selected]);

  const salvar = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        title: selected.title,
        marketplace: selected.marketplace,
        price: selected.price,
        original_price: (selected as any).original_price ?? selected.price,
        discount_pct: desconto,
        image_url: (selected as any).image_url ?? null,
        product_url: selected.product_url,
        affiliate_url: selected.affiliate_url,
        status: "active",
        curation_status: "approved",
        category_id: categoryId || null,
      };

      const res = await fetch("/api/admin/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Erro ao salvar oferta");
      setMessage("Oferta publicada com sucesso.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Nova oferta</h1>
        <p className="text-sm text-rs-muted">
          Busque no marketplace, revise e publique no Radar Smart.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BuscaAmazon
          onSelect={(item) =>
            setSelected({ ...item, marketplace: "amazon" })
          }
        />
        <BuscaMercadoLivre
          onSelect={(item) =>
            setSelected({ ...item, marketplace: "mercadolivre" })
          }
        />
      </div>

      <section className="rounded-xl border border-rs-border bg-white p-4">
        <h2 className="text-lg font-semibold text-navy">Preview de publicação</h2>
        {selected ? (
          <div className="mt-3 grid gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-medium">{selected.title}</p>
              <p className="mt-1 text-xs text-rs-muted">
                Marketplace: <strong>{selected.marketplace}</strong>
              </p>
              <p className="mt-1 font-mono text-xl font-bold">
                {formatBRL(Number(selected.price))}
              </p>
              <p className="text-xs text-rs-muted">
                Desconto calculado: {desconto}%
              </p>
              <div className="mt-3 max-w-xs">
                <label className="text-xs font-semibold uppercase tracking-wide text-rs-muted">
                  Category ID (opcional)
                  <input
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange"
                    placeholder="UUID da categoria"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              onClick={salvar}
              disabled={saving}
              className="h-fit rounded-lg bg-rs-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
            >
              {saving ? "Publicando..." : "Publicar oferta"}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-rs-muted">
            Selecione um produto acima para habilitar publicação.
          </p>
        )}
        {message ? <p className="mt-3 text-xs text-rs-muted">{message}</p> : null}
      </section>
    </div>
  );
}
