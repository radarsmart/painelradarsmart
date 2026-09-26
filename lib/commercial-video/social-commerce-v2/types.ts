import type { ScenePurpose } from "@/lib/commercial-director/types";

export type SocialCommerceGateStatus = "PASS" | "PASS_WITH_OBSERVATIONS" | "FAIL";

export type VoiceCastingProfileId =
  | "ENERGETIC_CREATOR"
  | "FRIEND_SHOWING_A_FIND"
  | "FRIENDLY_SELLER"
  | "PREMIUM_SOFT"
  | "URGENT_OFFER"
  | "TRUSTED_RECOMMENDER";

export type VoiceCastingSpec = {
  profileId: VoiceCastingProfileId;
  speakingStyle: string;
  energyLevel: "LOW" | "MEDIUM" | "HIGH";
  pacing: "CALM" | "BALANCED" | "FAST";
  emotionalTone: string;
  brandFit: string;
  recommendedUse: string[];
  generationAction: "SPEC_ONLY_NO_TTS";
};

export type GarotaRadarShotType =
  | "FACE_CLOSE_REACTION"
  | "HALF_BODY_CREATOR_DEMO"
  | "MID_SHOT_DIRECT_TO_CAMERA"
  | "POINTING_TO_OFFER"
  | "SURPRISED_DISCOVERY"
  | "TRUSTED_RECOMMENDATION"
  | "CTA_INVITATION"
  | "LOOK_TO_SCREEN"
  | "HOLD_PRODUCT_IF_AVAILABLE";

export type PresenterShotSpec = {
  shotType: GarotaRadarShotType;
  framing: string;
  gestureIntent: string;
  eyeLine: string;
  bodyEnergy: "LOW" | "MEDIUM" | "HIGH";
  facialExpression: string;
  allowedScenePurposes: ScenePurpose[];
};

export type PresenterShotAssignment = {
  sceneId: string;
  purpose: ScenePurpose | string;
  shotType: GarotaRadarShotType;
  reason: string;
};

export type PresenterShotPlan = {
  shotPackVersion: "GAROTA_RADAR_SHOT_PACK_V1";
  availableShots: PresenterShotSpec[];
  assignments: PresenterShotAssignment[];
  varietyScore: number;
};

export type MicroBeatPurpose =
  | "ATTENTION_SPIKE"
  | "PRICE_POP"
  | "HUMAN_REACTION"
  | "PRODUCT_DETAIL"
  | "PRODUCT_EXPERIENCE"
  | "OFFER_REVEAL"
  | "CTA_PUSH"
  | "RHYTHM_RESET";

export type MicroCutBeat = {
  beatId: string;
  beatIndex: number;
  startSecond: number;
  endSecond: number;
  durationSeconds: number;
  purpose: MicroBeatPurpose;
  beatGoal: string;
  presenterMode:
    | "REACTING_TO_FIND"
    | "PRESENTING_PRODUCT"
    | "DEMONSTRATING"
    | "REINFORCING_VALUE"
    | "INVITING_ACTION"
    | "OFFSCREEN_PRODUCT_FOCUS"
    | "NONE";
  productMode:
    | "VISIBLE_EARLY"
    | "PACKAGING_DETAIL"
    | "TEXTURE_OR_GEL"
    | "APPLICATION_DEMO"
    | "PRICE_ANCHOR"
    | "CTA_SUPPORT"
    | "NONE";
  shotType: GarotaRadarShotType | "PRODUCT_MACRO" | "PRODUCT_PACKAGING_LOCK" | "GRAPHIC_PRICE_CARD";
  cameraDistance: "FACE_CLOSE" | "MEDIUM_CLOSE" | "MID" | "DETAIL_MACRO" | "GRAPHIC";
  cameraMotion: "HANDHELD_MICRO_PUSH" | "PUSH_IN" | "SNAP_ZOOM" | "MATCH_MOVE" | "STATIC_LOCK";
  bodyAction: string;
  facialExpression: string;
  handAction: string;
  eyeDirection: string;
  productInteraction: string;
  visualFocus: string;
  emotionalIntent: string;
  salesIntent: string;
  overlayIntent: string | null;
  audioEnergyIntent: string;
  transitionIntent: string;
  visualAction: string;
  narrationFragment: string | null;
  overlayFragment: string | null;
  transition: "HARD_CUT" | "MATCH_CUT" | "PUSH_IN" | "POP" | "WHIP";
  sfxCue: string | null;
};

export type MicroCutScene = {
  sceneId: string;
  macroPurpose: ScenePurpose | string;
  startSecond: number;
  endSecond: number;
  durationSeconds: number;
  beats: MicroCutBeat[];
  pacing: "FAST_SOCIAL" | "MIXED" | "CONTROLLED";
};

