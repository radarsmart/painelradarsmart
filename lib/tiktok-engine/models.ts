export type TikTokVideoModel = {
  id: number;
  name: string;
  duration: string;
  cvr: string;
  promptAngle: string;
};

export const TIKTOK_VIDEO_MODELS: TikTokVideoModel[] = [
  {
    id: 1,
    name: "Problema → Solução Choque",
    duration: "15-21s",
    cvr: "8-12%",
    promptAngle:
      "Comece com a dor principal em close-up, mostre o produto resolvendo em tempo real e termine com antes/depois impactante.",
  },
  {
    id: 2,
    name: "ASMR Unboxing",
    duration: "15-30s",
    cvr: "6-9%",
    promptAngle:
      "Foque em sons satisfatórios de abertura e manuseio. Sem fala no início, com revelação gradual do produto.",
  },
  {
    id: 3,
    name: "POV Storytelling",
    duration: "21-45s",
    cvr: "10-15%",
    promptAngle:
      "Narrativa em primeira pessoa com jornada pessoal, virada emocional e CTA natural no fim.",
  },
  {
    id: 4,
    name: "Review Brutal Honesto",
    duration: "30-60s",
    cvr: "7-11%",
    promptAngle:
      "Comece com 2 pontos negativos reais e depois destaque os positivos que justificam a compra.",
  },
  {
    id: 5,
    name: "Comparação X vs Y",
    duration: "21-35s",
    cvr: "9-14%",
    promptAngle:
      "Comparação lado a lado entre barato e caro, com 3 testes práticos e revelação final.",
  },
  {
    id: 6,
    name: "Tutorial Rápido",
    duration: "15-30s",
    cvr: "5-8%",
    promptAngle:
      "Mostre 3 formas de usar o produto (básico, intermediário e avançado) de forma objetiva.",
  },
  {
    id: 7,
    name: "Trend Hijack",
    duration: "9-15s",
    cvr: "4-7%",
    promptAngle:
      "Aproveite trend atual, encaixe produto como punchline e encerre com CTA curto.",
  },
  {
    id: 8,
    name: "Rotina / Day-in-Life",
    duration: "30-60s",
    cvr: "6-10%",
    promptAngle:
      "Produto aparece de forma orgânica dentro de rotina diária, com estética aspiracional.",
  },
  {
    id: 9,
    name: "Social Proof",
    duration: "15-25s",
    cvr: "11-16%",
    promptAngle:
      "Abra com dado de prova social forte, reviews rápidos e urgência de estoque.",
  },
  {
    id: 10,
    name: "Duelo de Preço",
    duration: "15-25s",
    cvr: "12-18%",
    promptAngle:
      "Choque de preço versus concorrente caro, prova de equivalência e CTA urgente.",
  },
];

export function getModelById(modelId: number): TikTokVideoModel | null {
  return TIKTOK_VIDEO_MODELS.find((model) => model.id === modelId) ?? null;
}
