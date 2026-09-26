import type { VoiceCastingProfileId, VoiceCastingSpec } from "@/lib/commercial-video/social-commerce-v2/types";

export const VOICE_CASTING_PROFILES: Record<VoiceCastingProfileId, VoiceCastingSpec> = {
  FRIEND_SHOWING_A_FIND: {
    profileId: "FRIEND_SHOWING_A_FIND",
    speakingStyle: "natural friend showing a find, smiling voice, compact cadence, conversational but excited",
    energyLevel: "HIGH",
    pacing: "FAST",
    emotionalTone: "happy discovery, close to the viewer, not announcer-like",
    brandFit: "Best current direction after human audition for Garota Radar social commerce.",
    recommendedUse: ["HOOK", "PRICE_DISCOVERY", "SKINCARE_FIND", "KOKESHI_SOCIAL_COMMERCE"],
    generationAction: "SPEC_ONLY_NO_TTS",
  },
  ENERGETIC_CREATOR: {
    profileId: "ENERGETIC_CREATOR",
    speakingStyle: "creator delivery, quick smile in the voice, short phrases, high confidence",
    energyLevel: "HIGH",
    pacing: "FAST",
    emotionalTone: "excited discovery without shouting",
    brandFit: "Best default for Radar Smart social commerce hooks and creator-led offers.",
    recommendedUse: ["HOOK", "PRICE_DISCOVERY", "FAST_REELS", "KOKESHI_SOCIAL_COMMERCE"],
    generationAction: "SPEC_ONLY_NO_TTS",
  },
  FRIENDLY_SELLER: {
    profileId: "FRIENDLY_SELLER",
    speakingStyle: "warm seller, close to the viewer, clear price delivery",
    energyLevel: "MEDIUM",
    pacing: "BALANCED",
    emotionalTone: "helpful and upbeat",
    brandFit: "Good for daily offer videos where trust matters more than shock.",
    recommendedUse: ["CTA", "OFFER_EXPLANATION", "VIP_GROUP_INVITE"],
    generationAction: "SPEC_ONLY_NO_TTS",
  },
  PREMIUM_SOFT: {
    profileId: "PREMIUM_SOFT",
    speakingStyle: "polished beauty/lifestyle voice, restrained excitement, premium cadence",
    energyLevel: "MEDIUM",
    pacing: "CALM",
    emotionalTone: "soft, sensory and curated",
    brandFit: "Useful for beauty products when the product needs to feel pleasant, not rushed.",
    recommendedUse: ["BEAUTY", "SKINCARE", "TEXTURE_REVEAL"],
    generationAction: "SPEC_ONLY_NO_TTS",
  },
  URGENT_OFFER: {
    profileId: "URGENT_OFFER",
    speakingStyle: "fast offer announcer with strong emphasis on the real price",
    energyLevel: "HIGH",
    pacing: "FAST",
    emotionalTone: "urgent but factual",
    brandFit: "Use only when urgency is supported by real evidence or time-bound campaign context.",
    recommendedUse: ["OFFER", "PRICE_POP", "LIMITED_STOCK_WHEN_FACTUAL"],
    generationAction: "SPEC_ONLY_NO_TTS",
  },
  TRUSTED_RECOMMENDER: {
    profileId: "TRUSTED_RECOMMENDER",
    speakingStyle: "calm creator recommendation, confident and conversational",
    energyLevel: "MEDIUM",
    pacing: "BALANCED",
    emotionalTone: "trustworthy, close and practical",
    brandFit: "Good for products that need reassurance before the click.",
    recommendedUse: ["REACTION", "BENEFIT", "OBJECTION_HANDLING"],
    generationAction: "SPEC_ONLY_NO_TTS",
  },
};

export function getVoiceCastingSpec(profileId: VoiceCastingProfileId): VoiceCastingSpec {
  return VOICE_CASTING_PROFILES[profileId];
}

export function recommendVoiceCastingProfile(input: {
  category: string;
  price: number | null;
  discountPct: number | null;
  objective?: "HOOK" | "CTA" | "PRODUCT" | "OFFER";
}): VoiceCastingProfileId {
  const category = input.category.toLowerCase();
  if (input.objective === "CTA") return "FRIENDLY_SELLER";
  if (input.objective === "OFFER" && (input.discountPct ?? 0) > 0) return "URGENT_OFFER";
  if (category.includes("beleza") || category.includes("beauty") || category.includes("skin")) {
    if (input.price !== null && input.price <= 30) return "FRIEND_SHOWING_A_FIND";
    return "PREMIUM_SOFT";
  }
  return "ENERGETIC_CREATOR";
}
