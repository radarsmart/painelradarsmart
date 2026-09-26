// Radar Creative AI - CREATIVE V2 HOOK FIDELITY CANARY (CANARY B) - EXECUCAO REAL
//
// AUTORIZADO explicitamente pelo usuario: 1 POST real a freepik-kling-i2v
// (Kling v2.5 Pro image-to-video), maxCredits=325, 0 retry, 0 fallback,
// scene-1 (HOOK) da campanha Kokeshi, capability PRODUCT_VIDEO (corrigida
// pelo Subject-Aware Capability Routing V1).
//
// Reusa integralmente a infraestrutura JA VALIDADA por 3 CANARYs reais
// anteriores (Creatina scene-3, Invictus #3/#4): video-canary-guardrails.ts
// (validateVideoCanaryRequest) + video-canary-executor.ts (executeVideoCanary)
// + adapters/freepik-kling-image-to-video.ts (executeFreepikKlingImageToVideo).
// NENHUM codigo novo de chamada a provider e escrito aqui - so orquestracao
// e verificacao.
//
// NAO altera Creative Director V2 (hookStrategyV2/camera/motion/environment/
// timing/subject semantics/product role/scale/CTA/scores/benchmark) - so
// LE o que ja foi decidido e persistido/computado deterministicamente.

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

// --- Guardrail de rede: BLOCKLIST (nao allowlist) -----------------------
// Bloqueia qualquer host de OUTRO provider pago. Permite: Supabase, o CDN
// real da imagem do produto (ja conhecido - ver check de referencia), e o
// endpoint autorizado do Kling (api.freepik.com/.../kling-v2-5-pro) - mas
// com um contador que trava apos exatamente 1 POST (submit).
const KLING_SUBMIT_ENDPOINT = "https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro";
const BLOCKED_OTHER_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com", // WAN
  "heygen",
  "elevenlabs",
  "api.openai.com",
  "klingai.com", // API antiga/direta da Kling, nunca usada por este projeto
  "runwayml",
  "replicate",
];

const realFetch = global.fetch;
let klingSubmitCount = 0;
let otherProviderBlockedAttempts = 0;

global.fetch = async (url, options) => {
  const urlString = String(url);
  const method = (options && options.method) || "GET";

  if (BLOCKED_OTHER_PROVIDER_HOST_SUBSTRINGS.some((host) => urlString.includes(host))) {
    otherProviderBlockedAttempts += 1;
    throw new Error(`BLOQUEADO (guardrail de rede): tentativa de chamar host de OUTRO provider pago "${urlString}".`);
  }

  if (urlString === KLING_SUBMIT_ENDPOINT && method === "POST") {
    klingSubmitCount += 1;
    if (klingSubmitCount > 1) {
      throw new Error(`BLOQUEADO: tentativa de um SEGUNDO POST ao Kling (submit #${klingSubmitCount}) - autorizacao permite exatamente 1.`);
    }
    console.log(`\n>>> PONTO DE NAO RETORNO: enviando POST real #${klingSubmitCount} a ${urlString} <<<\n`);
  }

  return realFetch(url, options);
};

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { buildCommercialDirection } = require("../lib/commercial-director/director.ts");
const { buildCreativeDirectionV2DecisionEngine } = require("../lib/creative-director-v2/decision-engine/decision-engine.ts");
const { buildCampaignPromptPlan } = require("../lib/prompt-builder/prompt-builder.ts");
const { resolveCampaignSceneReferences } = require("../lib/generation-orchestrator/reference-resolver.ts");
const { buildCampaignExecutionPlan } = require("../lib/generation-orchestrator/orchestrator.ts");
const { getProviderProfile, isProviderProductionEligible } = require("../lib/generation-orchestrator/provider-capabilities.ts");
const { executeVideoCanary } = require("../lib/generation-orchestrator/video-canary-executor.ts");
const { findDryRunCampaign, buildInputForCampaign } = require("./lib/creative-director-v2-fixture.js");

const CAMPAIGN_ID = "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const SCENE_ID = "scene-1";
const EXPECTED_PROVIDER = "freepik-kling-i2v";
const EXPECTED_CAPABILITY = "PRODUCT_VIDEO";
const EXPECTED_CREDITS = 325;
const MAX_CREDITS = 325;
const KLING_BILLABLE_DURATION = "5";
const KLING_CFG_SCALE = 0.5;

