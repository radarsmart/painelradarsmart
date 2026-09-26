// Radar Creative AI - Commercial Director / Scene Planner
//
// Modulo PURO e deterministico: recebe as decisoes ja tomadas (estrutura,
// duracao, presenter strategy, hook strategy) e devolve o plano de cenas
// com timing proporcional. NAO chama o Character Pack aqui (isso exige
// Supabase) - characterDirection vem preenchida, mas
// identityReferenceAssetId/supportReferenceAssetId ficam null e sao
// preenchidos depois por lib/commercial-director/director.ts.

import type {
  CommercialScene,
  CommercialSceneCharacterDirection,
  HookStrategy,
  PresenterStrategy,
  ScenePresenter,
  ScenePurpose,
  StoryStructure,
  TextOverlayStrategy,
} from "@/lib/commercial-director/types";

type SceneTemplateEntry = { purpose: ScenePurpose; weight: number };

// Pesos por estrutura - somam 1.0, escalados pela duracao real da
// campanha. O exemplo de 20s dado na especificacao (HOOK 3s, PROBLEM 4s,
// PRODUCT 5s, BENEFIT 4s, OFFER 2s, CTA 2s) e exatamente
// PROBLEM_SOLUTION aqui (.15/.20/.25/.20/.10/.10 de 20s).
const STRUCTURE_TEMPLATES: Record<StoryStructure, SceneTemplateEntry[]> = {
  DIRECT_OFFER: [
    { purpose: "HOOK", weight: 0.3 },
    { purpose: "OFFER", weight: 0.45 },
    { purpose: "CTA", weight: 0.25 },
  ],
  PROBLEM_SOLUTION: [
    { purpose: "HOOK", weight: 0.15 },
    { purpose: "PROBLEM", weight: 0.2 },
    { purpose: "PRODUCT", weight: 0.25 },
    { purpose: "BENEFIT", weight: 0.2 },
    { purpose: "OFFER", weight: 0.1 },
    { purpose: "CTA", weight: 0.1 },
  ],
  DEMONSTRATION: [
    { purpose: "HOOK", weight: 0.15 },
    { purpose: "PRODUCT", weight: 0.35 },
    { purpose: "BENEFIT", weight: 0.25 },
    { purpose: "OFFER", weight: 0.1 },
    { purpose: "CTA", weight: 0.15 },
  ],
  REVIEW: [
    { purpose: "HOOK", weight: 0.15 },
    { purpose: "PRODUCT", weight: 0.3 },
    { purpose: "PROOF", weight: 0.25 },
    { purpose: "OFFER", weight: 0.15 },
    { purpose: "CTA", weight: 0.15 },
  ],
  STORYTELLING: [
    { purpose: "HOOK", weight: 0.2 },
    { purpose: "PROBLEM", weight: 0.25 },
    { purpose: "PRODUCT", weight: 0.25 },
    { purpose: "BENEFIT", weight: 0.15 },
    { purpose: "CTA", weight: 0.15 },
  ],
  COMPARISON: [
    { purpose: "HOOK", weight: 0.15 },
    { purpose: "PROBLEM", weight: 0.2 },
    { purpose: "PRODUCT", weight: 0.3 },
    { purpose: "OFFER", weight: 0.2 },
    { purpose: "CTA", weight: 0.15 },
  ],
  UGC: [
    { purpose: "HOOK", weight: 0.2 },
    { purpose: "PRODUCT", weight: 0.4 },
    { purpose: "BENEFIT", weight: 0.2 },
    { purpose: "CTA", weight: 0.2 },
  ],
  DISCOVERY: [
    { purpose: "HOOK", weight: 0.25 },
    { purpose: "PRODUCT", weight: 0.35 },
    { purpose: "OFFER", weight: 0.2 },
    { purpose: "CTA", weight: 0.2 },
  ],
};

type PurposeStaging = {
  camera: string;
  motion: string;
  lighting: string;
  transitionIntent: string;
  voiceoverIntent: string;
  sfxIntent: string | null;
};

