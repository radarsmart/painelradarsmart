import type {
  AudioEnergyPlan,
  BuildSocialCommerceExecutionPreflightInput,
  ExecutionGateStatus,
  ExecutionPreflightGate,
  MicroCutBeat,
  MicroCutScene,
  MicrobeatExecutionMapEntry,
  PresenterReferenceInput,
  PresenterShotRequirement,
  ProductExperienceReadiness,
  ProviderIfNeeded,
  SocialCommerceExecutionPreflight,
  VisualExecutionSource,
} from "@/lib/commercial-video/social-commerce-v2/types";

const HEYGEN_USD_PER_MINUTE_1080P = 4;
const KLING_CREDITS_PER_SECOND = 65;
const KLING_MIN_BILLABLE_SECONDS = 5;

function presenterAssetGroup(sceneId: string): "HEYGEN_SHOT_A" | "HEYGEN_SHOT_B" | "HEYGEN_SHOT_C" | null {
  if (sceneId === "scene-1") return "HEYGEN_SHOT_A";
  if (sceneId === "scene-3") return "HEYGEN_SHOT_B";
  if (sceneId === "scene-5") return "HEYGEN_SHOT_C";
  return null;
}

function isPresenterBeat(beat: MicroCutBeat): boolean {
  return !["OFFSCREEN_PRODUCT_FOCUS", "NONE"].includes(beat.presenterMode);
}

function isProductExperienceBeat(beat: MicroCutBeat): boolean {
  return ["TEXTURE_OR_GEL", "APPLICATION_DEMO", "PACKAGING_DETAIL"].includes(beat.productMode) ||
    ["PRODUCT_DETAIL", "PRODUCT_EXPERIENCE"].includes(beat.purpose);
}

function isOverlayBeat(beat: MicroCutBeat): boolean {
  return Boolean(beat.overlayIntent || beat.overlayFragment || beat.shotType === "GRAPHIC_PRICE_CARD");
}

function hasSfx(beat: MicroCutBeat): boolean {
  return Boolean(beat.sfxCue);
}

function secondaryOperationsForBeat(beat: MicroCutBeat): VisualExecutionSource[] {
  const operations: VisualExecutionSource[] = [];
  if (["PUSH_IN", "SNAP_ZOOM"].includes(beat.cameraMotion)) operations.push("EDITORIAL_ZOOM");
  if (beat.cameraDistance === "FACE_CLOSE" || beat.cameraDistance === "MEDIUM_CLOSE") operations.push("EDITORIAL_CROP");
  if (isOverlayBeat(beat)) operations.push("OVERLAY_MOTION");
  if (hasSfx(beat)) operations.push("SFX_EVENT");
  if (beat.transition !== "HARD_CUT") operations.push("TRANSITION");
  return [...new Set(operations)];
}

function providerForBeat(scene: MicroCutScene, beat: MicroCutBeat): ProviderIfNeeded {
  if (isPresenterBeat(beat) && presenterAssetGroup(scene.sceneId)) return "HEYGEN";
  if (scene.sceneId === "scene-2" && isProductExperienceBeat(beat)) return "KLING";
  return "NONE";
}

function visualSourceForBeat(scene: MicroCutScene, beat: MicroCutBeat): VisualExecutionSource {
  if (scene.sceneId === "scene-1" && beat.beatIndex === 1) return "NEW_PROVIDER_ASSET";
  if (scene.sceneId === "scene-3" && beat.beatIndex === 1) return "NEW_PROVIDER_ASSET";
  if (scene.sceneId === "scene-5" && beat.beatIndex === 1) return "NEW_PROVIDER_ASSET";
  if (scene.sceneId === "scene-2" && beat.beatIndex === 3) return "NEW_PROVIDER_ASSET";
  if (isOverlayBeat(beat) && !isPresenterBeat(beat)) return "OVERLAY_MOTION";
  if (scene.sceneId === "scene-2" && isProductExperienceBeat(beat)) return "PRODUCT_CUTAWAY";
  if (scene.sceneId === "scene-4" && beat.productMode === "PRICE_ANCHOR") return "STATIC_REFERENCE";
  if (isPresenterBeat(beat)) return "REUSE_PROVIDER_ASSET";
  if (beat.cameraMotion === "PUSH_IN") return "EDITORIAL_ZOOM";
  return "STATIC_REFERENCE";
}

