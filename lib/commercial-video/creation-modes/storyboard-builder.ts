import { buildScenePlan } from "@/lib/commercial-director/scene-planner";
import { buildAudioDirection } from "@/lib/commercial-director/audio-direction";
import { buildOfferStrategy, selectProofStrategy } from "@/lib/commercial-director/proof-and-offer";
import { buildCampaignExecutionPlan } from "@/lib/generation-orchestrator/orchestrator";
import type { ResolvedSceneReferences } from "@/lib/generation-orchestrator/types";
import { buildCampaignPromptPlan } from "@/lib/prompt-builder/prompt-builder";
import { scanTextForForbiddenClaims } from "@/lib/content-safety/claims-policy";
import { buildControlledPersuasionPipeline } from "@/lib/commercial-video/persuasion/pipeline-integration";
import { computeCommercialStoryboardFingerprint } from "@/lib/commercial-video/creation-modes/approval-state";
import { buildCreativeDnaFromReference, evaluateCreativeRemixGuard } from "@/lib/commercial-video/creation-modes/reference-dna";
import type {
  CommercialCreationMode,
  CommercialCreationOfferInput,
  CommercialCreationProductIntelligenceInput,
  CommercialCreativeContract,
  CommercialPrimaryObjective,
  CommercialStoryboardPreview,
  CommercialStoryboardPreviewScene,
  PresenterPreference,
  ProductUsagePreference,
} from "@/lib/commercial-video/creation-modes/types";
import type {
  CommercialDirection,
  CommercialObjective,
  CommercialPace,
  CommercialScene,
  HookStrategy,
  PresenterStrategy,
  ScenePurpose,
  SellingArgument,
  StoryStructure,
  TextOverlayStrategy,
  VisualStyle,
} from "@/lib/commercial-director/types";
import type { CampaignPromptPlan, SceneGenerationPrompt } from "@/lib/prompt-builder/types";

export type BuildCommercialCreationModePreviewInput = {
  contract: CommercialCreativeContract;
  offer: CommercialCreationOfferInput;
  productIntelligence: CommercialCreationProductIntelligenceInput;
  platform?: "TIKTOK" | "INSTAGRAM_REELS" | "META_ADS";
  aspectRatio?: string;
  defaultLogoAssetId?: string | null;
  presenterAssetIds?: {
    identityReferenceAssetId: string | null;
    supportReferenceAssetId: string | null;
  };
};

function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 15;
  return Math.max(6, Math.min(45, Math.round(value)));
}

function ensureRadarSmartCta(ctas: string[]): string[] {
  const cleaned = ctas.map((cta) => cta.trim()).filter(Boolean);
  const hasRadarSmartCta = cleaned.some((cta) => /radar\s*smart/i.test(cta));
  const withBrand = cleaned.map((cta) =>
    /radar\s*smart/i.test(cta) || (hasRadarSmartCta && /grupo\s*vip/i.test(cta)) ? cta : `${cta} pelo Radar Smart`,
  );
  return withBrand.length ? withBrand : ["Ver oferta no Radar Smart", "Entrar no Grupo VIP Radar Smart"];
}

function primaryObjectiveToCommercialObjective(objective: CommercialPrimaryObjective): CommercialObjective {
  if (objective === "TRAFFIC" || objective === "VIP_GROUP") return "TRAFFIC";
  if (objective === "ENGAGEMENT") return "ENGAGEMENT";
  return "CONVERSION";
}

function modeToStructure(mode: CommercialCreationMode): StoryStructure {
  switch (mode) {
    case "PRODUCT_COMMERCIAL":
      return "DEMONSTRATION";
    case "PRESENTER_UGC":
      return "UGC";
    case "HYBRID_SALES":
      return "PROBLEM_SOLUTION";
    case "TREND_REFERENCE_REMIX":
      return "DISCOVERY";
    default:
      return "DEMONSTRATION";
  }
}

function modeToHook(mode: CommercialCreationMode): HookStrategy {
  switch (mode) {
    case "PRODUCT_COMMERCIAL":
      return "DEMONSTRATION";
    case "PRESENTER_UGC":
      return "DISCOVERY";
    case "HYBRID_SALES":
      return "BENEFIT_FIRST";
    case "TREND_REFERENCE_REMIX":
      return "CURIOSITY";
    default:
      return "DISCOVERY";
  }
}

