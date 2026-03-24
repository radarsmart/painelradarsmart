"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";

export type ProdutoAmazon = {
  asin: string;
  title: string;
  price: number;
  original_price?: number;
  image_url?: string;
  rating?: number;
  reviews?: number;
  product_url: string;
  affiliate_url: string;
};

type BuscaAmazonProps = {
  onSelect: (item: ProdutoAmazon) => void;
};

export default function BuscaAmazon({ onSelect }: BuscaAmazonProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ProdutoAmazon[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getAuthHeaders = async (): Promise<HeadersInit> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers: HeadersInit = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const search = async () => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/amazon/search?q=${encodeURIComponent(q)}`, {
        method: "GET",
        headers,
        credentials: "include",
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? "Falha ao consultar Amazon");
      setResults(data.products ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-rs-border bg-white p-4">
      <p className="text-sm font-semibold text-navy">Buscar na Amazon</p>
      <div className="mt-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ex: fone bluetooth"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-orange"
        />
        <button
          type="button"
          onClick={search}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          <Search className="h-4 w-4" />
          Buscar
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rs-red">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {results.map((item) => (
          <div
            key={item.asin}
            className="flex items-center justify-between rounded-lg border border-slate-200 p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{item.title}</p>
              <p className="text-xs text-rs-muted">{formatBRL(item.price)}</p>
            </div>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white"
            >
              Selecionar
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
