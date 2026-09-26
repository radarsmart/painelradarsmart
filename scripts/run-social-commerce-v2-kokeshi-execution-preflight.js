// Radar Smart - Social Commerce V2 / Visual Execution Preflight.
// Read-only Supabase selects, no providers, no media generation, no uploads.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

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

const {
  buildSocialCommerceExecutionPreflight,
  buildSocialCommerceV2Plan,
} = require("../lib/commercial-video/social-commerce-v2/index.ts");

const CAMPAIGN_ID = process.argv[2] || "660d53b5-d3dc-47a5-b031-4d035bfd97a3";
const OUT_DIR = path.join(root, "temp", "social-commerce-v2-kokeshi-execution-preflight");
const REPORT_JSON = path.join(OUT_DIR, "report.json");
const REPORT_MD = path.join(OUT_DIR, "report.md");

const network = {
  providerCalls: 0,
  providerAttemptUrls: [],
  remoteWriteAttempts: 0,
  nonProviderNetworkCallCount: 0,
  nonProviderHosts: new Set(),
};

function installReadOnlyNetworkGuard() {
  const realFetch = global.fetch;
  const blockedProviderHostSubstrings = [
    "api.freepik.com",
    "cdn-magnific.freepik.com",
    "api.magnific.com",
    "api.heygen.com",
    "heygen",
    "api.elevenlabs.io",
    "elevenlabs",
    "api.openai.com",
    "klingai.com",
    "runwayml",
    "replicate",
  ];

  global.fetch = async (input, options = {}) => {
    const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
    const method = String(options.method ?? "GET").toUpperCase();
    const host = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return "";
      }
    })();

    if (blockedProviderHostSubstrings.some((blocked) => url.includes(blocked))) {
      network.providerCalls += 1;
      network.providerAttemptUrls.push(url);
      throw new Error(`BLOQUEADO: provider nao autorizado no execution preflight Social Commerce V2: ${url}`);
    }

    if (!["GET", "HEAD"].includes(method)) {
      network.remoteWriteAttempts += 1;
      throw new Error(`BLOQUEADO: preflight read-only nao permite metodo ${method} para ${url}`);
    }

    network.nonProviderNetworkCallCount += 1;
    if (host) network.nonProviderHosts.add(host);
    return realFetch(input, options);
  };
}

function ensureEnv() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env ausente: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios para o preflight real.");
  }
}

function toOfferInput(row) {
  return {
    id: row.id,
    title: row.title ?? "produto",
    category: row.category ?? "beleza",
    price: row.price,
    originalPrice: row.original_price,
    discountPct: row.discount_pct,
    rating: row.rating,
    reviewsCount: row.reviews_count,
    marketplace: row.marketplace,
    imageUrl: row.image_url,
  };
}

function currentScenesFromStoryboard(storyboard) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  return scenes.map((scene, index) => ({
    sceneId: scene.sceneId ?? `scene-${index + 1}`,
    sceneNumber: scene.sceneNumber ?? index + 1,
    purpose: scene.purpose ?? "BENEFIT",
    durationSeconds: scene.durationSeconds ?? 3,
    visual: scene.visual ?? scene.visualIntent ?? "",
    productUse: scene.productUse ?? scene.productInteraction ?? "",
    garotaRadarAppearance: scene.garotaRadarAppearance ?? "NONE",
    spokenNarration: scene.spokenNarration ?? scene.narration ?? "",
    overlay: scene.overlay ?? null,
    price: scene.price ?? null,
    cta: scene.cta ?? null,
  }));
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toPresenterReferences(rows, persona) {
  return rows
    .filter((row) => {
      const metadata = row.metadata ?? {};
      if (metadata.characterSlug) return metadata.characterSlug === persona?.slug;
      return Boolean(persona?.is_official_brand_character);
    })
    .map((row) => ({
      id: row.id,
      name: row.name,
      fileUrl: row.file_url ?? null,
      metadata: {
        referenceType: row.metadata?.referenceType,
        isPrimary: row.metadata?.isPrimary,
        expression: row.metadata?.expression,
        pose: row.metadata?.pose,
        shot: row.metadata?.shot,
        cameraAngle: row.metadata?.cameraAngle,
        generationSafe: row.metadata?.generationSafe,
        description: row.metadata?.description,
        tags: safeArray(row.metadata?.tags),
      },
    }));
}

