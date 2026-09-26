// Radar Creative AI - Prompt Builder / Scene Prompt
//
// Compositor PURO de UMA cena: recebe a CommercialScene (ja com
// characterDirection/identity/support resolvidos pelo Commercial Director)
// e o contexto da campanha, devolve o SceneGenerationPrompt completo.
// Nao chama Supabase nem provider nenhum.

import type { CommercialScene, CommercialPace, VisualStyle } from "@/lib/commercial-director/types";
import type { OfferStrategy, CtaStrategy, ScenePurpose } from "@/lib/commercial-director/types";
import { resolveCameraLanguage } from "@/lib/prompt-builder/camera-language";
import { buildNegativePrompt } from "@/lib/prompt-builder/negative-prompt";
import { buildProductPositiveDescriptor } from "@/lib/prompt-builder/product-prompt";
import { buildCharacterPromptBlock } from "@/lib/prompt-builder/character-prompt";
import { buildOverlayPlan } from "@/lib/prompt-builder/overlay-plan";
import { assertTextIsClaimsSafe } from "@/lib/content-safety/claims-policy";
import {
  applyProductIntegrityCameraOverride,
  classifyProductIntegrityRisk,
  isProductCentricMediaType,
  PRODUCT_INTEGRITY_DIRECTIVE,
  resolveProductIntegrityMode,
} from "@/lib/prompt-builder/product-integrity-mode";
import {
  deriveProductFidelityRequirement,
  isProductReferenceRequired,
  type ProductFidelityRequirement,
  type SceneProductRoleHint,
  type SceneSubjectPriorityHint,
} from "@/lib/prompt-builder/product-fidelity-requirement";
import type {
  Platform,
  ProviderHints,
  SceneGenerationPrompt,
  SceneMediaType,
} from "@/lib/prompt-builder/types";

const CATEGORY_ENVIRONMENT_EN: Record<string, string> = {
  casa: "modern Brazilian living room",
  cozinha: "modern Brazilian kitchen",
  ferramentas: "home workshop / garage setting",
  pet: "cozy home environment with a pet-friendly setting",
  suplementos: "clean modern gym or fitness environment",
  eletronicos: "modern tech-focused studio setting",
  perfumes: "elegant minimal studio with soft luxury lighting",
  beleza: "clean beauty studio setting",
  moda: "editorial lifestyle setting",
  geral: "clean neutral studio background",
};

const PURPOSE_ACTION_EN: Record<ScenePurpose, string> = {
  HOOK: "Immediate high-impact visual moment designed to stop the scroll",
  PROBLEM: "Show the everyday problem or frustration the product solves",
  PRODUCT: "Product as the visual hero, shown in realistic everyday use",
  BENEFIT: "Demonstrate the key practical benefit in action",
  PROOF: "Show a real trust/credibility signal naturally in the scene",
  OFFER: "Clean product composition leaving clear open space for a price overlay",
  CTA: "Inviting closing composition leaving clear space for a call-to-action overlay",
};

// Subject-Aware Capability Routing V1 (item 6 do pedido): fidelityRequirement
// ja cobre as 4 purposes PRODUCT/BENEFIT/OFFER/CTA (sempre REQUIRED, ver
// product-fidelity-requirement.ts), entao a regra abaixo generaliza sem
// duplicar a lista de purposes. Para HOOK/PROBLEM/PROOF, so vira
// PRODUCT_VIDEO quando o Creative Director V2 exigiu fidelidade real
// (REQUIRED/STRICT) - campanhas V1 (sem hints) nunca chegam em REQUIRED
// para essas purposes, entao o comportamento LEGADO fica intacto (Caso A do
// pedido: "HOOK sem produto real como sujeito central -> TEXT_TO_VIDEO
// continua permitido").
function resolveMediaType(scene: CommercialScene, fidelityRequirement: ProductFidelityRequirement): SceneMediaType {
  if (scene.identityReferenceAssetId) return "CHARACTER_VIDEO";
  if (scene.supportReferenceAssetId) return "IMAGE_TO_VIDEO";
  if (["PRODUCT", "BENEFIT", "OFFER", "CTA"].includes(scene.purpose)) return "PRODUCT_VIDEO";
  if (isProductReferenceRequired(fidelityRequirement)) return "PRODUCT_VIDEO";
  return "TEXT_TO_VIDEO";
}

function buildProviderHints(mediaType: SceneMediaType, hasCharacter: boolean): ProviderHints {
  return {
    requiresIdentityReference: hasCharacter,
    requiresProductReference: mediaType === "PRODUCT_VIDEO" || mediaType === "CHARACTER_VIDEO",
    preferredMode:
      mediaType === "CHARACTER_VIDEO"
        ? "image-to-video"
        : mediaType === "IMAGE_TO_VIDEO"
          ? "image-to-video"
          : mediaType === "PRODUCT_VIDEO"
            ? "product-hero"
            : "text-to-video",
    motionStrength: mediaType === "PRODUCT_VIDEO" ? "low" : "medium",
  };
}

