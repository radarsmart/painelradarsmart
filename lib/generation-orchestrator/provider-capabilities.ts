// Radar Creative AI - Generation Orchestrator / Provider Capabilities
//
// Registry ESTATICO do que cada provider de fato suporta hoje, com base
// em inspecao real do codigo existente (lib/ai/*, lib/ugc/freepik.ts,
// lib/ugc/heygen.ts). Nao inventa capacidade nenhuma - onde nao ha
// suporte real ainda, o campo fica documentado como limitacao (ver
// notes) e a unica opcao viavel continua sendo "mock".
//
// custo (costModel) so existe quando ha numero real confirmado no
// codigo (lib/ugc/generation-config.ts: 65 creditos/segundo, R$0,004 por
// credito - ja usado e validado para Kling/OmniHuman). Nunca inventado.
//
// STATUS (ver ProviderStatus em types.ts, adicionado na auditoria
// TEXT_TO_VIDEO de 2026-08-08): "estar nesta lista" nunca mais significa
// "elegivel pra selecao automatica" sozinho - so profiles com
// status "ACTIVE" sao considerados por getActiveProvidersForCapability
// (usado pelo provider-selector.ts). Atribuido por EVIDENCIA real deste
// projeto (CANARY bem-sucedido), nunca por suposicao:
//   - freepik-kling-i2v: ACTIVE - varios CANARYs reais bem-sucedidos
//     (Creatina scene-3, Invictus CANARY #3/#4).
//   - openai-image-edit: ACTIVE - CANARY real validou identidade da
//     Garota Radar para CHARACTER_IMAGE (2 execucoes reais); PRODUCT_IMAGE/
//     IMAGE_TO_IMAGE do mesmo profile NUNCA foram testados de verdade -
//     documentado explicitamente em notes, nao em um status separado (o
//     tipo tem 1 status por provider, nao por capability).
//   - freepik-kling-t2v: DISABLED - a auditoria de 2026-08-08 confirmou
//     que a Kling nao tem NENHUM endpoint text-to-video documentado hoje
//     (todos os 5 paths Kling reais sao image-to-video); esta integracao
//     sempre apontou pra uma capacidade que nunca existiu de verdade.
//   - freepik-omnihuman, heygen-avatar: UNVERIFIED - documentados, nunca
//     chamados de verdade neste projeto para CHARACTER_VIDEO (o unico
//     teste real de "animar a Garota Radar" foi via freepik-kling-i2v,
//     que nao esta registrado como CHARACTER_VIDEO por nao garantir
//     identidade - ver nota do proprio profile).
//   - heygen-image-avatar: ACTIVE - CANARY real concluido em 2026-08-09
//     (video_id b63c737565bd482bb7d7ad7ba9592f4e), usando imagem propria
//     da Garota Radar + audio_url externo da Ana Dias via type="image".
//   - freepik-mystic, openai-dalle: UNVERIFIED - documentados, nunca
//     chamados de verdade neste projeto.
//   - mock: ACTIVE, mas so no sentido de "elegivel pra execucao local/
//     mock" - nunca deve ser lido como "provider pago confirmado".

import type { ProviderCapabilityProfile } from "@/lib/generation-orchestrator/types";

const KLING_COST_MODEL = { creditsPerSecond: 65, centavosPerCredit: 0.4 };