function providerAssetGroupForBeat(scene: MicroCutScene, beat: MicroCutBeat): string | null {
  const presenterGroup = presenterAssetGroup(scene.sceneId);
  if (isPresenterBeat(beat) && presenterGroup) return presenterGroup;
  if (scene.sceneId === "scene-2" && isProductExperienceBeat(beat)) return "KLING_PRODUCT_EXPERIENCE_A";
  if (scene.sceneId === "scene-4") return "PRODUCT_STATIC_REFERENCE_A";
  return null;
}

function needsUnsupportedTextureOrApplicationGuard(beat: MicroCutBeat, readiness: ProductExperienceReadiness): boolean {
  const asksForTexture = beat.productMode === "TEXTURE_OR_GEL" || /textura|texture|creme|gel/i.test(beat.productInteraction);
  const asksForApplication = beat.productMode === "APPLICATION_DEMO" || /aplicacao|aplica|application|facial/i.test(beat.productInteraction);
  return (asksForTexture && readiness.TEXTURE_REFERENCE_READY === "NO") ||
    (asksForApplication && readiness.APPLICATION_REFERENCE_READY === "NO");
}

function productActionForBeat(beat: MicroCutBeat, readiness: ProductExperienceReadiness): string {
  if (!needsUnsupportedTextureOrApplicationGuard(beat, readiness)) return beat.productInteraction;
  return "produto real nas maos/manuseio com rotulo legivel; sem mostrar textura, gel ou aplicacao facial inventada";
}

function overlayForBeat(beat: MicroCutBeat, readiness: ProductExperienceReadiness): string | null {
  const overlay = beat.overlayIntent ?? beat.overlayFragment;
  if (!overlay || !needsUnsupportedTextureOrApplicationGuard(beat, readiness)) return overlay;
  if (/textura|texture|creme|gel|aplic/i.test(overlay)) return "ROTULO LEGIVEL";
  return overlay;
}

function sfxForBeat(beat: MicroCutBeat, readiness: ProductExperienceReadiness): string | null {
  if (!beat.sfxCue || !needsUnsupportedTextureOrApplicationGuard(beat, readiness)) return beat.sfxCue;
  if (/cream|texture|gel/i.test(beat.sfxCue)) return "soft-tap";
  return beat.sfxCue;
}

function buildTimeline(input: BuildSocialCommerceExecutionPreflightInput, readiness: ProductExperienceReadiness): MicrobeatExecutionMapEntry[] {
  return input.plan.microCutStoryboard.scenes.flatMap((scene) =>
    scene.beats.map((beat) => {
      const provider = providerForBeat(scene, beat);
      const visualSource = visualSourceForBeat(scene, beat);
      return {
        timeStart: beat.startSecond,
        timeEnd: beat.endSecond,
        macroScene: String(scene.macroPurpose),
        microbeat: beat.beatId,
        beatIndex: beat.beatIndex,
        visualSource,
        secondaryOperations: secondaryOperationsForBeat(beat),
        assetIdOrReference: providerAssetGroupForBeat(scene, beat),
        presenterShot: String(beat.shotType),
        productAction: productActionForBeat(beat, readiness),
        editorialAction: `${beat.cameraDistance}/${beat.cameraMotion}`,
        overlay: overlayForBeat(beat, readiness),
        sfx: sfxForBeat(beat, readiness),
        narration: beat.narrationFragment,
        providerIfNeeded: provider,
        providerAssetGroup: providerAssetGroupForBeat(scene, beat),
        framingVariation: (["EDITORIAL_CROP", "EDITORIAL_ZOOM"] as VisualExecutionSource[]).some((operation) =>
          secondaryOperationsForBeat(beat).includes(operation),
        ),
        performanceVariation: visualSource === "NEW_PROVIDER_ASSET" || visualSource === "REUSE_PROVIDER_ASSET",
      };
    }),
  );
}

