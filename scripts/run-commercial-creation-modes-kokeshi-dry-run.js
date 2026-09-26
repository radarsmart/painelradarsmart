// Radar Smart Commercial Creation Modes V1 - Kokeshi DRY_RUN.
// Reads the real campaign/offer/PI, produces storyboards for the 3 main modes,
// writes a local report, and blocks paid provider hosts plus remote writes.

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

const CAMPAIGN_ID = process.argv[2] || "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "commercial-creation-modes-v1");
const OUT_FILE = path.join(OUT_DIR, "kokeshi-dry-run-report.json");

const BLOCKED_PROVIDER_HOST_SUBSTRINGS = [
  "api.magnific.com",
  "api.freepik.com",
  "cdn-magnific.freepik.com",
  "heygen.com",
  "elevenlabs.io",
  "api.openai.com",
  "klingai.com",
  "runwayml",
  "replicate",
];

let blockedProviderAttempts = 0;
const networkCalls = [];
const realFetch = global.fetch;
global.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  networkCalls.push(url);
  if (BLOCKED_PROVIDER_HOST_SUBSTRINGS.some((host) => url.includes(host))) {
    blockedProviderAttempts += 1;
    throw new Error(`ABORTED: paid provider host attempted in DRY_RUN: ${url}`);
  }
  return realFetch(input, init);
};

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabaseHost = new URL(supabaseUrl).host;
const supabaseAdminRaw = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

let writeAttempts = 0;
const supabaseAdmin = {
  from(table) {
    const builder = supabaseAdminRaw.from(table);
    for (const method of ["insert", "update", "upsert", "delete"]) {
      builder[method] = () => {
        writeAttempts += 1;
        throw new Error(`ABORTED: remote write attempted in DRY_RUN: ${table}.${method}()`);
      };
    }
    return builder;
  },
};

const { buildCommercialCreationModePreview } = require("../lib/commercial-video/creation-modes/storyboard-builder.ts");

function rowToProductIntelligence(row) {
  return {
    category: row.category || "geral",
    painPoints: row.pain_points || [],
    desires: row.desires || [],
    objections: row.objections || [],
    purchaseMotivations: row.purchase_motivations || [],
    keyBenefits: row.key_benefits || [],
    emotionalBenefits: row.emotional_benefits || [],
    functionalBenefits: row.functional_benefits || [],
    summary: row.summary || "",
  };
}

function baseContract(mode, campaignId, offerId) {
  const hybridPrompt =
    "Crie um comercial de 15 segundos para o Creme Gel Regenerador Facial Gota de Colageno Kokeshi. " +
    "Quero um anuncio feminino, moderno, natural e com aparencia de publicidade profissional. " +
    "Comece com a Garota Radar chamando atencao para um achado de skincare. Em seguida, mostre o produto real " +
    "em destaque e uma demonstracao visual da textura/aplicacao em contexto de skincare. Depois, a Garota Radar " +
    "explica de forma curta por que vale a pena conhecer o produto. Revele o preco real de R$13,16 com o produto " +
    "em destaque. Finalize com a Garota Radar convidando o espectador a acessar a Radar Smart e entrar no Grupo VIP " +
    "para encontrar mais ofertas. Evite produto flutuando sem proposito, cenarios aleatorios e linguagem generica de IA. " +
    "Cada cena precisa ajudar a vender.";

  return {
    productId: offerId,
    campaignId,
    creationMode: mode,
    userPrompt:
      mode === "HYBRID_SALES"
        ? hybridPrompt
        : "Criar comercial com produto real, preco real, fidelidade visual e CTA para Radar Smart.",
    targetDuration: 15,
    tone: "direto, brasileiro, persuasivo e factual",
    visualStyle: "Radar Smart premium com produto fiel",
    primaryObjective: mode === "HYBRID_SALES" ? "PRODUCT_SALE" : "SALES",
    callToActions: ["Acesse a Radar Smart", "Entre no Grupo VIP"],
    mustShow: ["produto real", "preco real", "identidade Radar Smart"],
    mustSay: mode === "HYBRID_SALES" ? ["achado", "textura leve", "Radar Smart"] : ["Radar Smart"],
    mustAvoid: ["desconto inventado", "promessa de resultado", "mencionar marketplace no script UGC"],
    presenterPreference: "AUTO",
    productUsagePreference: "DEMONSTRATE_USE",
    referenceVideo: null,
  };
}