export const PROVIDER_CAPABILITIES: ProviderCapabilityProfile[] = [
  {
    provider: "mock",
    capabilities: [
      "TEXT_TO_IMAGE",
      "IMAGE_TO_IMAGE",
      "TEXT_TO_VIDEO",
      "IMAGE_TO_VIDEO",
      "CHARACTER_IMAGE",
      "CHARACTER_VIDEO",
      "PRODUCT_IMAGE",
      "PRODUCT_VIDEO",
    ],
    status: "ACTIVE",
    supportsIdentityReference: true,
    supportsProductReference: true,
    notes:
      "Provider mock de lib/ai/providers/{image,video} - sempre disponivel, nunca consome " +
      "credito real, usado para toda execucao nesta fase independente da capability. ACTIVE " +
      "aqui significa 'elegivel pra execucao local/mock', nao 'provider pago externo validado'.",
    costModel: null,
    // NUNCA true - "mock" nao produz midia real de producao em NENHUMA
    // circunstancia, so serve pra DRY_RUN/testes locais (ver Execution
    // Readiness V1). Continua ACTIVE de proposito (nao quebrar o
    // ecossistema de testes existente).
    productionEligible: false,
  },
  {
    provider: "freepik-mystic",
    capabilities: ["TEXT_TO_IMAGE"],
    status: "UNVERIFIED",
    supportsIdentityReference: false,
    supportsProductReference: false,
    notes:
      "Freepik Mystic (lib/ugc/freepik.ts generateImage) - texto para imagem. Sem parametro " +
      "de imagem de referencia, nao suporta image-to-image nem preservacao de identidade. " +
      "Documentado mas nunca chamado de verdade por este projeto - UNVERIFIED.",
    costModel: null,
    productionEligible: false,
  },
  {
    provider: "freepik-kling-i2v",
    capabilities: ["IMAGE_TO_VIDEO", "PRODUCT_VIDEO"],
    status: "ACTIVE",
    supportsIdentityReference: false,
    supportsProductReference: true,
    notes:
      "Freepik Kling v2.5 Pro image-to-video (lib/ugc/freepik.ts animateImage) - anima uma " +
      "imagem de entrada (serve bem para animar uma foto de produto). NAO garante preservacao " +
      "de identidade facial - nao deve ser usado sozinho para CHARACTER_VIDEO. ACTIVE: varios " +
      "CANARYs reais bem-sucedidos (Creatina scene-3, Invictus CANARY #3/#4).",
    costModel: KLING_COST_MODEL,
    productionEligible: true,
  },
  {
    provider: "freepik-kling-t2v",
    capabilities: ["TEXT_TO_VIDEO"],
    status: "DISABLED",
    supportsIdentityReference: false,
    supportsProductReference: false,
    notes:
      "Freepik Kling v3 Omni text-to-video (lib/ugc/freepik.ts textToVideo) - sem imagem de " +
      "entrada. DISABLED (auditoria de 2026-08-08): a documentacao oficial atual da Kling NAO " +
      "lista nenhum endpoint text-to-video - os 5 paths Kling documentados hoje " +
      "(kling-v2.1-pro, kling-v2.5-pro, kling-v2-6-pro, kling-motion, kling-o1-pro) sao todos " +
      "image-to-video. Uma chamada real de teste (payload vazio, sem gerar video) ao endpoint " +
      "kling-v3-omni-std retornou um task_id que nao resolve no polling ('Not found') - a " +
      "integracao nunca correspondeu a uma capacidade real. Nao selecionar automaticamente. " +
      "Ver auditoria completa na conversa de 2026-08-08.",
    costModel: null,
    productionEligible: false,
  },
  {
    provider: "freepik-omnihuman",
    capabilities: ["CHARACTER_VIDEO"],
    status: "UNVERIFIED",
    supportsIdentityReference: true,
    supportsProductReference: false,
    notes:
      "Freepik OmniHuman 1.5 (lib/ugc/freepik.ts animateAvatar - host/header desatualizados, " +
      "ver adapter isolado em adapters/freepik-omnihuman.ts com os valores corretos " +
      "api.magnific.com/x-magnific-api-key) - avatar falante a partir de UMA imagem de " +
      "referencia + audio (lip-sync, audio SEMPRE obrigatorio). E a opcao real mais proxima de " +
      "preservar a identidade da Garota Radar hoje, mas ainda nao foi validada com PRIMARY/" +
      "support reais - UNVERIFIED ate um CANARY real confirmar.",
    // PRECO CONFIRMADO em 2026-08-09 (magnific.com/ai/docs/ai-video-generator-credits,
    // conferido em 2 consultas independentes): 180 creditos/segundo,
    // SEM variacao por resolucao (a coluna de resolucao desse modelo na
    // tabela oficial e "-"). Ate 2026-08-09 este campo usava KLING_COST_MODEL
    // (65 creditos/s) por SUPOSICAO - ver lib/ugc/generation-config.ts,
    // que documentava isso como "chutando na mesma ordem de grandeza do
    // Kling ate testarmos de verdade". Corrigido para o valor real - quase
    // 3x mais caro que o assumido. centavosPerCredit reaproveita a MESMA
    // taxa de plano ja confirmada para Kling (R$180/45.000 creditos =
    // 0,4 centavo/credito - e uma taxa de PLANO, nao de modelo especifico).
    costModel: { creditsPerSecond: 180, centavosPerCredit: 0.4 },
    productionEligible: false,
  },
  {
    provider: "openai-dalle",
    capabilities: ["TEXT_TO_IMAGE"],
    status: "UNVERIFIED",
    supportsIdentityReference: false,
    supportsProductReference: false,
    notes:
      "DALL-E 3 (lib/ai/providers/image/openai.ts) - nao suporta imagem de referencia real; " +
      "quando sourceImageUrl e informado, a implementacao atual apenas reaproveita essa URL " +
      "em vez de gerar algo novo a partir dela. Documentado mas nunca chamado de verdade por " +
      "este projeto - UNVERIFIED.",
    costModel: null,
    productionEligible: false,
  },
  {
    provider: "openai-image-edit",
    capabilities: ["CHARACTER_IMAGE", "PRODUCT_IMAGE", "IMAGE_TO_IMAGE"],
    status: "ACTIVE",
    supportsIdentityReference: true,
    supportsProductReference: true,
    notes:
      "OpenAI gpt-image-2 via /v1/images/edits (verificado direto na API real da conta em " +
      "2026-08-07 - modelo mais novo que gpt-image-1, usado em lib/ai/product-image.ts para " +
      "outro fluxo; aqui como adapter dedicado - ver " +
      "lib/generation-orchestrator/adapters/openai-character-image.ts). UNICO provider real no " +
      "codigo que aceita imagem de referencia para gerar/editar (nao e text-to-image puro). " +
      "Aceita multiplas imagens de referencia (identity + support) via campo image[] repetido, " +
      "e forca input_fidelity alto automaticamente em todas elas - mas a OpenAI nao documenta " +
      "contrato formal de 'imagem 1 = identidade, imagem 2 = pose'. Sem parametro de negative " +
      "prompt (a API nao tem esse campo). Sem custo conhecido/confirmado - a resposta da API " +
      "nao retorna dado de uso/custo. ACTIVE: 2 CANARYs reais validaram identidade da Garota " +
      "Radar para CHARACTER_IMAGE (generationSafe support); PRODUCT_IMAGE e IMAGE_TO_IMAGE do " +
      "mesmo profile AINDA NAO foram testados de verdade - status unico por provider (nao por " +
      "capability), documentado aqui em vez de um enum separado.",
    costModel: null,
    // productionEligible=true so pra CHARACTER_IMAGE (a capability
    // realmente validada por CANARY) - PRODUCT_IMAGE/IMAGE_TO_IMAGE deste
    // MESMO profile ainda nao tem evidencia real, mas o campo e por
    // provider (nao por capability), igual ao "status" - documentado aqui
    // pra quem for usar esta capability saber que a garantia e parcial.
    productionEligible: true,
  },
  {
    provider: "heygen-avatar",
    capabilities: ["CHARACTER_VIDEO"],
    status: "UNVERIFIED",
    supportsIdentityReference: false,
    supportsProductReference: false,
    notes:
      "HeyGen (lib/ugc/heygen.ts) usa avatares da propria biblioteca (avatar_id) - nao aceita " +
      "a imagem de referencia da Garota Radar diretamente, portanto NAO preserva a identidade " +
      "dela hoje. Nunca chamado de verdade por este projeto - UNVERIFIED.",
    costModel: null,
    productionEligible: false,
  },
  {
    provider: "heygen-image-avatar",
    capabilities: ["CHARACTER_VIDEO"],
    status: "ACTIVE",
    supportsIdentityReference: true,
    supportsProductReference: false,
    notes:
      "HeyGen Image Avatar (POST /v3/videos, type=image + audio_url externo) - provider " +
      "separado do heygen-avatar legado. CANARY real executado em 2026-08-09, video_id " +
      "b63c737565bd482bb7d7ad7ba9592f4e, resultado PASS_WITH_OBSERVATIONS: identidade " +
      "preservada, rosto estavel, roupa/cabelo preservados, sem deformacoes criticas, sem " +
      "flicker relevante e lip-sync tecnicamente funcional. Suporta imagem customizada da " +
      "Garota Radar e audio_url externo com a voz oficial Ana Dias. Recomendado inicialmente " +
      "para videos curtos HOOK/CTA; avaliacao perceptual fina de lip-sync ainda depende de " +
      "revisao humana assistindo ao MP4.",
    // HeyGen usa wallet USD, nao creditos Magnific. Fonte oficial confirmada
    // em 2026-08-09: Avatar IV @1080p = US$4/min. O delta observado de
    // wallet no CANARY ($4.93 -> $4.78) e somente empirico, nunca formula
    // oficial. 720p/4K continuam UNKNOWN.
    costModel: null,
    usdCostModel: {
      costUnit: "USD",
      costPerMinuteUSD: 4,
      resolution: "1080p",
      unknownResolutions: ["720p", "4k"],
    },
    productionEligible: true,
  },
  {
    provider: "wan-2-5-t2v",
    capabilities: ["TEXT_TO_VIDEO"],
    status: "ACTIVE",
    supportsIdentityReference: false,
    supportsProductReference: false,
    notes:
      "WAN 2.5 T2V 1080p (docs.magnific.com/api-reference/text-to-video/wan-2-5-t2v-1080p, " +
      "verificado em 2026-08-08) - POST https://api.magnific.com/v1/ai/text-to-video/" +
      "wan-2-5-t2v-1080p, header x-magnific-api-key, body {prompt (obrigatorio, max 800 " +
      "chars), negative_prompt (opcional, max 500), duration ('5' ou '10'), seed, " +
      "webhook_url}. Sem parametro de aspect_ratio/vertical documentado - saida " +
      "presumivelmente paisagem 1080p (o Hybrid Compositor ja sabe fazer crop/scale " +
      "determinístico pra 9:16 sem distorcer). Endpoint de LISTA de tasks confirmado " +
      "(GET no mesmo path, docs.magnific.com/.../wan-2-5-t2v-1080p-tasks); GET por task_id " +
      "individual inferido do mesmo path + /{task_id} (padrao generico documentado em outras " +
      "categorias da API, ja comprovado no adapter Kling deste projeto) - nao ha pagina de doc " +
      "dedicada so pro GET individual. PRECO CONFIRMADO em 2026-08-08 " +
      "(magnific.com/ai/docs/ai-video-generator-credits): 300 creditos/segundo em 1080p. Taxa " +
      "credito->BRL desta conta AINDA NAO confirmada - custo em credito e real, custo em BRL " +
      "fica null ate confirmarmos (ver costModel.centavosPerCredit). ACTIVE por decisao humana " +
      "controlada em 2026-08-09 apos 2 CANARYs reais concluidos: CANARY #1 task_id " +
      "f3ce024a-1f70-47a2-9115-2168422a7760, technicalStatus COMPLETED, BACKGROUND_QUALITY " +
      "PASS; CANARY #2 task_id d11eb3d6-8f20-4322-830d-cc6fa7af1b8d, COMPLETED, " +
      "WAN_SECOND_CANARY_RESULT PASS_WITH_OBSERVATIONS. Escopo restrito: TEXT_TO_VIDEO para " +
      "backgrounds/cenas sem produto e sem personagem; nao usar para PRODUCT_VIDEO, " +
      "CHARACTER_VIDEO ou IMAGE_TO_VIDEO.",
    costModel: { creditsPerSecond: 300, centavosPerCredit: null },
    // true SOMENTE para TEXT_TO_VIDEO/backgrounds sem produto/personagem,
    // por promocao manual deliberada apos 2 CANARYs reais. Nao implica
    // promocao de capability nem autorizacao para campanha completa.
    productionEligible: true,
  },
  {
    provider: "ltx-2-pro",
    capabilities: ["TEXT_TO_VIDEO"],
    status: "UNVERIFIED",
    supportsIdentityReference: false,
    supportsProductReference: false,
    notes:
      "LTX 2.0 Pro (docs.magnific.com/api-reference/text-to-video/ltx-2-pro, verificado em " +
      "2026-08-08) - POST https://api.magnific.com/v1/ai/text-to-video/ltx-2-pro, body " +
      "{prompt (obrigatorio, max 2000 chars), resolution (1080p/1440p/2160p), duration (6, 8 " +
      "ou 10 - NAO aceita '5'), fps (25 ou 50, 50 so ate 10s), generate_audio, seed, " +
      "webhook_url}. Sem negative_prompt documentado. Preco CONFIRMADO em 2026-08-08 " +
      "(magnific.com/ai/docs/ai-video-generator-credits): 120 creditos/segundo em 1080p - mais " +
      "barato que o WAN (300/s), mas fora do escopo desta tarefa (so o adapter do WAN foi " +
      "construido); costModel deliberadamente deixado null aqui ate essa decisao ser tomada. " +
      "Duracao minima de 6s e menos compativel com o padrao de 5s usado nos CANARYs deste " +
      "projeto que o WAN. UNVERIFIED ate CANARY real confirmar.",
    costModel: null,
    productionEligible: false,
  },
];

