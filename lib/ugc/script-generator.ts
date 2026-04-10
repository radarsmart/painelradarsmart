import { UGCOfferContext, UGCScript } from "./types";

/**
 * Gera um roteiro de vídeo UGC (User Generated Content) com linguagem natural,
 * hesitações e gaguejadas casuais para parecer um vídeo real e não ensaiado.
 */
export async function generateUGCScript(offer: UGCOfferContext): Promise<UGCScript> {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no ambiente.");
  }

  const prompt = `
  Você é um criador de conteúdo UGC brasileiro, focado em promoções e achados.
  Sua tarefa é criar um roteiro curto e extremamente natural para um vídeo de "achadinhos".
  
  DADOS DA OFERTA:
  - Produto: ${offer.title}
  - Preço: R$ ${offer.price}
  - Marketplace: ${offer.marketplace}
  - Desconto: ${offer.discountPct}% OFF
  
  REGRAS DE ESCRITA:
  1. HOOK: Deve começar com uma reação GENUÍNA de choque/surpresa (Ex: "Cara, não é possível!", "Gente, eu to em choque...", "O q-quê?") como se estivesse vendo o preço pela primeira vez.
  2. LINGUAGEM: Casual, coloquial, com hesitações (hã..., é..., tipo...) e gaguejadas leves (t-ta, p-preço).
  3. BODY: NUNCA mencione o nome do marketplace (ex: não diga "Mercado Livre" ou "Amazon"). Diga apenas "no app" ou "no site".
  4. CTA OBRIGATÓRIO (Exatamente esta frase): "Corre lá, entra no Radar Smart pelo link na bio e garante antes de esgotar!"
  5. Formato JSON: hook, body, cta, full_text, tone.
  `;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        temperature: 0.9,
        messages: [
          {
            role: "system",
            content: "Você é um criador de conteúdo UGC especializado em vídeos naturais e autênticos para redes sociais."
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    return JSON.parse(content) as UGCScript;
  } catch (error) {
    console.error("Erro ao gerar roteiro UGC:", error);
    throw error;
  }
}