// Registrado no CANARY A real (WAN, 2026-08-10) - usado aqui so para PROVAR
// que o storyboard/direcao criativa nao mudou entre os dois canaries.
const CANARY_A_REFERENCE = {
  hookStrategyV2: "TRANSFORMATION",
  cameraIntent: "close-to-wide reveal do produto em HERO, centralizado no quadro",
  motionIntent: "reveal rapido com push-in no produto",
  environmentIntent: "ambiente ativo consistente, variando o nivel de acao de fundo; palco de destaque, luz dinamica, sombras marcadas",
  productRole: "HERO",
  subjectPriority: "PRODUCT",
  taskId: "094127bb-1e3d-42cc-a3c2-a8cd57a8a636",
};

function resolvePlatform(value) {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("reels") || normalized.includes("instagram")) return "INSTAGRAM_REELS";
  if (normalized.includes("meta") || normalized.includes("ads")) return "META_ADS";
  return "TIKTOK";
}

function abort(reason) {
  console.error(`\nABORTADO ANTES DO POST: ${reason}\n`);
  process.exitCode = 1;
  throw new Error(reason);
}

function run(cmd, args) {
  return execFileSync(cmd, args, { encoding: "utf8" });
}

async function main() {
  const campaignRow = await findDryRunCampaign(supabaseAdmin, CAMPAIGN_ID);
  const { input, offerTitle } = await buildInputForCampaign(supabaseAdmin, campaignRow);

  const { data: fullCampaign, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,aspect_ratio,platform,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  const { data: offerRow } = await supabaseAdmin.from("offers").select("title,price,original_price,discount_pct").eq("id", fullCampaign.offer_id).maybeSingle();

  const existingBrief = fullCampaign.creative_brief || {};
  const v1 = existingBrief.commercialDirection || (await buildCommercialDirection(input));
  const v2 = existingBrief.commercialDirectionV2 || (await buildCreativeDirectionV2DecisionEngine(input, v1)).result;

  const aspectRatio = fullCampaign.aspect_ratio || "9:16";
  const platform = resolvePlatform(fullCampaign.platform);
  const ctx = { productTitle: offerTitle, category: input.category, platform, aspectRatio, defaultLogoAssetId: null };

  const promptPlan = buildCampaignPromptPlan(CAMPAIGN_ID, v2.underlyingDirection, ctx, {
    sceneBlueprints: v2.sceneBlueprints,
    ctaDirection: v2.ctaDirection,
  });

  const resolvedRefs = await resolveCampaignSceneReferences(promptPlan, fullCampaign.offer_id, input.category);
  const executionPlan = buildCampaignExecutionPlan(CAMPAIGN_ID, "MOCK", promptPlan, resolvedRefs);

  const promptScene = promptPlan.scenes.find((s) => s.sceneId === SCENE_ID);
  const executionScene = executionPlan.scenes.find((s) => s.sceneId === SCENE_ID);
  const blueprint = v2.sceneBlueprints.find((b) => b.sceneId === SCENE_ID);
  const directionScene = v2.underlyingDirection.scenes.find((s) => s.id === SCENE_ID);
  const providerProfile = getProviderProfile(EXPECTED_PROVIDER);

  // ======================================================================
  // PRE-FLIGHT CHECKLIST - qualquer divergencia ABORTA antes do POST.
  // ======================================================================
  const checklist = [];
  function check(label, ok, detail) {
    checklist.push({ label, ok, detail });
    if (!ok) abort(`${label} -> ${detail}`);
  }

  check("campaignId correto", fullCampaign.id === CAMPAIGN_ID, `esperado ${CAMPAIGN_ID}, obtido ${fullCampaign.id}`);
  check("sceneId = scene-1", Boolean(executionScene) && executionScene.sceneId === SCENE_ID, "scene-1 nao encontrada no execution plan");
  check("creativeDirectorVersion = V2", Boolean(v2), "commercialDirectionV2 ausente");
  check("hookStrategyV2 = exatamente a ja validada (CANARY A)", v2.hookStrategy === CANARY_A_REFERENCE.hookStrategyV2, `esperado ${CANARY_A_REFERENCE.hookStrategyV2}, obtido ${v2.hookStrategy}`);
  check("camera intent inalterado desde CANARY A", directionScene.camera === CANARY_A_REFERENCE.cameraIntent, `esperado "${CANARY_A_REFERENCE.cameraIntent}", obtido "${directionScene.camera}"`);
  check("motion intent inalterado desde CANARY A", directionScene.motion === CANARY_A_REFERENCE.motionIntent, `esperado "${CANARY_A_REFERENCE.motionIntent}", obtido "${directionScene.motion}"`);
  check("environment intent inalterado desde CANARY A", blueprint.environmentDirection === CANARY_A_REFERENCE.environmentIntent, `esperado "${CANARY_A_REFERENCE.environmentIntent}", obtido "${blueprint.environmentDirection}"`);
  check("productPresence = HERO", blueprint.productRole === "HERO", `obtido ${blueprint.productRole}`);
  check("subjectPriority = PRODUCT (inalterado desde CANARY A)", blueprint.subjectPriority === CANARY_A_REFERENCE.subjectPriority, `obtido ${blueprint.subjectPriority}`);
  check("ProductFidelityRequirement = REQUIRED", promptScene.productFidelityRequirement === "REQUIRED", `obtido ${promptScene.productFidelityRequirement}`);
  check("capability = PRODUCT_VIDEO", executionScene.providerCapability === EXPECTED_CAPABILITY, `obtido ${executionScene.providerCapability}`);
  check("provider = freepik-kling-i2v", executionScene.selectedProvider === EXPECTED_PROVIDER, `obtido ${executionScene.selectedProvider}`);
  check("provider status = ACTIVE", providerProfile?.status === "ACTIVE", `obtido ${providerProfile?.status}`);
  check("productionEligible = true", providerProfile?.productionEligible === true, `obtido ${providerProfile?.productionEligible}`);
  check("product reference = RESOLVED", Boolean(executionScene.productReferenceUrl), "productReferenceUrl ausente");
  check("timeline duration = 2s", promptScene.durationSeconds === 2, `obtido ${promptScene.durationSeconds}s`);
  check("billable duration = 5s (325 = 5 x 65 creditos/s)", executionScene.estimatedCost.estimatedCredits === EXPECTED_CREDITS, `obtido ${executionScene.estimatedCost.estimatedCredits}`);
  check("estimatedCredits <= 325", (executionScene.estimatedCost.estimatedCredits ?? Infinity) <= MAX_CREDITS, `obtido ${executionScene.estimatedCost.estimatedCredits}`);
  check("blockingReasons = nenhum (status READY, nao bloqueado pelo Fidelity Gate)", executionScene.status === "READY" && !executionScene.capabilityFidelityBlocked, `status=${executionScene.status} reason=${executionScene.statusReason}`);
  check("price persistido = R$ 13,16", offerRow.price === 13.16, `obtido ${offerRow.price}`);
  check("discount_pct = 0", offerRow.discount_pct === 0, `obtido ${offerRow.discount_pct}`);
  check("discountText = null (nunca '0% OFF')", promptScene.overlayInstructions.discountText === null, `obtido ${promptScene.overlayInstructions.discountText}`);
  check(
    "product reference sera de fato enviada ao Kling (positivePrompt afirma 'shown exactly as provided' apenas porque a capability aceita referencia)",
    promptScene.positivePrompt.includes("shown exactly as provided"),
    "positivePrompt nao afirma preservacao de referencia real",
  );

  console.log(`\nPRE-FLIGHT: ${checklist.length}/${checklist.length} checagens OK. Prosseguindo para a chamada real.\n`);
  console.log("positivePrompt registrado:", promptScene.positivePrompt);
  console.log("negativePrompt registrado:", promptScene.negativePrompt);
  console.log("productReferenceUrl:", executionScene.productReferenceUrl);

  // ======================================================================
  // EXECUCAO REAL - reusa executeVideoCanary (JA VALIDADO em 3 CANARYs
  // reais anteriores) - nao escreve nenhuma chamada de rede nova aqui.
  // ======================================================================
  const maxCostBRL = executionScene.estimatedCost.estimatedCurrencyCostCents !== null
    ? executionScene.estimatedCost.estimatedCurrencyCostCents / 100
    : 5; // fallback conservador (nunca usado - kling tem centavosPerCredit confirmado)

  const canaryResult = await executeVideoCanary({
    provider: EXPECTED_PROVIDER,
    inputImageUrl: executionScene.productReferenceUrl,
    prompt: executionScene.positivePrompt,
    negativePrompt: executionScene.negativePrompt,
    duration: KLING_BILLABLE_DURATION,
    cfgScale: KLING_CFG_SCALE,
    confirmed: true,
    maxCostBRL,
    dryRun: false,
    category: input.category,
  });

  console.log("\nResultado da execucao real:", JSON.stringify(canaryResult, null, 2));

  const outDir = path.join(root, "temp", "creative-v2-hook-fidelity-canary");
  const framesDir = path.join(outDir, "frames");
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  const baseReport = {
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    sceneId: SCENE_ID,
    preflightChecklist: checklist,
    promptRegistered: {
      positivePrompt: promptScene.positivePrompt,
      negativePrompt: promptScene.negativePrompt,
      hookStrategyV2: v2.hookStrategy,
      cameraIntent: directionScene.camera,
      motionIntent: directionScene.motion,
      environmentIntent: blueprint.environmentDirection,
      productRole: blueprint.productRole,
      subjectPriority: blueprint.subjectPriority,
      productFidelityRequirement: promptScene.productFidelityRequirement,
    },
    capability: executionScene.providerCapability,
    productGenerationStrategy: executionScene.productGenerationStrategy,
    productReferenceUrlUsed: executionScene.productReferenceUrl,
    offerPricing: { title: offerRow.title, price: offerRow.price, originalPrice: offerRow.original_price, discountPct: offerRow.discount_pct },
    timelineDurationSeconds: promptScene.durationSeconds,
    billableDuration: KLING_BILLABLE_DURATION,
    cfgScale: KLING_CFG_SCALE,
    estimatedCost: executionScene.estimatedCost,
    canaryResult,
    submits: klingSubmitCount,
    retries: 0,
    otherProviderBlockedAttempts,
    canaryAComparison: CANARY_A_REFERENCE,
  };

  if (canaryResult.status !== "COMPLETED" || !canaryResult.outputUrl) {
    console.error("\nCANARY FAILED - PARANDO. Nenhum artefato para baixar/processar.");
    fs.writeFileSync(path.join(outDir, "hook-fidelity-canary-report.json"), JSON.stringify({ ...baseReport, aborted: false, technicalStatus: "FAILED" }, null, 2), "utf8");
    console.log(`Relatorio salvo: ${path.relative(root, path.join(outDir, "hook-fidelity-canary-report.json"))}`);
    console.log(`submits=${klingSubmitCount} otherProviderBlockedAttempts=${otherProviderBlockedAttempts}`);
    console.log("Banco alterado: NAO. Storage (Supabase) alterado: NAO.");
    return;
  }

  console.log(`\nBaixando output real (taskId=${canaryResult.taskId})...`);
  const originalPath = path.join(outDir, "kling-original-5s.mp4");
  const videoResponse = await fetch(canaryResult.outputUrl);
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

  const finalReport = {
    ...baseReport,
    aborted: false,
    technicalStatus: "COMPLETED",
    artifacts: {
      original5s: path.relative(root, originalPath),
      preview2s: path.relative(root, previewPath),
      contactSheet: path.relative(root, contactSheetPath),
      frames: framePaths.map((p) => path.relative(root, p)),
    },
    technicalMetadata,
    qaVisual: "PENDING_MANUAL_VISUAL_REVIEW - ver contact-sheet.png e frames/ individuais.",
  };

  fs.writeFileSync(path.join(outDir, "hook-fidelity-canary-report.json"), JSON.stringify(finalReport, null, 2), "utf8");
  console.log(`\nRelatorio salvo: ${path.relative(root, path.join(outDir, "hook-fidelity-canary-report.json"))}`);
  console.log(`submits=${klingSubmitCount} (esperado 1) otherProviderBlockedAttempts=${otherProviderBlockedAttempts} (esperado 0)`);
  console.log("Banco alterado: NAO. Storage (Supabase) alterado: NAO (tudo local em temp/).");
}

main().catch((err) => {
  console.error("\nExecucao falhou/abortada:", err.message);
  process.exitCode = 1;
});
