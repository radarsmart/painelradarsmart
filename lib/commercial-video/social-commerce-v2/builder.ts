import { buildAudioEnergyPlan } from "@/lib/commercial-video/social-commerce-v2/audio-energy-plan";
import { buildCtaBehaviorPlan } from "@/lib/commercial-video/social-commerce-v2/cta-behavior-plan";
import { buildMicroCutStoryboard } from "@/lib/commercial-video/social-commerce-v2/micro-cut-storyboard";
import { buildProductExperiencePlan } from "@/lib/commercial-video/social-commerce-v2/product-experience-plan";
import { runSocialCommerceQualityGate } from "@/lib/commercial-video/social-commerce-v2/quality-gate";
import { buildPresenterShotPlan } from "@/lib/commercial-video/social-commerce-v2/shot-pack";
import { getVoiceCastingSpec, recommendVoiceCastingProfile } from "@/lib/commercial-video/social-commerce-v2/voice-casting";
import type {
  BuildSocialCommerceV2Input,
  CreativeEnergyProfile,
  SocialCommerceV2Plan,
} from "@/lib/commercial-video/social-commerce-v2/types";

function normalizeFinalLine(value: string | null | undefined): string {
  if (value && value.includes("Radar Smart") && value.length >= 24) return value;
  return "Quer achar ofertas assim? Entra no Grupo VIP da Radar Smart.";
}

function buildCreativeEnergyProfile(): CreativeEnergyProfile {
  return {
    version: "CREATIVE_ENERGY_PROFILE_V1",
    targetFeel: "CREATOR_SOCIAL_COMMERCE",
    visualEnergy: "HIGH",
    rhythm: "MICRO_CUTS",
    hookWindowSeconds: 2,
    productProofMode: "EXPERIENCE_FIRST",
    notes: [
      "Plan for creator-style interruption in the first two seconds.",
      "Product scenes must carry tactile proof: hand, texture, application, packaging detail or usage context.",
      "This layer does not choose providers and does not generate media.",
    ],
  };
}

function buildProposedStoryboardTable(plan: Pick<SocialCommerceV2Plan, "microCutStoryboard" | "productExperiencePlan" | "presenterShotPlan" | "audioEnergyPlan">) {
  return plan.microCutStoryboard.scenes.map((scene) => {
    const productScene = plan.productExperiencePlan.scenes.find((entry) => entry.sceneId === scene.sceneId);
    const presenter = plan.presenterShotPlan.assignments.find((entry) => entry.sceneId === scene.sceneId);
    const sfx = plan.audioEnergyPlan.sfxMoments.find((entry) => entry.sceneId === scene.sceneId);
    const narration = scene.beats.map((beat) => beat.narrationFragment).filter(Boolean).join(" ");
    return {
      sceneId: scene.sceneId,
      macroPurpose: String(scene.macroPurpose),
      durationSeconds: scene.durationSeconds,
      beatCount: scene.beats.length,
      narration,
      productExperience: productScene ? productScene.elements.join(", ") : "presenter-only",
      presenterShot: presenter?.shotType ?? "PRODUCT_ONLY",
      audioCue: sfx?.cue ?? "music-bed",
    };
  });
}