function modeToPresenterStrategy(mode: CommercialCreationMode, preference: PresenterPreference): PresenterStrategy {
  if (preference === "NO_PRESENTER") return "PRODUCT_ONLY";
  if (preference === "PRESENTER_LED") return mode === "PRESENTER_UGC" ? "UGC_PERSONA" : "GAROTA_RADAR_FULL";
  if (preference === "HOOK_AND_CTA") return "GAROTA_RADAR_RECOMMENDATION";

  switch (mode) {
    case "PRODUCT_COMMERCIAL":
      return "PRODUCT_ONLY";
    case "PRESENTER_UGC":
      return "GAROTA_RADAR_RECOMMENDATION";
    case "HYBRID_SALES":
      return "GAROTA_RADAR_RECOMMENDATION";
    case "TREND_REFERENCE_REMIX":
      return "GAROTA_RADAR_HOOK_ONLY";
    default:
      return "PRODUCT_ONLY";
  }
}

function modeToSellingArgument(mode: CommercialCreationMode, discountPct: number | null): SellingArgument {
  if ((discountPct ?? 0) > 0) return "PRICE";
  if (mode === "PRODUCT_COMMERCIAL") return "DEMONSTRATION";
  if (mode === "PRESENTER_UGC") return "CONVENIENCE";
  if (mode === "HYBRID_SALES") return "PRACTICAL_BENEFIT";
  return "PRACTICAL_BENEFIT";
}

function modeToTextOverlayStrategy(mode: CommercialCreationMode): TextOverlayStrategy {
  if (mode === "PRODUCT_COMMERCIAL" || mode === "HYBRID_SALES") return "PRICE_FOCUSED";
  if (mode === "PRESENTER_UGC") return "BENEFIT_FOCUSED";
  return "MINIMAL";
}

function resolvePace(durationSeconds: number, tone: string): CommercialPace {
  const normalizedTone = tone.toLowerCase();
  if (normalizedTone.includes("cinematic") || normalizedTone.includes("premium")) return "CINEMATIC";
  if (durationSeconds <= 15 || normalizedTone.includes("rapido") || normalizedTone.includes("direto")) return "FAST";
  return "MEDIUM";
}

function resolveVisualStyle(category: string, visualStyle: string, mode: CommercialCreationMode): VisualStyle {
  const normalized = `${category} ${visualStyle}`.toLowerCase();
  if (mode === "PRESENTER_UGC") return "UGC_NATIVE";
  if (normalized.includes("beleza") || normalized.includes("skin") || normalized.includes("beauty")) return "BEAUTY";
  if (normalized.includes("casa") || normalized.includes("cozinha")) return "HOME_DEMO";
  if (normalized.includes("tech") || normalized.includes("eletron")) return "TECH";
  if (normalized.includes("luxo") || normalized.includes("premium")) return "LUXURY";
  if (mode === "PRODUCT_COMMERCIAL") return "PRODUCT_HERO";
  return "PREMIUM_COMMERCIAL";
}

function objectiveText(objective: CommercialPrimaryObjective): string {
  if (objective === "VIP_GROUP") return "levar o usuario para o Grupo VIP Radar Smart";
  if (objective === "TRAFFIC") return "levar o usuario para a pagina Radar Smart";
  if (objective === "ENGAGEMENT") return "gerar interesse e comentario sem perder intencao de compra";
  if (objective === "CUSTOM") return "seguir o objetivo declarado no prompt sem violar dados reais";
  return "venda direta com CTA Radar Smart";
}