export type ScenePromptContext = {
  productTitle: string;
  category: string;
  platform: Platform;
  aspectRatio: string;
  visualStyle: VisualStyle;
  pace: CommercialPace;
  offerStrategy: OfferStrategy;
  ctaStrategy: CtaStrategy;
  defaultLogoAssetId: string | null;
};

// Hints OPCIONAIS do Creative Director V2 (lib/creative-director-v2/
// decision-engine/**) - so preenchidos quando a campanha usa V2. Nunca
// preco/desconto/logo/claims (isso continua 100% controlado por
// overlayInstructions, nunca por texto livre no prompt) - so
// ambiente/efeitos/intencao visual de CTA, ADICIONADOS ao positivePrompt.
// resolveCameraLanguage()/applyProductIntegrityCameraOverride() (a trava de
// seguranca de integridade de produto) continuam a UNICA fonte dos campos
// mecanicos camera/lens/framing/movement - nunca sobrescritos aqui.
export type ScenePromptCreativeHints = {
  environmentDirection?: string;
  visualEffects?: string[];
  ctaVisualAction?: string;
  ctaCharacterGesture?: string | null;
  persuasionObjective?: string;
  productInteraction?: string;
  characterNarrativeRole?: string;
  consumerState?: string;
  // Subject-Aware Capability Routing V1 - SceneBlueprintV2.productRole/
  // subjectPriority (lib/creative-director-v2/types.ts), passados por
  // valor (uniao de string literal, sem import cruzado - ver
  // product-fidelity-requirement.ts). Unicos hints que participam de uma
  // DECISAO estrutural (mediaType) - todos os outros campos deste tipo
  // permanecem so descritivos/aditivos ao positivePrompt.
  productRoleV2?: SceneProductRoleHint;
  subjectPriorityV2?: SceneSubjectPriorityHint;
};

