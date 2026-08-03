import { buildBriefingFromOffer } from "./from-offer";

function parseBenefitLines(benefits: string): string[] {
  return benefits
    .split("\n")
    .map((line) => line.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
}

// Formata os dados ja derivados de uma oferta real (preco, desconto,
// beneficios, dor do cliente) como um prompt descritivo pronto pra colar no
// Gemini/Veo — texto corrido em portugues, do jeito que geradores de video
// por IA esperam (cena + estilo + texto na tela), nao um schema JSON. O
// usuario cola isso direto no site/app do Gemini e gera o video la, manual.
export async function buildGeminiVideoPrompt(offerId: string): Promise<{ prompt: string; productName: string }> {
  const briefing = await buildBriefingFromOffer(offerId);
  const benefits = parseBenefitLines(briefing.product_benefits);

  const priceLine = briefing.product_discount
    ? `de R$ ${briefing.competitor_price ?? "?"} por R$ ${briefing.product_price} (${briefing.product_discount})`
    : `por R$ ${briefing.product_price}`;

  const promptLines = [
    `Video vertical (9:16), estilo TikTok/Reels, 15-20 segundos, ritmo dinamico com cortes rapidos, iluminacao clara e cores vibrantes.`,
    ``,
    `Produto: ${briefing.product_name}${briefing.product_category ? ` (categoria: ${briefing.product_category})` : ""}.`,
    `Preco em destaque na tela: ${priceLine}.`,
    ``,
    `Abertura (0-3s): plano rapido e chamativo mostrando o produto de perto, com uma frase de impacto na tela sobre a dor do cliente: "${briefing.product_pain}"`,
    ``,
    `Meio (3-14s): mostra o produto em uso real, destacando estes beneficios em texto na tela, um de cada vez:`,
    ...benefits.map((b, i) => `${i + 1}. ${b}`),
    ``,
    `Fechamento (14-20s): preco em destaque grande na tela (${priceLine}), com chamada para acao final: "Link na bio - Radar Smart".`,
    ``,
    `Estilo de audio: trilha instrumental animada e comercial, sem narracao falada (o texto todo aparece na tela).`,
  ];

  return { prompt: promptLines.join("\n"), productName: briefing.product_name };
}
