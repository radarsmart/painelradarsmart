/**
 * Banco de variações de hook para o TikTok Engine.
 * Cada modelo tem 5 variações sorteadas aleatoriamente a cada job,
 * permitindo A/B test automático de desempenho de hooks.
 *
 * {PRODUCT}, {PRICE}, {DISCOUNT}, {COMPETITOR_PRICE} são substituídos
 * pelo pipeline antes de inserir no prompt da OpenAI.
 */

export const HOOK_VARIATIONS: Readonly<Record<number, readonly string[]>> = {
  // Modelo 1 — Problema → Solução Choque
  1: [
    "Não acredito no que acabei de ver...",
    "Para tudo! Olha o preço disso...",
    "Isso não pode tá certo... mas tá",
    "Alguém me explica como esse preço é possível",
    "Eu tava procurando isso faz MESES",
  ],

  // Modelo 2 — ASMR Unboxing
  2: [
    "Esse som vai te viciar...",
    "Quando o pacote chegou eu não tava pronto...",
    "Unboxing do produto que tá bombando essa semana",
    "Olha o que acabou de chegar aqui em casa",
    "Não esperava que ia ser TÃO satisfatório...",
  ],

  // Modelo 3 — POV Storytelling
  3: [
    "POV: você finalmente achou o que sempre quis",
    "Isso mudou minha rotina de verdade",
    "Eu precisaria ter achado isso antes...",
    "A historia do produto que ninguem contou pra mim",
    "Do problema ate a solucao em menos de 30 segundos",
  ],

  // Modelo 4 — Review Brutal Honesto
  4: [
    "Vou ser honesto: tem coisa ruim e coisa boa",
    "Review sem filtro — o que ninguem fala",
    "Comprei, testei e vou te contar tudo",
    "2 defeitos e 5 vantagens. Vale a pena?",
    "A verdade sobre esse produto que ta em todo lugar",
  ],

  // Modelo 5 — Comparação X vs Y
  5: [
    "Paguei {COMPETITOR_PRICE} no concorrente. Aqui ta {PRICE}. Nao acredito",
    "Teste lado a lado — qual e melhor de verdade?",
    "O barato vs o caro: resultado SURPREENDEU",
    "Cabou de vez a discussao de qual comprar",
    "Voce esta pagando caro demais por isso",
  ],

  // Modelo 6 — Tutorial Rápido
  6: [
    "3 formas de usar que voce nao conhece",
    "Aprendi isso em 15 segundos e mudou tudo",
    "Do jeito errado vs do jeito certo — rapido",
    "Como usar direitinho em menos de 20 segundos",
    "O truque que ninguem te ensinou sobre esse produto",
  ],

  // Modelo 7 — Trend Hijack
  7: [
    "Isso ta em todo lugar mas poucas pessoas sabem...",
    "A trend que voce nao esperava ver assim",
    "Quando a trend encontra a oferta perfeita",
    "Isso que ta bombando no TikTok agora — com desconto",
    "Nao e so trend. E economia real",
  ],

  // Modelo 8 — Rotina / Day-in-Life
  8: [
    "Um dia na minha rotina com esse produto",
    "Como isso entrou na minha vida e nao saiu mais",
    "De noche a noite — como uso isso todo dia",
    "Minha rotina com e sem. Diferenca brutal",
    "Adicionei isso na minha vida a 30 dias atras",
  ],

  // Modelo 9 — Social Proof
  9: [
    "Mais de 2000 pessoas compraram essa semana",
    "4.8 estrelas e isso nao e exagero — olha",
    "Todo mundo que mostrei quis comprar na hora",
    "Os reviews falam por si so — impressionante",
    "Nao confie em mim. Confie em quem ja comprou",
  ],

  // Modelo 10 — Duelo de Preço
  10: [
    "Vi esse mesmo produto por {COMPETITOR_PRICE}. Aqui ta {PRICE}. Eu nao acredito",
    "O concorrente cobra o dobro por isso. Sabe por que?",
    "Preco de hoje vs preco de amanha — aproveita agora",
    "Com {DISCOUNT} de desconto voce economiza de verdade",
    "Isso devia ser caro. Por algum motivo nao ta sendo",
  ],
} as const;

/**
 * Retorna uma variação de hook para o modelo dado.
 * @param modelId - ID do modelo de vídeo
 * @param forceIndex - índice forçado (para testes ou replay de briefing)
 * @returns `{ text: string; index: number }`
 */
export function pickHookVariation(
  modelId: number,
  forceIndex?: number,
): { text: string; index: number } {
  const pool = HOOK_VARIATIONS[modelId] ?? HOOK_VARIATIONS[1]!;
  const index =
    forceIndex !== undefined && forceIndex >= 0 && forceIndex < pool.length
      ? forceIndex
      : Math.floor(Math.random() * pool.length);
  return { text: pool[index]!, index };
}

/**
 * Resolve os placeholders de um hook text com dados reais do produto.
 */
export function resolveHookPlaceholders(
  hookText: string,
  vars: {
    productName?: string;
    price?: string;
    discount?: string;
    competitorPrice?: string;
  },
): string {
  return hookText
    .replace(/\{PRODUCT\}/g, vars.productName ?? "produto")
    .replace(/\{PRICE\}/g, vars.price ?? "")
    .replace(/\{DISCOUNT\}/g, vars.discount ?? "")
    .replace(/\{COMPETITOR_PRICE\}/g, vars.competitorPrice ?? "concorrente");
}
