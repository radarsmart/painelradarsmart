import type { UGCOfferContext } from "./types";
import type { ProductClassification } from "./product-classifier";
import { OUTRO_TEXT_TITLE, OUTRO_TEXT_SUBTITLE } from "./brand-kit";
import type { VideoScene } from "./video-composer";

// "Modulos 3/4 — Diretor Criativo + Engenharia de Prompt": antes disso,
// generateDefaultScenes() em video-composer.ts usava sempre o mesmo prompt
// generico ("Produto em destaque: X" / "person using X"), independente do
// produto, publico ou template escolhido. Essa funcao monta um plano de
// cena por cena a partir do template (structureSteps) e da classificacao
// do produto (Modulo 1), variando a linguagem de camera/iluminacao/publico
// por cena — mesma tecnica ja validada em lib/tiktok-engine/gemini-prompt.ts
// (repetir descricoes fixas gera consistencia visual), so que aplicada a
// prompts de video por IA em vez de copy manual pro Gemini.
//
// Continuidade entre cenas: o Freepik/Kling nao tem um endpoint de "continuar
// da cena anterior" (cada chamada e independente), entao a forma real de dar
// consistencia visual entre os cortes e ancorar TODAS as cenas de produto na
// MESMA imagem de partida (freepik-animate/image-to-video), em vez de
// misturar com freepik-text2video (que gera cada cena do zero, sem nenhuma
// imagem de referencia — essa mistura era a causa raiz do video parecer
// "cada cena um produto diferente"). Text2video fica reservado so pro caso
// sem nenhuma imagem de produto disponivel (ver buildScenePlan).

// Vocabulario de camera/estilo vindo do "prompt mestre" cinematografico do
// dono (registrado 2026-08-06): comercial de TV premiado, lentes
// anamorficas, 4K HDR, slow motion, macro, 360, alta profundidade de campo.
const CAMERA_LANGUAGE_POOL = [
  "Dynamic pan and subtle zoom, elegant slow motion, anamorphic lens flare",
  "Smooth tracking shot with shallow depth of field, cinematic commercial look",
  "Macro close-up with gentle 360-degree rotation, premium product photography feel",
  "Handheld-style natural movement, authentic lifestyle energy, shallow focus",
  "Slow orbit around the subject, high-end TV commercial cinematography",
];

const LIGHTING_LANGUAGE_POOL = [
  "warm natural window light, premium cinematic color grade",
  "soft studio lighting, clean neutral background, 4K HDR look",
  "golden hour outdoor light, ultra realistic",
  "bright even daylight, airy atmosphere, high-end commercial finish",
];

// Base fixa de qualidade aplicada em toda cena de produto — garante que
// mesmo variando camera/iluminacao por cena, o "piso" de qualidade sempre
// bate com o prompt mestre (comercial de agencia grande, nao amador).
const CINEMATIC_QUALITY_BASELINE =
  "award-winning TV commercial quality, ultra realistic, 4K HDR, high production value";

function pickFromPool<T>(pool: T[], seed: number): T {
  const index = Math.abs(seed) % pool.length;
  return pool[index];
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return hash;
}

// Classifica cada passo do template (texto livre, ex: "Hook forte",
// "Prova visual", "CTA direto") num papel de cena — heuristica por palavra-
// chave, nao e perfeito, mas cobre bem os 10 templates da biblioteca.
// So decide entre "cartao de texto local" (preco/CTA) e "cena de produto";
// qual provedor de IA gera a cena de produto quem decide e buildScenePlan,
// com base em ter ou nao uma imagem do produto pra ancorar a continuidade.
function isTextCardStep(stepLabel: string): boolean {
  const normalized = stepLabel.toLowerCase();
  return (
    normalized.includes("cta") ||
    normalized.includes("preco") ||
    normalized.includes("preço") ||
    normalized.includes("desconto") ||
    normalized.includes("economia") ||
    normalized.includes("urgencia") ||
    normalized.includes("urgência")
  );
}