export type MicroCutStoryboard = {
  version: "SOCIAL_COMMERCE_MICRO_CUT_STORYBOARD_V2";
  totalDurationSeconds: number;
  averageBeatDurationSeconds: number;
  scenes: MicroCutScene[];
};

export type ProductExperienceElement =
  | "TEXTURE_REVEAL"
  | "APPLICATION_DEMO"
  | "HAND_INTERACTION"
  | "PACKAGING_DETAIL"
  | "USAGE_CONTEXT"
  | "BENEFIT_FOCUSED_DETAIL";

export type ProductExperienceScenePlan = {
  sceneId: string;
  purpose: ScenePurpose | string;
  required: boolean;
  elements: ProductExperienceElement[];
  packshotOnly: boolean;
  instruction: string;
  gateStatus: SocialCommerceGateStatus;
  reasons: string[];
};

export type ProductExperiencePlan = {
  version: "PRODUCT_EXPERIENCE_LAYER_V1";
  scenes: ProductExperienceScenePlan[];
  packshotDominanceRisk: "LOW" | "MEDIUM" | "HIGH";
  overallStatus: SocialCommerceGateStatus;
};

export type AudioEnergyPlan = {
  version: "AUDIO_ENERGY_PLAN_V1";
  narrationEnergy: VoiceCastingProfileId;
  recommendedVoiceArchetype: VoiceCastingProfileId;
  deliveryEnergy: "MEDIUM_HIGH" | "HIGH";
  speechRhythm: "FAST_CREATOR" | "COMPACT_CONVERSATIONAL";
  hookIntensity: "HIGH";
  ctaIntensity: "MEDIUM_HIGH" | "HIGH";
  pauseStyle: "SHORT_INTENTIONAL" | "MINIMAL";
  backgroundMusicIntent: string;
  sfxMoments: Array<{ atSecond: number; sceneId: string; cue: string; reason: string }>;
  sfxOpportunities: string[];
  emphasisWords: string[];
  transitionsOnBeat: boolean;
  silenceRisk: "LOW" | "MEDIUM" | "HIGH";
  generationAction: "PLAN_ONLY_NO_AUDIO";
};

export type CtaBehaviorPlan = {
  version: "CTA_BEHAVIOR_PLAN_V1";
  finalLine: string;
  closerFraming: GarotaRadarShotType;
  invitationGesture: string;
  destination: "RADAR_SMART_GROUP_VIP" | "RADAR_SMART_SITE";
  overlayHierarchy: string[];
  actionBeats: string[];
  staticPresenterRisk: "LOW" | "MEDIUM" | "HIGH";
};

export type CreativeEnergyProfile = {
  version: "CREATIVE_ENERGY_PROFILE_V1";
  targetFeel: "CREATOR_SOCIAL_COMMERCE";
  visualEnergy: "HIGH";
  rhythm: "MICRO_CUTS";
  hookWindowSeconds: 2;
  productProofMode: "EXPERIENCE_FIRST";
  notes: string[];
};

export type SocialCommerceQualityCheck = {
  name:
    | "SCROLL_STOP_VISUAL"
    | "PRESENTER_LIVELINESS"
    | "PRODUCT_EXPERIENCE"
    | "SOCIAL_NATIVE_FEEL"
    | "SALES_CLARITY"
    | "PRICE_IMPACT"
    | "CTA_STRENGTH"
    | "REPETITION_RISK"
    | "GENERIC_AD_RISK"
    | "DESIRE_SIGNAL"
    | "PRODUCT_CONTEXT_RELEVANCE";
  status: SocialCommerceGateStatus;
  score: number;
  threshold: number;
  reasons: string[];
};

export type SocialCommerceQualityGate = {
  version: "SOCIAL_COMMERCE_VISUAL_STORYBOARD_GATE_V2";
  status: SocialCommerceGateStatus;
  gateName: "SOCIAL_COMMERCE_STORYBOARD_GATE";
  checks: SocialCommerceQualityCheck[];
  blockingReasons: string[];
  observations: string[];
  canaryBlocked: boolean;
};

export type SocialCommerceOfferInput = {
  id: string;
  title: string;
  category: string;
  price: number | null;
  originalPrice: number | null;
  discountPct: number | null;
  rating: number | null;
  reviewsCount: number | null;
  marketplace: string | null;
  imageUrl: string | null;
};

export type SocialCommerceCurrentSceneInput = {
  sceneId: string;
  sceneNumber: number;
  purpose: ScenePurpose | string;
  durationSeconds: number;
  visual: string;
  productUse: string;
  garotaRadarAppearance: string;
  spokenNarration: string;
  overlay: string | null;
  price: string | null;
  cta: string | null;
};

