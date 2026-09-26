// Radar Creative AI - Creative Director V2 / HOOK CANARY - POS-PROCESSAMENTO
//
// A geracao real ja aconteceu (script anterior submeteu 1 POST ao WAN com
// sucesso - taskId/outputUrl abaixo sao os retornados de verdade). Este
// script NAO faz nenhuma nova chamada de geracao/submit - so baixa o
// resultado JA PAGO (o bug no script anterior foi o guardrail de rede
// bloquear por engano o CDN de DOWNLOAD "cdn-magnific.freepik.com",
// confundindo com o host da API "api.freepik.com" que de fato deveria ser
// bloqueado) e continua o pos-processamento (ffprobe, frames, contact
// sheet, preview 2s).

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { execFileSync } = require("node:child_process");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAlias(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(root, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

require.extensions[".ts"] = function loadTs(mod, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: filename,
  });
  mod._compile(output.outputText, filename);
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const SCENE_ID = "scene-1";

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

// Resultado JA REAL do submit anterior (nao re-submeter, nao re-pollar -
// so usar o outputUrl ja retornado com sucesso).
const WAN_RESULT = {
  status: "success",
  taskId: "094127bb-1e3d-42cc-a3c2-a8cd57a8a636",
  outputUrl:
    "https://cdn-magnific.freepik.com/videos/video_WAN_25_T2V_1080P_094127bb-1e3d-42cc-a3c2-a8cd57a8a636_0.mp4?token=exp=1786404565~hmac=2581a0e2f0d327aa122d357195aca11044141c53e9781f69b61e1bc7b355e53a",
  error: null,
};

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

async function main() {
  const outDir = path.join(root, "temp", "creative-v2-hook-canary");
  const framesDir = path.join(outDir, "frames");
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  const reportPath = path.join(outDir, "hook-canary-report.json");

  // Reconstroi o registro completo (item 5 do pedido) por leitura - mesmo
  // calculo deterministico do script anterior, sem tocar WAN de novo.
  const campaignRow = await findDryRunCampaign(supabaseAdmin, CAMPAIGN_ID);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);
  const { data: fullCampaign } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  const { data: offerRow } = await supabaseAdmin.from("offers").select("title,price,original_price,discount_pct").eq("id", fullCampaign.offer_id).maybeSingle();

  const existingBrief = fullCampaign.creative_brief || {};
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));
  const v2 = existingBrief.commercialDirectionV2 || (await buildCreativeDirectionV2DecisionEngine(input, v1)).result;

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const ctx = { productTitle: offerTitle, category: input.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlanV2 = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, { sceneBlueprints: v2.sceneBlueprints, ctaDirection: v2.ctaDirection });

  const promptScene = promptPlanV2.scenes.find((s) => s.sceneId === SCENE_ID);
  const directionScene = v2.underlyingDirection.scenes.find((s) => s.id === SCENE_ID);
  const blueprint = v2.sceneBlueprints.find((b) => b.sceneId === SCENE_ID);

  const existingReport = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    sceneId: SCENE_ID,
    promptRegistered: {
      positivePrompt: promptScene?.positivePrompt ?? null,
      negativePrompt: promptScene?.negativePrompt ?? null,
      hookStrategyV2: v2.hookStrategy,
      cameraIntent: directionScene?.camera ?? null,
      motionIntent: directionScene?.motion ?? null,
      environmentIntent: blueprint?.environmentDirection ?? null,
      visualEffects: blueprint?.effectDirection.effects ?? [],
      productRole: blueprint?.productRole ?? null,
      subjectPriority: blueprint?.subjectPriority ?? null,
    },
    offerPricing: { title: offerRow?.title, price: offerRow?.price, originalPrice: offerRow?.original_price, discountPct: offerRow?.discount_pct },
  };

  console.log(`Baixando resultado JA GERADO (taskId=${WAN_RESULT.taskId}) - nenhuma nova chamada de geracao.`);

  const originalPath = path.join(outDir, "wan-original-5s.mp4");
  const videoResponse = await fetch(WAN_RESULT.outputUrl);
  if (!videoResponse.ok) throw new Error(`Falha ao baixar video: HTTP ${videoResponse.status}`);
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  fs.writeFileSync(originalPath, videoBuffer);
  console.log(`Video original salvo: ${path.relative(root, originalPath)} (${videoBuffer.length} bytes)`);

  const ffprobeOut = run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", originalPath]);
  const probe = JSON.parse(ffprobeOut);
  const videoStream = probe.streams.find((s) => s.codec_type === "video");
  const technicalMetadata = {
    durationSeconds: Number(probe.format.duration),
    width: videoStream?.width ?? null,
    height: videoStream?.height ?? null,
    fps: videoStream ? eval(videoStream.r_frame_rate).toFixed(2) : null,
    videoCodec: videoStream?.codec_name ?? null,
    container: probe.format.format_name,
    sizeBytes: Number(probe.format.size),
  };
  console.log("Metadados tecnicos:", JSON.stringify(technicalMetadata));

  const duration = technicalMetadata.durationSeconds;
  const framePercents = [0, 0.25, 0.5, 0.75, 1];
  const framePaths = [];
  framePercents.forEach((pct, i) => {
    const t = Math.min(duration - 0.05, Math.max(0, duration * pct));
    const framePath = path.join(framesDir, `frame-${i}-${Math.round(pct * 100)}pct.png`);
    run("ffmpeg", ["-y", "-ss", String(t), "-i", originalPath, "-frames:v", "1", framePath]);
    framePaths.push(framePath);
  });

  const contactSheetPath = path.join(outDir, "contact-sheet.png");
  run("ffmpeg", ["-y", ...framePaths.flatMap((p) => ["-i", p]), "-filter_complex", `[0][1][2][3][4]hstack=inputs=5`, contactSheetPath]);
  console.log(`Contact sheet: ${path.relative(root, contactSheetPath)}`);

  const previewPath = path.join(outDir, "hook-timeline-preview-2s.mp4");
  run("ffmpeg", ["-y", "-i", originalPath, "-t", "2", "-c", "copy", previewPath]);
  console.log(`Preview 2s (trim, sem re-encode): ${path.relative(root, previewPath)}`);

  const report = {
    ...existingReport,
    aborted: false,
    wanResult: WAN_RESULT,
    submits: 1,
    retries: 0,
    artifacts: {
      original5s: path.relative(root, originalPath),
      preview2s: path.relative(root, previewPath),
      contactSheet: path.relative(root, contactSheetPath),
      frames: framePaths.map((p) => path.relative(root, p)),
    },
    technicalMetadata,
    qaVisual: "PENDING_MANUAL_VISUAL_REVIEW - ver contact-sheet.png e frames/ individuais.",
    postprocessNote: "Download re-tentado separadamente apos o script original bloquear por engano o CDN de download (cdn-magnific.freepik.com, confundido com host de API a bloquear). Nenhuma nova chamada de geracao foi feita - so leitura do resultado ja pago.",
  };

  fs.writeFileSync(path.join(outDir, "hook-canary-report.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(`\nRelatorio atualizado: ${path.relative(root, path.join(outDir, "hook-canary-report.json"))}`);
  console.log("Banco alterado: NAO. Storage (Supabase) alterado: NAO (tudo local).");
}

main().catch((err) => {
  console.error("Pos-processamento falhou:", err.message, err.stack);
  process.exitCode = 1;
});
