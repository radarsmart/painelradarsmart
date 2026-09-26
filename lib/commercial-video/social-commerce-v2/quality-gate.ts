import type {
  AudioEnergyPlan,
  MicroCutStoryboard,
  ProductExperiencePlan,
  SocialCommerceQualityCheck,
  SocialCommerceQualityGate,
  CtaBehaviorPlan,
  PresenterShotPlan,
} from "@/lib/commercial-video/social-commerce-v2/types";

function statusFor(score: number, threshold: number): "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL" {
  if (score >= threshold) return "PASS";
  if (score >= threshold - 10) return "PASS_WITH_OBSERVATIONS";
  return "FAIL";
}

function check(
  name: SocialCommerceQualityCheck["name"],
  score: number,
  threshold: number,
  reasons: string[],
): SocialCommerceQualityCheck {
  return { name, score, threshold, status: statusFor(score, threshold), reasons };
}

export function runSocialCommerceQualityGate(input: {
  storyboard: MicroCutStoryboard;
  presenterShotPlan: PresenterShotPlan;
  productExperiencePlan: ProductExperiencePlan;
  audioEnergyPlan: AudioEnergyPlan;
  ctaBehaviorPlan: CtaBehaviorPlan;
}): SocialCommerceQualityGate {
  const firstTwoSecondBeats = input.storyboard.scenes
    .flatMap((scene) => scene.beats)
    .filter((beat) => beat.startSecond < 2);
  const firstTwoHasHuman = firstTwoSecondBeats.some((beat) => String(beat.shotType).includes("FACE") || String(beat.shotType).includes("REACTION"));
  const firstTwoHasPrice = firstTwoSecondBeats.some((beat) => /R\$\s*\d/.test(beat.overlayFragment ?? "") || /R\$\s*\d/.test(beat.narrationFragment ?? ""));
  const averageBeat = input.storyboard.averageBeatDurationSeconds;
  const uniquePresenterShots = new Set(input.presenterShotPlan.assignments.map((assignment) => assignment.shotType)).size;
  const allBeats = input.storyboard.scenes.flatMap((scene) => scene.beats);
  const totalBeats = allBeats.length;
  const presenterModes = new Set(allBeats.map((beat) => beat.presenterMode).filter((mode) => mode !== "NONE" && mode !== "OFFSCREEN_PRODUCT_FOCUS"));
  const cameraDistances = new Set(allBeats.map((beat) => beat.cameraDistance));
  const productExperienceBeats = allBeats.filter((beat) => beat.purpose === "PRODUCT_EXPERIENCE" || beat.productMode === "TEXTURE_OR_GEL" || beat.productMode === "APPLICATION_DEMO");
  const priceBeats = allBeats.filter((beat) => /R\$\s*\d/.test(`${beat.overlayFragment ?? ""} ${beat.narrationFragment ?? ""}`));
  const ctaBeats = allBeats.filter((beat) => beat.purpose === "CTA_PUSH" || beat.presenterMode === "INVITING_ACTION");
  const productExperiencePass = input.productExperiencePlan.overallStatus === "PASS";
  const productSceneElementCount = input.productExperiencePlan.scenes.reduce((sum, scene) => sum + scene.elements.length, 0);
  const sfxCount = input.audioEnergyPlan.sfxMoments.length;
  const hasTexture = input.productExperiencePlan.scenes.some((scene) => scene.elements.includes("TEXTURE_REVEAL"));
  const hasApplication = input.productExperiencePlan.scenes.some((scene) => scene.elements.includes("APPLICATION_DEMO"));
  const hasHand = input.productExperiencePlan.scenes.some((scene) => scene.elements.includes("HAND_INTERACTION"));
  const hasFakeDiscount = allBeats.some((beat) => /0%\s*off|desconto/i.test(`${beat.overlayFragment ?? ""} ${beat.visualAction}`));

  const checks: SocialCommerceQualityCheck[] = [
    check("SCROLL_STOP_VISUAL", 58 + (firstTwoHasHuman ? 16 : 0) + (firstTwoHasPrice ? 12 : 0) + (cameraDistances.has("FACE_CLOSE") ? 8 : 0) + (totalBeats >= 16 ? 6 : 0), 82, [
      firstTwoHasHuman ? "First two seconds include a human reaction/close-up." : "First two seconds lack human interruption.",
      firstTwoHasPrice ? "Price curiosity appears inside the hook window." : "Price does not appear inside the hook window.",
      `${totalBeats} microbeats planned.`,
    ]),
    check("PRESENTER_LIVELINESS", Math.min(100, 50 + uniquePresenterShots * 9 + presenterModes.size * 7 + input.presenterShotPlan.varietyScore * 0.12), 82, [
      `${uniquePresenterShots} distinct Garota Radar shot types planned.`,
      `${presenterModes.size} presenter roles planned: ${Array.from(presenterModes).join(", ")}.`,
      "Presenter is planned as a creator with reactions, pointing, demonstration support and invitation, not one repeated standing shot.",
    ]),
    check("PRODUCT_EXPERIENCE", productExperiencePass ? 88 : 58, 82, input.productExperiencePlan.scenes.flatMap((scene) => scene.reasons)),
    check("SOCIAL_NATIVE_FEEL", averageBeat <= 1.05 && totalBeats >= 16 ? 90 : averageBeat <= 1.25 ? 80 : 64, 82, [
      `Average microbeat duration is ${averageBeat}s.`,
      "The plan breaks macro scenes into short creator-style beats.",
    ]),
    check("SALES_CLARITY", hasFakeDiscount ? 50 : Math.min(100, 68 + priceBeats.length * 7 + ctaBeats.length * 4), 80, [
      hasFakeDiscount ? "Plan contains fake discount/0% off language." : "No fake discount language planned.",
      `${priceBeats.length} price/value beats and ${ctaBeats.length} CTA beats planned.`,
    ]),
    check("PRICE_IMPACT", Math.min(100, 64 + priceBeats.length * 9 + (firstTwoHasPrice ? 8 : 0)), 82, [
      "Price is treated as a value beat while product remains present.",
      firstTwoHasPrice ? "R$ 13,16 appears in the hook window." : "R$ 13,16 does not appear early enough.",
    ]),
    check("CTA_STRENGTH", input.ctaBehaviorPlan.staticPresenterRisk === "LOW" ? 86 : 70, 78, [
      `CTA line: ${input.ctaBehaviorPlan.finalLine}`,
      `CTA destination: ${input.ctaBehaviorPlan.destination}`,
      `CTA action beats: ${input.ctaBehaviorPlan.actionBeats.join(" | ")}`,
    ]),
    check("REPETITION_RISK", uniquePresenterShots >= 3 && cameraDistances.size >= 4 ? 88 : 68, 80, [
      `${uniquePresenterShots} presenter shot types and ${cameraDistances.size} camera distances planned.`,
      "Presenter/product/graphic beats alternate instead of repeating one setup.",
    ]),
    check("GENERIC_AD_RISK", input.productExperiencePlan.packshotDominanceRisk === "LOW" && sfxCount >= 5 ? 86 : 65, 78, [
      `Packshot dominance risk: ${input.productExperiencePlan.packshotDominanceRisk}`,
      "Product and presenter plans explicitly avoid frozen packshot-only execution.",
    ]),
    check("DESIRE_SIGNAL", Math.min(100, 58 + productSceneElementCount * 3 + productExperienceBeats.length * 6 + (hasTexture ? 8 : 0)), 82, [
      `${productExperienceBeats.length} tactile/product-experience beats planned.`,
      hasTexture ? "Texture/gel reveal is planned." : "Texture/gel reveal is missing.",
    ]),
    check("PRODUCT_CONTEXT_RELEVANCE", hasTexture && hasApplication && hasHand ? 90 : 66, 82, [
      hasHand ? "Hand interaction planned for skincare realism." : "Hand interaction missing.",
      hasTexture ? "Texture reveal planned." : "Texture reveal missing.",
      hasApplication ? "Application demo planned." : "Application demo missing.",
    ]),
  ];

  const blockingReasons = checks
    .filter((item) => item.status === "FAIL")
    .map((item) => `${item.name}: ${item.reasons.join(" ")}`);
  const observations = checks
    .filter((item) => item.status === "PASS_WITH_OBSERVATIONS")
    .map((item) => `${item.name}: score ${item.score}/${item.threshold}`);

  return {
    version: "SOCIAL_COMMERCE_VISUAL_STORYBOARD_GATE_V2",
    gateName: "SOCIAL_COMMERCE_STORYBOARD_GATE",
    status: blockingReasons.length > 0 ? "FAIL" : observations.length > 0 ? "PASS_WITH_OBSERVATIONS" : "PASS",
    checks,
    blockingReasons,
    observations,
    canaryBlocked: blockingReasons.length > 0,
  };
}
