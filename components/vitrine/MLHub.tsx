"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Smartphone, TrendingUp } from "lucide-react";
import { formatBRL } from "@/lib/formatters";

type MlHubProduct = {
  id: string;
  title: string;
  price: number;
  image?: string;
  thumbnail: string;
  link?: string;
  permalink: string;
  category_id: string | null;
  sold_quantity: number | null;
  updated_at: string;
};

type MlHubResponse = {
  success: boolean;
  products: MlHubProduct[];
  error?: string;
};

export default function MLHub() {
  const [products, setProducts] = useState<MlHubProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    const loadProducts = async () => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/ml/products?limit=8", { cache: "no-store" });
        const data = (await response.json()) as MlHubResponse;
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Falha ao carregar produtos ML.");
        }
        setProducts(data.products ?? []);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : "Falha ao carregar ML Hub.");
      } finally {
        setLoading(false);
      }
    };

    void loadProducts();
  }, []);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9e6a18]">
            Mercado Livre Hub
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-navy">
            Produtos em destaque
          </h2>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#22223B] px-3 py-2 text-xs font-semibold text-white">
          <Smartphone className="h-4 w-4 text-[#9e6a18]" />
          Curadoria fixa do ML
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={`mlhub-skeleton-${index}`}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
            >
              <div className="h-36 animate-pulse rounded-xl bg-slate-100" />
              <div className="mt-3 h-4 animate-pulse rounded bg-slate-100" />
              <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="mt-4 h-10 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {error || "Não foi possível carregar o Mercado Livre Hub agora."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <article
              key={product.id}
              className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5"
            >
              <div className="flex h-40 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={product.image || product.thumbnail || "/next.svg"}
                  alt={product.title}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>

              <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-navy">
                {product.title}
              </h3>

              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="font-mono text-lg font-bold text-[#22223B]">
                  {formatBRL(product.price)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#9e6a18]/10 px-2 py-1 text-[11px] font-bold text-[#9e6a18]">
                  <TrendingUp className="h-3.5 w-3.5" />
                  {product.sold_quantity ?? 0}
                </span>
              </div>

              <a
                href={product.link || product.permalink}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#22223B] px-3 py-2 text-sm font-semibold text-white transition group-hover:bg-[#9e6a18]"
              >
                Ver oferta <ArrowUpRight className="h-4 w-4" />
              </a>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
