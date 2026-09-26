// Radar Creative AI - Creative Director V2 / Decision Engine / Visual World
//
// Conceito global de mundo visual, derivado UMA VEZ por campanha a partir do
// visualStyle ja decidido por V1 (selectVisualStyle, reusado) + categoria.
// Cada cena deriva uma VARIACAO deste mesmo mundo (environment-decision.ts) -
// garante progressao sem virar 5 cenarios desconectados.

import type { VisualStyle } from "@/lib/commercial-director/types";

export type VisualWorldDirection = {
  baseMood: string;
  paletteIntent: string;
  lightingLanguage: string;
  materialLanguage: string;
  motionLanguage: string;
  backgroundContinuity: string;
};

const WORLD_BY_VISUAL_STYLE: Record<VisualStyle, VisualWorldDirection> = {
  LUXURY: {
    baseMood: "sofisticado, aspiracional",
    paletteIntent: "dourado quente sobre tons escuros",
    lightingLanguage: "luz direcional suave, reflexos controlados",
    materialLanguage: "superficies polidas, vidro, metal escovado",
    motionLanguage: "movimentos lentos e controlados",
    backgroundContinuity: "mesmo cenario de estudio escuro em todas as cenas, variando so o enquadramento",
  },
  TECH: {
    baseMood: "moderno, preciso",
    paletteIntent: "tons frios, azul/branco",
    lightingLanguage: "luz dura e direcional, contrastes definidos",
    materialLanguage: "superficies foscas, linhas retas",
    motionLanguage: "movimentos precisos, cortes limpos",
    backgroundContinuity: "ambiente minimalista consistente, variando profundidade de campo",
  },
  BEAUTY: {
    baseMood: "suave, sensorial",
    paletteIntent: "tons pastel, rosa/branco",
    lightingLanguage: "luz difusa e uniforme",
    materialLanguage: "texturas macias, brilho controlado",
    motionLanguage: "movimentos suaves e fluidos",
    backgroundContinuity: "estudio claro consistente, variando o angulo de luz",
  },
  FITNESS: {
    baseMood: "energico, ativo",
    paletteIntent: "tons vibrantes, contraste alto",
    lightingLanguage: "luz dinamica, sombras marcadas",
    materialLanguage: "texturas de tecido/suor/movimento",
    motionLanguage: "movimentos rapidos e energeticos",
    backgroundContinuity: "ambiente ativo consistente, variando o nivel de acao de fundo",
  },
  HOME_DEMO: {
    baseMood: "pratico, confiavel",
    paletteIntent: "tons neutros e quentes de casa real",
    lightingLanguage: "luz natural de ambiente domestico",
    materialLanguage: "superficies domesticas reais (madeira, tecido, ceramica)",
    motionLanguage: "movimentos naturais de uso cotidiano",
    backgroundContinuity: "mesmo ambiente domestico, variando o comodo/angulo",
  },
  LIFESTYLE: {
    baseMood: "autentico, aspiracional-real",
    paletteIntent: "tons naturais, luz quente",
    lightingLanguage: "luz natural, sombras suaves",
    materialLanguage: "texturas reais do cotidiano",
    motionLanguage: "movimentos naturais, camera levemente handheld",
    backgroundContinuity: "mesmo contexto de vida real, variando o momento do dia",
  },
  PRODUCT_HERO: {
    baseMood: "limpo, focado no produto",
    paletteIntent: "fundo neutro, produto em destaque cromatico",
    lightingLanguage: "key light dedicada ao produto",
    materialLanguage: "superficie do produto em evidencia",
    motionLanguage: "movimentos de camera orbitais/controlados",
    backgroundContinuity: "estudio neutro consistente, variando so o angulo em torno do produto",
  },
  UGC_NATIVE: {
    baseMood: "casual, autentico",
    paletteIntent: "tons naturais, sem tratamento pesado",
    lightingLanguage: "luz natural/disponivel, sem setup",
    materialLanguage: "texturas cotidianas reais",
    motionLanguage: "camera levemente instavel, estilo mao",
    backgroundContinuity: "ambiente cotidiano consistente, variando o comodo",
  },
  PREMIUM_COMMERCIAL: {
    baseMood: "premium, confiante",
    paletteIntent: "paleta de marca controlada",
    lightingLanguage: "iluminacao de estudio profissional",
    materialLanguage: "superficies cuidadas, sem ruido visual",
    motionLanguage: "movimentos de camera comerciais, suaves e intencionais",
    backgroundContinuity: "identidade visual consistente, variando composicao por cena",
  },
};

export function buildVisualWorldDirection(visualStyle: VisualStyle): VisualWorldDirection {
  return WORLD_BY_VISUAL_STYLE[visualStyle];
}
