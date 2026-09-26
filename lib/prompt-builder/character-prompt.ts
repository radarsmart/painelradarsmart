// Radar Creative AI - Prompt Builder / Character Prompt
//
// Quando a Garota Radar esta na cena, a identidade NUNCA depende so de
// descricao textual do rosto - o prompt sempre menciona explicitamente
// preservar a identidade da imagem de referencia (identityReferenceAssetId).
// So variam: roupa, penteado, maquiagem, expressao, pose, ambiente.

import type { CommercialSceneCharacterDirection } from "@/lib/commercial-director/types";

const IDENTITY_PRESERVATION_RULES =
  "Preserve exact facial identity from the identity reference image. " +
  "Same recognizable woman, maintain facial proportions, photorealistic, natural skin texture, " +
  "consistent hair identity unless a hairstyle variation is explicitly requested.";

const EXPRESSION_TEXT: Record<string, string> = {
  NEUTRAL: "neutral, calm expression",
  SMILING: "warm smiling expression",
  HAPPY: "genuinely happy expression",
  EXCITED: "excited, energetic expression",
  SURPRISED: "surprised, wide-eyed expression",
  THOUGHTFUL: "thoughtful, reflective expression",
  CONFIDENT: "confident, assured expression",
  WINKING: "playful winking expression",
  INVITING: "warm, inviting expression",
  SERIOUS: "serious, focused expression",
};

const POSE_TEXT: Record<string, string> = {
  NEUTRAL: "neutral standing pose",
  ARMS_CROSSED: "arms crossed, confident stance",
  HANDS_IN_POCKETS: "hands in pockets, relaxed stance",
  POINTING: "pointing gesture toward the product/offer",
  POINTING_UP: "pointing upward",
  POINTING_DOWN: "pointing downward toward the offer",
  PRESENTING: "presenting gesture with an open hand",
  INVITING: "inviting gesture, welcoming the viewer",
  THUMBS_UP: "thumbs up gesture",
  HAND_ON_CHIN: "hand on chin, thoughtful gesture",
  CELEBRATING: "celebratory gesture",
  WALKING: "natural walking motion",
  LEANING: "leaning casually",
  OTHER: "natural candid pose",
};

const SHOT_TEXT: Record<string, string> = {
  CLOSE_UP: "close-up shot",
  HEADSHOT: "headshot framing",
  BUST: "bust shot framing",
  HALF_BODY: "half body shot",
  THREE_QUARTER_BODY: "three-quarter body shot",
  FULL_BODY: "full body shot",
};

/**
 * Retorna null quando nao ha personagem na cena (PRODUCT_ONLY) - nesse
 * caso o prompt nao menciona nenhuma pessoa.
 */
export function buildCharacterPromptBlock(
  characterDirection: CommercialSceneCharacterDirection | null,
): string | null {
  if (!characterDirection) return null;

  const expression = EXPRESSION_TEXT[characterDirection.expression] ?? characterDirection.expression;
  const pose = POSE_TEXT[characterDirection.pose] ?? characterDirection.pose;
  const shot = SHOT_TEXT[characterDirection.shot] ?? characterDirection.shot;

  return `${IDENTITY_PRESERVATION_RULES} Radar Smart presenter, ${expression}, ${pose}, ${shot}.`;
}