export function getProviderProfile(provider: string): ProviderCapabilityProfile | null {
  return PROVIDER_CAPABILITIES.find((profile) => profile.provider === provider) ?? null;
}

// Todos os profiles registrados para a capability, INDEPENDENTE de
// status - uso administrativo/observabilidade (mostrar o que existe,
// mesmo o que nao e selecionavel). NUNCA usar isto pra decidir o que
// executar - ver getActiveProvidersForCapability.
export function getProvidersForCapability(
  capability: ProviderCapabilityProfile["capabilities"][number],
): ProviderCapabilityProfile[] {
  return PROVIDER_CAPABILITIES.filter((profile) => profile.capabilities.includes(capability));
}

// So profiles com status "ACTIVE" - a UNICA fonte que o
// provider-selector.ts pode usar para decidir o que seria selecionado
// automaticamente. UNVERIFIED/DISABLED/DEPRECATED nunca aparecem aqui,
// mesmo que declarem suporte real a capability.
export function getActiveProvidersForCapability(
  capability: ProviderCapabilityProfile["capabilities"][number],
): ProviderCapabilityProfile[] {
  return getProvidersForCapability(capability).filter((profile) => profile.status === "ACTIVE");
}

// Execution Readiness / Provider Coverage V1 - "ACTIVE" sozinho nao basta
// pra EXECUTE de producao real (ver "mock", ACTIVE mas nunca
// productionEligible). Provider desconhecido (nao registrado) tambem
// nunca e productionEligible - nunca assume capacidade que nao foi
// declarada explicitamente.
export function isProviderProductionEligible(provider: string): boolean {
  const profile = getProviderProfile(provider);
  return profile?.status === "ACTIVE" && profile.productionEligible === true;
}