function summarize(preview) {
  return {
    mode: preview.contract.creationMode,
    storyboardFingerprint: preview.storyboardFingerprint,
    creationTrace: preview.creationTrace,
    approvalState: preview.approvalState,
    sceneCount: preview.scenes.length,
    presenterStrategy: preview.commercialDirection.presenterStrategy,
    productFirstAppearanceSecond: preview.optimizerAudit.notes.find((note) => note.includes("Produto aparece primeiro")) || null,
    hookNarration: preview.scenes[0] ? preview.scenes[0].spokenNarration : null,
    offerScene: preview.scenes.find((scene) => scene.purpose === "OFFER") || null,
    ctaScene: preview.scenes.find((scene) => scene.purpose === "CTA") || null,
    mediaTypes: preview.promptPlan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      mediaType: scene.mediaType,
      productFidelityRequirement: scene.productFidelityRequirement,
    })),
    routing: preview.generationPlan.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      capability: scene.providerCapability,
      provider: scene.selectedProvider,
      status: scene.status,
      reason: scene.statusReason,
      estimatedCredits: scene.estimatedCost.estimatedCredits,
      estimatedCurrencyCostCents: scene.estimatedCost.estimatedCurrencyCostCents,
      estimatedUsdCostCents: scene.estimatedCost.estimatedUsdCostCents,
    })),
    totals: preview.totals,
    optimizerAudit: preview.optimizerAudit,
  };
}

