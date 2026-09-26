import type { ScenePurpose } from "@/lib/commercial-director/types";
import type {
  GarotaRadarShotType,
  PresenterShotAssignment,
  PresenterShotPlan,
  PresenterShotSpec,
  SocialCommerceCurrentSceneInput,
} from "@/lib/commercial-video/social-commerce-v2/types";

export const GAROTA_RADAR_SHOT_PACK_V1: PresenterShotSpec[] = [
  {
    shotType: "FACE_CLOSE_REACTION",
    framing: "tight face close-up, vertical safe area, eyes dominant in first second",
    gestureIntent: "small forward lean, eyebrows up, discovery energy",
    eyeLine: "direct to camera",
    bodyEnergy: "HIGH",
    facialExpression: "surprised but controlled",
    allowedScenePurposes: ["HOOK", "PROOF", "BENEFIT"],
  },
  {
    shotType: "MID_SHOT_DIRECT_TO_CAMERA",
    framing: "mid shot, shoulders and hands visible",
    gestureIntent: "short explanatory hand movement",
    eyeLine: "direct to camera",
    bodyEnergy: "MEDIUM",
    facialExpression: "confident creator",
    allowedScenePurposes: ["BENEFIT", "PROOF", "CTA"],
  },
  {
    shotType: "HALF_BODY_CREATOR_DEMO",
    framing: "half-body creator shot, hands visible, product/overlay safe zone preserved",
    gestureIntent: "lean-in, small product gesture, compact recommendation energy",
    eyeLine: "camera with quick product glance",
    bodyEnergy: "HIGH",
    facialExpression: "friendly discovery smile",
    allowedScenePurposes: ["BENEFIT", "PROOF", "PRODUCT"],
  },
  {
    shotType: "POINTING_TO_OFFER",
    framing: "mid shot with clear empty space for price overlay",
    gestureIntent: "points to price/product area without covering overlay",
    eyeLine: "camera then offer area",
    bodyEnergy: "HIGH",
    facialExpression: "positive price surprise",
    allowedScenePurposes: ["OFFER", "CTA"],
  },
  {
    shotType: "SURPRISED_DISCOVERY",
    framing: "close to medium close-up, quick reaction cut",
    gestureIntent: "quick look-to-screen then back to viewer",
    eyeLine: "screen/product then camera",
    bodyEnergy: "HIGH",
    facialExpression: "genuine discovery",
    allowedScenePurposes: ["HOOK", "PROBLEM"],
  },
  {
    shotType: "TRUSTED_RECOMMENDATION",
    framing: "steady mid shot, calm hands, warm eye contact",
    gestureIntent: "open palm recommendation",
    eyeLine: "direct to camera",
    bodyEnergy: "MEDIUM",
    facialExpression: "trustworthy and practical",
    allowedScenePurposes: ["BENEFIT", "PROOF"],
  },
  {
    shotType: "CTA_INVITATION",
    framing: "closer mid shot, one hand inviting viewer in",
    gestureIntent: "come-with-me gesture toward CTA area",
    eyeLine: "direct to camera",
    bodyEnergy: "HIGH",
    facialExpression: "friendly confident close",
    allowedScenePurposes: ["CTA"],
  },
  {
    shotType: "LOOK_TO_SCREEN",
    framing: "face and upper body with side glance space",
    gestureIntent: "reacts to offer/product appearing beside her",
    eyeLine: "screen side then camera",
    bodyEnergy: "HIGH",
    facialExpression: "curious and impressed",
    allowedScenePurposes: ["HOOK", "OFFER"],
  },
  {
    shotType: "HOLD_PRODUCT_IF_AVAILABLE",
    framing: "hands and product visible near chest/face",
    gestureIntent: "holds product in frame without blocking label",
    eyeLine: "product then camera",
    bodyEnergy: "MEDIUM",
    facialExpression: "practical demonstration",
    allowedScenePurposes: ["PRODUCT", "BENEFIT", "OFFER"],
  },
];

function normalizePurpose(value: string): ScenePurpose {
  if (value === "PRODUCT_DEMONSTRATION") return "PRODUCT";
  if (value === "SALES_ARGUMENT") return "BENEFIT";
  if (["HOOK", "PROBLEM", "PRODUCT", "BENEFIT", "PROOF", "OFFER", "CTA"].includes(value)) {
    return value as ScenePurpose;
  }
  return "BENEFIT";
}

export function selectShotForPurpose(purposeValue: string, sceneNumber: number): GarotaRadarShotType {
  const purpose = normalizePurpose(purposeValue);
  if (purpose === "HOOK") return sceneNumber === 1 ? "FACE_CLOSE_REACTION" : "SURPRISED_DISCOVERY";
  if (purpose === "PRODUCT") return "HOLD_PRODUCT_IF_AVAILABLE";
  if (purpose === "OFFER") return "POINTING_TO_OFFER";
  if (purpose === "CTA") return "CTA_INVITATION";
  if (purpose === "BENEFIT") return sceneNumber <= 3 ? "HALF_BODY_CREATOR_DEMO" : "TRUSTED_RECOMMENDATION";
  return "MID_SHOT_DIRECT_TO_CAMERA";
}

export function buildPresenterShotPlan(currentScenes: SocialCommerceCurrentSceneInput[]): PresenterShotPlan {
  const assignments: PresenterShotAssignment[] = currentScenes
    .filter((scene) => scene.garotaRadarAppearance !== "NONE" || scene.purpose === "CTA" || scene.purpose === "HOOK")
    .map((scene) => ({
      sceneId: scene.sceneId,
      purpose: scene.purpose,
      shotType: selectShotForPurpose(scene.purpose, scene.sceneNumber),
      reason: "Assigns a distinct social-commerce framing instead of repeating one standing presenter shot.",
    }));

  const uniqueShots = new Set(assignments.map((assignment) => assignment.shotType)).size;
  const varietyScore = Math.min(100, 55 + uniqueShots * 13);

  return {
    shotPackVersion: "GAROTA_RADAR_SHOT_PACK_V1",
    availableShots: GAROTA_RADAR_SHOT_PACK_V1,
    assignments,
    varietyScore,
  };
}