function buildDiagnostics(input: BuildSocialCommerceV2Input, plan: Pick<SocialCommerceV2Plan, "microCutStoryboard" | "productExperiencePlan" | "presenterShotPlan" | "audioEnergyPlan" | "ctaBehaviorPlan" | "socialCommerceQualityGate">) {
  const currentProductPackshotRisk = input.currentScenes.some((scene) =>
    /packshot|produto real em packshot/i.test(`${scene.productUse} ${scene.visual}`),
  );
  return {
    currentPipeline: [
      "Macro scenes are valid but usually last around 3 seconds each.",
      "Presenter scenes can feel like repeated talking-head clips.",
      currentProductPackshotRisk
        ? "Product scenes include packshot language and risk feeling static."
        : "Product scenes mention usage but do not force microbeat proof yet.",
      "Audio is generated later, without a dedicated energy plan at approval time.",
    ],
    socialCommerceV2: [
      `${plan.microCutStoryboard.scenes.reduce((sum, scene) => sum + scene.beats.length, 0)} microbeats planned before generation.`,
      `${plan.presenterShotPlan.assignments.length} presenter shot assignments with creator-style movement.`,
      `Product experience gate status: ${plan.productExperiencePlan.overallStatus}.`,
      `Audio energy plan has ${plan.audioEnergyPlan.sfxMoments.length} SFX/transition cues.`,
      `Creative canary blocked: ${plan.socialCommerceQualityGate.canaryBlocked ? "YES" : "NO"}.`,
    ],
    comparison: [
      {
        dimension: "uso da personagem",
        current: "Garota Radar appears in macro scenes but shot variety is not enforced.",
        socialCommerceV2: "Face close, reaction, pointing and CTA invitation are planned before canary.",
        verdict: "IMPROVED" as const,
      },
      {
        dimension: "forca do hook",
        current: "Hook copy is correct but lives inside one 3s presenter scene.",
        socialCommerceV2: "First 2s are split into face close + price pop + reaction.",
        verdict: "IMPROVED" as const,
      },
      {
        dimension: "experiencia do produto",
        current: "Previous review found PRODUCT_EXPERIENCE FAIL due to packshot/static feel.",
        socialCommerceV2: "Product scene requires hand, texture/application, packaging detail and usage context.",
        verdict: "IMPROVED" as const,
      },
      {
        dimension: "energia da locucao",
        current: "TTS choice exists later; voice energy is not approved as a creative object.",
        socialCommerceV2: `Voice profile is planned as ${plan.audioEnergyPlan.narrationEnergy}.`,
        verdict: "IMPROVED" as const,
      },
      {
        dimension: "risco de packshot travado",
        current: currentProductPackshotRisk ? "HIGH/PRESENT in approved V1 wording." : "MEDIUM.",
        socialCommerceV2: `Risk planned as ${plan.productExperiencePlan.packshotDominanceRisk}.`,
        verdict: plan.productExperiencePlan.packshotDominanceRisk === "LOW" ? "IMPROVED" as const : "RISK" as const,
      },
      {
        dimension: "prontidao para canary",
        current: "Technical preflight can pass even when social-commerce quality is weak.",
        socialCommerceV2: `Social commerce gate status is ${plan.socialCommerceQualityGate.status}.`,
        verdict: plan.socialCommerceQualityGate.status === "FAIL" ? "RISK" as const : "IMPROVED" as const,
      },
    ],
  };
}

export function buildSocialCommerceV2Plan(input: BuildSocialCommerceV2Input): SocialCommerceV2Plan {
  const totalDurationSeconds = input.totalDurationSeconds ?? input.currentScenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
  const selectedVoiceProfile = input.preferredVoiceProfile ?? recommendVoiceCastingProfile({
    category: input.offer.category,
    price: input.offer.price,
    discountPct: input.offer.discountPct,
    objective: "HOOK",
  });
  const voiceCastingSpec = getVoiceCastingSpec(selectedVoiceProfile);
  const presenterShotPlan = buildPresenterShotPlan(input.currentScenes);
  const microCutStoryboard = buildMicroCutStoryboard({
    scenes: input.currentScenes,
    offer: input.offer,
    totalDurationSeconds,
  });
  const productExperiencePlan = buildProductExperiencePlan(input.currentScenes);
  const audioEnergyPlan = buildAudioEnergyPlan({
    voiceProfile: selectedVoiceProfile,
    storyboard: microCutStoryboard,
    productTitle: input.offer.title,
    price: input.offer.price,
  });
  const ctaScene = input.currentScenes.find((scene) => String(scene.purpose) === "CTA");
  const ctaBehaviorPlan = buildCtaBehaviorPlan({ finalLine: normalizeFinalLine(ctaScene?.spokenNarration), objective: "GROUP" });
  const socialCommerceQualityGate = runSocialCommerceQualityGate({
    storyboard: microCutStoryboard,
    presenterShotPlan,
    productExperiencePlan,
    audioEnergyPlan,
    ctaBehaviorPlan,
  });

  const partial = {
    microCutStoryboard,
    productExperiencePlan,
    presenterShotPlan,
    audioEnergyPlan,
    ctaBehaviorPlan,
    socialCommerceQualityGate,
  };

  return {
    version: "SOCIAL_COMMERCE_V2",
    campaignId: input.campaignId,
    creativeEnergyProfile: buildCreativeEnergyProfile(),
    voiceCastingSpec,
    presenterShotPlan,
    microCutStoryboard,
    productExperiencePlan,
    audioEnergyPlan,
    ctaBehaviorPlan,
    socialCommerceQualityGate,
    proposedStoryboardTable: buildProposedStoryboardTable(partial),
    diagnostics: buildDiagnostics(input, partial),
  };
}
