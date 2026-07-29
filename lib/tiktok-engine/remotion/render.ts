import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { ScriptPayload, TikTokGenerateRequest } from "../types";
import type { RemotionTemplate, TikTokRemotionInput } from "./types";

let bundlePromise: Promise<string> | null = null;

function runtimeRequire<T = unknown>(moduleName: string): T {
  const req = eval("require") as NodeRequire;
  return req(moduleName) as T;
}

/**
 * Mapeia o model_id para a composição Remotion correta.
 *
 * Modelos 1, 7, 9  → TikTokHookChoque   (hook choque + bomba de preço)
 * Modelos 5, 10    → TikTokComparacaoPreco (split preço vs concorrente)
 * Demais           → TikTokStorytellingBeneficio (narrativa + benefícios)
 */
export function getCompositionIdByModelId(modelId: number): {
  compositionId: string;
  template: RemotionTemplate;
} {
  switch (modelId) {
    case 1:
    case 7:
    case 9:
      return { compositionId: "TikTokHookChoque", template: "hook_choque" };
    case 5:
    case 10:
      return { compositionId: "TikTokComparacaoPreco", template: "comparacao_preco" };
    default:
      return { compositionId: "TikTokStorytellingBeneficio", template: "storytelling_beneficio" };
  }
}

async function getServeUrl() {
  const { bundle } = runtimeRequire<typeof import("@remotion/bundler")>("@remotion/bundler");

  if (!bundlePromise) {
    const projectRoot = process.cwd();
    bundlePromise = bundle({
      entryPoint: path.join(projectRoot, "lib", "tiktok-engine", "remotion", "Root.tsx"),
      webpackOverride: (config) => {
        // Resolve o alias @/ do tsconfig para o Webpack do Remotion
        config.resolve = config.resolve ?? {};
        config.resolve.alias = {
          ...(config.resolve.alias as Record<string, string> | undefined),
          "@": projectRoot,
        };
        return config;
      },
    });
  }

  return bundlePromise;
}

function buildBenefits(text: string) {
  return text
    .split(/\n|\d+\./)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

export async function renderTikTokVideoWithRemotion(options: {
  briefingId: string;
  jobId: string;
  modelId: number;
  audioUrl: string;
  script: ScriptPayload;
  input: TikTokGenerateRequest;
  hookVariationIndex?: number;
}) {
  const { getAudioDurationInSeconds } =
    runtimeRequire<typeof import("@remotion/media-utils")>("@remotion/media-utils");
  const { renderMedia, selectComposition } =
    runtimeRequire<typeof import("@remotion/renderer")>("@remotion/renderer");

  const serveUrl = await getServeUrl();
  const fps = 30;
  const audioDurationSeconds = await getAudioDurationInSeconds(options.audioUrl);
  const durationInFrames = Math.max(Math.ceil(audioDurationSeconds * fps) + fps * 1.2, 180);

  const { compositionId, template } = getCompositionIdByModelId(options.modelId);

  const inputProps: TikTokRemotionInput = {
    template,
    durationInFrames,
    fps,
    modelId: options.modelId,
    productName: options.input.product_name,
    productPrice: options.input.product_price,
    productDiscount: options.input.product_discount,
    productCategory: options.input.product_category,
    competitorName: options.input.competitor_name,
    competitorPrice: options.input.competitor_price,
    benefits: buildBenefits(options.input.product_benefits),
    onScreenText: options.script.on_screen_text,
    hook: options.script.hook,
    body: options.script.body,
    cta: options.script.cta || "Entra no Radar Smart pelo link na bio!",
    caption: options.script.caption,
    imageUrls: options.input.product_image_urls ?? [],
    audioUrl: options.audioUrl,
    shopUrl: options.input.shop_url,
    hookVariationIndex: options.hookVariationIndex,
  };

  const composition = await selectComposition({
    serveUrl,
    id: compositionId,
    inputProps,
  });

  const outputLocation = path.join(
    os.tmpdir(),
    `radarsmart-tiktok-${options.briefingId}-${options.jobId}-${randomUUID()}.mp4`,
  );

  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation,
    inputProps,
    chromiumOptions: {
      gl: "swiftshader",
    },
  });

  const buffer = await fs.readFile(outputLocation);
  await fs.unlink(outputLocation).catch(() => undefined);

  return {
    buffer,
    durationInFrames,
    fps,
    provider: "remotion" as const,
    compositionId,
    template,
  };
}
