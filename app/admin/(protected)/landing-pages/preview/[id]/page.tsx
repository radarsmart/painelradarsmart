"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

import LandingPageView from "@/components/landing/LandingPageView";
import { supabase } from "@/lib/supabase";
import type { LandingPageBundle } from "@/lib/landing-pages";

type PreviewResponse = {
  bundle?: LandingPageBundle;
  error?: string;
};

export default function AdminLandingPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const searchParams = useSearchParams();
  const [bundle, setBundle] = useState<LandingPageBundle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const viewport = searchParams.get("viewport") === "mobile" ? "mobile" : "desktop";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (sessionError || !accessToken) {
          throw new Error("Sessão expirada. Faça login novamente.");
        }

        const response = await fetch(`/api/admin/landing-pages/preview/${params.id}`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const payload = (await response.json()) as PreviewResponse;
        if (!response.ok || !payload.bundle) {
          throw new Error(payload.error || "Falha ao carregar o preview da landing page.");
        }

        if (!active) return;
        setBundle(payload.bundle);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error ? err.message : "Falha ao carregar o preview da landing page.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center rounded-3xl bg-white text-sm text-slate-500 shadow-sm">
        Carregando preview da landing...
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
        {error || "Falha ao carregar preview da landing."}
      </div>
    );
  }

  if (viewport === "mobile") {
    return (
      <div className="min-h-screen bg-slate-200 p-4 md:p-6">
        <div className="mx-auto mb-4 w-full max-w-[430px] rounded-2xl bg-slate-900 px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-white">
          Preview mobile
        </div>
        <div className="mx-auto w-full max-w-[430px] overflow-hidden rounded-[32px] border-8 border-slate-900 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
          <LandingPageView bundle={bundle} previewMode />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto mb-4 w-full max-w-6xl rounded-2xl bg-white px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-700 shadow-sm">
        Preview desktop
      </div>
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
        <LandingPageView bundle={bundle} previewMode />
      </div>
    </div>
  );
}
