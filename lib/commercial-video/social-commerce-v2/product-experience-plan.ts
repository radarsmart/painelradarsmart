import type {
  ProductExperienceElement,
  ProductExperiencePlan,
  ProductExperienceScenePlan,
  SocialCommerceCurrentSceneInput,
} from "@/lib/commercial-video/social-commerce-v2/types";

function isProductScene(scene: SocialCommerceCurrentSceneInput): boolean {
  const purpose = String(scene.purpose);
  return purpose === "PRODUCT" || purpose === "PRODUCT_DEMONSTRATION" || purpose === "OFFER";
}

function inferElements(scene: SocialCommerceCurrentSceneInput): ProductExperienceElement[] {
  const text = `${scene.visual} ${scene.productUse}`.toLowerCase();
  const elements = new Set<ProductExperienceElement>();
  if (text.includes("textura") || text.includes("texture")) elements.add("TEXTURE_REVEAL");
  if (text.includes("aplicacao") || text.includes("aplica") || text.includes("application")) elements.add("APPLICATION_DEMO");
  if (text.includes("mao") || text.includes("hand") || text.includes("segur")) elements.add("HAND_INTERACTION");
  if (text.includes("embalagem") || text.includes("rotulo") || text.includes("label") || text.includes("packaging")) elements.add("PACKAGING_DETAIL");
  if (text.includes("contexto") || text.includes("skincare") || text.includes("uso")) elements.add("USAGE_CONTEXT");
  if (text.includes("beneficio") || text.includes("benefit") || text.includes("detalhe")) elements.add("BENEFIT_FOCUSED_DETAIL");
  return Array.from(elements);
}

function buildInstruction(scene: SocialCommerceCurrentSceneInput, elements: ProductExperienceElement[]): string {
  if (String(scene.purpose) === "OFFER") {
    return "Keep price deterministic as overlay, but avoid pure floating packshot: use packaging detail, hand-adjacent scale, or counter context.";
  }
  if (elements.includes("TEXTURE_REVEAL") || elements.includes("APPLICATION_DEMO")) {
    return "Prioritize macro texture/application while keeping the real package upright and readable.";
  }
  return "Add at least hand interaction, packaging detail and product-native context before any canary.";
}

export function buildProductExperiencePlan(currentScenes: SocialCommerceCurrentSceneInput[]): ProductExperiencePlan {
  const scenes: ProductExperienceScenePlan[] = currentScenes.filter(isProductScene).map((scene) => {
    let elements = inferElements(scene);
    if (String(scene.purpose) === "PRODUCT_DEMONSTRATION" || String(scene.purpose) === "PRODUCT") {
      elements = Array.from(new Set<ProductExperienceElement>([
        "HAND_INTERACTION",
        "TEXTURE_REVEAL",
        "APPLICATION_DEMO",
        "PACKAGING_DETAIL",
        "USAGE_CONTEXT",
        ...elements,
      ]));
    }
    if (String(scene.purpose) === "OFFER") {
      elements = Array.from(new Set<ProductExperienceElement>(["PACKAGING_DETAIL", "USAGE_CONTEXT", ...elements]));
    }
    const packshotOnly = elements.length === 0 || (elements.length === 1 && elements[0] === "PACKAGING_DETAIL");
    const required = true;
    const gateStatus = !required || (!packshotOnly && elements.length > 0) ? "PASS" : "FAIL";
    return {
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      required,
      elements,
      packshotOnly,
      instruction: buildInstruction(scene, elements),
      gateStatus,
      reasons: gateStatus === "PASS"
        ? ["Product scene has planned experience elements beyond a static packshot."]
        : ["Product scene is still packshot-only and cannot dominate a social commerce commercial."],
    };
  });

  const productScenes = scenes.length;
  const packshotOnlyCount = scenes.filter((scene) => scene.packshotOnly).length;
  const packshotRatio = productScenes === 0 ? 1 : packshotOnlyCount / productScenes;
  const packshotDominanceRisk = packshotRatio >= 0.75 ? "HIGH" : packshotRatio >= 0.4 ? "MEDIUM" : "LOW";
  const hasFail = scenes.some((scene) => scene.gateStatus === "FAIL");

  return {
    version: "PRODUCT_EXPERIENCE_LAYER_V1",
    scenes,
    packshotDominanceRisk,
    overallStatus: hasFail ? "FAIL" : packshotDominanceRisk === "MEDIUM" ? "PASS_WITH_OBSERVATIONS" : "PASS",
  };
}
