// Radar Creative AI - Creative Director V2 / HOOK CANARY (Option A) - EXECUCAO REAL
//
// AUTORIZADO EXPLICITAMENTE pelo usuario: 1 POST real ao WAN 2.5 T2V
// (provider "wan-2-5-t2v"), so a scene-1 (HOOK) da campanha kokeshi, teto
// de 1500 creditos, 0 retry, 0 fallback. NAO gera as outras 4 cenas. NAO
// persiste nada no banco (so leitura ate a revalidacao; a UNICA escrita
// depois do POST e local, em disco, dentro de temp/).
//
// Reusa infraestrutura ja validada em sessoes anteriores:
// - lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts (adapter,
//   1 submit + poll, sem retry/fallback - NAO reescrito aqui)
// - lib/generation-orchestrator/wan-background-canary-guardrails.ts
//   (validateWanBackgroundCanaryRequest - reusada, nao duplicada)
//
// Uso: node scripts/run-creative-director-v2-hook-canary-execute.js
// (sem argumentos - campaignId/sceneId sao fixos e conferidos na
// revalidacao, exatamente como autorizado)

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

// --- Guardrail de rede: bloqueia QUALQUER outro provider, conta os POSTs
// reais ao endpoint de submit do WAN (nunca mais que 1), loga tudo pro
// relatorio. Diferente dos scripts anteriores desta sessao, este PRECISA
// deixar passar api.magnific.com (e a chamada autorizada) - mas nenhum
// outro host de provider.
const BLOCKED_OTHER_PROVIDER_HOST_SUBSTRINGS = ["heygen", "freepik.com", "elevenlabs", "openai", "klingai", "runwayml", "replicate"];
const WAN_SUBMIT_ENDPOINT = "https://api.magnific.com/v1/ai/text-to-video/wan-2-5-t2v-1080p";

