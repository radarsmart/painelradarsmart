"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ImageDown, Sparkles, X } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { supabase } from "@/lib/supabase";

type StoryGeneratorButtonProps = {
  title: string;
  imageUrl: string | null;
  price: number;
  oldPrice: number | null;
};

const CANVAS_WIDTH = 1080;
const CANVAS_HEIGHT = 1920;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    image.src = src;
  });
}

async function loadAuthenticatedApiImage(path: string): Promise<HTMLImageElement> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (sessionError || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }

  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}) as { error?: string });
    throw new Error(payload.error || `Falha ao carregar imagem (${response.status}).`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await loadImage(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
}

function fitContain(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return { width: width * scale, height: height * scale };
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      return;
    }

    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word);
    }
  });

  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const truncated = lines.slice(0, maxLines);
  truncated[maxLines - 1] = `${truncated[maxLines - 1].replace(/[. ]+$/g, "")}...`;
  return truncated;
}

export default function StoryGeneratorButton({
  title,
  imageUrl,
  price,
  oldPrice,
}: StoryGeneratorButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const discountPct = useMemo(() => {
    if (!oldPrice || oldPrice <= price) return 0;
    return Math.round(((oldPrice - price) / oldPrice) * 100);
  }, [oldPrice, price]);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function renderStory() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      setIsRendering(true);
      setErrorMessage(null);

      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setIsRendering(false);
        setErrorMessage("Nao foi possivel montar o canvas do story.");
        return;
      }

      try {
        const productImage = imageUrl
          ? await loadAuthenticatedApiImage(
              `/api/admin/story/image?src=${encodeURIComponent(imageUrl)}`,
            )
          : await loadImage("/logo.png");

        if (cancelled) return;

        const background = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        background.addColorStop(0, "#2563eb");
        background.addColorStop(1, "#312e81");
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = "rgba(255,255,255,0.09)";
        ctx.beginPath();
        ctx.arc(CANVAS_WIDTH - 80, 180, 240, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(120, CANVAS_HEIGHT - 140, 220, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.06)";
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.font = "900 58px Arial";
        ctx.fillText("RADAR SMART", CANVAS_WIDTH / 2, 140);
        ctx.font = "700 30px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fillText("Oferta pronta para Stories", CANVAS_WIDTH / 2, 188);

        const cardX = 70;
        const cardY = 260;
        const cardWidth = CANVAS_WIDTH - 140;
        const cardHeight = 1250;

        drawRoundedRect(ctx, cardX, cardY, cardWidth, cardHeight, 60);
        ctx.fillStyle = "#ffffff";
        ctx.fill();

        ctx.shadowColor = "rgba(15,23,42,0.12)";
        ctx.shadowBlur = 40;
        ctx.shadowOffsetY = 18;
        drawRoundedRect(ctx, 128, 344, CANVAS_WIDTH - 256, 660, 48);
        ctx.fillStyle = "#f8fafc";
        ctx.fill();
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        const fitted = fitContain(
          productImage.width || 800,
          productImage.height || 800,
          CANVAS_WIDTH - 360,
          540,
        );
        const productX = (CANVAS_WIDTH - fitted.width) / 2;
        const productY = 404 + (540 - fitted.height) / 2;
        ctx.drawImage(productImage, productX, productY, fitted.width, fitted.height);

        if (discountPct > 0) {
          drawRoundedRect(ctx, CANVAS_WIDTH - 320, 310, 190, 88, 28);
          ctx.fillStyle = "#dc2626";
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "900 48px Arial";
          ctx.fillText(`-${discountPct}%`, CANVAS_WIDTH - 225, 368);
        }

        ctx.fillStyle = "#0f172a";
        ctx.font = "900 64px Arial";
        const titleLines = wrapLines(ctx, title, cardWidth - 180, 3);
        titleLines.forEach((line, index) => {
          ctx.fillText(line, CANVAS_WIDTH / 2, 1110 + index * 74);
        });

        const titleBottom = 1110 + (titleLines.length - 1) * 74;
        const oldPriceY = titleBottom + 118;
        if (oldPrice && oldPrice > price) {
          ctx.fillStyle = "#94a3b8";
          ctx.font = "700 46px Arial";
          const formattedOldPrice = formatBRL(oldPrice);
          ctx.fillText(formattedOldPrice, CANVAS_WIDTH / 2, oldPriceY);
          const oldWidth = ctx.measureText(formattedOldPrice).width;
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(CANVAS_WIDTH / 2 - oldWidth / 2, oldPriceY - 15);
          ctx.lineTo(CANVAS_WIDTH / 2 + oldWidth / 2, oldPriceY - 15);
          ctx.stroke();
        }

        ctx.fillStyle = "#16a34a";
        ctx.font = "900 118px Arial";
        ctx.fillText(formatBRL(price), CANVAS_WIDTH / 2, oldPriceY + 130);

        drawRoundedRect(ctx, 150, 1640, CANVAS_WIDTH - 300, 148, 74);
        ctx.fillStyle = "#f97316";
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "900 56px Arial";
        ctx.fillText("LINK NA BIO / STORIES", CANVAS_WIDTH / 2, 1732);

        ctx.font = "700 24px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText("Criativo premium gerado pelo Radar Smart", CANVAS_WIDTH / 2, 1858);
        ctx.textAlign = "start";
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : "Falha ao gerar o story.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    }

    void renderStory();

    return () => {
      cancelled = true;
    };
  }, [discountPct, imageUrl, isOpen, oldPrice, price, title]);

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "radar-smart-story.png";
    link.click();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 py-3 text-xs font-black uppercase tracking-tight text-white shadow-sm transition-all hover:brightness-110"
      >
        <ImageDown className="h-4 w-4" />
        Gerar Story
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-5xl rounded-3xl bg-white p-5 shadow-2xl">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:text-slate-900"
              aria-label="Fechar gerador de story"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="mb-5 pr-12">
              <p className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700">
                <Sparkles className="h-4 w-4" />
                Criativo para Stories
              </p>
              <h3 className="mt-3 text-2xl font-black text-slate-900">
                Story vertical pronto para Instagram
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Layout premium com card branco, preco em destaque e CTA pronto para
                bio ou stories.
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
              <div className="rounded-3xl bg-slate-950 p-3">
                <canvas
                  ref={canvasRef}
                  className="aspect-[9/16] w-full rounded-[28px] bg-slate-900"
                />
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

                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                    O arquivo sai em PNG 1080x1920, pronto para publicar ou enviar ao time
                    de social.
                  </div>

                  {errorMessage ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-slate-400"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    onClick={handleDownload}
                    disabled={isRendering}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Download className="h-4 w-4" />
                    {isRendering ? "Gerando story..." : "Baixar Story"}
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
