import type {
  CommercialContractApprovalState,
  CommercialCreativeContract,
  CommercialStoryboardPreview,
} from "@/lib/commercial-video/creation-modes/types";
import type { GenerationCapability } from "@/lib/generation-orchestrator/types";

type ReferenceVideoFingerprintInput = CommercialCreativeContract["referenceVideo"];

export type CommercialStoryboardFingerprintSceneInput = {
  sceneId: string;
  purpose: string;
  durationSeconds: number;
  presenterRole: string;
  visualIntent: string;
  productInteraction: string;
  spokenNarration: string;
  overlay: string | null;
  price: string | null;
  cta: string | null;
  productFidelityRequirement: string | null;
  capabilityIntent: GenerationCapability | string;
  mediaType: string | null;
};

export type CommercialStoryboardFingerprintInput = {
  contract: CommercialCreativeContract;
  scenes: CommercialStoryboardFingerprintSceneInput[];
};

export type CommercialCreationApprovalValidation = {
  approvalStatus: CommercialContractApprovalState | string | null;
  currentStoryboardFingerprint: string | null;
  approvedStoryboardFingerprint: string | null;
  approvalValid: boolean;
  resolvedApprovalState: CommercialContractApprovalState;
  staleReason: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeTextList(values: string[] | null | undefined): string[] {
  return (values ?? []).map(normalizeText).filter(Boolean);
}

function normalizeReferenceVideo(value: ReferenceVideoFingerprintInput): ReferenceVideoFingerprintInput {
  if (!value) return null;
  return {
    sourceUrl: normalizeText(value.sourceUrl),
    sourceLabel: normalizeText(value.sourceLabel),
    preserveStructure: Boolean(value.preserveStructure),
    preservePacing: Boolean(value.preservePacing),
    preserveHookMechanism: Boolean(value.preserveHookMechanism),
    preserveCameraLanguage: Boolean(value.preserveCameraLanguage),
    preserveProductPresentationMechanism: Boolean(value.preserveProductPresentationMechanism),
    preserveCtaMechanism: Boolean(value.preserveCtaMechanism),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value: unknown): string {
  const serialized = stableStringify(value);
  let hash = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 33) ^ serialized.charCodeAt(index);
  }
  return `ccm-v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizedContract(contract: CommercialCreativeContract): Record<string, unknown> {
  return {
    creationMode: contract.creationMode,
    userPrompt: normalizeText(contract.userPrompt),
    targetDuration: Number(contract.targetDuration),
    primaryObjective: contract.primaryObjective,
    callToActions: normalizeTextList(contract.callToActions),
    mustShow: normalizeTextList(contract.mustShow),
    mustSay: normalizeTextList(contract.mustSay),
    mustAvoid: normalizeTextList(contract.mustAvoid),
    presenterPreference: contract.presenterPreference,
    productUsagePreference: contract.productUsagePreference,
    referenceVideo: normalizeReferenceVideo(contract.referenceVideo ?? null),
  };
}

export function computeCommercialStoryboardFingerprint(input: CommercialStoryboardFingerprintInput): string {
  return fingerprint({
    contract: normalizedContract(input.contract),
    scenes: input.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      durationSeconds: scene.durationSeconds,
      presenterRole: scene.presenterRole,
      visualIntent: normalizeText(scene.visualIntent),
      productInteraction: normalizeText(scene.productInteraction),
      spokenNarration: normalizeText(scene.spokenNarration),
      overlay: scene.overlay === null ? null : normalizeText(scene.overlay),
      price: scene.price === null ? null : normalizeText(scene.price),
      cta: scene.cta === null ? null : normalizeText(scene.cta),
      productFidelityRequirement: scene.productFidelityRequirement,
      capabilityIntent: scene.capabilityIntent,
      mediaType: scene.mediaType,
    })),
  });
}

export function recomputeCommercialStoryboardFingerprint(storyboard: CommercialStoryboardPreview): string {
  return computeCommercialStoryboardFingerprint({
    contract: storyboard.contract,
    scenes: storyboard.scenes.map((scene) => {
      const promptScene = storyboard.promptPlan.scenes.find((entry) => entry.sceneId === scene.sceneId);
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
}

function nonEmpty(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > 0 ? text : null;
}

export function resolveCommercialCreationApprovalValidation(input: {
  approvalStatus: unknown;
  currentStoryboardFingerprint: unknown;
  approvedStoryboardFingerprint: unknown;
}): CommercialCreationApprovalValidation {
  const approvalStatus = typeof input.approvalStatus === "string" ? input.approvalStatus : null;
  const currentStoryboardFingerprint = nonEmpty(input.currentStoryboardFingerprint);
  const approvedStoryboardFingerprint = nonEmpty(input.approvedStoryboardFingerprint);
  const approvalValid =
    approvalStatus === "APPROVED_FOR_GENERATION" &&
    currentStoryboardFingerprint !== null &&
    approvedStoryboardFingerprint !== null &&
    approvedStoryboardFingerprint === currentStoryboardFingerprint;

  let resolvedApprovalState: CommercialContractApprovalState = "DRAFT";
  let staleReason: string | null = null;

  if (approvalValid) {
    resolvedApprovalState = "APPROVED_FOR_GENERATION";
  } else if (currentStoryboardFingerprint) {
    resolvedApprovalState = approvalStatus === "REJECTED" ? "REJECTED" : "READY_FOR_REVIEW";
  }

  if (approvalStatus === "APPROVED_FOR_GENERATION" && !approvalValid) {
    staleReason = "Este storyboard mudou e precisa ser aprovado novamente.";
  }

  return {
    approvalStatus,
    currentStoryboardFingerprint,
    approvedStoryboardFingerprint,
    approvalValid,
    resolvedApprovalState,
    staleReason,
  };
}
