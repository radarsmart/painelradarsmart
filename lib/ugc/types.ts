export type UGCType = "model-a" | "model-b" | "model-c";

export type UGCScript = {
  hook: string;
  body: string;
  cta: string;
  full_text: string;
  tone: string;
  part1?: string;
  part2?: string;
  part3?: string;
};

export type UGCOfferContext = {
  title: string;
  price: number;
  originalPrice?: number;
  marketplace: string;
  category?: string;
  discountPct?: number;
  productUrl: string;
  campaignName?: string;
  objective?: string;
  persona?: UGCPersonaProfile;
  angle?: UGCMarketingAngle;
  template?: UGCTemplateProfile;
  voiceDirection?: UGCVoiceDirection;
  behaviorDirection?: UGCBehaviorDirection;
};

export type UGCModelCResponse = {
  success: boolean;
  videoUrl?: string;
  screenshotUrl?: string;
  script: UGCScript;
  error?: string;
};

export type UGCPersonaProfile = {
  id: string;
  slug: string;
  name: string;
  archetype: string;
  genderPresentation?: string | null;
  ageRange?: string | null;
  visualStyle?: string | null;
  tone?: string | null;
  energy?: string | null;
  accent?: string | null;
  primaryUseCases: string[];
  provider?: string | null;
  providerAvatarId?: string | null;
  providerVoiceId?: string | null;
  avatarImageUrl?: string | null;
  behaviorProfile?: Record<string, unknown>;
  cameraProfile?: Record<string, unknown>;
  isDefault?: boolean;
};

export type UGCProjectStatus =
  | "draft"
  | "brief_ready"
  | "script_ready"
  | "approved"
  | "archived";

export type UGCMarketingAngle = {
  id: string;
  slug: string;
  name: string;
  angleType?: string | null;
  description?: string | null;
  painPoints: string[];
  desirePoints: string[];
  proofPoints: string[];
  hookStarters: string[];
  ctaOptions: string[];
};

export type UGCTemplateProfile = {
  id: string;
  slug: string;
  name: string;
  objective?: string | null;
  description?: string | null;
  hookFramework?: string | null;
  structureSteps: string[];
  recommendedDuration?: string | null;
  ctaStyle?: string | null;
  editingNotes?: Record<string, unknown>;
};

export type UGCVoiceDirection = {
  pace?: "calm" | "balanced" | "fast";
  pauseStyle?: "clean" | "natural" | "fragmented";
  emotionalIntensity?: "low" | "medium" | "high";
  urgency?: "low" | "medium" | "high";
  credibility?: "low" | "medium" | "high";
  ctaPressure?: "soft" | "balanced" | "strong";
};

export type UGCBehaviorDirection = {
  eyeContact?: "soft" | "balanced" | "strong";
  gestureIntensity?: "low" | "medium" | "high";
  smileLevel?: "low" | "medium" | "high";
  imperfectionLevel?: "low" | "medium" | "high";
  cameraEnergy?: "calm" | "balanced" | "dynamic";
};

export type UGCProjectAssetType =
  | "audio"
  | "video"
  | "image"
  | "avatar"
  | "screenshot"
  | "script";