const networkCalls = [];
let wanSubmitCount = 0;
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  const method = (init && init.method) || "GET";
  const lower = url.toLowerCase();

  const blockedMatch = BLOCKED_OTHER_PROVIDER_HOST_SUBSTRINGS.find((needle) => lower.includes(needle));
  if (blockedMatch) {
    throw new Error(`BLOQUEADO: tentativa de chamada a host de provider nao autorizado ("${blockedMatch}") - ${url}`);
  }

  if (url === WAN_SUBMIT_ENDPOINT && method === "POST") {
    wanSubmitCount += 1;
    if (wanSubmitCount > 1) {
      throw new Error(`BLOQUEADO: tentativa de 2o POST de submit ao WAN - limite e exatamente 1 (autorizado). Ja submetido: ${wanSubmitCount - 1}x.`);
    }
  }

  networkCalls.push({ url, method });
  return originalFetch(input, init);
};

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { getProviderProfile, isProviderProductionEligible } = require("../lib/generation-orchestrator/provider-capabilities.ts");
const { estimateSceneCost } = require("../lib/generation-orchestrator/cost-estimator.ts");
const { validateWanBackgroundCanaryRequest } = require("../lib/generation-orchestrator/wan-background-canary-guardrails.ts");
const { executeWanTextToVideo } = require("../lib/generation-orchestrator/adapters/wan-2-5-text-to-video.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

// --- Parametros AUTORIZADOS (fixos, nao vem de argv - exatamente o que foi aprovado) ---
const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const SCENE_ID = "scene-1";
const EXPECTED_PURPOSE = "HOOK";
const EXPECTED_PROVIDER = "wan-2-5-t2v";
const MAX_WAN_CREDITS = 1500;
const WAN_DURATION = "5"; // billable duration ja confirmada no pre-flight - unico enum valido pra 2s de timeline

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

async function main() {
  const outDir = path.join(root, "temp", "creative-v2-hook-canary");
  const framesDir = path.join(outDir, "frames");
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  // --- Fase 1: reconstruir o plano V2 (leitura, deterministico) ---------
  const campaignRow = await findDryRunCampaign(supabaseAdmin, CAMPAIGN_ID);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const { data: fullCampaign } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();

  const { data: offerRow } = await supabaseAdmin
    .from("offers")
    .select("title,price,original_price,discount_pct")
    .eq("id", fullCampaign.offer_id)
    .maybeSingle();

  const { data: piRow } = await supabaseAdmin
    .from("product_intelligence")
    .select("key_benefits")
    .eq("offer_id", fullCampaign.offer_id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const narrationProduct = piRow ? { keyBenefits: piRow.key_benefits || [] } : null;

  const existingBrief = fullCampaign.creative_brief || {};
  const persistedVersion = existingBrief.creativeDirectorVersion || "V1";
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));
  const v2 = existingBrief.commercialDirectionV2 || (await buildCreativeDirectionV2DecisionEngine(input, v1)).result;

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const ctx = { productTitle: offerTitle, category: input.category, platform, aspectRatio, defaultLogoAssetId: null };
  const promptPlanV2 = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, {
    sceneBlueprints: v2.sceneBlueprints,
    ctaDirection: v2.ctaDirection,
  });

  const resolvedRefsV2 = await resolveCampaignSceneReferences(promptPlanV2, fullCampaign.offer_id, input.category);
  const generationPlanV2 = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", promptPlanV2, resolvedRefsV2);

  const promptScene = promptPlanV2.scenes.find((s) => s.sceneId === SCENE_ID);
  const execScene = generationPlanV2.scenes.find((s) => s.sceneId === SCENE_ID);
  const directionScene = v2.underlyingDirection.scenes.find((s) => s.id === SCENE_ID);
  const blueprint = v2.sceneBlueprints.find((b) => b.sceneId === SCENE_ID);

  // --- Fase 2: REVALIDACAO (item 3) - qualquer divergencia = ABORTAR ----
  const checks = [];
  const check = (label, ok, detail) => checks.push({ label, ok, detail });

  check("campaignId correto", fullCampaign.id === CAMPAIGN_ID, fullCampaign.id);
  check("sceneId = scene-1", Boolean(promptScene) && promptScene.sceneId === SCENE_ID, promptScene?.sceneId ?? "AUSENTE");
  check("purpose = HOOK", promptScene?.purpose === EXPECTED_PURPOSE, promptScene?.purpose ?? "AUSENTE");
  check("creativeDirectorVersion = V2", persistedVersion === "V2", persistedVersion);
  check("Storyboard Quality Gate = PASS", v2.storyboardQualityGate.status === "PASS", v2.storyboardQualityGate.status);
  check("provider = wan-2-5-t2v", execScene?.selectedProvider === EXPECTED_PROVIDER, execScene?.selectedProvider ?? "AUSENTE");
  const providerProfile = getProviderProfile(EXPECTED_PROVIDER);
  check("provider status = ACTIVE", providerProfile?.status === "ACTIVE", providerProfile?.status ?? "AUSENTE");
  check("productionEligible = true", isProviderProductionEligible(EXPECTED_PROVIDER), String(isProviderProductionEligible(EXPECTED_PROVIDER)));
  const timelineDuration = directionScene ? directionScene.endSecond - directionScene.startSecond : null;
  check("duration timeline = 2s", timelineDuration === 2, String(timelineDuration));
  check("billable duration = 5s (WAN_DURATION)", WAN_DURATION === "5", WAN_DURATION);
  check("estimatedCredits = 1500", execScene?.estimatedCost.estimatedCredits === 1500, String(execScene?.estimatedCost.estimatedCredits));
  check("estimatedCredits <= teto (1500)", (execScene?.estimatedCost.estimatedCredits ?? Infinity) <= MAX_WAN_CREDITS, String(execScene?.estimatedCost.estimatedCredits));
  check("reference status READY (nao bloqueia scene-1)", execScene?.status !== "FAILED", execScene?.status ?? "AUSENTE");
  check("positivePrompt presente", Boolean(promptScene?.positivePrompt), promptScene?.positivePrompt ? `${promptScene.positivePrompt.length} chars` : "AUSENTE");

  const failedChecks = checks.filter((c) => !c.ok);

  const baseReport = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    sceneId: SCENE_ID,
    revalidation: checks,
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
      productionEligibleCapability: execScene?.providerCapability ?? null,
      productGenerationStrategy: execScene?.productGenerationStrategy ?? null,
    },
    offerPricing: { title: offerRow?.title, price: offerRow?.price, originalPrice: offerRow?.original_price, discountPct: offerRow?.discount_pct },
  };

  if (failedChecks.length > 0) {
    console.log("REVALIDACAO FALHOU - ABORTANDO. Nenhuma chamada paga foi feita.");
    for (const c of checks) console.log(`  ${c.ok ? "OK  " : "FAIL"} - ${c.label}: ${c.detail}`);
    const report = { ...baseReport, aborted: true, abortReason: "Revalidacao imediatamente antes do POST encontrou divergencia(s).", wanResult: null };
    fs.writeFileSync(path.join(outDir, "hook-canary-report.json"), JSON.stringify(report, null, 2), "utf8");
    process.exitCode = 1;
    return;
  }

  console.log("Revalidacao: TODOS os checks OK.");
  for (const c of checks) console.log(`  OK   - ${c.label}: ${c.detail}`);

  // --- Fase 3: guardrail formal (reusa wan-background-canary-guardrails.ts) ---
  const estimatedCost = estimateSceneCost(EXPECTED_PROVIDER, Number(WAN_DURATION));
  const wanRequest = { prompt: promptScene.positivePrompt, negativePrompt: promptScene.negativePrompt, duration: WAN_DURATION };
  const guardrailCheck = validateWanBackgroundCanaryRequest({ ...wanRequest, confirmed: true, maxCredits: MAX_WAN_CREDITS }, estimatedCost);

  if (!guardrailCheck.ok) {
    console.log(`GUARDRAIL FORMAL FALHOU - ABORTANDO: ${guardrailCheck.reason}`);
    const report = { ...baseReport, aborted: true, abortReason: guardrailCheck.reason, wanResult: null };
    fs.writeFileSync(path.join(outDir, "hook-canary-report.json"), JSON.stringify(report, null, 2), "utf8");
    process.exitCode = 1;
    return;
  }

  // --- Fase 4: EXECUCAO REAL (ponto de nao-retorno) ---------------------
  console.log("\n=== EXECUTANDO CHAMADA PAGA REAL AGORA ===");
  console.log(`provider=${EXPECTED_PROVIDER} duration=${WAN_DURATION}s maxCredits=${MAX_WAN_CREDITS} estimatedCredits=${estimatedCost.estimatedCredits}`);
  console.log(`positivePrompt (${wanRequest.prompt.length} chars): ${wanRequest.prompt}`);
  console.log(`negativePrompt (${wanRequest.negativePrompt.length} chars): ${wanRequest.negativePrompt}`);

  const wanResult = await executeWanTextToVideo(wanRequest);
  console.log(`\nResultado WAN: status=${wanResult.status} taskId=${wanResult.taskId} outputUrl=${wanResult.outputUrl ? "presente" : "null"} error=${wanResult.error ?? "nenhum"}`);

  const report = {
    ...baseReport,
    aborted: false,
    guardrailCheck,
    estimatedCost,
    submits: wanSubmitCount,
    retries: 0,
    wanResult,
  };

  if (wanResult.status !== "success" || !wanResult.outputUrl) {
    console.log("WAN nao completou com sucesso - sem artefato pra baixar.");
    fs.writeFileSync(path.join(outDir, "hook-canary-report.json"), JSON.stringify(report, null, 2), "utf8");
    return;
  }

  // --- Fase 5: baixar o video original (5s, tal como o WAN devolveu) ---
  const originalPath = path.join(outDir, "wan-original-5s.mp4");
  const videoResponse = await fetch(wanResult.outputUrl);
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  fs.writeFileSync(originalPath, videoBuffer);
  console.log(`Video original salvo: ${path.relative(root, originalPath)} (${videoBuffer.length} bytes)`);

  // --- Fase 6: metadados tecnicos via ffprobe ---------------------------
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

  // --- Fase 7: extrair frames (0/25/50/75/100%) + contact sheet ---------
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
  run("ffmpeg", [
    "-y",
    ...framePaths.flatMap((p) => ["-i", p]),
    "-filter_complex",
    `[0][1][2][3][4]hstack=inputs=5`,
    contactSheetPath,
  ]);
  console.log(`Contact sheet: ${path.relative(root, contactSheetPath)}`);

  // --- Fase 8: preview 2s (trim deterministico, sem regeneracao) --------
  const previewPath = path.join(outDir, "hook-timeline-preview-2s.mp4");
  run("ffmpeg", ["-y", "-i", originalPath, "-t", "2", "-c", "copy", previewPath]);
  console.log(`Preview 2s (trim, sem re-encode): ${path.relative(root, previewPath)}`);

  report.artifacts = {
    original5s: path.relative(root, originalPath),
    preview2s: path.relative(root, previewPath),
    contactSheet: path.relative(root, contactSheetPath),
    frames: framePaths.map((p) => path.relative(root, p)),
  };
  report.technicalMetadata = technicalMetadata;
  report.qaVisual = "PENDING_MANUAL_VISUAL_REVIEW - ver contact-sheet.png e frames/ individuais; preenchido no relatorio final pelo agente apos inspecao visual real (Read tool), nunca inferido sem ver a imagem.";

  fs.writeFileSync(path.join(outDir, "hook-canary-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`\nBanco alterado: NAO`);
  console.log(`Storage (Supabase) alterado: NAO (artefatos salvos localmente em ${path.relative(root, outDir)})`);
  console.log(`Chamadas de rede totais: ${networkCalls.length}, submits WAN: ${wanSubmitCount}`);
  console.log(`\nRelatorio salvo em: ${path.relative(root, path.join(outDir, "hook-canary-report.json"))}`);
  console.log("PRONTO PARA REVISAO VISUAL (contact sheet + frames).");
}

main().catch((err) => {
  console.error("Canary HOOK falhou:", err.message, err.stack);
  process.exitCode = 1;
});