function referenceHasShot(reference: PresenterReferenceInput, shots: string[]): boolean {
  const shot = reference.metadata.shot ?? reference.metadata.referenceType;
  return Boolean(shot && shots.includes(shot));
}

function referenceHasExpression(reference: PresenterReferenceInput, expressions: string[]): boolean {
  const expression = reference.metadata.expression;
  return Boolean(expression && expressions.includes(expression));
}

function referenceHasPose(reference: PresenterReferenceInput, poses: string[]): boolean {
  const pose = reference.metadata.pose;
  return Boolean(pose && poses.includes(pose));
}

function compatibleReferences(
  references: PresenterReferenceInput[],
  requirement: Pick<PresenterShotRequirement, "requiredShotTypes" | "requiredExpressions" | "requiredPoses">,
): PresenterReferenceInput[] {
  return references.filter((reference) =>
    referenceHasShot(reference, requirement.requiredShotTypes) &&
    (referenceHasExpression(reference, requirement.requiredExpressions) || referenceHasPose(reference, requirement.requiredPoses)),
  );
}

function hasOnlyFullBodyOrPrimary(references: PresenterReferenceInput[]): boolean {
  if (references.length === 0) return false;
  return references.every((reference) => {
    const shot = reference.metadata.shot ?? reference.metadata.referenceType;
    return shot === "FULL_BODY" || reference.metadata.referenceType === "PRIMARY" || reference.metadata.isPrimary === true;
  });
}

function buildPresenterRequirement(
  references: PresenterReferenceInput[],
  base: Omit<PresenterShotRequirement, "referenceAvailable" | "referenceCompatibleWithShot" | "matchedReferenceIds" | "framingVariation" | "performanceVariation" | "gaps">,
): PresenterShotRequirement {
  const matches = compatibleReferences(references, base);
  const onlyFullBody = hasOnlyFullBodyOrPrimary(references);
  const gaps: string[] = [];
  if (references.length === 0) gaps.push("Nenhuma referencia da Garota Radar cadastrada para auditar este shot.");
  if (onlyFullBody) gaps.push("Referencias existentes parecem PRIMARY/FULL_BODY; crop ajuda enquadramento, mas nao cria expressao, gesto ou pose.");
  if (matches.length === 0) {
    gaps.push(`Falta referencia compativel com ${base.framing}, expressao ${base.expression} e gesto ${base.gesture}.`);
  }

  return {
    ...base,
    referenceAvailable: references.length > 0 ? "YES" : "NO",
    referenceCompatibleWithShot: matches.length > 0 ? "YES" : "NO",
    matchedReferenceIds: matches.map((reference) => reference.id),
    framingVariation: references.length > 0 ? "YES" : "NO",
    performanceVariation: matches.length > 0 ? "YES" : "NO",
    gaps,
  };
}