// So profiles ACTIVE + productionEligible - a UNICA fonte que o
// Execution Readiness (EXECUTE de producao real) pode considerar apto a
// gerar midia nova. Mais restrito que getActiveProvidersForCapability
// (que ainda inclui "mock").
export function getProductionEligibleProvidersForCapability(
  capability: ProviderCapabilityProfile["capabilities"][number],
): ProviderCapabilityProfile[] {
  return getProvidersForCapability(capability).filter((profile) => profile.status === "ACTIVE" && profile.productionEligible === true);
}

// Preparacao de arquitetura (item 11 do pedido original) - PURO, nao
// usado por nenhum endpoint ainda. Representa a elegibilidade futura de
// um provider pra rodar dentro do fluxo CONTROLADO de CANARY (nunca pelo
// fluxo normal de campanha):
//   ACTIVE     -> ja roda nos guardrails normais, entao tambem pode
//                 rodar num CANARY sem restricao adicional.
//   UNVERIFIED -> so pode ser tentado atraves de um endpoint de CANARY
//                 dedicado, com confirmacao/teto de custo explicitos
//                 (mesmo padrao ja usado em canary-guardrails.ts/
//                 video-canary-guardrails.ts) - nunca pelo fluxo normal.
//   DISABLED / DEPRECATED -> nunca, nem em CANARY.
export function canProviderRunCanary(status: ProviderCapabilityProfile["status"]): boolean {
  return status === "ACTIVE" || status === "UNVERIFIED";
}
