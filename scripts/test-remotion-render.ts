/**
 * test-remotion-render.ts
 *
 * Testa o render Remotion de forma isolada:
 * - Usa um áudio público de 5 segundos (sem ElevenLabs)
 * - Usa uma imagem pública do produto (sem scraping)
 * - Renderiza o template HookChoque (Modelo 1)
 * - Faz upload do MP4 gerado no Supabase Storage
 * - Imprime a URL pública do MP4
 *
 * Uso: npx tsx scripts/test-remotion-render.ts
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Config do teste ──────────────────────────────────────────────────────────
const TEST_AUDIO_URL = "https://www.w3schools.com/html/horse.mp3";
const TEST_IMAGE_URL = "https://images.unsplash.com/photo-1609081219090-a6d81d3085bf?w=1080";
const FPS = 30;
const DURATION_SECONDS = 10; // 10s = 300 frames — render rápido para teste
const DURATION_IN_FRAMES = DURATION_SECONDS * FPS;
const OUTPUT_PATH = path.join(os.tmpdir(), `radar-smart-test-${randomUUID()}.mp4`);

function log(msg: string, level: "ok" | "info" | "warn" | "error" = "info") {
  const icon = { ok: "✅", info: "ℹ️ ", warn: "⚠️ ", error: "❌" }[level];
  console.log(`${icon}  ${msg}`);
}

function section(title: string) {
  console.log(`\n${"─".repeat(56)}\n  ${title}\n${"─".repeat(56)}`);
}

function runtimeRequire<T = unknown>(mod: string): T {
  const req = eval("require") as NodeRequire;
  return req(mod) as T;
}

async function main() {
  console.log("\n🎬  Remotion Render — Teste Isolado (sem OpenAI/ElevenLabs)");
  console.log(`⏰   ${new Date().toLocaleString("pt-BR")}\n`);

  // ── Verificar deps
  section("Passo 1 — Verificar dependências Remotion");
  try {
    runtimeRequire("@remotion/bundler");
    runtimeRequire("@remotion/renderer");
    log("@remotion/bundler e @remotion/renderer instalados", "ok");
  } catch (e) {
    log(`Remotion não instalado: ${String(e)}`, "error");
    process.exit(1);
  }

  // ── Bundle
  section("Passo 2 — Bundling (primeira vez demora ~30s)");
  const { bundle } = runtimeRequire<typeof import("@remotion/bundler")>("@remotion/bundler");
  const { renderMedia, selectComposition } =
    runtimeRequire<typeof import("@remotion/renderer")>("@remotion/renderer");

  log("Iniciando bundle do Root.tsx...", "info");
  const bundleStart = Date.now();

  let serveUrl: string;
  try {
    serveUrl = await bundle({
      entryPoint: path.join(process.cwd(), "lib", "tiktok-engine", "remotion", "Root.tsx"),
      webpackOverride: (config) => config,
    });
    log(`Bundle concluído em ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`, "ok");
    log(`Serve URL: ${serveUrl.slice(0, 60)}...`, "info");
  } catch (e) {
    log(`Bundle falhou: ${String(e)}`, "error");
    console.error(e);
    process.exit(1);
  }

  // ── Selecionar composição
  section("Passo 3 — Selecionar composição TikTokHookChoque");

  const inputProps = {
    template: "hook_choque" as const,
    durationInFrames: DURATION_IN_FRAMES,
    fps: FPS,
    modelId: 1,
    productName: "Câmera de Ação 4K",
    productPrice: "149,90",
    productDiscount: "40% OFF",
    productCategory: "Eletrônicos",
    competitorName: "Concorrente",
    competitorPrice: "R$299,00",
    benefits: ["Qualidade 4K", "Bateria de 2 horas", "Resistente à água"],
    onScreenText: ["Qualidade 4K real", "Bateria 2h", "Resistente à água"],
    hook: "Não acredito no que acabei de ver...",
    body: [
      "Câmera 4K por R$ 149,90",
      "40% OFF — só hoje",
      "Entrega rápida e garantia incluída",
    ],
    cta: "Entra no Radar Smart pelo link na bio!",
    caption: "Câmera 4K por R$149,90 — link na bio 🔥",
    imageUrls: [TEST_IMAGE_URL],
    audioUrl: TEST_AUDIO_URL,
    shopUrl: "",
    hookVariationIndex: 0,
  };

  let composition;
  try {
    composition = await selectComposition({
      serveUrl,
      id: "TikTokHookChoque",
      inputProps,
    });
    log(`Composição: ${composition.id} — ${composition.width}x${composition.height} @${composition.fps}fps`, "ok");
    log(`Duração: ${composition.durationInFrames} frames (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`, "info");
  } catch (e) {
    log(`selectComposition falhou: ${String(e)}`, "error");
    console.error(e);
    process.exit(1);
  }

  // ── Render
  section(`Passo 4 — Renderizar ${DURATION_IN_FRAMES} frames → MP4`);
  log(`Output: ${OUTPUT_PATH}`, "info");

  const renderStart = Date.now();
  let lastProgress = 0;

  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: "h264",
      outputLocation: OUTPUT_PATH,
      inputProps,
      chromiumOptions: {
        gl: "swiftshader",
      },
      onProgress: ({ progress, renderedFrames, encodedFrames }) => {
        const pct = Math.round(progress * 100);
        if (pct >= lastProgress + 10) {
          lastProgress = pct;
          log(`Progresso: ${pct}% — rendered ${renderedFrames}f / encoded ${encodedFrames}f`, "info");
        }
      },
    });

    const elapsed = ((Date.now() - renderStart) / 1000).toFixed(1);
    const stats = await fs.stat(OUTPUT_PATH);
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    log(`Render concluído em ${elapsed}s — arquivo: ${sizeMb} MB`, "ok");
  } catch (e) {
    log(`Render falhou:`, "error");
    console.error(e);
    // Tentar limpar
    await fs.unlink(OUTPUT_PATH).catch(() => {});
    process.exit(1);
  }

  // ── Upload
  section("Passo 5 — Upload MP4 → Supabase Storage");
  const videoBuffer = await fs.readFile(OUTPUT_PATH);
  const storagePath = `e2e-test/remotion-test-${Date.now()}.mp4`;

  const { error: uploadError } = await supabase.storage
    .from("tiktok-engine-assets")
    .upload(storagePath, videoBuffer, { contentType: "video/mp4", upsert: true });

  await fs.unlink(OUTPUT_PATH).catch(() => {});

  if (uploadError) {
    log(`Upload falhou: ${uploadError.message}`, "error");
    process.exit(1);
  }

  const { data: publicData } = supabase.storage
    .from("tiktok-engine-assets")
    .getPublicUrl(storagePath);

  log(`MP4 enviado com sucesso!`, "ok");
  log(`URL pública: ${publicData.publicUrl}`, "ok");

  // ── Resultado
  section("✅  RESULTADO FINAL");
  console.log(`
  Render E2E do Remotion: PASSOU
  ─────────────────────────────────────────────
  Template  : TikTokHookChoque (Modelo 1)
  Composição: 1080x1920 @30fps
  Duração   : ${DURATION_SECONDS}s (${DURATION_IN_FRAMES} frames)
  Arquivo   : ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB
  Storage   : ${storagePath}
  URL MP4   : ${publicData.publicUrl}
  ─────────────────────────────────────────────

  Próximo passo:
  Atualize a OPENAI_API_KEY no .env.local com uma chave válida
  e execute: npx tsx scripts/validate-tiktok-e2e.ts

  O pipeline completo (script + áudio + render + upload) estará
  funcionando assim que a chave OpenAI for renovada.
  `);
}

main().catch((e: unknown) => {
  console.error("\n❌ Erro fatal:", e);
  process.exit(1);
});