function buildPresenterShotRequirements(references: PresenterReferenceInput[]): PresenterShotRequirement[] {
  return [
    buildPresenterRequirement(references, {
      requirementId: "SHOT_A",
      purpose: "HOOK",
      framing: "MEDIUM_CLOSE_UP",
      expression: "excited discovery",
      gesture: "attention / look what I found",
      requiredShotTypes: ["CLOSE_UP", "HEADSHOT", "BUST", "HALF_BODY", "EXPRESSION"],
      requiredExpressions: ["EXCITED", "SURPRISED", "HAPPY", "SMILING", "INVITING"],
      requiredPoses: ["LEANING", "PRESENTING", "POINTING", "INVITING"],
    }),
    buildPresenterRequirement(references, {
      requirementId: "SHOT_B",
      purpose: "SALES_ARGUMENT",
      framing: "WAIST_UP",
      expression: "amused / impressed",
      gesture: "recommendation",
      requiredShotTypes: ["HALF_BODY", "THREE_QUARTER_BODY", "BUST"],
      requiredExpressions: ["CONFIDENT", "HAPPY", "SMILING", "EXCITED"],
      requiredPoses: ["PRESENTING", "POINTING", "LEANING"],
    }),
    buildPresenterRequirement(references, {
      requirementId: "SHOT_C",
      purpose: "CTA",
      framing: "MEDIUM_CLOSE_UP",
      expression: "inviting / energetic",
      gesture: "invitation / pointing",
      requiredShotTypes: ["CLOSE_UP", "HEADSHOT", "BUST", "HALF_BODY", "EXPRESSION"],
      requiredExpressions: ["INVITING", "EXCITED", "HAPPY", "SMILING"],
      requiredPoses: ["INVITING", "POINTING", "POINTING_UP", "PRESENTING"],
    }),
  ];
}

function buildProductReadiness(input: BuildSocialCommerceExecutionPreflightInput): ProductExperienceReadiness {
  const packshotReady = Boolean(input.productReferences.packshotReferenceUrl);
  const handInteractionReady =
    input.productReferences.handInteractionReferenceUrls.length > 0 ||
    input.productReferences.demoReferenceUrls.length > 0;
  const skincareContextReady =
    input.productReferences.skincareContextReferenceUrls.length > 0 ||
    input.productReferences.demoReferenceUrls.length > 0 ||
    handInteractionReady;
  const benefitContextReady = input.productReferences.benefitContextReferenceUrls.length > 0;
  const demoReady = handInteractionReady && skincareContextReady;
  const textureReady = input.productReferences.textureReferenceUrls.length > 0;
  const applicationReady = input.productReferences.applicationReferenceUrls.length > 0;
  const gaps: string[] = [];
  const observations: string[] = [];
  if (!packshotReady) gaps.push("PACKSHOT_REFERENCE_READY=NO: oferta nao tem image_url real.");
  if (!handInteractionReady) gaps.push("HAND_INTERACTION_REFERENCE_READY=NO: nao ha referencia real de produto nas maos/manuseio.");
  if (!skincareContextReady) gaps.push("SKINCARE_CONTEXT_REFERENCE_READY=NO: nao ha referencia real de contexto skincare.");
  if (!textureReady) observations.push("TEXTURE_REFERENCE_READY=NO: nao inventar creme/gel visivel; manter experiencia em manuseio real.");
  if (!applicationReady) observations.push("APPLICATION_REFERENCE_READY=NO: nao inventar aplicacao facial; usar produto na mao, rotulo e manuseio.");
  return {
    PACKSHOT_REFERENCE_READY: packshotReady ? "YES" : "NO",
    HAND_INTERACTION_REFERENCE_READY: handInteractionReady ? "YES" : "NO",
    SKINCARE_CONTEXT_REFERENCE_READY: skincareContextReady ? "YES" : "NO",
    BENEFIT_CONTEXT_REFERENCE_READY: benefitContextReady ? "YES" : "NO",
    DEMO_REFERENCE_READY: demoReady ? "YES" : "NO",
    TEXTURE_REFERENCE_READY: textureReady ? "YES" : "NO",
    APPLICATION_REFERENCE_READY: applicationReady ? "YES" : "NO",
    REAL_PRODUCT_INTERACTION_READY: packshotReady && handInteractionReady && skincareContextReady ? "YES" : "NO",
    SUPPORT_GROUNDED_PRODUCT_EXPERIENCE_READY: packshotReady && handInteractionReady && skincareContextReady ? "YES" : "NO",
    gaps,
    observations,
  };
}

function sumNarrationCharacters(input: BuildSocialCommerceExecutionPreflightInput): number {
  return input.plan.microCutStoryboard.scenes.reduce(
    (sceneSum, scene) =>
      sceneSum + scene.beats.reduce((beatSum, beat) => beatSum + (beat.narrationFragment?.length ?? 0), 0),
    0,
  );
}