export function buildScenePrompt(
  scene: CommercialScene,
  context: ScenePromptContext,
  creativeHints?: ScenePromptCreativeHints,
): SceneGenerationPrompt {
  const hasCharacter = Boolean(scene.characterDirection && scene.identityReferenceAssetId);
  const productFidelityRequirement = deriveProductFidelityRequirement({
    purpose: scene.purpose,
    hasCharacterPresenter: Boolean(scene.identityReferenceAssetId),
    productRoleV2: creativeHints?.productRoleV2,
    subjectPriorityV2: creativeHints?.subjectPriorityV2,
  });
  const mediaType = resolveMediaType(scene, productFidelityRequirement);
  const durationSeconds = scene.endSecond - scene.startSecond;

  const baseCameraLanguage = resolveCameraLanguage(scene.purpose, context.pace);

  // Aprendizado do canary real (scene-3, Creatina): classifica o risco de
  // perda de integridade do produto ANTES de decidir a linguagem de
  // camera final - HIGH troca dolly-in/tracking/macro por uma camera
  // travada, sem nenhuma reconstrucao de perspectiva. Generico, nunca
  // especifico de um produto. Ver product-integrity-mode.ts.
  const productIntegrityRisk = classifyProductIntegrityRisk({
    mediaType,
    category: context.category,
    cameraMovement: baseCameraLanguage.camera,
    cameraLens: baseCameraLanguage.lens,
  });
  const productIntegrityMode = resolveProductIntegrityMode(productIntegrityRisk);
  const cameraLanguage = applyProductIntegrityCameraOverride(baseCameraLanguage, productIntegrityRisk);

  const characterBlock = buildCharacterPromptBlock(scene.characterDirection);
  // Item 10 do pedido: so afirma "shown exactly as provided" quando o
  // mediaType final desta cena de fato tem um caminho real de receber uma
  // referencia de produto (hoje, so PRODUCT_VIDEO - ver
  // isProductCentricMediaType). Nunca baseado em purpose isoladamente, nem
  // em saber se a URL especifica realmente resolveu (isso e
  // BLOCKED_REFERENCE_QUALITY, um bloqueio separado).
  const productDescriptor = buildProductPositiveDescriptor(context.productTitle, isProductCentricMediaType(mediaType));
  const environment = CATEGORY_ENVIRONMENT_EN[context.category] ?? CATEGORY_ENVIRONMENT_EN.geral;
  const purposeAction = PURPOSE_ACTION_EN[scene.purpose];

  const overlayPlan = buildOverlayPlan({
    purpose: scene.purpose,
    offerStrategy: context.offerStrategy,
    ctaStrategy: context.ctaStrategy,
    hasCharacterInScene: hasCharacter,
  });

  const ctaVisualHint =
    scene.purpose === "CTA" && creativeHints?.ctaVisualAction && creativeHints.ctaVisualAction !== "NONE"
      ? `Presenter CTA intent: ${creativeHints.ctaVisualAction.toLowerCase().replace(/_/g, " ")}${creativeHints.ctaCharacterGesture ? ` (${creativeHints.ctaCharacterGesture})` : ""} - creative intent, not a provider guarantee.`
      : null;

  const persuasionHint =
    creativeHints?.persuasionObjective
      ? [
          `Persuasion objective: ${creativeHints.persuasionObjective}.`,
          creativeHints.productInteraction ? `Product interaction intent: ${creativeHints.productInteraction.toLowerCase().replace(/_/g, " ")}.` : null,
          creativeHints.characterNarrativeRole && creativeHints.characterNarrativeRole !== "NONE"
            ? `Character narrative role: ${creativeHints.characterNarrativeRole.toLowerCase().replace(/_/g, " ")}.`
            : null,
          creativeHints.consumerState ? `Target viewer state: ${creativeHints.consumerState}.` : null,
        ].filter((line): line is string => Boolean(line)).join(" ")
      : null;

  const positivePromptLines = [
    `Commercial advertising scene for a ${context.category} product, ${context.visualStyle} visual style.`,
    `${environment}.`,
    `${purposeAction}.`,
    `${productDescriptor}.`,
    // Instrucao ATIVA (nao so ausencia de palavras no negative prompt) -
    // so entra quando o risco e HIGH, logo apos descrever o produto.
    productIntegrityMode === "PRESERVE_PACKAGE" ? PRODUCT_INTEGRITY_DIRECTIVE : null,
    characterBlock,
    `${cameraLanguage.lighting}.`,
    `${cameraLanguage.movement}, ${cameraLanguage.lens.toLowerCase()} lens.`,
    `${context.pace.toLowerCase()} pace.`,
    // Hints aditivos do Creative Director V2 - nunca substituem os campos
    // mecanicos acima, so descrevem contexto extra.
    creativeHints?.environmentDirection ? `Creative environment detail: ${creativeHints.environmentDirection}.` : null,
    creativeHints?.visualEffects && creativeHints.visualEffects.length > 0
      ? `Supporting visual effects (background/lighting only, never altering the product itself): ${creativeHints.visualEffects.join(", ").toLowerCase()}.`
      : null,
    persuasionHint,
    ctaVisualHint,
    `Vertical ${context.aspectRatio}, premium commercial appearance.`,
  ].filter((line): line is string => Boolean(line));

  const positivePrompt = positivePromptLines.join(" ");
  const negativePrompt = buildNegativePrompt(hasCharacter, productIntegrityRisk);

  // Guarda defensiva (belt-and-suspenders): o positivePrompt so e montado
  // a partir de templates fixos (nunca de texto livre do Product
  // Intelligence), entao isso nunca deveria disparar. Se disparar, e sinal
  // de um bug real introduzido em outro lugar do pipeline - preferimos
  // falhar alto a deixar uma claim proibida chegar ao provider.
  assertTextIsClaimsSafe(positivePrompt, context.category, `positivePrompt da cena "${scene.id}"`);

  return {
    sceneId: scene.id,
    sceneOrder: scene.order,
    purpose: scene.purpose,

    mediaType,
    durationSeconds,
    aspectRatio: context.aspectRatio,
    platform: context.platform,

    subject: hasCharacter ? "Garota Radar" : context.productTitle,
    environment,
    action: purposeAction,

    character: characterBlock,
    product: productDescriptor,

    camera: cameraLanguage.camera,
    lens: cameraLanguage.lens,
    framing: cameraLanguage.framing,
    movement: cameraLanguage.movement,
    lighting: cameraLanguage.lighting,

    visualStyle: context.visualStyle,
    pace: context.pace,

    expression: scene.characterDirection?.expression ?? null,
    pose: scene.characterDirection?.pose ?? null,
    shot: scene.characterDirection?.shot ?? null,
    cameraAngle: null,
    outfit: null,

    identityReferenceAssetId: scene.identityReferenceAssetId,
    supportReferenceAssetId: scene.supportReferenceAssetId,
    productReferenceUrl: null,

    textOverlay: scene.textOverlay,
    voiceoverIntent: scene.voiceoverIntent,
    sfxIntent: scene.sfxIntent,

    positivePrompt,
    negativePrompt,

    overlayInstructions: overlayPlan.overlayInstructions,
    safeAreaDirection: overlayPlan.safeAreaDirection,
    brandOverlayRequired: overlayPlan.brandOverlayRequired,
    brandAssetId: overlayPlan.brandOverlayRequired ? context.defaultLogoAssetId : null,

    productIntegrityRisk,
    productIntegrityMode,
    productFidelityRequirement,

    providerHints: buildProviderHints(mediaType, hasCharacter),
  };
}