const PURPOSE_STAGING: Record<ScenePurpose, PurposeStaging> = {
  HOOK: {
    camera: "close-up dinamico",
    motion: "corte rapido",
    lighting: "alto contraste",
    transitionIntent: "hard cut",
    voiceoverIntent: "gancho de abertura, sem saudacao generica",
    sfxIntent: "whoosh de entrada",
  },
  PROBLEM: {
    camera: "plano medio",
    motion: "estatico com leve zoom",
    lighting: "natural, tom neutro",
    transitionIntent: "cut",
    voiceoverIntent: "nomear a dor/situacao comum do publico-alvo",
    sfxIntent: null,
  },
  PRODUCT: {
    camera: "plano produto + apresentador quando presente",
    motion: "movimento suave de apresentacao",
    lighting: "key light no produto",
    transitionIntent: "cut",
    voiceoverIntent: "mostrar o produto resolvendo a dor/em uso",
    sfxIntent: "click/uso do produto",
  },
  BENEFIT: {
    camera: "close no beneficio/detalhe do produto",
    motion: "zoom lento",
    lighting: "destaque no produto",
    transitionIntent: "cut",
    voiceoverIntent: "reforcar o beneficio principal de forma curta",
    sfxIntent: null,
  },
  PROOF: {
    camera: "plano medio",
    motion: "estatico",
    lighting: "natural",
    transitionIntent: "cut",
    voiceoverIntent: "citar a prova real disponivel (avaliacao/confianca do marketplace)",
    sfxIntent: null,
  },
  OFFER: {
    camera: "plano do preco/produto",
    motion: "destaque grafico no preco",
    lighting: "alto contraste no preco",
    transitionIntent: "cut rapido",
    voiceoverIntent: "revelar o preco/desconto conforme a estrategia de offer reveal",
    sfxIntent: "cash register / notificacao",
  },
  CTA: {
    camera: "plano medio do apresentador ou produto",
    motion: "estatico, olhar direto pra camera quando ha apresentador",
    lighting: "identidade Radar Smart (dourado sobre fundo escuro)",
    transitionIntent: "fade out",
    voiceoverIntent: "CTA oficial da Radar Smart, urgencia conforme ctaStrategy",
    sfxIntent: null,
  },
};

// Direcao de personagem por proposito de cena. HOOK varia conforme o
// hookStrategy escolhido (choque de preco pede surpresa, nao convite).
function characterDirectionForPurpose(
  purpose: ScenePurpose,
  hookStrategy: HookStrategy,
): CommercialSceneCharacterDirection {
  if (purpose === "HOOK") {
    if (hookStrategy === "PRICE_SHOCK") return { expression: "SURPRISED", pose: "POINTING", shot: "HALF_BODY" };
    if (hookStrategy === "DEMONSTRATION") return { expression: "CONFIDENT", pose: "PRESENTING", shot: "HALF_BODY" };
    if (hookStrategy === "CURIOSITY" || hookStrategy === "DISCOVERY") return { expression: "THOUGHTFUL", pose: "NEUTRAL", shot: "HALF_BODY" };
    return { expression: "EXCITED", pose: "POINTING", shot: "HALF_BODY" };
  }

  switch (purpose) {
    case "PROBLEM":
      return { expression: "THOUGHTFUL", pose: "NEUTRAL", shot: "HALF_BODY" };
    case "PRODUCT":
      return { expression: "CONFIDENT", pose: "PRESENTING", shot: "HALF_BODY" };
    case "BENEFIT":
      return { expression: "SMILING", pose: "PRESENTING", shot: "HALF_BODY" };
    case "PROOF":
      return { expression: "CONFIDENT", pose: "NEUTRAL", shot: "HALF_BODY" };
    case "OFFER":
      return { expression: "EXCITED", pose: "POINTING", shot: "HALF_BODY" };
    case "CTA":
      return { expression: "INVITING", pose: "INVITING", shot: "HALF_BODY" };
    default:
      return { expression: "SMILING", pose: "NEUTRAL", shot: "HALF_BODY" };
  }
}

/**
 * Traduz a presenter strategy GERAL da campanha em presenca CONCRETA por
 * cena. GAROTA_RADAR_HOOK_ONLY/CTA_ONLY sao interpretados literalmente;
 * RECOMMENDATION a mantem presente na maior parte do video, exceto na
 * cena de produto puro (onde um close no produto sozinho tem mais forca).
 */