export type BuildSocialCommerceV2Input = {
  campaignId: string;
  offer: SocialCommerceOfferInput;
  currentScenes: SocialCommerceCurrentSceneInput[];
  totalDurationSeconds?: number;
  preferredVoiceProfile?: VoiceCastingProfileId;
};

export type SocialCommerceV2Plan = {
  version: "SOCIAL_COMMERCE_V2";
  campaignId: string;
  creativeEnergyProfile: CreativeEnergyProfile;
  voiceCastingSpec: VoiceCastingSpec;
  presenterShotPlan: PresenterShotPlan;
  microCutStoryboard: MicroCutStoryboard;
  productExperiencePlan: ProductExperiencePlan;
  audioEnergyPlan: AudioEnergyPlan;
  ctaBehaviorPlan: CtaBehaviorPlan;
  socialCommerceQualityGate: SocialCommerceQualityGate;
  proposedStoryboardTable: Array<{
    sceneId: string;
    macroPurpose: string;
    durationSeconds: number;
    beatCount: number;
    narration: string;
    productExperience: string;
    presenterShot: string;
    audioCue: string;
  }>;
  diagnostics: {
    currentPipeline: string[];
    socialCommerceV2: string[];
    comparison: Array<{ dimension: string; current: string; socialCommerceV2: string; verdict: "IMPROVED" | "UNCHANGED" | "RISK" }>;
  };
};

export type VisualExecutionSource =
  | "NEW_PROVIDER_ASSET"
  | "REUSE_PROVIDER_ASSET"
  | "EDITORIAL_CROP"
  | "EDITORIAL_ZOOM"
  | "EDITORIAL_SPEED_RAMP"
  | "OVERLAY_MOTION"
  | "PRODUCT_CUTAWAY"
  | "STATIC_REFERENCE"
  | "SFX_EVENT"
  | "TRANSITION"
  | "OTHER";

export type ProviderIfNeeded = "HEYGEN" | "KLING" | "ELEVENLABS" | "WAN" | "NONE" | "OTHER";

export type ExecutionGateStatus = "PASS" | "FAIL";

export type PresenterReferenceInput = {
  id: string;
  name: string;
  fileUrl: string | null;
  metadata: {
    referenceType?: string;
    isPrimary?: boolean;
    expression?: string;
    pose?: string;
    shot?: string;
    cameraAngle?: string;
    generationSafe?: boolean;
    description?: string;
    tags?: string[];
  };
};

export type ProductReferenceInventory = {
  packshotReferenceUrl: string | null;
  demoReferenceUrls: string[];
  handInteractionReferenceUrls: string[];
  skincareContextReferenceUrls: string[];
  benefitContextReferenceUrls: string[];
  textureReferenceUrls: string[];
  applicationReferenceUrls: string[];
  notes: string[];
};

export type PresenterShotRequirement = {
  requirementId: "SHOT_A" | "SHOT_B" | "SHOT_C";
  purpose: "HOOK" | "SALES_ARGUMENT" | "CTA";
  framing: "MEDIUM_CLOSE_UP" | "WAIST_UP";
  expression: string;
  gesture: string;
  requiredShotTypes: string[];
  requiredExpressions: string[];
  requiredPoses: string[];
  referenceAvailable: "YES" | "NO";
  referenceCompatibleWithShot: "YES" | "NO";
  matchedReferenceIds: string[];
  framingVariation: "YES" | "NO";
  performanceVariation: "YES" | "NO";
  gaps: string[];
};

export type ProductExperienceReadiness = {
  PACKSHOT_REFERENCE_READY: "YES" | "NO";
  HAND_INTERACTION_REFERENCE_READY: "YES" | "NO";
  SKINCARE_CONTEXT_REFERENCE_READY: "YES" | "NO";
  BENEFIT_CONTEXT_REFERENCE_READY: "YES" | "NO";
  DEMO_REFERENCE_READY: "YES" | "NO";
  TEXTURE_REFERENCE_READY: "YES" | "NO";
  APPLICATION_REFERENCE_READY: "YES" | "NO";
  REAL_PRODUCT_INTERACTION_READY: "YES" | "NO";
  SUPPORT_GROUNDED_PRODUCT_EXPERIENCE_READY: "YES" | "NO";
  gaps: string[];
  observations: string[];
};

export type MicrobeatExecutionMapEntry = {
  timeStart: number;
  timeEnd: number;
  macroScene: string;
  microbeat: string;
  beatIndex: number;
  visualSource: VisualExecutionSource;
  secondaryOperations: VisualExecutionSource[];
  assetIdOrReference: string | null;
  presenterShot: string;
  productAction: string;
  editorialAction: string;
  overlay: string | null;
  sfx: string | null;
  narration: string | null;
  providerIfNeeded: ProviderIfNeeded;
  providerAssetGroup: string | null;
  framingVariation: boolean;
  performanceVariation: boolean;
};