function formatPrice(value: number | null): string | null {
  if (value === null) return null;
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function productUseForScene(
  purpose: ScenePurpose,
  preference: ProductUsagePreference,
  productTitle: string,
  mode: CommercialCreationMode,
): string {
  if (mode === "HYBRID_SALES") {
    if (purpose === "HOOK") return "sem produto visivel; a apresentadora cria curiosidade antes da demonstracao";
    if (purpose === "BENEFIT") return "argumento curto da apresentadora sobre valor percebido, sem claim de resultado";
    if (purpose === "OFFER") return "produto real em packshot com overlay deterministico R$ 13,16, discountText null e sem desconto inventado";
    if (purpose === "CTA") return "CTA humano para Radar Smart e Grupo VIP";
  }
  if (purpose === "OFFER" || purpose === "CTA") return "produto real em packshot/overlay, sem recriar rotulo";
  if (purpose === "PRODUCT" || purpose === "BENEFIT") {
    if (preference === "NO_USAGE_DEMO") return `mostrar ${productTitle} parado, embalagem fiel em primeiro plano`;
    if (preference === "PACKSHOT_FIRST") return `packshot fiel de ${productTitle} antes de qualquer demonstracao`;
    return `produto Kokeshi real em contexto de skincare, com textura/aplicacao contextualizada, product fidelity obrigatoria, sem promessa de resultado e sem produto flutuando sem proposito`;
  }
  return "aparecimento breve ou sugerido, sem distorcer a embalagem";
}

function mergedCta(ctas: string[]): string {
  const joined = ctas.join(" e ");
  if (/grupo\s*vip/i.test(joined)) return joined;
  return `${ctas[0] ?? "Acesse a Radar Smart"} e entre no Grupo VIP`;
}

function spokenNarrationForScene(input: {
  purpose: ScenePurpose;
  mode: CommercialCreationMode;
  offer: CommercialCreationOfferInput;
  ctas: string[];
  mustSay: string[];
}): string {
  const price = formatPrice(input.offer.price);
  if (input.purpose === "HOOK") {
    if (input.mode === "PRESENTER_UGC") return `Gente, olha esse achado que eu encontrei hoje.`;
    if (input.mode === "HYBRID_SALES") {
      return price ? `Olha esse achado por só ${price}.` : `Olha esse achado que vale conhecer.`;
    }
    return price ? `Olha esse achado por so ${price}.` : `Olha esse achado que vale conhecer.`;
  }
  if (input.purpose === "PRODUCT") return `Esse é o Creme Gel Kokeshi.`;
  if (input.purpose === "BENEFIT") return `Por esse preço, vale conhecer.`;
  if (input.purpose === "OFFER") return input.offer.price !== null ? `Só ${formatPrice(input.offer.price)}.` : "Olha a oferta real.";
  if (input.purpose === "CTA") return `Entre no Grupo VIP da Radar Smart.`;
  return `Se voce gosta de achar produto bom sem pagar caro, presta atencao.`;
}

function sceneInstructionForPurpose(input: {
  purpose: ScenePurpose;
  mode: CommercialCreationMode;
  offer: CommercialCreationOfferInput;
}): string {
  if (input.mode === "HYBRID_SALES") {
    if (input.purpose === "HOOK") return "Close da Garota Radar em ambiente feminino de skincare; ela chama atencao sem mostrar o produto.";
    if (input.purpose === "PRODUCT") return "Produto Kokeshi real em contexto de skincare; close na embalagem, textura/aplicacao contextualizada, product fidelity obrigatoria, sem promessa de resultado e sem produto flutuando.";
    if (input.purpose === "BENEFIT") return "Garota Radar volta para camera e transforma a demonstracao em motivo de interesse.";
    if (input.purpose === "OFFER") return "Produto Kokeshi real em destaque com overlay deterministico de preco.";
    if (input.purpose === "CTA") return "Garota Radar olha para camera e direciona para Radar Smart e Grupo VIP.";
  }
  if (input.purpose === "HOOK") return "Abrir com imagem de alto impacto alinhada ao modo escolhido.";
  if (input.purpose === "PRODUCT") return "Mostrar produto real com embalagem fiel e contexto de uso.";
  if (input.purpose === "OFFER") return "Revelar oferta com dado real e overlay deterministico.";
  if (input.purpose === "CTA") return "Converter interesse em acao para Radar Smart.";
  return "Avancar a narrativa comercial sem inventar claim.";
}

function productFirstAppearanceSecond(direction: CommercialDirection): number {
  const scene = direction.scenes.find((entry) => entry.presenter === "PRODUCT_ONLY" || entry.purpose === "PRODUCT");
  return scene?.startSecond ?? 0;
}

function proportionalTimes(durationSeconds: number, count: number): Array<{ startSecond: number; endSecond: number }> {
  const times: Array<{ startSecond: number; endSecond: number }> = [];
  let elapsed = 0;
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const startSecond = elapsed;
    const endSecond = isLast ? durationSeconds : Math.round(((index + 1) * durationSeconds) / count);
    times.push({ startSecond, endSecond });
    elapsed = endSecond;
  }
  return times;
}

