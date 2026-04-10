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

  const prompt = `Você é um curador de ofertas real da startup Radar Smart.
    Gere um roteiro de vídeo curto (aproximadamente 13 segundos total) em português brasileiro para o produto "${offer.title}" que está custando R$ ${offer.price}.
    
    ESTILO DE LINGUAGEM:
    - Humano, informal, empolgado e rápido.
    - Use hesitações ("hã...", "tipo..."), gaguejadas leves no início de palavras e expressões casuais ("cara", "olha isso", "surreal").
    - NUNCA mencione marketplaces como Mercado Livre, Amazon, etc. Diga sempre "no app" ou "aqui no site".
    - O CTA deve ser EXATAMENTE: "Corre lá, entra no Radar Smart pelo link na bio e garante antes de esgotar!"
    
    DIVISÃO DO ROTEIRO EM 3 PARTES:
    - part1 (3s): Reação inicial enquanto vemos a home do site Radar Smart.
    - part2 (3s): Empolgação crescente enquanto vemos a página de ofertas.
    - part3 (restante): Foco no produto, preço e o CTA final obrigatório.
    
    O hook deve começar com uma reação genuína de surpresa.
    
    Retorne APENAS um objeto JSON com:
    {
      "part1": "...",
      "part2": "...",
      "part3": "...",
      "full_text": "Junção das 3 partes em um texto fluido.",
      "tone": "empolgado"
    }`;

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
    const parsed = JSON.parse(content);
    
    return {
      hook: parsed.part1 || "",
      body: (parsed.part2 || "") + " " + (parsed.part3 || ""),
      cta: "Corre lá, entra no Radar Smart pelo link na bio e garante antes de esgotar!",
      full_text: parsed.full_text,
      tone: parsed.tone,
      part1: parsed.part1,
      part2: parsed.part2,
      part3: parsed.part3
    };
  } catch (error) {
    console.error("Erro ao gerar roteiro UGC:", error);
    throw error;
  }
}
