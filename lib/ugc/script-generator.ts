import { UGCOfferContext, UGCScript } from "./types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

function buildPersonaInstructions(offer: UGCOfferContext): string {
  const persona = offer.persona;
  if (!persona) {
    return [
      "PERSONA:",
      "- Creator brasileiro de alta credibilidade, com linguagem natural e ritmo de conversa real.",
      "- Use pequenas pausas, respiros curtos e variacao de energia, sem exagerar em cacoetes.",
      "- Nao use depoimento falso nem afirme experiencia pessoal que nao foi comprovada.",
    ].join("\n");
  }

  const useCases = persona.primaryUseCases.length
    ? persona.primaryUseCases.join(", ")
    : "geral";

  return [
    "PERSONA:",
    `- Nome interno: ${persona.name}`,
    `- Arquétipo: ${persona.archetype}`,
    persona.visualStyle ? `- Estilo visual: ${persona.visualStyle}` : "",
    persona.tone ? `- Tom de fala: ${persona.tone}` : "",
    persona.energy ? `- Energia: ${persona.energy}` : "",
    persona.accent ? `- Sotaque: ${persona.accent}` : "",
    `- Nichos preferidos: ${useCases}`,
    persona.behaviorProfile
      ? `- Direção comportamental: ${JSON.stringify(persona.behaviorProfile)}`
      : "",
    persona.cameraProfile
      ? `- Direção de câmera: ${JSON.stringify(persona.cameraProfile)}`
      : "",
    "- A fala deve soar humana e orgânica, mas sem fingir ser cliente real do produto.",
    "- Use naturalidade, pequenas pausas e variação de frase, sem ficar roboticamente perfeito.",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAngleInstructions(offer: UGCOfferContext): string {
  const angle = offer.angle;
  if (!angle) {
    return [
      "ANGULO:",
      "- Priorize um angulo de performance simples: beneficio direto, economia percebida ou curiosidade.",
      "- O hook deve interromper o scroll nos primeiros 2 a 3 segundos.",
    ].join("\n");
  }

  return [
    "ANGULO:",
    `- Nome: ${angle.name}`,
    angle.angleType ? `- Tipo: ${angle.angleType}` : "",
    angle.description ? `- Descricao: ${angle.description}` : "",
    angle.painPoints.length ? `- Dores: ${angle.painPoints.join(" | ")}` : "",
    angle.desirePoints.length ? `- Desejos: ${angle.desirePoints.join(" | ")}` : "",
    angle.proofPoints.length ? `- Provas: ${angle.proofPoints.join(" | ")}` : "",
    angle.hookStarters.length ? `- Aberturas sugeridas: ${angle.hookStarters.join(" | ")}` : "",
    angle.ctaOptions.length ? `- CTAs sugeridos: ${angle.ctaOptions.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTemplateInstructions(offer: UGCOfferContext): string {
  const template = offer.template;
  if (!template) {
    return [
      "TEMPLATE:",
      "- Estrutura padrao: hook forte, contexto curto, prova rapida e CTA final.",
      "- Mantenha o roteiro em formato vertical de alta retencao.",
    ].join("\n");
  }

  return [
    "TEMPLATE:",
    `- Nome: ${template.name}`,
    template.objective ? `- Objetivo principal: ${template.objective}` : "",
    template.description ? `- Descricao: ${template.description}` : "",
    template.hookFramework ? `- Framework de hook: ${template.hookFramework}` : "",
    template.structureSteps.length ? `- Estrutura: ${template.structureSteps.join(" -> ")}` : "",
    template.recommendedDuration ? `- Duracao recomendada: ${template.recommendedDuration}` : "",
    template.ctaStyle ? `- Estilo de CTA: ${template.ctaStyle}` : "",
    template.editingNotes
      ? `- Notas de edicao: ${JSON.stringify(template.editingNotes)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildVoiceDirectionInstructions(offer: UGCOfferContext): string {
  const direction = offer.voiceDirection;
  if (!direction) {
    return [
      "DIRECAO DE VOZ:",
      "- Ritmo equilibrado, pausas naturais e credibilidade alta.",
      "- CTA firme, mas sem parecer locucao publicitaria dura.",
    ].join("\n");
  }

  return [
    "DIRECAO DE VOZ:",
    direction.pace ? `- Ritmo: ${direction.pace}` : "",
    direction.pauseStyle ? `- Estilo de pausa: ${direction.pauseStyle}` : "",
    direction.emotionalIntensity ? `- Intensidade emocional: ${direction.emotionalIntensity}` : "",
    direction.urgency ? `- Nivel de urgencia: ${direction.urgency}` : "",
    direction.credibility ? `- Nivel de credibilidade: ${direction.credibility}` : "",
    direction.ctaPressure ? `- Pressao do CTA: ${direction.ctaPressure}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBehaviorDirectionInstructions(offer: UGCOfferContext): string {
  const direction = offer.behaviorDirection;
  if (!direction) {
    return [
      "DIRECAO COMPORTAMENTAL:",
      "- Olhar equilibrado para camera, gestos leves e imperfeicao sutil.",
      "- Expressividade natural, sem parecer ensaiado demais.",
    ].join("\n");
  }

  return [
    "DIRECAO COMPORTAMENTAL:",
    direction.eyeContact ? `- Contato visual: ${direction.eyeContact}` : "",
    direction.gestureIntensity ? `- Intensidade de gestos: ${direction.gestureIntensity}` : "",
    direction.smileLevel ? `- Nivel de sorriso: ${direction.smileLevel}` : "",
    direction.imperfectionLevel ? `- Nivel de imperfeicao: ${direction.imperfectionLevel}` : "",
    direction.cameraEnergy ? `- Energia em camera: ${direction.cameraEnergy}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildPrompt(offer: UGCOfferContext): string {
  const discountText =
    offer.discountPct && offer.discountPct > 0
      ? `Desconto detectado: ${offer.discountPct}%`
      : "Desconto nao confirmado";

  const originalPriceText =
    offer.originalPrice && offer.originalPrice > offer.price
      ? `Preco de referencia anterior: R$ ${offer.originalPrice.toFixed(2).replace(".", ",")}`
      : "Preco anterior nao confirmado";

  const objective = offer.objective || "conversion";
  const campaignName = offer.campaignName || offer.title;

  return [
    "Voce e um estrategista de criativos de performance da Radar Smart.",
    "Gere um roteiro curto de UGC em portugues brasileiro para anuncio vertical.",
    "",
    `Produto: ${offer.title}`,
    `Campanha: ${campaignName}`,
    `Marketplace: ${offer.marketplace}`,
    offer.category ? `Categoria: ${offer.category}` : "",
    `Preco atual: R$ ${offer.price.toFixed(2).replace(".", ",")}`,
    originalPriceText,
    discountText,
    `Objetivo: ${objective}`,
    `URL do produto: ${offer.productUrl}`,
    "",
    buildPersonaInstructions(offer),
    "",
    buildAngleInstructions(offer),
    "",
    buildTemplateInstructions(offer),
    "",
    buildVoiceDirectionInstructions(offer),
    "",
    buildBehaviorDirectionInstructions(offer),
    "",
    "REGRAS DE COPY:",
    "- O texto precisa parecer gravado por um creator real, com fala limpa e natural.",
    "- Use micro imperfeicoes humanas apenas de forma leve: pausas, retomadas curtas, mudanca de ritmo.",
    "- Nao use gagueira caricata nem excesso de interjeicoes.",
    "- Nao mencione Amazon, Mercado Livre, Shopee ou qualquer marketplace. Use 'no site', 'aqui na oferta' ou 'na Radar Smart'.",
    "- Nao invente depoimento, compra pessoal, avaliacao ou prova social que nao foi fornecida.",
    "- Nao faca promessa absoluta, medica, financeira ou enganosa.",
    "- O CTA final deve direcionar para clicar no link e/ou entrar no grupo da Radar Smart.",
    "- Se houver angulo e template fornecidos, eles devem guiar a abertura, a prova e o CTA.",
    "",
    "ESTRUTURA:",
    "- part1: hook de 2 a 4 segundos",
    "- part2: desenvolvimento curto com beneficio e prova visual",
    "- part3: fechamento com CTA claro",
    "- full_text: texto unido em leitura fluida",
    "- tone: descreva o tom do criativo em 2 a 4 palavras",
    "",
    "Retorne APENAS JSON valido neste formato:",
    "{",
    '  "part1": "...",',
    '  "part2": "...",',
    '  "part3": "...",',
    '  "full_text": "...",',
    '  "tone": "..."',
    "}",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateUGCScript(
  offer: UGCOfferContext,
): Promise<UGCScript> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY nao configurada no ambiente.");
  }

  const prompt = buildPrompt(offer);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content:
            "Voce cria roteiros de UGC de alta conversao para a Radar Smart, com naturalidade, clareza e conformidade publicitaria.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`OpenAI API error: ${JSON.stringify(error)}`);
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Resposta vazia ao gerar roteiro UGC.");
  }

  const parsed = JSON.parse(content) as Record<string, unknown>;
  const part1 = String(parsed.part1 ?? "").trim();
  const part2 = String(parsed.part2 ?? "").trim();
  const part3 = String(parsed.part3 ?? "").trim();
  const fullText =
    String(parsed.full_text ?? "").trim() ||
    [part1, part2, part3].filter(Boolean).join(" ").trim();

  return {
    hook: part1,
    body: [part2, part3].filter(Boolean).join(" ").trim(),
    cta: part3,
    full_text: fullText,
    tone: String(parsed.tone ?? "natural e persuasivo").trim(),
    part1,
    part2,
    part3,
  };
}