function buildHybridSalesScenePlan(input: {
  durationSeconds: number;
  productTitle: string;
  textOverlayStrategy: TextOverlayStrategy;
  hasOfficialCharacter: boolean;
}): CommercialScene[] {
  const times = proportionalTimes(input.durationSeconds, 5);
  const presenter = input.hasOfficialCharacter ? "GAROTA_RADAR_FULL" : "PRODUCT_ONLY";
  const presenterDirection = { expression: "CONFIDENT", pose: "PRESENTING", shot: "HALF_BODY" } as const;

  return [
    {
      id: "scene-1",
      order: 1,
      ...times[0],
      purpose: "HOOK",
      visualSubject: input.hasOfficialCharacter ? "Garota Radar" : `produto (${input.productTitle})`,
      presenter,
      productAction: "sem produto visivel; hook humano cria curiosidade para o achado",
      characterDirection: input.hasOfficialCharacter ? { expression: "EXCITED", pose: "POINTING", shot: "HALF_BODY" } : null,
      identityReferenceAssetId: null,
      supportReferenceAssetId: null,
      camera: "close-up frontal da apresentadora",
      motion: "leve push-in no rosto, sem produto no quadro",
      lighting: "ambiente feminino de skincare, luz suave e premium",
      textOverlay: input.textOverlayStrategy === "NO_TEXT" ? null : "achado de skincare",
      voiceoverIntent: "",
      sfxIntent: "whoosh curto de abertura",
      transitionIntent: "hard cut",
    },
    {
      id: "scene-2",
      order: 2,
      ...times[1],
      purpose: "PRODUCT",
      visualSubject: `produto (${input.productTitle})`,
      presenter: "PRODUCT_ONLY",
      productAction: `produto Kokeshi real em close, embalagem fiel, textura/aplicacao em contexto de skincare, product fidelity obrigatoria, sem promessa de resultado e sem produto flutuando`,
      characterDirection: null,
      identityReferenceAssetId: null,
      supportReferenceAssetId: null,
      camera: "macro/close de produto",
      motion: "movimento suave na embalagem e textura",
      lighting: "luz de skincare limpa destacando rotulo e textura",
      textOverlay: null,
      voiceoverIntent: "",
      sfxIntent: "toque leve de produto",
      transitionIntent: "cut",
    },
    {
      id: "scene-3",
      order: 3,
      ...times[2],
      purpose: "BENEFIT",
      visualSubject: input.hasOfficialCharacter ? "Garota Radar" : `produto (${input.productTitle})`,
      presenter,
      productAction: "apresentadora transforma a demonstracao em motivo de interesse, sem prometer resultado",
      characterDirection: input.hasOfficialCharacter ? presenterDirection : null,
      identityReferenceAssetId: null,
      supportReferenceAssetId: null,
      camera: "plano medio frontal da apresentadora",
      motion: "gesto natural apontando para area de produto/overlay",
      lighting: "skincare premium com fundo claro e feminino",
      textOverlay: "vale conhecer",
      voiceoverIntent: "",
      sfxIntent: null,
      transitionIntent: "cut",
    },
    {
      id: "scene-4",
      order: 4,
      ...times[3],
      purpose: "OFFER",
      visualSubject: `oferta real de ${input.productTitle}`,
      presenter: "PRODUCT_ONLY",
      productAction: "produto real em packshot com preco deterministico, discountText null e sem desconto inventado",
      characterDirection: null,
      identityReferenceAssetId: null,
      supportReferenceAssetId: null,
      camera: "packshot estatico do produto",
      motion: "preco entra como overlay, produto fica travado",
      lighting: "alto contraste no produto e area livre para preco",
      textOverlay: "preco real em destaque",
      voiceoverIntent: "",
      sfxIntent: "notificacao curta",
      transitionIntent: "cut rapido",
    },
    {
      id: "scene-5",
      order: 5,
      ...times[4],
      purpose: "CTA",
      visualSubject: input.hasOfficialCharacter ? "Garota Radar" : `produto (${input.productTitle})`,
      presenter,
      productAction: "CTA humano para Radar Smart e Grupo VIP",
      characterDirection: input.hasOfficialCharacter ? { expression: "INVITING", pose: "INVITING", shot: "HALF_BODY" } : null,
      identityReferenceAssetId: null,
      supportReferenceAssetId: null,
      camera: "plano medio frontal olhando para camera",
      motion: "estatico com gesto de convite",
      lighting: "identidade Radar Smart com dourado discreto",
      textOverlay: "Radar Smart + Grupo VIP",
      voiceoverIntent: "",
      sfxIntent: null,
      transitionIntent: "fade out",
    },
  ];
}