function sfxMomentsForPreflight(input: BuildSocialCommerceExecutionPreflightInput, readiness: ProductExperienceReadiness): AudioEnergyPlan["sfxMoments"] {
  const unsupportedTextureOrApplication =
    readiness.TEXTURE_REFERENCE_READY === "NO" || readiness.APPLICATION_REFERENCE_READY === "NO";
  return input.plan.audioEnergyPlan.sfxMoments.map((moment) => {
    if (!unsupportedTextureOrApplication || !/cream|texture|gel/i.test(moment.cue)) return moment;
    return {
      ...moment,
      cue: "soft-tap",
      reason: "Supports product handling without implying visible texture/application generation.",
    };
  });
}

function plannedAssetGroups(input: BuildSocialCommerceExecutionPreflightInput, presenterReady: boolean, productReady: boolean) {
  return [
    {
      groupId: "HEYGEN_SHOT_A",
      provider: "HEYGEN" as const,
      purpose: "Garota Radar hook: close/meio-corpo com surpresa e energia.",
      coveredMicrobeats: ["scene-1-beat-1", "scene-1-beat-2", "scene-1-beat-4"],
      durationSeconds: 3,
      referenceStatus: presenterReady ? "READY" as const : "GAP" as const,
    },
    {
      groupId: "HEYGEN_SHOT_B",
      provider: "HEYGEN" as const,
      purpose: "Garota Radar argumento: cintura para cima com recomendacao.",
      coveredMicrobeats: ["scene-3-beat-1", "scene-3-beat-3"],
      durationSeconds: 3,
      referenceStatus: presenterReady ? "READY" as const : "GAP" as const,
    },
    {
      groupId: "HEYGEN_SHOT_C",
      provider: "HEYGEN" as const,
      purpose: "Garota Radar CTA: convite/apontando.",
      coveredMicrobeats: ["scene-5-beat-1", "scene-5-beat-2", "scene-5-beat-3"],
      durationSeconds: 3,
      referenceStatus: presenterReady ? "READY" as const : "GAP" as const,
    },
    {
      groupId: "KLING_PRODUCT_EXPERIENCE_A",
      provider: "KLING" as const,
      purpose: "Produto Kokeshi em interacao real: produto na mao, rotulo legivel, manuseio natural e contexto skincare.",
      coveredMicrobeats: ["scene-2-beat-2", "scene-2-beat-3", "scene-2-beat-4"],
      durationSeconds: 3,
      referenceStatus: productReady ? "READY" as const : "GAP" as const,
    },
  ];
}

function gate(name: ExecutionPreflightGate["name"], status: ExecutionGateStatus, reasons: string[]): ExecutionPreflightGate {
  return { name, status, reasons };
}

