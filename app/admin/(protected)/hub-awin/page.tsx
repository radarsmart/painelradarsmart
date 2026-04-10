"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, RefreshCw, Store } from "lucide-react";

import { supabase } from "@/lib/supabase";

type AwinAdvertiser = {
  id: string;
  name: string;
  logoUrl: string;
};

export default function HubAwinPage() {
  const [advertisers, setAdvertisers] = useState<AwinAdvertiser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessao expirada. Faca login novamente.");
    }
    return token;
  }

  async function loadAdvertisers() {
    setLoading(true);
    setError("");

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/awin/advertisers", {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const payload = (await response.json()) as AwinAdvertiser[] | { error?: string };

      if (!response.ok || !Array.isArray(payload)) {
        throw new Error(
          Array.isArray(payload)
            ? "Falha ao carregar anunciantes AWIN."
            : payload.error || "Falha ao carregar anunciantes AWIN.",
        );
      }

      setAdvertisers(payload);
    } catch (err) {
      setAdvertisers([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar anunciantes AWIN.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdvertisers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Store className="text-orange" />
            Hub AWIN
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Anunciantes aprovados para o publisher 2843910.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAdvertisers()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar anunciantes
        </button>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Publisher ID
          </p>
          <p className="mt-2 text-2xl font-black text-navy">2843910</p>
        </div>
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Programas aprovados
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-600">
            {loading ? "-" : advertisers.length}
          </p>
        </div>
        <div className="rounded-2xl border border-rs-border bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Etapa atual
          </p>
          <p className="mt-2 font-bold text-slate-700">Anunciantes</p>
        </div>
      </section>

      {error ? (
        <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`awin-advertiser-skeleton-${index}`}
              className="rounded-3xl bg-white p-5 shadow-sm"
            >
              <div className="h-16 w-16 animate-pulse rounded-2xl bg-slate-100" />
              <div className="mt-5 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
              <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="mt-5 h-11 animate-pulse rounded-xl bg-slate-100" />
            </div>
          ))}
        </div>
      ) : advertisers.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {advertisers.map((advertiser) => (
            <article
              key={advertiser.id}
              className="rounded-3xl border border-rs-border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex gap-4">
                {advertiser.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={advertiser.logoUrl}
                    alt={advertiser.name}
                    className="h-16 w-16 rounded-2xl border border-slate-100 object-contain p-2"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange/10 text-xs font-black text-orange">
                    AWIN
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h2 className="line-clamp-2 font-bold text-navy">{advertiser.name}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    ID {advertiser.id}
                  </p>
                </div>
              </div>

              <Link
                href={`/admin/hub-awin/${advertiser.id}`}
                className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-4 text-sm font-semibold text-white transition hover:bg-black"
              >
                Ver Produtos
                <ExternalLink className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 rounded-full bg-orange/10 p-5">
            <Store className="h-8 w-8 text-orange" />
          </div>
          <h2 className="text-xl font-bold text-[#1A1A1A]">
            Nenhum anunciante aprovado encontrado
          </h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            Quando novos programas forem aprovados na AWIN, eles aparecerao aqui.
          </p>
        </div>
      )}
    </div>
  );
}