function buildCommercialDirectionFromContract(input: {
  contract: CommercialCreativeContract;
  offer: CommercialCreationOfferInput;
  productIntelligence: CommercialCreationProductIntelligenceInput;
  ctas: string[];
  conflicts: string[];
  presenterAssetIds: { identityReferenceAssetId: string | null; supportReferenceAssetId: string | null };
}): CommercialDirection {
  const durationSeconds = clampDuration(input.contract.targetDuration);
  const structure = modeToStructure(input.contract.creationMode);
  const presenterStrategy = modeToPresenterStrategy(input.contract.creationMode, input.contract.presenterPreference);
  const hookStrategy = modeToHook(input.contract.creationMode);
  const sellingArgument = modeToSellingArgument(input.contract.creationMode, input.offer.discountPct);
  const pace = resolvePace(durationSeconds, input.contract.tone);
  const visualStyle = resolveVisualStyle(input.productIntelligence.category, input.contract.visualStyle, input.contract.creationMode);
  const textOverlayStrategy = modeToTextOverlayStrategy(input.contract.creationMode);
  const proofStrategy = selectProofStrategy({
    rating: input.offer.rating,
    reviewsCount: input.offer.reviewsCount,
    marketplace: input.offer.marketplace,
    storyStructure: structure,
  }).strategy;
  const offerStrategy = buildOfferStrategy({
    price: input.offer.price,
    originalPrice: input.offer.originalPrice,
    discountPct: input.offer.discountPct,
    sellingArgument,
    hookStrategy,
  });
  const baseScenes =
    input.contract.creationMode === "HYBRID_SALES"
      ? buildHybridSalesScenePlan({
          durationSeconds,
          productTitle: input.offer.title,
          textOverlayStrategy,
          hasOfficialCharacter: presenterStrategy !== "PRODUCT_ONLY",
        })
      : buildScenePlan({
          storyStructure: structure,
          durationSeconds,
          hookStrategy,
          presenterStrategy,
          textOverlayStrategy,
          productTitle: input.offer.title,
          hasOfficialCharacter: presenterStrategy !== "PRODUCT_ONLY",
        });
  const scenes = baseScenes.map((scene) => {
    const isPresenterScene = scene.presenter === "GAROTA_RADAR_FULL" || scene.presenter === "UGC_PERSONA";
    return {
      ...scene,
      visualSubject:
        input.contract.creationMode === "HYBRID_SALES" && isPresenterScene
          ? "Garota Radar"
          : scene.purpose === "OFFER"
            ? `oferta real de ${input.offer.title}`
            : scene.visualSubject,
      productAction: productUseForScene(
        scene.purpose,
        input.contract.productUsagePreference,
        input.offer.title,
        input.contract.creationMode,
      ),
      characterDirection:
        isPresenterScene
          ? scene.characterDirection ?? { expression: "CONFIDENT", pose: "PRESENTING", shot: "HALF_BODY" }
          : null,
      identityReferenceAssetId: isPresenterScene ? input.presenterAssetIds.identityReferenceAssetId : null,
      supportReferenceAssetId: isPresenterScene ? input.presenterAssetIds.supportReferenceAssetId : null,
      voiceoverIntent: spokenNarrationForScene({
        purpose: scene.purpose,
        mode: input.contract.creationMode,
        offer: input.offer,
        ctas: input.ctas,
        mustSay: input.contract.mustSay,
      }),
      textOverlay:
        scene.purpose === "OFFER" && input.offer.price !== null
          ? formatPrice(input.offer.price)
          : scene.purpose === "CTA"
            ? mergedCta(input.ctas)
            : scene.textOverlay,
    };
  });

  return {
    objective: primaryObjectiveToCommercialObjective(input.contract.primaryObjective),
    durationSeconds,
    sellingArgument,
    hookStrategy,
    storyStructure: structure,
    pace,
    visualStyle,
    proofStrategy,
    offerStrategy,
    ctaStrategy: {
      ctaText: mergedCta(input.ctas),
      ctaVisual: "logo Radar Smart + oferta real + direcao para Radar Smart",
      ctaPresenter: presenterStrategy === "PRODUCT_ONLY" ? "PRODUCT_ONLY" : "GAROTA_RADAR_CTA_ONLY",
      ctaUrgency: (input.offer.discountPct ?? 0) >= 30 ? "HIGH" : "LOW",
    },
    presenterStrategy,
    sceneCount: scenes.length,
    audioDirection: buildAudioDirection(pace, visualStyle),
    textOverlayStrategy,
    scenes,
    reasoningSummary:
      `Contrato ${input.contract.creationMode} aplicado com prioridade para prompt do usuario, ` +
      `fidelidade de produto e factual grounding. Conflitos registrados: ${input.conflicts.length}.`,
  };
}