export function buildSocialCommerceExecutionPreflight(input: BuildSocialCommerceExecutionPreflightInput): SocialCommerceExecutionPreflight {
  const productExperienceReadiness = buildProductReadiness(input);
  const timeline = buildTimeline(input, productExperienceReadiness);
  const totalMicrobeats = timeline.length;
  const presenterShotRequirements = buildPresenterShotRequirements(input.presenterReferences);
  const presenterGaps = presenterShotRequirements.flatMap((requirement) =>
    requirement.gaps.map((gapText) => `${requirement.requirementId}/${requirement.purpose}: ${gapText}`),
  );
  const productGaps = productExperienceReadiness.gaps;
  const presenterReady = presenterShotRequirements.every((requirement) =>
    requirement.referenceAvailable === "YES" &&
    requirement.referenceCompatibleWithShot === "YES" &&
    requirement.performanceVariation === "YES",
  );
  const productReady =
    productExperienceReadiness.PACKSHOT_REFERENCE_READY === "YES" &&
    productExperienceReadiness.HAND_INTERACTION_REFERENCE_READY === "YES" &&
    productExperienceReadiness.SKINCARE_CONTEXT_REFERENCE_READY === "YES" &&
    productExperienceReadiness.SUPPORT_GROUNDED_PRODUCT_EXPERIENCE_READY === "YES";
  const groups = plannedAssetGroups(input, presenterReady, productReady);
  const heygenCalls = groups.filter((group) => group.provider === "HEYGEN").length;
  const klingCalls = groups.filter((group) => group.provider === "KLING").length;
  const elevenLabsCharacters = sumNarrationCharacters(input);
  const sfxMoments = sfxMomentsForPreflight(input, productExperienceReadiness);
  const copyReady = elevenLabsCharacters > 0;
  const timingReady = input.plan.microCutStoryboard.totalDurationSeconds > 0 &&
    input.plan.microCutStoryboard.scenes.every((scene) => scene.endSecond > scene.startSecond);
  const audioReady = copyReady && timingReady && input.plan.audioEnergyPlan.silenceRisk === "LOW" && sfxMoments.length >= 4;
  const visualNewProviderAssets = groups.length;
  const efficiencyPass = visualNewProviderAssets <= 5 && visualNewProviderAssets < totalMicrobeats / 2;
  const heygenFeasibility = presenterReady ? "HIGH" : input.presenterReferences.length > 0 ? "LOW" : "LOW";
  const klingFeasibility = productReady
    ? "HIGH"
    : productExperienceReadiness.PACKSHOT_REFERENCE_READY === "YES"
      ? "LOW"
      : "LOW";
  const gates = [
    gate(
      "MICROBEAT_EXECUTION_EFFICIENCY",
      efficiencyPass ? "PASS" : "FAIL",
      [
        `${totalMicrobeats} microbeats mapeados para ${visualNewProviderAssets} assets generativos visuais, usando reuso/editorial/overlay/SFX para ritmo.`,
      ],
    ),
    gate(
      "PRESENTER_VISUAL_VARIETY_READY",
      presenterReady ? "PASS" : "FAIL",
      presenterReady
        ? ["Referencias de hook, argumento e CTA tem shot/performance compativeis."]
        : presenterGaps,
    ),
    gate(
      "PRODUCT_EXPERIENCE_EXECUTABLE",
      productReady ? "PASS" : "FAIL",
      productReady
        ? [
          "Packshot, produto nas maos/manuseio e contexto skincare tem referencias reais; textura/aplicacao nao serao inventadas.",
          ...productExperienceReadiness.observations,
        ]
        : productGaps,
    ),
    gate(
      "SHOT_REFERENCE_READINESS",
      presenterReady ? "PASS" : "FAIL",
      presenterReady
        ? ["Os requirements SHOT_A/SHOT_B/SHOT_C estao cobertos."]
        : ["O storyboard textual exige performance; as referencias atuais nao cobrem todos os shots."],
    ),
    gate(
      "AUDIO_ENERGY_EXECUTABLE",
      audioReady ? "PASS" : "FAIL",
      audioReady
        ? ["Copy, timing, music bed continuo e SFX estao planejados sem gerar TTS."]
        : ["Audio plan incompleto para timing/copy/SFX/silence risk."],
    ),
  ];
  const finalPass = gates.every((entry) => entry.status === "PASS");
  const reusedBeats = timeline.filter((entry) => entry.visualSource === "REUSE_PROVIDER_ASSET").length;
  const editorialOnlyBeats = timeline.filter((entry) =>
    entry.providerIfNeeded === "NONE" &&
    entry.visualSource !== "REUSE_PROVIDER_ASSET" &&
    entry.visualSource !== "NEW_PROVIDER_ASSET",
  ).length;

  return {
    version: "SOCIAL_COMMERCE_EXECUTION_PREFLIGHT_V1",
    campaignId: input.campaignId,
    totalMicrobeats,
    timeline,
    presenterShotRequirements,
    productExperienceReadiness,
    plannedGenerativeAssetGroups: groups,
    totals: {
      TOTAL_MICROBEATS: totalMicrobeats,
      NEW_PROVIDER_ASSETS_REQUIRED: visualNewProviderAssets,
      EDITORIAL_ONLY_BEATS: editorialOnlyBeats,
      REUSED_BEATS: reusedBeats,
      HEYGEN_NEW_ASSETS_REQUIRED: heygenCalls,
      KLING_NEW_ASSETS_REQUIRED: klingCalls,
      OTHER_GENERATIVE_ASSETS_REQUIRED: 0,
      HEYGEN_CALLS_PLANNED: heygenCalls,
      KLING_CALLS_PLANNED: klingCalls,
      ELEVENLABS_CALLS_PLANNED: copyReady ? 1 : 0,
    },
    audioPlan: {
      voiceId: input.voiceCandidate.voiceId,
      model: input.voiceCandidate.model,
      copyReady: copyReady ? "YES" : "NO",
      timingReady: timingReady ? "YES" : "NO",
      CONTINUOUS_MUSIC_BED: "YES",
      sfxMoments,
      silenceRisk: input.plan.audioEnergyPlan.silenceRisk,
      generationAction: "PLAN_ONLY_NO_TTS",
    },
    feasibility: {
      HEYGEN_PRESENTER_FEASIBILITY: heygenFeasibility,
      KLING_PRODUCT_EXPERIENCE_FEASIBILITY: klingFeasibility,
      reasons: [
        presenterReady
          ? "HeyGen tem 3 referencias funcionais planejadas para HOOK/ARGUMENTO/CTA."
          : "HeyGen nao deve ser considerado pronto quando as referencias da Garota Radar nao trazem pose/expressao/shot adequados.",
        productReady
          ? "Kling teria referencias suficientes para interacao realista com produto, sem exigir textura/aplicacao inventada."
          : "Kling nao deve partir so de packshot quando a cena exige manuseio/contexto de skincare.",
      ],
    },
    estimatedCosts: {
      HEYGEN: {
        numberOfGenerationCalls: heygenCalls,
        estimatedUsd: Number(((heygenCalls * 3 * HEYGEN_USD_PER_MINUTE_1080P) / 60).toFixed(2)),
      },
      KLING: {
        numberOfGenerationCalls: klingCalls,
        billableDurationSeconds: klingCalls > 0 ? KLING_MIN_BILLABLE_SECONDS : 0,
        estimatedCredits: klingCalls > 0 ? KLING_MIN_BILLABLE_SECONDS * KLING_CREDITS_PER_SECOND : 0,
      },
      ELEVENLABS: {
        numberOfGenerationCalls: copyReady ? 1 : 0,
        characters: elevenLabsCharacters,
        estimatedCredits: elevenLabsCharacters,
      },
      WAN: {
        numberOfGenerationCalls: 0,
        estimatedCredits: 0,
      },
    },
    gates,
    gaps: {
      PRESENTER_REFERENCE_GAPS: presenterGaps,
      PRODUCT_REFERENCE_GAPS: productGaps,
    },
    result: {
      MICROBEAT_EXECUTION_EFFICIENCY: gates.find((entry) => entry.name === "MICROBEAT_EXECUTION_EFFICIENCY")?.status ?? "FAIL",
      PRESENTER_VISUAL_VARIETY_READY: presenterReady ? "YES" : "NO",
      PRODUCT_EXPERIENCE_EXECUTABLE: productReady ? "YES" : "NO",
      AUDIO_ENERGY_EXECUTABLE: audioReady ? "YES" : "NO",
      SOCIAL_COMMERCE_EXECUTION_PREFLIGHT: finalPass ? "PASS" : "FAIL",
      READY_FOR_PAID_SOCIAL_COMMERCE_CANARY: finalPass ? "YES" : "NO",
    },
    safety: {
      providersCalled: 0,
      mediaGenerated: 0,
      uploads: 0,
      publications: 0,
      remoteWrites: 0,
    },
  };
}