function localReference(pathParts) {
  const absolutePath = path.join(root, ...pathParts);
  if (!fs.existsSync(absolutePath)) return null;
  return {
    absolutePath,
    referenceValue: path.relative(root, absolutePath),
  };
}

function buildLocalPresenterReferences() {
  const candidates = [
    {
      id: "local-support-neutra-convidando",
      pathParts: ["temp", "brand-assets", "Character-pack", "poses", "support-neutra-convidando.png"],
      name: "Garota Radar - support-neutra-convidando.png",
      metadata: {
        referenceType: "EXPRESSION",
        expression: "INVITING",
        pose: "INVITING",
        shot: "HALF_BODY",
        cameraAngle: "FRONT",
        generationSafe: true,
        description: "HOOK/CTA support: medium/waist-up, eye contact, smiling/open-hand presenting gesture.",
        tags: ["hook", "cta", "convidando", "open-hand", "generation-safe"],
      },
    },
    {
      id: "local-garota-radar-corporativo-verde-office",
      pathParts: ["temp", "brand-assets", "Character-pack", "Garota-radar", "garota-radar-corporativo-verde-office.png"],
      name: "Garota Radar - corporativo verde office",
      metadata: {
        referenceType: "HALF_BODY",
        expression: "CONFIDENT",
        pose: "PRESENTING",
        shot: "HALF_BODY",
        cameraAngle: "FRONT",
        description: "SALES_ARGUMENT support: Radar Smart visual identity, presenter/commercial role.",
        tags: ["sales-argument", "presenter", "green-office", "radar-smart"],
      },
    },
    {
      id: "local-garota-radar-corporativo-bege-office",
      pathParts: ["temp", "brand-assets", "Character-pack", "Garota-radar", "garota-radar-corporativo-bege-office.png"],
      name: "Garota Radar - corporativo bege office",
      metadata: {
        referenceType: "HALF_BODY",
        expression: "INVITING",
        pose: "INVITING",
        shot: "HALF_BODY",
        cameraAngle: "FRONT",
        description: "CTA/institutional support: brand environment and invitation-compatible posture.",
        tags: ["cta", "bege-office", "radar-smart"],
      },
    },
    {
      id: "local-garota-radar-lifestyle-rua-fullbody",
      pathParts: ["temp", "brand-assets", "Character-pack", "Garota-radar", "garota-radar-lifestyle-rua-fullbody.png"],
      name: "Garota Radar - lifestyle rua fullbody",
      metadata: {
        referenceType: "FULL_BODY",
        shot: "FULL_BODY",
        cameraAngle: "FRONT",
        description: "Lifestyle/editorial support only; not a substitute for close/performance.",
        tags: ["lifestyle", "editorial-only", "fullbody"],
      },
    },
  ];

  return candidates.flatMap((candidate) => {
    const found = localReference(candidate.pathParts);
    if (!found) return [];
    return [{
      id: candidate.id,
      name: candidate.name,
      fileUrl: found.referenceValue,
      metadata: candidate.metadata,
    }];
  });
}

function dedupeById(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function listImageFiles(baseDir) {
  const resolved = path.join(root, baseDir);
  if (!fs.existsSync(resolved)) return [];
  const out = [];
  const stack = [resolved];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", ".next"].includes(entry.name)) stack.push(fullPath);
        continue;
      }
      if (/\.(png|jpe?g|webp)$/i.test(entry.name)) out.push(fullPath);
    }
  }
  return out;
}

function findLocalImagesByName(patterns) {
  const files = [
    ...listImageFiles("assets"),
    ...listImageFiles("temp"),
    ...listImageFiles("temp-brand-assets"),
    ...listImageFiles("public"),
  ];
  const dedupedByFilename = new Map();
  for (const filePath of files) {
    const basename = path.basename(filePath).toLowerCase();
    if (!patterns.some((pattern) => pattern.test(basename))) continue;
    if (!dedupedByFilename.has(basename)) dedupedByFilename.set(basename, filePath);
  }
  return Array.from(dedupedByFilename.values()).map((filePath) => path.relative(root, filePath));
}