export type ExecutionCostPreflight = {
  HEYGEN: {
    numberOfGenerationCalls: number;
    estimatedUsd: number;
  };
  KLING: {
    numberOfGenerationCalls: number;
    billableDurationSeconds: number;
    estimatedCredits: number;
  };
  ELEVENLABS: {
    numberOfGenerationCalls: number;
    characters: number;
    estimatedCredits: number;
  };
  WAN: {
    numberOfGenerationCalls: 0;
    estimatedCredits: 0;
  };
};

export type ExecutionPreflightGate = {
  name:
    | "MICROBEAT_EXECUTION_EFFICIENCY"
    | "PRESENTER_VISUAL_VARIETY_READY"
    | "PRODUCT_EXPERIENCE_EXECUTABLE"
    | "SHOT_REFERENCE_READINESS"
    | "AUDIO_ENERGY_EXECUTABLE";
  status: ExecutionGateStatus;
  reasons: string[];
};

export type BuildSocialCommerceExecutionPreflightInput = {
  campaignId: string;
  plan: SocialCommerceV2Plan;
  presenterReferences: PresenterReferenceInput[];
  productReferences: ProductReferenceInventory;
  voiceCandidate: {
    voiceId: "qUqXzKPs4b4NRdbYKPx7";
    model: "eleven_multilingual_v2";
  };
};

export type SocialCommerceExecutionPreflight = {
  version: "SOCIAL_COMMERCE_EXECUTION_PREFLIGHT_V1";
  campaignId: string;
  totalMicrobeats: number;
  timeline: MicrobeatExecutionMapEntry[];
  presenterShotRequirements: PresenterShotRequirement[];
  productExperienceReadiness: ProductExperienceReadiness;
  plannedGenerativeAssetGroups: Array<{
    groupId: string;
    provider: ProviderIfNeeded;
    purpose: string;
    coveredMicrobeats: string[];
    durationSeconds: number;
    referenceStatus: "READY" | "GAP";
  }>;
  totals: {
    TOTAL_MICROBEATS: number;
    NEW_PROVIDER_ASSETS_REQUIRED: number;
    EDITORIAL_ONLY_BEATS: number;
    REUSED_BEATS: number;
    HEYGEN_NEW_ASSETS_REQUIRED: number;
    KLING_NEW_ASSETS_REQUIRED: number;
    OTHER_GENERATIVE_ASSETS_REQUIRED: number;
    HEYGEN_CALLS_PLANNED: number;
    KLING_CALLS_PLANNED: number;
    ELEVENLABS_CALLS_PLANNED: number;
  };
  audioPlan: {
    voiceId: "qUqXzKPs4b4NRdbYKPx7";
    model: "eleven_multilingual_v2";
    copyReady: "YES" | "NO";
    timingReady: "YES" | "NO";
    CONTINUOUS_MUSIC_BED: "YES";
    sfxMoments: Array<{ atSecond: number; sceneId: string; cue: string; reason: string }>;
    silenceRisk: "LOW" | "MEDIUM" | "HIGH";
    generationAction: "PLAN_ONLY_NO_TTS";
  };
  feasibility: {
    HEYGEN_PRESENTER_FEASIBILITY: "HIGH" | "MEDIUM" | "LOW";
    KLING_PRODUCT_EXPERIENCE_FEASIBILITY: "HIGH" | "MEDIUM" | "LOW";
    reasons: string[];
  };
  estimatedCosts: ExecutionCostPreflight;
  gates: ExecutionPreflightGate[];
  gaps: {
    PRESENTER_REFERENCE_GAPS: string[];
    PRODUCT_REFERENCE_GAPS: string[];
  };
  result: {
    MICROBEAT_EXECUTION_EFFICIENCY: ExecutionGateStatus;
    PRESENTER_VISUAL_VARIETY_READY: "YES" | "NO";
    PRODUCT_EXPERIENCE_EXECUTABLE: "YES" | "NO";
    AUDIO_ENERGY_EXECUTABLE: "YES" | "NO";
    SOCIAL_COMMERCE_EXECUTION_PREFLIGHT: ExecutionGateStatus;
    READY_FOR_PAID_SOCIAL_COMMERCE_CANARY: "YES" | "NO";
  };
  safety: {
    providersCalled: 0;
    mediaGenerated: 0;
    uploads: 0;
    publications: 0;
    remoteWrites: 0;
  };
};