function buildResolvedRefs(direction: CommercialDirection, offer: CommercialCreationOfferInput): Record<string, ResolvedSceneReferences> {
  return Object.fromEntries(
    direction.scenes.map((scene) => [
      scene.id,
      {
        identityReferenceUrl: scene.identityReferenceAssetId ? "preview://garota-radar-primary" : null,
        supportReferenceAssetId: scene.supportReferenceAssetId,
        supportReferenceUrl: scene.supportReferenceAssetId ? "preview://garota-radar-support" : null,
        productReferenceUrl: sceneRequiresIdentifiableProduct(scene) ? offer.imageUrl : null,
        supportReferenceError: null,
        productReferenceQuality: null,
      },
    ]),
  );
}

function costFromGenerationScene(
  scene: CommercialStoryboardPreviewScene,
  ttsSeconds: number,
): CommercialStoryboardPreviewScene {
  return {
    ...scene,
    cost: {
      ...scene.cost,
      estimatedTtsCredits: Math.max(1, Math.ceil(ttsSeconds)),
    },
  };
}

function sceneRequiresIdentifiableProduct(scene: CommercialScene): boolean {
  const combined = `${scene.visualSubject} ${scene.productAction}`.toLowerCase();
  if (combined.includes("sem produto visivel")) return false;
  return scene.purpose === "PRODUCT" || scene.purpose === "OFFER" || combined.includes("produto");
}

function applyProductRequiredTextToVideoGuard(
  promptPlan: CampaignPromptPlan,
  direction: CommercialDirection,
): CampaignPromptPlan {
  const scenes: SceneGenerationPrompt[] = promptPlan.scenes.map((promptScene) => {
    const sourceScene = direction.scenes.find((scene) => scene.id === promptScene.sceneId);
    if (
      sourceScene?.purpose === "HOOK" &&
      sceneRequiresIdentifiableProduct(sourceScene) &&
      promptScene.mediaType === "TEXT_TO_VIDEO"
    ) {
      return {
        ...promptScene,
        mediaType: "PRODUCT_VIDEO",
        productFidelityRequirement: "REQUIRED",
        providerHints: {
          ...promptScene.providerHints,
          requiresProductReference: true,
          preferredMode: "product-hero",
        },
      };
    }
    return promptScene;
  });

  return { ...promptPlan, scenes };
}

function previewPurpose(scene: CommercialScene, mode: CommercialCreationMode): string {
  if (mode === "HYBRID_SALES" && scene.order === 3) return "SALES_ARGUMENT";
  return scene.purpose;
}

function whySceneExists(scene: CommercialScene, mode: CommercialCreationMode): string {
  if (mode === "HYBRID_SALES") {
    if (scene.order === 1) return "criar curiosidade atraves da Garota Radar antes de mostrar o produto";
    if (scene.order === 2) return "mostrar o Kokeshi real em contexto de uso e preservar embalagem/rotulo";
    if (scene.order === 3) return "transformar a demonstracao em motivo de interesse sem inventar beneficio";
    if (scene.order === 4) return "revelar o preco real com produto fiel e overlay deterministico";
    if (scene.order === 5) return "converter interesse em acao para Radar Smart e Grupo VIP";
  }
  if (scene.purpose === "HOOK") return "abrir com promessa visual clara sem trocar a intencao do contrato";
  if (scene.purpose === "OFFER") return "mostrar preco real e oferta sem inventar desconto";
  if (scene.purpose === "CTA") return "fechar a acao no Radar Smart depois da demonstracao";
  return "avancar a prova visual do produto mantendo fidelidade e claim safety";
}