function extractReferenceUrlsFromBrief(brief, keys) {
  const urls = [];
  for (const key of keys) {
    const value = brief?.[key];
    if (typeof value === "string" && value.startsWith("http")) urls.push(value);
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.startsWith("http")) urls.push(item);
        if (item && typeof item === "object" && typeof item.url === "string" && item.url.startsWith("http")) urls.push(item.url);
      }
    }
  }
  return [...new Set(urls)];
}

function buildProductReferences(offerRow, creativeBrief) {
  const localPackshots = findLocalImagesByName([
    /kokeshi.*packshot/,
    /packshot.*kokeshi/,
    /kokeshi.*branco/,
  ]);
  const localHandInteraction = findLocalImagesByName([
    /kokeshi.*(maos|m[aã]os|mao|m[aã]o|hands?|segur)/,
    /(maos|m[aã]os|mao|m[aã]o|hands?|segur).*kokeshi/,
    /produto.*(maos|m[aã]os|mao|m[aã]o|hands?|segur)/,
  ]);
  const localBenefitContext = findLocalImagesByName([
    /kokeshi.*(copaiba|girassol|benefit|beneficio|ingred)/,
    /(copaiba|girassol|benefit|beneficio|ingred).*kokeshi/,
  ]);
  const localTexture = findLocalImagesByName([
    /kokeshi.*(texture|textura|gel|creme)/,
    /(texture|textura|gel|creme).*kokeshi/,
  ]).filter((entry) => !localPackshots.includes(entry) && !localHandInteraction.includes(entry));
  const localApplication = findLocalImagesByName([
    /kokeshi.*(application|aplicacao|aplica|pele|rosto)/,
    /(application|aplicacao|aplica|pele|rosto).*kokeshi/,
  ]);
  const demoReferenceUrls = extractReferenceUrlsFromBrief(creativeBrief, [
    "productDemoReferenceUrls",
    "demoReferenceUrls",
    "handDemoReferenceUrls",
  ]);
  const handInteractionReferenceUrls = [
    ...demoReferenceUrls,
    ...extractReferenceUrlsFromBrief(creativeBrief, ["handInteractionReferenceUrls", "productHandInteractionReferenceUrls"]),
    ...localHandInteraction,
  ];
  const skincareContextReferenceUrls = [
    ...extractReferenceUrlsFromBrief(creativeBrief, ["skincareContextReferenceUrls", "productSkincareContextReferenceUrls"]),
    ...localHandInteraction,
  ];
  const benefitContextReferenceUrls = [
    ...extractReferenceUrlsFromBrief(creativeBrief, ["benefitContextReferenceUrls", "productBenefitContextReferenceUrls"]),
    ...localBenefitContext,
  ];
  const textureReferenceUrls = [
    ...extractReferenceUrlsFromBrief(creativeBrief, [
      "productTextureReferenceUrls",
      "textureReferenceUrls",
    ]),
    ...localTexture,
  ];
  const applicationReferenceUrls = [
    ...extractReferenceUrlsFromBrief(creativeBrief, [
      "productApplicationReferenceUrls",
      "applicationReferenceUrls",
    ]),
    ...localApplication,
  ];
  return {
    packshotReferenceUrl: localPackshots[0] ?? offerRow.image_url ?? null,
    demoReferenceUrls: [...new Set([...demoReferenceUrls, ...localHandInteraction])],
    handInteractionReferenceUrls: [...new Set(handInteractionReferenceUrls)],
    skincareContextReferenceUrls: [...new Set(skincareContextReferenceUrls)],
    benefitContextReferenceUrls: [...new Set(benefitContextReferenceUrls)],
    textureReferenceUrls: [...new Set(textureReferenceUrls)],
    applicationReferenceUrls: [...new Set(applicationReferenceUrls)],
    notes: [
      "offers.image_url conta somente como packshot/reference estatica.",
      "Imagem de embalagem nao e promovida automaticamente para textura ou aplicacao.",
      localHandInteraction.length > 0
        ? `Referencias locais de produto nas maos encontradas: ${localHandInteraction.join(", ")}.`
        : "Nenhuma referencia local de produto nas maos foi encontrada por nome no workspace.",
      localBenefitContext.length > 0
        ? `Referencias locais de contexto/beneficio encontradas: ${localBenefitContext.join(", ")}.`
        : "Nenhuma arte local de copaiba/girassol/beneficio foi encontrada por nome no workspace.",
    ],
  };
}