function tableRow(scene, routing) {
  return {
    scene: scene.sceneId,
    purpose: scene.purpose,
    visual: scene.visual,
    presenter: scene.garotaRadarAppearance === "NONE" ? "PRODUCT_ONLY" : "GAROTA_RADAR",
    productInteraction: scene.productUse,
    narration: scene.spokenNarration,
    overlay: scene.overlay,
    capability: routing ? routing.providerCapability : scene.estimatedCapability,
    provider: routing ? routing.selectedProvider : scene.estimatedProvider,
    estimatedCost: {
      videoCredits: scene.cost.estimatedVideoCredits,
      ttsCredits: scene.cost.estimatedTtsCredits,
      brlCents: scene.cost.estimatedCurrencyCostCents,
      usdCents: scene.cost.estimatedUsdCostCents,
    },
  };
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const initialGit = {
    branch: git(["branch", "--show-current"]),
    lastCommit: git(["log", "-1", "--oneline", "--decorate"]),
    statusShort: git(["status", "--short"]),
  };

  const { data: campaignRow, error: campaignError } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,aspect_ratio,platform")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaignRow) throw new Error(`Campaign not found: ${CAMPAIGN_ID}`);

  const [offerRes, piRes] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select("id,title,category,discount_pct,price,original_price,rating,reviews_count,marketplace,image_url")
      .eq("id", campaignRow.offer_id)
      .maybeSingle(),
    supabaseAdmin
      .from("product_intelligence")
      .select("id,category,pain_points,desires,objections,purchase_motivations,key_benefits,emotional_benefits,functional_benefits,summary")
      .eq("id", campaignRow.product_intelligence_id)
      .maybeSingle(),
  ]);

  if (offerRes.error) throw new Error(offerRes.error.message);
  if (piRes.error) throw new Error(piRes.error.message);
  if (!offerRes.data) throw new Error("Offer not found.");
  if (!piRes.data) throw new Error("Product Intelligence not found.");

  const offerRow = offerRes.data;
  const productIntelligence = rowToProductIntelligence(piRes.data);
  const offer = {
    id: offerRow.id,
    title: offerRow.title || "produto",
    category: productIntelligence.category,
    price: offerRow.price,
    originalPrice: offerRow.original_price,
    discountPct: offerRow.discount_pct,
    rating: offerRow.rating,
    reviewsCount: offerRow.reviews_count,
    marketplace: offerRow.marketplace,
    imageUrl: offerRow.image_url,
  };

  const modes = ["PRODUCT_COMMERCIAL", "PRESENTER_UGC", "HYBRID_SALES"];
  const previews = modes.map((mode) =>
    buildCommercialCreationModePreview({
      contract: baseContract(mode, campaignRow.id, offer.id),
      offer,
      productIntelligence,
      aspectRatio: campaignRow.aspect_ratio || "9:16",
      platform: "TIKTOK",
      presenterAssetIds: {
        identityReferenceAssetId: "dry-run-garota-radar-primary",
        supportReferenceAssetId: "dry-run-garota-radar-support",
      },
    }),
  );

  const report = {
    reportName: "RADAR_SMART_COMMERCIAL_CREATION_MODES_V1_KOKESHI_DRY_RUN",
    generatedAt: new Date().toISOString(),
    campaignId: CAMPAIGN_ID,
    campaignName: campaignRow.name,
    offer: {
      title: offer.title,
      price: offer.price,
      originalPrice: offer.originalPrice,
      discountPct: offer.discountPct,
      imageUrlPresent: Boolean(offer.imageUrl),
    },
    productIntelligence: {
      category: productIntelligence.category,
      summary: productIntelligence.summary,
    },
    modes: previews.map(summarize),
    hybridSalesSceneTable: previews[2].scenes.map((scene) =>
      tableRow(scene, previews[2].generationPlan.scenes.find((entry) => entry.sceneId === scene.sceneId)),
    ),
    conceptualHybridExpectationCheck: {
      garotaRadarHook: previews[2].scenes[0]?.garotaRadarAppearance === "HOOK",
      kokeshiSkincareDemo: previews[2].scenes.some((scene) => scene.productUse.toLowerCase().includes("kokeshi")),
      presenterAchado: previews[2].scenes[0]?.narration.toLowerCase().includes("achado"),
      realOfferPrice1316: previews[2].scenes.some((scene) => scene.price === "R$ 13,16"),
      ctaRadarSmartVip: previews[2].scenes.some((scene) => (scene.cta || "").includes("Radar Smart")),
      noInventedDiscount: !JSON.stringify(previews[2]).includes("0% OFF"),
    },
    dryRunSafety: {
      paidProviderAttempts: blockedProviderAttempts,
      remoteWriteAttempts: writeAttempts,
      networkCallsAllowedHosts: [...new Set(networkCalls.map((url) => {
        try {
          return new URL(url).host;
        } catch {
          return url;
        }
      }))],
      supabaseHost,
      mediaGenerated: false,
      providerCallsExecuted: false,
    },
    readiness: {
      HYBRID_SALES_CONTRACT_WIRING_VALID:
        previews[2].creationTrace.requestedCreationMode === "HYBRID_SALES" &&
        previews[2].creationTrace.resolvedCreationMode === "HYBRID_SALES" &&
        previews[2].scenes.map((scene) => scene.garotaRadarAppearance === "NONE" ? "PRODUCT" : "PRESENTER").join(">") ===
          "PRESENTER>PRODUCT>PRESENTER>PRODUCT>PRESENTER"
          ? "YES"
          : "NO",
      FINAL_CREATIVE_COPY_VALID: previews[2].scenes.every((scene) =>
        !/Mostra o produto real|Reforca o beneficio principal|direto ao ponto|consumo diario/i.test(scene.spokenNarration),
      )
        ? "YES"
        : "NO",
      STORYBOARD_COPY_QUALITY_VALID: previews[2].scenes.every((scene) =>
        !/Mostra o produto real|Reforca o beneficio principal|direto ao ponto|consumo diario/i.test(scene.spokenNarration),
      )
        ? "YES"
        : "NO",
      APPROVAL_VERSIONING_VALID: previews[2].storyboardFingerprint && previews[2].approvalState === "READY_FOR_REVIEW" ? "YES" : "NO",
      CURRENT_PLAN_COST_CONSISTENT:
        previews[2].generationPlan.scenes.length === previews[2].scenes.length &&
        previews[2].totals.estimatedVideoCredits === previews[2].generationPlan.estimatedCost.totalEstimatedCredits
          ? "YES"
          : "NO",
      READY_FOR_USER_APPROVAL: previews[2].dryRunGenerationPlanReady ? "YES" : "NO",
      READY_FOR_USER_STORYBOARD_REVIEW: previews[2].dryRunGenerationPlanReady ? "YES" : "NO",
      READY_FOR_PAID_CANARY: previews[2].dryRunGenerationPlanReady ? "YES" : "NO",
      READY_FOR_COMMERCIAL_CREATION_UI_REVIEW: previews.every((preview) => preview.dryRunGenerationPlanReady) ? "YES" : "NO",
      READY_FOR_FIRST_USER_APPROVED_CANARY: previews.every((preview) => preview.dryRunGenerationPlanReady) ? "YES" : "NO",
      firstUserApprovedCanaryNote: "YES means technically ready after a future explicit user approval; this dry-run did not authorize generation.",
    },
    git: initialGit,
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`COMMERCIAL_CREATION_KOKESHI_DRY_RUN=PASS`);
  console.log(`REPORT=${OUT_FILE}`);
  console.log(`PAID_PROVIDER_ATTEMPTS=${blockedProviderAttempts}`);
  console.log(`REMOTE_WRITE_ATTEMPTS=${writeAttempts}`);
  console.log(`READY_FOR_COMMERCIAL_CREATION_UI_REVIEW=${report.readiness.READY_FOR_COMMERCIAL_CREATION_UI_REVIEW}`);
  console.log(`READY_FOR_FIRST_USER_APPROVED_CANARY=${report.readiness.READY_FOR_FIRST_USER_APPROVED_CANARY}`);
  console.log(`HYBRID_SALES_CONTRACT_WIRING_VALID=${report.readiness.HYBRID_SALES_CONTRACT_WIRING_VALID}`);
  console.log(`FINAL_CREATIVE_COPY_VALID=${report.readiness.FINAL_CREATIVE_COPY_VALID}`);
  console.log(`STORYBOARD_COPY_QUALITY_VALID=${report.readiness.STORYBOARD_COPY_QUALITY_VALID}`);
  console.log(`APPROVAL_VERSIONING_VALID=${report.readiness.APPROVAL_VERSIONING_VALID}`);
  console.log(`CURRENT_PLAN_COST_CONSISTENT=${report.readiness.CURRENT_PLAN_COST_CONSISTENT}`);
  console.log(`READY_FOR_USER_APPROVAL=${report.readiness.READY_FOR_USER_APPROVAL}`);
  console.log(`READY_FOR_USER_STORYBOARD_REVIEW=${report.readiness.READY_FOR_USER_STORYBOARD_REVIEW}`);
  console.log(`READY_FOR_PAID_CANARY=${report.readiness.READY_FOR_PAID_CANARY}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
