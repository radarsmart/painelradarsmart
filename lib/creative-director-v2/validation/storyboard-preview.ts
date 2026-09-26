// Radar Creative AI - Creative Director V2 / Validation / Storyboard Preview
//
// So FORMATA a saida ja calculada de CommercialCreativeDirectionV2 num
// storyboard legivel por humano - nao decide nada novo, nao gera
// imagem/video. productScale/productPosition sao recalculados POR CENA
// reaproveitando as mesmas funcoes puras que o V2 ja usa no nivel de
// campanha (selectProductScaleTarget/selectProductPositionStrategy) -
// nenhuma logica nova de decisao.

import type { CommercialCreativeDirectionV2, SceneBlueprintV2 } from "@/lib/creative-director-v2/types";
import { selectProductScaleTarget, selectProductPositionStrategy } from "@/lib/creative-director-v2/product-presentation";
import type { StoryboardPreview, StoryboardScenePreview } from "@/lib/creative-director-v2/validation/types";

function formatOverlays(blueprint: SceneBlueprintV2): string {
  const { overlayInstructions, safeAreaDirection, brandOverlayRequired } = blueprint.overlayPlan;
  const parts: string[] = [];
  if (overlayInstructions.priceText) parts.push(`preco="${overlayInstructions.priceText}"`);
  if (overlayInstructions.discountText) parts.push(`desconto="${overlayInstructions.discountText}"`);
  if (overlayInstructions.ctaText) parts.push(`cta="${overlayInstructions.ctaText}"`);
  if (brandOverlayRequired) parts.push("logo Radar Smart obrigatorio");
  parts.push(`area segura=${safeAreaDirection}`);
  return parts.length > 0 ? parts.join(", ") : "sem overlay nesta cena";
}

function formatOfferElements(blueprint: SceneBlueprintV2): string {
  if (blueprint.purpose !== "OFFER") return "n/a (nao e a cena de oferta)";
  const { priceText, discountText } = blueprint.overlayPlan.overlayInstructions;
  if (!priceText && !discountText) return "sem preco/desconto real disponivel para mostrar";
  return [priceText ? `preco ${priceText}` : null, discountText ? discountText : null].filter(Boolean).join(" + ");
}

function formatCta(blueprint: SceneBlueprintV2, v2: CommercialCreativeDirectionV2): string {
  if (blueprint.purpose !== "CTA") return "n/a (nao e a cena de CTA)";
  const { ctaVisualAction, ctaCharacterGesture, ctaText } = v2.ctaDirection;
  return `"${ctaText}" - acao=${ctaVisualAction}${ctaCharacterGesture ? `, gesto="${ctaCharacterGesture}"` : ""}`;
}

function formatCharacterAction(blueprint: SceneBlueprintV2): string {
  const role = blueprint.characterRole;
  if (role.role === "NONE") return "sem apresentadora nesta cena";
  return `entra via "${role.entrance}", fala "${role.line}", emocao ${role.emotion}, gesto ${role.gesture}`;
}

function formatWhatUserSees(blueprint: SceneBlueprintV2): string {
  return `${blueprint.environmentDirection}; sujeito principal: ${blueprint.subjectPriority.toLowerCase()}; ${blueprint.visualObjective}`;
}

function formatVisualEffects(blueprint: SceneBlueprintV2): string {
  const { effects, productSafeOnly } = blueprint.effectDirection;
  const list = effects.join(", ");
  return productSafeOnly ? `${list} (restrito: nao pode redesenhar o produto real)` : list;
}

function formatNarrationIntent(blueprint: SceneBlueprintV2): string {
  const { intent, tone, energy, messagePriority } = blueprint.narrationRole;
  return `${intent} (tom ${tone}, energia ${energy}, prioridade da mensagem ${messagePriority})`;
}

export function buildStoryboardScenePreview(blueprint: SceneBlueprintV2, v2: CommercialCreativeDirectionV2): StoryboardScenePreview {
  const productScaleTarget = selectProductScaleTarget(blueprint.productPresentationStrategy);
  const productPositionStrategy = selectProductPositionStrategy(blueprint.overlayPlan.safeAreaDirection);

  return {
    scene: blueprint.sceneId,
    purpose: blueprint.purpose,
    durationSeconds: blueprint.desiredDuration,
    creativeIntent: blueprint.creativeIntent,
    whatUserSees: formatWhatUserSees(blueprint),
    productRole: blueprint.productRole,
    productScale: blueprint.productRole === "NONE" ? "n/a" : productScaleTarget,
    productPosition: blueprint.productRole === "NONE" ? "n/a" : productPositionStrategy,
    characterRole: blueprint.characterRole.role,
    characterAction: formatCharacterAction(blueprint),
    camera: blueprint.cameraDirection,
    motion: blueprint.motionDirection,
    environment: blueprint.environmentDirection,
    visualEffects: formatVisualEffects(blueprint),
    narrationIntent: formatNarrationIntent(blueprint),
    offerElements: formatOfferElements(blueprint),
    overlays: formatOverlays(blueprint),
    cta: formatCta(blueprint, v2),
    transition: blueprint.transitionIntent,
    whyThisSceneExists: `${blueprint.creativeIntent} (prioridade: ${blueprint.narrationRole.messagePriority})`,
  };
}

export function buildStoryboardPreview(v2: CommercialCreativeDirectionV2): StoryboardPreview {
  return {
    campaignSummary: v2.reasoningSummary,
    scenes: v2.sceneBlueprints.map((blueprint) => buildStoryboardScenePreview(blueprint, v2)),
  };
}

export function buildStoryboardPreviewMarkdown(preview: StoryboardPreview): string {
  const lines: string[] = ["# Storyboard Preview (Creative Director V2)", "", preview.campaignSummary, ""];

  for (const scene of preview.scenes) {
    lines.push(`## ${scene.scene} - ${scene.purpose} (${scene.durationSeconds}s)`, "");
    lines.push(`- **CREATIVE INTENT**: ${scene.creativeIntent}`);
    lines.push(`- **WHAT USER SEES**: ${scene.whatUserSees}`);
    lines.push(`- **PRODUCT ROLE**: ${scene.productRole}`);
    lines.push(`- **PRODUCT SCALE / POSITION**: ${scene.productScale} / ${scene.productPosition}`);
    lines.push(`- **CHARACTER ROLE**: ${scene.characterRole}`);
    lines.push(`- **CHARACTER ACTION**: ${scene.characterAction}`);
    lines.push(`- **CAMERA**: ${scene.camera}`);
    lines.push(`- **MOTION**: ${scene.motion}`);
    lines.push(`- **ENVIRONMENT**: ${scene.environment}`);
    lines.push(`- **VISUAL EFFECTS**: ${scene.visualEffects}`);
    lines.push(`- **NARRATION INTENT**: ${scene.narrationIntent}`);
    lines.push(`- **OFFER ELEMENTS**: ${scene.offerElements}`);
    lines.push(`- **OVERLAYS**: ${scene.overlays}`);
    lines.push(`- **CTA**: ${scene.cta}`);
    lines.push(`- **TRANSITION**: ${scene.transition}`);
    lines.push(`- **WHY THIS SCENE EXISTS**: ${scene.whyThisSceneExists}`);
    lines.push("");
  }

  return lines.join("\n");
}