function resolveScenePresenter(overall: PresenterStrategy, purpose: ScenePurpose): ScenePresenter {
  switch (overall) {
    case "PRODUCT_ONLY":
      return "PRODUCT_ONLY";
    case "UGC_PERSONA":
      return "UGC_PERSONA";
    case "GAROTA_RADAR_FULL":
      return "GAROTA_RADAR_FULL";
    case "GAROTA_RADAR_HOOK_ONLY":
      return purpose === "HOOK" ? "GAROTA_RADAR_FULL" : "PRODUCT_ONLY";
    case "GAROTA_RADAR_CTA_ONLY":
      return purpose === "CTA" ? "GAROTA_RADAR_FULL" : "PRODUCT_ONLY";
    case "GAROTA_RADAR_RECOMMENDATION":
      return purpose === "PRODUCT" ? "PRODUCT_ONLY" : "GAROTA_RADAR_FULL";
    default:
      return "PRODUCT_ONLY";
  }
}

function textOverlayForPurpose(purpose: ScenePurpose, strategy: TextOverlayStrategy): string | null {
  if (strategy === "NO_TEXT") return null;

  const short: Partial<Record<ScenePurpose, string>> = {
    HOOK: "frase curta de choque/curiosidade",
    OFFER: "preco em destaque",
    PROOF: "avaliacao/confianca em destaque",
    CTA: "Radar Smart + CTA curto",
  };

  if (strategy === "MINIMAL") return purpose === "OFFER" || purpose === "CTA" ? (short[purpose] ?? null) : null;
  return short[purpose] ?? null;
}

export type ScenePlanInput = {
  storyStructure: StoryStructure;
  durationSeconds: number;
  hookStrategy: HookStrategy;
  presenterStrategy: PresenterStrategy;
  textOverlayStrategy: TextOverlayStrategy;
  productTitle: string;
  hasOfficialCharacter: boolean;
};

/**
 * Monta o plano de cenas puro (sem Character Pack). Escalona os pesos do
 * template pela duracao real e ajusta a ultima cena para absorver
 * arredondamento, garantindo que a soma bata exatamente com
 * durationSeconds.
 */
export function buildScenePlan(input: ScenePlanInput): CommercialScene[] {
  const template = STRUCTURE_TEMPLATES[input.storyStructure];
  const scenes: CommercialScene[] = [];

  let elapsed = 0;
  template.forEach((entry, index) => {
    const isLast = index === template.length - 1;
    const rawSeconds = input.durationSeconds * entry.weight;
    const startSecond = elapsed;
    const endSecond = isLast ? input.durationSeconds : Math.min(input.durationSeconds, startSecond + Math.round(rawSeconds));
    elapsed = endSecond;

    const staging = PURPOSE_STAGING[entry.purpose];
    const scenePresenter = resolveScenePresenter(input.presenterStrategy, entry.purpose);
    const hasCharacterInScene = input.hasOfficialCharacter && scenePresenter === "GAROTA_RADAR_FULL";

    scenes.push({
      id: `scene-${index + 1}`,
      order: index + 1,
      startSecond,
      endSecond,
      purpose: entry.purpose,
      visualSubject: hasCharacterInScene ? "Garota Radar" : `produto (${input.productTitle})`,
      presenter: scenePresenter,
      productAction: entry.purpose === "PRODUCT" || entry.purpose === "BENEFIT"
        ? `mostrar ${input.productTitle} resolvendo a necessidade do publico`
        : "produto em segundo plano ou destaque grafico",
      characterDirection: hasCharacterInScene ? characterDirectionForPurpose(entry.purpose, input.hookStrategy) : null,
      identityReferenceAssetId: null,
      supportReferenceAssetId: null,
      camera: staging.camera,
      motion: staging.motion,
      lighting: staging.lighting,
      textOverlay: textOverlayForPurpose(entry.purpose, input.textOverlayStrategy),
      voiceoverIntent: staging.voiceoverIntent,
      sfxIntent: staging.sfxIntent,
      transitionIntent: staging.transitionIntent,
    });
  });

  return scenes;
}