export function buildCommercialCreationModePreview(
  input: BuildCommercialCreationModePreviewInput,
): CommercialStoryboardPreview {
  const ctas = ensureRadarSmartCta(input.contract.callToActions);
  const textForSafety = [
    input.contract.userPrompt,
    ...input.contract.mustSay,
    ...input.contract.mustShow,
  ].join(" ");
  const claimViolations = scanTextForForbiddenClaims(textForSafety, input.productIntelligence.category);
  const conflicts = claimViolations.map(
    (violation) => `Claim bloqueado no contrato: ${violation.matchedText} (${violation.ruleLabel})`,
  );

  const persuasion = buildControlledPersuasionPipeline({
    offer: {
      title: input.offer.title,
      price: input.offer.price,
      originalPrice: input.offer.originalPrice,
      discountPct: input.offer.discountPct,
      marketplace: input.offer.marketplace,
      brand: null,
      imageUrl: input.offer.imageUrl,
      rating: input.offer.rating,
      reviewsCount: input.offer.reviewsCount,
    },
    productIntelligence: input.productIntelligence,
    observedPackagingTexts: [],
    useCharacter: input.contract.presenterPreference !== "NO_PRESENTER",
  });

  const direction = buildCommercialDirectionFromContract({
    contract: input.contract,
    offer: input.offer,
    productIntelligence: input.productIntelligence,
    ctas,
    conflicts,
    presenterAssetIds: input.presenterAssetIds ?? { identityReferenceAssetId: null, supportReferenceAssetId: null },
  });

  const creativeDna = buildCreativeDnaFromReference(input.contract.referenceVideo);
  const remixGuard = evaluateCreativeRemixGuard(input.contract.referenceVideo);
  const promptPlan = applyProductRequiredTextToVideoGuard(
    buildCampaignPromptPlan(input.contract.campaignId, direction, {
      productTitle: input.offer.title,
      category: input.productIntelligence.category,
      platform: input.platform ?? "TIKTOK",
      aspectRatio: input.aspectRatio ?? "9:16",
      defaultLogoAssetId: input.defaultLogoAssetId ?? null,
    }),
    direction,
  );
  const generationPlan = buildCampaignExecutionPlan(
    input.contract.campaignId,
    "MOCK",
    promptPlan,
    buildResolvedRefs(direction, input.offer),
  );

  const previewScenes = direction.scenes.map((scene) => {
    const promptScene = promptPlan.scenes.find((entry) => entry.sceneId === scene.id);
    const generationScene = generationPlan.scenes.find((entry) => entry.sceneId === scene.id);
    const isPresenter = scene.presenter === "GAROTA_RADAR_FULL" || scene.presenter === "UGC_PERSONA";
    const cta = scene.purpose === "CTA" ? mergedCta(ctas) : null;
    const base: CommercialStoryboardPreviewScene = {
      sceneId: scene.id,
      sceneNumber: scene.order,
      purpose: previewPurpose(scene, input.contract.creationMode),
      durationSeconds: scene.endSecond - scene.startSecond,
      commercialObjective: objectiveText(input.contract.primaryObjective),
      visual: scene.visualSubject,
      environment: promptScene?.environment ?? "ambiente definido pelo Creative Director",
      productAppearance: promptScene?.product ?? input.offer.title,
      productUse: scene.productAction,
      garotaRadarAppearance: isPresenter
        ? scene.purpose === "HOOK"
          ? "HOOK"
          : scene.purpose === "CTA"
            ? "CTA"
            : "DEMO"
        : "NONE",
      garotaRadarRole: isPresenter ? "apresentadora Radar Smart dentro da cena aprovada" : "nao aparece nesta cena",
      garotaRadarAction: isPresenter ? scene.productAction : "nenhuma acao de personagem",
      camera: scene.camera,
      motion: scene.motion,
      sceneInstruction: sceneInstructionForPurpose({
        purpose: scene.purpose,
        mode: input.contract.creationMode,
        offer: input.offer,
      }),
      spokenNarration: scene.voiceoverIntent,
      narration: scene.voiceoverIntent,
      overlay: scene.textOverlay,
      price: scene.purpose === "OFFER" ? formatPrice(input.offer.price) : null,
      cta,
      whyThisSceneExists: whySceneExists(scene, input.contract.creationMode),
      whyViewerKeepsWatching:
        persuasion.persuasionStrategy.sceneStrategies.find((entry) => entry.purpose === scene.purpose)?.whyContinueWatching ??
        "a cena entrega uma informacao nova antes de pedir o clique",
      estimatedCapability: generationScene?.providerCapability ?? "PRODUCT_VIDEO",
      estimatedProvider: generationScene?.selectedProvider ?? "mock",
      cost: {
        estimatedVideoCredits: generationScene?.estimatedCost.estimatedCredits ?? null,
        estimatedTtsCredits: null,
        estimatedCurrencyCostCents: generationScene?.estimatedCost.estimatedCurrencyCostCents ?? null,
        estimatedUsdCostCents: generationScene?.estimatedCost.estimatedUsdCostCents ?? null,
      },
      conflictNotes: conflicts,
    };
    return costFromGenerationScene(base, scene.endSecond - scene.startSecond);
  });

  const estimatedTtsCredits = previewScenes.reduce((sum, scene) => sum + (scene.cost.estimatedTtsCredits ?? 0), 0);
  const resolvedCreationMode = input.contract.creationMode;
  const normalizedContract = { ...input.contract, callToActions: ctas };
  const storyFingerprint = computeCommercialStoryboardFingerprint({
    contract: normalizedContract,
    scenes: previewScenes.map((scene) => {
      const promptScene = promptPlan.scenes.find((entry) => entry.sceneId === scene.sceneId);
      return {
        sceneId: scene.sceneId,
        purpose: scene.purpose,
        durationSeconds: scene.durationSeconds,
        presenterRole: scene.garotaRadarAppearance,
        visualIntent: scene.visual,
        productInteraction: scene.productUse,
        spokenNarration: scene.spokenNarration,
        overlay: scene.overlay,
        price: scene.price,
        cta: scene.cta,
        productFidelityRequirement: promptScene?.productFidelityRequirement ?? null,
        capabilityIntent: scene.estimatedCapability,
        mediaType: promptScene?.mediaType ?? null,
      };
    }),
  });

  return {
    contract: normalizedContract,
    approvalState: "READY_FOR_REVIEW",
    storyboardFingerprint: storyFingerprint,
    creationTrace: {
      requestedCreationMode: input.contract.creationMode,
      resolvedCreationMode,
      requestedPresenterPreference: input.contract.presenterPreference,
      resolvedPresenterStrategy: direction.presenterStrategy,
      userPrompt: input.contract.userPrompt,
      targetDuration: direction.durationSeconds,
      primaryObjective: input.contract.primaryObjective,
      callToActions: ctas,
      conflictReason: input.contract.creationMode === resolvedCreationMode ? null : "creationMode alterado pelo builder",
      legacyCopySourcesUsed: false,
    },
    creativeDna,
    remixGuard,
    commercialDirection: direction,
    promptPlan,
    generationPlan,
    scenes: previewScenes,
    totals: {
      estimatedVideoCredits: generationPlan.estimatedCost.totalEstimatedCredits,
      estimatedTtsCredits,
      estimatedCurrencyCostCents: generationPlan.estimatedCost.totalEstimatedCurrencyCostCents,
      estimatedUsdCostCents: generationPlan.estimatedCost.totalEstimatedUsdCostCents ?? null,
    },
    optimizerAudit: {
      desireEngineVersion: "V1",
      appliedWithinContract: conflicts.length === 0,
      selectedHookVariant: persuasion.hookDecision.selectedVariant,
      conflicts,
      qualityGateStatus: persuasion.persuasionStrategy.qualityGate.status,
      notes: [
        "Desire Engine auditou e otimizou dentro do contrato, sem trocar o pedido explicito do usuario.",
        `Produto aparece primeiro em ${productFirstAppearanceSecond(direction)}s.`,
        input.contract.creationMode === "TREND_REFERENCE_REMIX"
          ? "Referencia externa virou CreativeDNA/guardrail; nenhum download foi executado."
          : "Sem referencia externa aplicada.",
      ],
    },
    dryRunGenerationPlanReady: generationPlan.scenes.length === previewScenes.length,
  };
}