function timelineMarkdown(rows) {
  const header = "| Start | End | Scene | Beat | Visual Source | Asset/ref | Shot | Product Action | Editorial | Overlay | SFX | Provider |\n|---:|---:|---|---:|---|---|---|---|---|---|---|---|";
  const body = rows.map((row) =>
    `| ${row.timeStart.toFixed(2)} | ${row.timeEnd.toFixed(2)} | ${row.macroScene} | ${row.beatIndex} | ${row.visualSource} | ${row.assetIdOrReference ?? "-"} | ${row.presenterShot} | ${row.productAction} | ${row.editorialAction} | ${row.overlay ?? "-"} | ${row.sfx ?? "-"} | ${row.providerIfNeeded} |`,
  );
  return [header, ...body].join("\n");
}

function requirementsMarkdown(rows) {
  const header = "| Requirement | Purpose | Framing | Expression | Gesture | Ref Available | Compatible | Framing Var | Performance Var | Matched refs |\n|---|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((row) =>
    `| ${row.requirementId} | ${row.purpose} | ${row.framing} | ${row.expression} | ${row.gesture} | ${row.referenceAvailable} | ${row.referenceCompatibleWithShot} | ${row.framingVariation} | ${row.performanceVariation} | ${row.matchedReferenceIds.join(", ") || "-"} |`,
  );
  return [header, ...body].join("\n");
}

function gatesMarkdown(rows) {
  return rows.map((row) => `- ${row.name}: ${row.status}\n  ${row.reasons.join(" | ") || "-"}`).join("\n");
}

