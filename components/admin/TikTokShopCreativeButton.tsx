"use client";

import { useState } from "react";
import { CheckCircle2, ImageDown, Sparkles, X } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";

type TikTokShopCreativeButtonProps = {
  title: string;
  imageUrl: string | null;
  price: number;
  oldPrice: number | null;
  onGenerated: (imageUrl: string) => void;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

export default function TikTokShopCreativeButton({
  title,
  imageUrl,
  price,
  oldPrice,
  onGenerated,
}: TikTokShopCreativeButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [creativeUrl, setCreativeUrl] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  const discountPct =
    oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;

  async function generateCreative() {
    if (!imageUrl) {
      setErrorMessage("Esta oferta nao tem imagem de produto para gerar o criativo.");
      return;
    }

    setIsRendering(true);
    setErrorMessage(null);
    setCreativeUrl(null);
    setApplied(false);

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/story/generate-ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title,
          price,
          old_price: oldPrice,
          discount_pct: discountPct || null,
          image_url: imageUrl,
          template_id: "tiktokshop",
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        image_url?: string;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.image_url) {
        throw new Error(payload.error || "Falha ao gerar o criativo com IA.");
      }

      setCreativeUrl(payload.image_url);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao gerar o criativo.");
    } finally {
      setIsRendering(false);
    }
  }

  function openModal() {
    setIsOpen(true);
    void generateCreative();
  }

  function handleUseImage() {
    if (!creativeUrl) return;
    onGenerated(creativeUrl);
    setApplied(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 py-3 text-xs font-black uppercase tracking-tight text-white shadow-sm transition-all hover:brightness-110"
      >
        <ImageDown className="h-4 w-4" />
        Gerar imagem TikTok Shop
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl rounded-3xl bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:text-slate-900"
              aria-label="Fechar gerador de criativo"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 pr-12">
              <p className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                <Sparkles className="h-4 w-4" />
                Criativo para grupos (TikTok Shop)
              </p>
              <h3 className="mt-3 text-2xl font-black text-slate-900">
                Imagem com preco e botao &quot;Assista e compre&quot;
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Como o link do TikTok Shop abre um video (nao uma pagina de compra direta), essa
                imagem substitui o preview do video no grupo: produto, preco e a chamada para
                assistir e comprar, tudo na mesma arte.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <div className="flex aspect-[2/3] w-full items-center justify-center overflow-hidden rounded-[28px] bg-slate-950 p-3">
                {isRendering ? (
                  <div className="flex flex-col items-center gap-3 text-white">
                    <Sparkles className="h-8 w-8 animate-pulse" />
                    <p className="text-center text-xs font-semibold">
                      Gerando com IA... isso leva de 15 a 30 segundos.
                    </p>
                  </div>
                ) : creativeUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={creativeUrl}
                    alt="Criativo TikTok Shop gerado por IA"
                    className="h-full w-full rounded-[20px] object-cover"
                  />
                ) : (
                  <p className="px-4 text-center text-xs font-semibold text-slate-400">
                    A imagem vai aparecer aqui.
                  </p>
                )}
              </div>

              <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="space-y-4">
                  <div className="rounded-2xl bg-white p-4 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Titulo
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-800">{title}</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        Preco atual
                      </p>
                      <p className="mt-2 text-2xl font-black text-emerald-600">
                        {formatBRL(price)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        Preco anterior
                      </p>
                      <p className="mt-2 text-2xl font-black text-slate-700">
                        {oldPrice && oldPrice > price ? formatBRL(oldPrice) : "-"}
                      </p>
                    </div>
                  </div>

                  {errorMessage ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  ) : null}

                  {applied ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      Imagem aplicada. Ela sera usada ao enviar para os grupos.
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void generateCreative()}
                    disabled={isRendering}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Sparkles className="h-4 w-4" />
                    Gerar novamente
                  </button>
                  <button
                    type="button"
                    onClick={handleUseImage}
                    disabled={isRendering || !creativeUrl}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Usar esta imagem no envio
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