function buildProductScenePrompt(
  offer: UGCOfferContext,
  classification: ProductClassification | null,
  stepLabel: string,
  seed: number,
  hasAnchorImage: boolean,
): string {
  const camera = pickFromPool(CAMERA_LANGUAGE_POOL, seed);
  const lighting = pickFromPool(LIGHTING_LANGUAGE_POOL, seed + 1);
  const audience = classification?.audienceDescriptor
    ? ` for ${classification.audienceDescriptor}`
    : "";
  // Quando a cena vai ser gerada por image-to-video (ancorada na foto real
  // do produto), reforca pro modelo nao trocar o produto/fundo/cores — e
  // isso, mais do que o prompt em si, que segura a continuidade entre
  // cortes (ver nota de continuidade no topo do arquivo).
  const continuityInstruction = hasAnchorImage
    ? " Keep the exact same product, packaging, colors and background from the reference image — do not change or replace the product, only animate the camera and motion."
    : "";

  return (
    `Professional e-commerce advertisement scene for "${offer.title}"${audience}, ` +
    `context: ${stepLabel}. ${camera}, ${lighting}, ${CINEMATIC_QUALITY_BASELINE}, ` +
    `Brazilian market, 9:16 vertical format, no on-screen text.${continuityInstruction}`
  );
}

export function buildScenePlan(
  offer: UGCOfferContext,
  classification: ProductClassification | null,
  productImageUrl?: string | null,
): VideoScene[] {
  const steps = offer.template?.structureSteps?.length
    ? offer.template.structureSteps
    : ["Hook forte", "Beneficio central", "CTA direto"];

  const hasAnchorImage = Boolean(productImageUrl);
  const seedBase = hashString(offer.title || "produto");
  const scenes: VideoScene[] = steps.map((stepLabel, index) => {
    const seed = seedBase + index;

    if (isTextCardStep(stepLabel)) {
      const isPriceStep = /preco|preço|desconto|economia/i.test(stepLabel);
      return {
        type: "ffmpeg-text",
        duration: 4,
        text: isPriceStep
          ? `R$ ${offer.price.toFixed(2).replace(".", ",")}`
          : "APROVEITE",
        subtext: isPriceStep
          ? offer.discountPct
            ? `${offer.discountPct}% OFF`
            : "Melhor preço"
          : stepLabel,
      };
    }

    // Todas as cenas de produto ficam ancoradas na MESMA foto (quando
    // existe) — e o que da continuidade visual real ao video, ver nota no
    // topo do arquivo. Sem foto do produto, cai pra text2video (cada cena
    // gerada do zero, sem ancora — pior continuidade, mas ainda funcional).
    if (hasAnchorImage) {
      return {
        type: "freepik-animate",
        // 10s (tier maximo do Kling 2.5 Pro) — com ~3 cenas de produto por
        // template, da um video de ~30s, meta combinada com o dono (antes
        // era 5s/cena, o que resultava em videos de ~20-25s, curtos demais).
        duration: 10,
        imageUrl: productImageUrl || undefined,
        prompt: buildProductScenePrompt(offer, classification, stepLabel, seed, true),
      };
    }

    return {
      type: "freepik-text2video",
      duration: 10,
      prompt: buildProductScenePrompt(offer, classification, stepLabel, seed, false),
    };
  });

  // Encerramento com marca sempre igual, independente do template — mesma
  // logica do OUTRO_BRAND_CARD ja provada em gemini-prompt.ts.
  scenes.push({
    type: "ffmpeg-text",
    duration: 4,
    text: OUTRO_TEXT_TITLE,
    subtext: OUTRO_TEXT_SUBTITLE,
  });

  return scenes;
}

// ---- Plano com avatar (garota propaganda falando) ----
//
// Pedido do dono 2026-08-06: em vez de so animar o produto (Kling), o
// video tem uma pessoa real falando pra camera na abertura e no
// fechamento, com cenas de produto (mesma logica de continuidade acima)
// no meio. A avatar e gerada pelo OmniHuman 1.5 (Freepik/Magnific,
// lib/ugc/freepik.ts's animateAvatar / worker-ugc-video), que sincroniza
// os labios com um audio de referencia — por isso hookAudioUrl/ctaAudioUrl
// e suas duracoes reais (medidas depois de gerar o audio, ver
// app/api/admin/criativos/audio/route.ts) sao obrigatorios aqui, nao
// escolhidos livremente como as cenas de produto.