function reportMarkdown(report) {
  const preflight = report.executionPreflight;
  return [
    "# Social Commerce V2 - Kokeshi Visual Execution Preflight",
    "",
    `Campaign: ${report.campaignId}`,
    `Generated at: ${report.generatedAt}`,
    "",
    "## Status",
    "",
    `TOTAL_MICROBEATS=${preflight.totals.TOTAL_MICROBEATS}`,
    `NEW_PROVIDER_ASSETS_REQUIRED=${preflight.totals.NEW_PROVIDER_ASSETS_REQUIRED}`,
    `EDITORIAL_ONLY_BEATS=${preflight.totals.EDITORIAL_ONLY_BEATS}`,
    `REUSED_BEATS=${preflight.totals.REUSED_BEATS}`,
    `HEYGEN_CALLS_PLANNED=${preflight.totals.HEYGEN_CALLS_PLANNED}`,
    `KLING_CALLS_PLANNED=${preflight.totals.KLING_CALLS_PLANNED}`,
    `ELEVENLABS_CALLS_PLANNED=${preflight.totals.ELEVENLABS_CALLS_PLANNED}`,
    `MICROBEAT_EXECUTION_EFFICIENCY=${preflight.result.MICROBEAT_EXECUTION_EFFICIENCY}`,
    `PRESENTER_VISUAL_VARIETY_READY=${preflight.result.PRESENTER_VISUAL_VARIETY_READY}`,
    `PRODUCT_EXPERIENCE_EXECUTABLE=${preflight.result.PRODUCT_EXPERIENCE_EXECUTABLE}`,
    `AUDIO_ENERGY_EXECUTABLE=${preflight.result.AUDIO_ENERGY_EXECUTABLE}`,
    `SOCIAL_COMMERCE_EXECUTION_PREFLIGHT=${preflight.result.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT}`,
    `READY_FOR_PAID_SOCIAL_COMMERCE_CANARY=${preflight.result.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY}`,
    "",
    "## Feasibility",
    "",
    `HEYGEN_PRESENTER_FEASIBILITY=${preflight.feasibility.HEYGEN_PRESENTER_FEASIBILITY}`,
    `KLING_PRODUCT_EXPERIENCE_FEASIBILITY=${preflight.feasibility.KLING_PRODUCT_EXPERIENCE_FEASIBILITY}`,
    "",
    "## Presenter Requirements",
    "",
    requirementsMarkdown(preflight.presenterShotRequirements),
    "",
    "## Product Readiness",
    "",
    `PACKSHOT_REFERENCE_READY=${preflight.productExperienceReadiness.PACKSHOT_REFERENCE_READY}`,
    `HAND_INTERACTION_REFERENCE_READY=${preflight.productExperienceReadiness.HAND_INTERACTION_REFERENCE_READY}`,
    `SKINCARE_CONTEXT_REFERENCE_READY=${preflight.productExperienceReadiness.SKINCARE_CONTEXT_REFERENCE_READY}`,
    `BENEFIT_CONTEXT_REFERENCE_READY=${preflight.productExperienceReadiness.BENEFIT_CONTEXT_REFERENCE_READY}`,
    `DEMO_REFERENCE_READY=${preflight.productExperienceReadiness.DEMO_REFERENCE_READY}`,
    `TEXTURE_REFERENCE_READY=${preflight.productExperienceReadiness.TEXTURE_REFERENCE_READY}`,
    `APPLICATION_REFERENCE_READY=${preflight.productExperienceReadiness.APPLICATION_REFERENCE_READY}`,
    `REAL_PRODUCT_INTERACTION_READY=${preflight.productExperienceReadiness.REAL_PRODUCT_INTERACTION_READY}`,
    `SUPPORT_GROUNDED_PRODUCT_EXPERIENCE_READY=${preflight.productExperienceReadiness.SUPPORT_GROUNDED_PRODUCT_EXPERIENCE_READY}`,
    "",
    "Observations:",
    ...(preflight.productExperienceReadiness.observations.length ? preflight.productExperienceReadiness.observations.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## 17 Microbeats - Real Timeline",
    "",
    timelineMarkdown(preflight.timeline),
    "",
    "## Planned Generative Asset Groups",
    "",
    ...preflight.plannedGenerativeAssetGroups.map((group) =>
      `- ${group.groupId}: ${group.provider}, ${group.durationSeconds}s, ${group.referenceStatus}, covers ${group.coveredMicrobeats.join(", ")}`,
    ),
    "",
    "## Cost Preflight",
    "",
    `HEYGEN: ${preflight.estimatedCosts.HEYGEN.numberOfGenerationCalls} calls, estimated USD ${preflight.estimatedCosts.HEYGEN.estimatedUsd}`,
    `KLING: ${preflight.estimatedCosts.KLING.numberOfGenerationCalls} calls, ${preflight.estimatedCosts.KLING.billableDurationSeconds}s billable, estimated credits ${preflight.estimatedCosts.KLING.estimatedCredits}`,
    `ELEVENLABS: ${preflight.estimatedCosts.ELEVENLABS.numberOfGenerationCalls} call, ${preflight.estimatedCosts.ELEVENLABS.characters} chars, estimated credits ${preflight.estimatedCosts.ELEVENLABS.estimatedCredits}`,
    `WAN: ${preflight.estimatedCosts.WAN.numberOfGenerationCalls}`,
    "",
    "## Gates",
    "",
    gatesMarkdown(preflight.gates),
    "",
    "## Gaps",
    "",
    "Presenter:",
    ...(preflight.gaps.PRESENTER_REFERENCE_GAPS.length ? preflight.gaps.PRESENTER_REFERENCE_GAPS.map((gap) => `- ${gap}`) : ["- none"]),
    "",
    "Product:",
    ...(preflight.gaps.PRODUCT_REFERENCE_GAPS.length ? preflight.gaps.PRODUCT_REFERENCE_GAPS.map((gap) => `- ${gap}`) : ["- none"]),
    "",
    "## Safety",
    "",
    `Providers called: ${report.providerCalls}`,
    `Media generated: ${report.mediaGeneration}`,
    `Uploads: ${report.uploads}`,
    `Publications: ${report.publications}`,
    `Remote writes: ${report.remoteWriteAttempts}`,
    `Database writes: ${report.databaseWrites}`,
  ].join("\n");
}

async function main() {
  ensureEnv();
  installReadOnlyNetworkGuard();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: campaign, error: campaignError } = await supabase
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,selected_persona_id,creative_brief")
    .eq("id", CAMPAIGN_ID)
    .maybeSingle();
  if (campaignError) throw new Error(campaignError.message);
  if (!campaign) throw new Error(`Campanha ${CAMPAIGN_ID} nao encontrada.`);

  const [offerRes, personaRes, assetRes] = await Promise.all([
    supabase
      .from("offers")
      .select("id,title,category,price,original_price,discount_pct,rating,reviews_count,marketplace,image_url")
      .eq("id", campaign.offer_id)
      .maybeSingle(),
    campaign.selected_persona_id
      ? supabase
        .from("ugc_personas")
        .select("id,slug,is_official_brand_character,avatar_image_url,reference_images")
        .eq("id", campaign.selected_persona_id)
        .maybeSingle()
      : supabase
        .from("ugc_personas")
        .select("id,slug,is_official_brand_character,avatar_image_url,reference_images")
        .eq("is_official_brand_character", true)
        .maybeSingle(),
    supabase
      .from("brand_assets")
      .select("id,name,type,file_url,metadata,created_at")
      .eq("type", "CHARACTER_REFERENCE"),
  ]);

  if (offerRes.error) throw new Error(offerRes.error.message);
  if (!offerRes.data) throw new Error("Oferta da campanha nao encontrada.");
  if (personaRes.error) throw new Error(personaRes.error.message);
  if (assetRes.error) throw new Error(assetRes.error.message);

  const storyboard = campaign.creative_brief?.commercialCreationStoryboard;
  const currentScenes = currentScenesFromStoryboard(storyboard);
  if (currentScenes.length === 0) {
    throw new Error("commercialCreationStoryboard ausente; preflight nao vai regenerar briefing nem escrever no banco.");
  }

  const socialCommerceV2 = buildSocialCommerceV2Plan({
    campaignId: campaign.id,
    offer: toOfferInput(offerRes.data),
    currentScenes,
    totalDurationSeconds: currentScenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    preferredVoiceProfile: "FRIEND_SHOWING_A_FIND",
  });

  const presenterReferences = dedupeById([
    ...toPresenterReferences(assetRes.data ?? [], personaRes.data),
    ...buildLocalPresenterReferences(),
  ]);
  const productReferences = buildProductReferences(offerRes.data, campaign.creative_brief);
  const executionPreflight = buildSocialCommerceExecutionPreflight({
    campaignId: campaign.id,
    plan: socialCommerceV2,
    presenterReferences,
    productReferences,
    voiceCandidate: {
      voiceId: "qUqXzKPs4b4NRdbYKPx7",
      model: "eleven_multilingual_v2",
    },
  });

  const report = {
    generatedAt: new Date().toISOString(),
    reportName: "SOCIAL_COMMERCE_V2_KOKESHI_VISUAL_EXECUTION_PREFLIGHT",
    mode: "READ_ONLY_PREFLIGHT_NO_PROVIDERS_NO_MEDIA",
    campaignId: campaign.id,
    campaignName: campaign.name,
    offer: toOfferInput(offerRes.data),
    storyboardStatusBeforePreflight: {
      SOCIAL_COMMERCE_VISUAL_STORYBOARD_VALID: socialCommerceV2.socialCommerceQualityGate.status !== "FAIL" ? "YES" : "NO",
      READY_FOR_SOCIAL_COMMERCE_VISUAL_CANARY: socialCommerceV2.socialCommerceQualityGate.canaryBlocked ? "NO" : "YES",
      SOCIAL_COMMERCE_STORYBOARD_GATE: socialCommerceV2.socialCommerceQualityGate.status,
    },
    personaAudit: {
      persona: personaRes.data ?? null,
      presenterReferenceCount: presenterReferences.length,
      presenterReferences,
    },
    productReferenceAudit: productReferences,
    socialCommerceV2,
    executionPreflight,
    providerCalls: network.providerCalls,
    mediaGeneration: 0,
    uploads: 0,
    publications: 0,
    databaseWrites: 0,
    remoteWriteAttempts: network.remoteWriteAttempts,
    nonProviderNetworkCallCount: network.nonProviderNetworkCallCount,
    nonProviderHosts: Array.from(network.nonProviderHosts),
    safety: {
      providersCalled: 0,
      mediaGenerated: 0,
      uploads: 0,
      publications: 0,
      remoteWrites: 0,
    },
    SOCIAL_COMMERCE_EXECUTION_PREFLIGHT: executionPreflight.result.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT,
    READY_FOR_PAID_SOCIAL_COMMERCE_CANARY: executionPreflight.result.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY,
  };

  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(REPORT_MD, reportMarkdown(report), "utf8");

  console.log(JSON.stringify({
    SOCIAL_COMMERCE_EXECUTION_PREFLIGHT: report.SOCIAL_COMMERCE_EXECUTION_PREFLIGHT,
    READY_FOR_PAID_SOCIAL_COMMERCE_CANARY: report.READY_FOR_PAID_SOCIAL_COMMERCE_CANARY,
    TOTAL_MICROBEATS: executionPreflight.totals.TOTAL_MICROBEATS,
    NEW_PROVIDER_ASSETS_REQUIRED: executionPreflight.totals.NEW_PROVIDER_ASSETS_REQUIRED,
    EDITORIAL_ONLY_BEATS: executionPreflight.totals.EDITORIAL_ONLY_BEATS,
    REUSED_BEATS: executionPreflight.totals.REUSED_BEATS,
    HEYGEN_CALLS_PLANNED: executionPreflight.totals.HEYGEN_CALLS_PLANNED,
    KLING_CALLS_PLANNED: executionPreflight.totals.KLING_CALLS_PLANNED,
    ELEVENLABS_CALLS_PLANNED: executionPreflight.totals.ELEVENLABS_CALLS_PLANNED,
    MICROBEAT_EXECUTION_EFFICIENCY: executionPreflight.result.MICROBEAT_EXECUTION_EFFICIENCY,
    PRESENTER_VISUAL_VARIETY_READY: executionPreflight.result.PRESENTER_VISUAL_VARIETY_READY,
    PRODUCT_EXPERIENCE_EXECUTABLE: executionPreflight.result.PRODUCT_EXPERIENCE_EXECUTABLE,
    PACKSHOT_REFERENCE_READY: executionPreflight.productExperienceReadiness.PACKSHOT_REFERENCE_READY,
    HAND_INTERACTION_REFERENCE_READY: executionPreflight.productExperienceReadiness.HAND_INTERACTION_REFERENCE_READY,
    SKINCARE_CONTEXT_REFERENCE_READY: executionPreflight.productExperienceReadiness.SKINCARE_CONTEXT_REFERENCE_READY,
    BENEFIT_CONTEXT_REFERENCE_READY: executionPreflight.productExperienceReadiness.BENEFIT_CONTEXT_REFERENCE_READY,
    TEXTURE_REFERENCE_READY: executionPreflight.productExperienceReadiness.TEXTURE_REFERENCE_READY,
    APPLICATION_REFERENCE_READY: executionPreflight.productExperienceReadiness.APPLICATION_REFERENCE_READY,
    AUDIO_ENERGY_EXECUTABLE: executionPreflight.result.AUDIO_ENERGY_EXECUTABLE,
    HEYGEN_PRESENTER_FEASIBILITY: executionPreflight.feasibility.HEYGEN_PRESENTER_FEASIBILITY,
    KLING_PRODUCT_EXPERIENCE_FEASIBILITY: executionPreflight.feasibility.KLING_PRODUCT_EXPERIENCE_FEASIBILITY,
    presenterReferenceCount: presenterReferences.length,
    handInteractionReferences: productReferences.handInteractionReferenceUrls.length,
    skincareContextReferences: productReferences.skincareContextReferenceUrls.length,
    benefitContextReferences: productReferences.benefitContextReferenceUrls.length,
    providerCalls: network.providerCalls,
    remoteWriteAttempts: network.remoteWriteAttempts,
    reportJson: path.relative(root, REPORT_JSON),
    reportMd: path.relative(root, REPORT_MD),
  }, null, 2));
}

main().catch((error) => {
  console.error("SOCIAL_COMMERCE_EXECUTION_PREFLIGHT_FAILED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
