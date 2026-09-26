import type {
  AudioEnergyPlan,
  MicroCutStoryboard,
  VoiceCastingProfileId,
} from "@/lib/commercial-video/social-commerce-v2/types";

export function buildAudioEnergyPlan(input: {
  voiceProfile: VoiceCastingProfileId;
  storyboard: MicroCutStoryboard;
  productTitle: string;
  price: number | null;
}): AudioEnergyPlan {
  const sfxMoments = input.storyboard.scenes.flatMap((scene) =>
    scene.beats
      .filter((beat) => beat.sfxCue)
      .map((beat) => ({
        atSecond: beat.startSecond,
        sceneId: scene.sceneId,
        cue: beat.sfxCue as string,
        reason: `Supports ${beat.purpose.toLowerCase()} without generating audio now.`,
      })),
  );

  return {
    version: "AUDIO_ENERGY_PLAN_V1",
    narrationEnergy: input.voiceProfile,
    recommendedVoiceArchetype: input.voiceProfile,
    deliveryEnergy: input.voiceProfile === "FRIEND_SHOWING_A_FIND" ? "MEDIUM_HIGH" : "HIGH",
    speechRhythm: input.voiceProfile === "FRIEND_SHOWING_A_FIND" ? "COMPACT_CONVERSATIONAL" : "FAST_CREATOR",
    hookIntensity: "HIGH",
    ctaIntensity: "HIGH",
    pauseStyle: "MINIMAL",
    backgroundMusicIntent: "Fast light social-commerce beat, beauty/creator feel, sidechained under narration, no long silent intro.",
    sfxMoments,
    sfxOpportunities: [
      "snap-in on first face close",
      "small price pop when R$ 13,16 appears",
      "soft tactile tap on product touch",
      "subtle cream/texture accent",
      "button-pop on Radar Smart CTA",
    ],
    emphasisWords: input.price !== null ? ["Gente", "achado", `R$ ${input.price.toFixed(2).replace(".", ",")}`, "Radar Smart"] : ["Gente", "achado", "Radar Smart"],
    transitionsOnBeat: true,
    silenceRisk: sfxMoments.length >= input.storyboard.scenes.length ? "LOW" : "MEDIUM",
    generationAction: "PLAN_ONLY_NO_AUDIO",
  };
}