export type AvatarSceneConfig = {
  imageUrl: string;
  hookAudioUrl: string;
  hookDurationSeconds: number;
  bodyDurationSeconds: number;
  ctaAudioUrl: string;
  ctaDurationSeconds: number;
};

function buildAvatarPrompt(offer: UGCOfferContext, beat: "hook" | "cta"): string {
  const voice = offer.voiceDirection;
  const behavior = offer.behaviorDirection;
  const energy =
    beat === "hook" || voice?.urgency === "high" ? "energetic, attention-grabbing" : "confident, warm";
  const eyeContact =
    behavior?.eyeContact === "strong"
      ? "intense direct eye contact with the camera"
      : "natural direct eye contact with the camera";
  const gestures =
    behavior?.gestureIntensity === "high" ? "expressive hand gestures" : "subtle natural hand gestures";

  return (
    `Real person talking directly to camera in a vertical smartphone ad for "${offer.title}", ` +
    `${energy} delivery, ${eyeContact}, ${gestures}, authentic creator energy, ` +
    `${CINEMATIC_QUALITY_BASELINE}, 9:16 vertical format, natural indoor lighting, no on-screen text.`
  );
}

export function buildAvatarScenePlan(
  offer: UGCOfferContext,
  classification: ProductClassification | null,
  productImageUrl: string | null | undefined,
  avatar: AvatarSceneConfig,
): VideoScene[] {
  const scenes: VideoScene[] = [];

  scenes.push({
    type: "heygen-avatar",
    duration: avatar.hookDurationSeconds,
    imageUrl: avatar.imageUrl,
    audioUrl: avatar.hookAudioUrl,
    prompt: buildAvatarPrompt(offer, "hook"),
  });

  const hasAnchorImage = Boolean(productImageUrl);
  const bodySceneCount = Math.max(1, Math.ceil(avatar.bodyDurationSeconds / 10));
  const templateLabels = offer.template?.structureSteps?.filter((step) => !isTextCardStep(step));
  const fallbackLabels = [
    "Beneficio principal em uso real",
    "Detalhe do produto em destaque",
    "Resultado / prova visual",
  ];
  const labelPool = templateLabels?.length ? templateLabels : fallbackLabels;
  const seedBase = hashString(offer.title || "produto");

  for (let i = 0; i < bodySceneCount; i += 1) {
    const stepLabel = labelPool[i % labelPool.length];
    const seed = seedBase + i;

    scenes.push(
      hasAnchorImage
        ? {
            type: "freepik-animate",
            duration: 10,
            imageUrl: productImageUrl || undefined,
            prompt: buildProductScenePrompt(offer, classification, stepLabel, seed, true),
          }
        : {
            type: "freepik-text2video",
            duration: 10,
            prompt: buildProductScenePrompt(offer, classification, stepLabel, seed, false),
          },
    );
  }

  // Cartao rapido de preco antes do fechamento — silencioso, reforca
  // "pouco texto, letras grandes" do prompt mestre sem depender de fala.
  scenes.push({
    type: "ffmpeg-text",
    duration: 3,
    text: `R$ ${offer.price.toFixed(2).replace(".", ",")}`,
    subtext: offer.discountPct ? `${offer.discountPct}% OFF` : "Oferta por tempo limitado",
  });

  scenes.push({
    type: "heygen-avatar",
    duration: avatar.ctaDurationSeconds,
    imageUrl: avatar.imageUrl,
    audioUrl: avatar.ctaAudioUrl,
    prompt: buildAvatarPrompt(offer, "cta"),
  });

  scenes.push({
    type: "ffmpeg-text",
    duration: 4,
    text: OUTRO_TEXT_TITLE,
    subtext: OUTRO_TEXT_SUBTITLE,
  });

  return scenes;
}
