// Radar Creative AI - Generation Orchestrator / Types
//
// Este modulo NAO gera midia e NAO chama nenhum provider pago. Ele apenas
// traduz um CampaignPromptPlan (ja pronto) em um plano de execucao por
// cena, escolhendo capability/provider/custo de forma deterministica.
// A execucao real (fase futura, modo LIVE) ainda nao existe aqui.

import type { OverlayInstructions, SafeAreaDirection, SceneMediaType } from "@/lib/prompt-builder/types";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";
import type { ProductIntegrityMode, ProductIntegrityRisk } from "@/lib/prompt-builder/product-integrity-mode";
import type { ProductFidelityRequirement } from "@/lib/prompt-builder/product-fidelity-requirement";
import type { ProductReferenceQualityAssessment } from "@/lib/generation-orchestrator/product-reference-quality";
import type {
  HybridCompositePlan,
  ProductGenerationStrategy,
} from "@/lib/generation-orchestrator/product-generation-strategy";

// Vocabulario de capacidades independente de provider - o core do Radar
// Creative AI nunca deve conhecer "Freepik"/"Kling"/"HeyGen" diretamente,
// so essas capabilities.
export type GenerationCapability =
  | "TEXT_TO_IMAGE"
  | "IMAGE_TO_IMAGE"
  | "TEXT_TO_VIDEO"
  | "IMAGE_TO_VIDEO"
  | "CHARACTER_IMAGE"
  | "CHARACTER_VIDEO"
  | "PRODUCT_IMAGE"
  | "PRODUCT_VIDEO";

// LIVE exige habilitacao explicita em uma fase futura - nunca inferido
// automaticamente a partir de configuracao de ambiente. CANARY e um modo
// a parte de MOCK/LIVE: permite UMA geracao real controlada (uma cena,
// um provider aprovado, sem fallback pago, custo maximo obrigatorio) -
// nunca executado pelo fluxo de campanha completa (/generate so aceita
// MOCK; CANARY so existe em /generate-canary).
export type GenerationMode = "MOCK" | "PREVIEW" | "LIVE" | "CANARY";

export type SceneExecutionStatus =
  | "PENDING"
  | "READY"
  | "GENERATING"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

// Aprendizado da auditoria TEXT_TO_VIDEO (2026-08-08): "estar registrado
// em provider-capabilities.ts" NUNCA foi o mesmo que "ser utilizavel" -
// freepik-kling-t2v apontava pra um endpoint/capacidade que a Kling nunca
// ofereceu de verdade, e nada no codigo impedia o provider-selector de
// escolhe-lo automaticamente mesmo assim. ProviderStatus formaliza essa
// distincao:
//
// ACTIVE      - validado end-to-end no Radar Creative AI (CANARY real
//               bem-sucedido) - unico status elegivel pra selecao
//               automatica (ver provider-selector.ts). Para "mock",
//               ACTIVE significa "elegivel pra execucao local/mock", NAO
//               "provider pago externo confirmado".
// UNVERIFIED  - documentado pelo provider real (endpoint/payload
//               conhecidos), mas nunca chamado de verdade por este
//               projeto - nunca selecionavel automaticamente; so via um
//               futuro fluxo de CANARY dedicado com autorizacao explicita.
// DISABLED    - integracao existe no codigo mas foi desligada de proposito
//               (ex: freepik-kling-t2v, que aponta pra uma capacidade que
//               a Kling nao sustenta hoje) - nunca selecionavel.
// DEPRECATED  - integracao antiga mantida so por historico/compatibilidade
//               - nunca selecionavel.
export type ProviderStatus = "ACTIVE" | "UNVERIFIED" | "DISABLED" | "DEPRECATED";

// Perfil estatico de o que um provider real suporta hoje, segundo o que
// foi de fato inspecionado no codigo (lib/ai, lib/ugc/freepik.ts,
// lib/ugc/heygen.ts) - nunca capacidades inventadas.
export type ProviderCapabilityProfile = {
  provider: string;
  capabilities: GenerationCapability[];
  status: ProviderStatus;
  supportsIdentityReference: boolean;
  supportsProductReference: boolean;
  notes: string;
  // centavosPerCredit pode ser null quando os CREDITOS por segundo sao
  // conhecidos (documentados oficialmente) mas a taxa credito->BRL desta
  // conta/plano ainda nao foi confirmada (ex: wan-2-5-t2v, 2026-08-08) -
  // nesse caso o cost-estimator calcula estimatedCredits normalmente mas
  // deixa estimatedCurrencyCostCents null, nunca inventando uma taxa.
  costModel: { creditsPerSecond: number; centavosPerCredit: number | null } | null;
  // Providers que faturam diretamente em USD (ex: HeyGen wallet) NUNCA
  // devem ser convertidos para creditos Magnific. O custo so e conhecido
  // para a resolucao explicitamente confirmada; qualquer outra resolucao
  // deve continuar UNKNOWN.
  usdCostModel?: {
    costUnit: "USD";
    costPerMinuteUSD: number;
    resolution: "1080p";
    unknownResolutions: readonly string[];
  } | null;
  // Execution Readiness / Provider Coverage V1 (2026-08-09): "status"
  // sozinho nao distingue "elegivel pra execucao local/mock" de "capaz de
  // produzir midia real de producao" - ver auditoria que motivou esta
  // tarefa (campanha real ficaria BLOCKED depois de gastar credito porque
  // 2 de 3 cenas usavam "mock", que e ACTIVE mas nunca produz midia real).
  // "mock" e status ACTIVE + productionEligible FALSE (elegivel so pra
  // testes locais/DRY_RUN, nunca conta como caminho real em EXECUTE de
  // producao). Qualquer outro provider so e productionEligible=true
  // quando ja foi validado por CANARY real (mesmo criterio ja usado pra
  // status=ACTIVE) - por isso hoje productionEligible == (status ===
  // "ACTIVE" && provider !== "mock"), mas o campo fica EXPLICITO (nunca
  // derivado silenciosamente) para permitir excecoes futuras sem reescrever
  // logica de leitura em outro lugar (ex: um provider ACTIVE mas
  // restrito a CANARY controlado).
  productionEligible: boolean;
};

export type ResolvedSceneReferences = {
  identityReferenceUrl: string | null;
  // Id REAL usado como support - pode ser diferente do supportReferenceAssetId
  // que o Prompt Builder/Commercial Director gravaram no planejamento, porque
  // aqui (preparacao para geracao real) o Character Pack e reconsultado
  // exigindo generationSafe=true (ver reference-resolver.ts). null quando a
  // cena e PRODUCT_ONLY (sem personagem) OU quando nao existe support
  // generation-safe compativel (ver supportReferenceError).
  supportReferenceAssetId: string | null;
  supportReferenceUrl: string | null;
  productReferenceUrl: string | null;
  // Preenchido SOMENTE quando a cena precisa de personagem e nenhuma
  // support reference generation-safe compativel foi encontrada - nunca
  // cai silenciosamente para uma referencia insegura (com logo/texto).
  supportReferenceError: string | null;
  // null quando nao ha productReferenceUrl nenhuma (oferta sem imagem) -
  // ver product-reference-quality.ts. Calculado UMA vez por productReferenceUrl
  // (as dimensoes da imagem sao as mesmas para todas as cenas da campanha),
  // mas o resultado (fidelityRisk/recommendedIntegrityMode) e por cena,
  // porque depende do productIntegrityRisk e mediaType de cada cena.
  productReferenceQuality: ProductReferenceQualityAssessment | null;
};

// Envelope normalizado que um futuro adapter (Freepik, HeyGen, etc.)
// traduziria para o formato especifico do provider. Independente de
// qualquer provider concreto.
export type NormalizedGenerationRequest = {
  capability: GenerationCapability;
  prompt: string;
  negativePrompt: string;
  aspectRatio: string;
  durationSeconds: number;
  references: {
    identity: string | null;
    support: string | null;
    product: string | null;
  };
  motion: string;
  quality: "standard";
};

export type GenerationCostEstimate = {
  provider: string;
  estimatedCredits: number | null;
  estimatedCurrencyCostCents: number | null;
  costUnit?: "FREE" | "CREDITS" | "USD" | "UNKNOWN";
  estimatedUsdCostCents?: number | null;
  actualCredits: number | null;
  actualCurrencyCostCents: number | null;
};

export type SceneExecutionPlan = {
  sceneId: string;
  sceneOrder: number;
  mediaType: SceneMediaType;

  providerCapability: GenerationCapability;

  selectedProvider: string;
  fallbackProviders: string[];

  positivePrompt: string;
  negativePrompt: string;

  identityReferenceAssetId: string | null;
  identityReferenceUrl: string | null;
  supportReferenceAssetId: string | null;
  supportReferenceUrl: string | null;
  productReferenceUrl: string | null;

  durationSeconds: number;
  aspectRatio: string;

  providerRequest: NormalizedGenerationRequest;

  overlayInstructions: OverlayInstructions;
  safeAreaDirection: SafeAreaDirection;

  // Passthrough do Prompt Builder (ver lib/prompt-builder/product-integrity-mode.ts) -
  // o Orchestrator ainda nao troca provider automaticamente por causa
  // disso, mas precisa "saber" que esta cena exige alta preservacao do
  // produto para decisoes futuras de selecao de provider.
  productIntegrityRisk: ProductIntegrityRisk;
  // Valor EFETIVO usado no positivePrompt/negativePrompt acima - pode ser
  // PRESERVE_PACKAGE_STRICT mesmo quando o Prompt Builder persistiu
  // PRESERVE_PACKAGE, se productReferenceQuality abaixo recomendar STRICT
  // (ver scene-execution-plan.ts). Nunca promovido automaticamente por
  // provider - so pela qualidade real da referencia.
  productIntegrityMode: ProductIntegrityMode;
  // null quando a cena nao tem productReferenceUrl (ex: sem oferta com
  // imagem). Informativo - o Orchestrator ainda nao troca provider
  // automaticamente por causa disso.
  productReferenceQuality: ProductReferenceQualityAssessment | null;

  // Subject-Aware Capability Routing V1 (ver capability-fidelity-gate.ts) -
  // valor EFETIVO (ja promovido a STRICT quando aplicavel, ver
  // product-fidelity-requirement.ts#promoteProductFidelityRequirementByReferenceQuality),
  // igual ao padrao ja usado por productIntegrityMode acima.
  productFidelityRequirement: ProductFidelityRequirement;
  // true quando esta cena foi bloqueada pelo Capability Fidelity Gate
  // (status="FAILED" acima, statusReason explica o motivo) - permite ao
  // Runner (commercial-generation-runner.ts) diferenciar este bloqueio de
  // outros motivos de FAILED sem parsear texto.
  capabilityFidelityBlocked: boolean;

  // Aprendizado dos CANARY #3/#4 (ver product-generation-strategy.ts): null
  // quando a cena nao e product-centric (ex: CHARACTER_VIDEO). Quando
  // HYBRID_PRODUCT_COMPOSITE, providerCapability/selectedProvider/
  // providerRequest ja refletem "gerar so o fundo" - o produto real NUNCA
  // e enviado ao provider generativo (ver hybridCompositePlan abaixo).
  productGenerationStrategy: ProductGenerationStrategy | null;
  // Preenchido SOMENTE quando productGenerationStrategy === "HYBRID_PRODUCT_COMPOSITE".
  // Contrato de entrada para um FUTURO compositor (nao implementado nesta
  // fase) - nunca executado aqui.
  hybridCompositePlan: HybridCompositePlan | null;

  estimatedCost: GenerationCostEstimate;

  status: SceneExecutionStatus;
  statusReason: string | null;
};

export type CampaignExecutionPlan = {
  campaignId: string;
  mode: GenerationMode;
  promptPlan: CampaignPromptPlan;
  scenes: SceneExecutionPlan[];
  estimatedCost: {
    totalEstimatedCredits: number | null;
    totalEstimatedCurrencyCostCents: number | null;
    totalEstimatedUsdCostCents?: number | null;
  };
};

export type SceneExecutionResult = {
  sceneId: string;
  provider: string;
  status: Extract<SceneExecutionStatus, "COMPLETED" | "FAILED" | "SKIPPED">;
  outputUrl: string | null;
  cost: number;
  mockedAt: string;
  error: string | null;
};

// Payload de entrada do endpoint /generate-canary. maxCostBRL e
// obrigatorio (nunca executar sem limite informado). acknowledgeUnknownCost
// so e necessario quando o provider real nao tem custo estimado
// (ver canary-guardrails.ts). dryRun forca o caminho mock mesmo quando o
// provider selecionado e real - unica forma de "fallback para mock", e
// precisa ser pedido explicitamente.
export type CanaryRequestInput = {
  sceneId: string;
  confirmed: boolean;
  maxCostBRL: number;
  acknowledgeUnknownCost?: boolean;
  dryRun?: boolean;
};

// Resultado de UMA execucao canary - nunca sobrescreve PRIMARY, nunca
// registra a imagem no Character Pack automaticamente (isso e uma acao
// manual e futura, so depois de validar qualidade).
export type CanaryResult = {
  provider: string;
  requestId: string | null;
  status: "COMPLETED" | "FAILED";
  outputUrl: string | null;
  creditsUsed: number | null;
  currencyCostCents: number | null;
  createdAt: string;
  error: string | null;
};

// Entrada de auditoria append-only, persistida em
// creative_brief.canaryLog (jsonb existente, sem migration).
export type CanaryLogEntry = {
  campaignId: string;
  sceneId: string;
  provider: string;
  mode: "CANARY";
  estimatedCost: GenerationCostEstimate;
  actualCost: { credits: number | null; currencyCostCents: number | null };
  success: boolean;
  error: string | null;
  createdAt: string;
};

// --- CANARY de video (image-to-video) --------------------------------
//
// Fluxo DELIBERADAMENTE separado do CanaryRequestInput acima: nao depende
// de uma cena persistida em creative_brief.generationPlan nem do
// Character Pack - recebe uma inputImageUrl explicita (o resultado ja
// aprovado de um canary de imagem anterior). Existe SOMENTE dentro do
// fluxo controlado de CANARY - o Generation Orchestrator normal (scenes
// de campanha) continua exatamente como estava.

export type VideoCanaryRequestInput = {
  provider: string;
  inputImageUrl: string;
  prompt: string;
  negativePrompt: string;
  duration: string;
  cfgScale: number;
  confirmed: boolean;
  maxCostBRL: number;
  // Forca o caminho mock de lib/ai (nunca chama Freepik) - unica forma de
  // testar o pipeline ponta a ponta sem custo real.
  dryRun?: boolean;
  // Quando informada, o prompt e varrido pela politica de claims
  // (lib/content-safety/claims-policy.ts) ANTES do submit real - usado
  // pelas cenas comerciais reais (ex: "suplementos"). Opcional porque o
  // uso original deste canary (testes de identidade da Garota Radar) nao
  // tem categoria de produto associada.
  category?: string;
};

export type VideoCanaryStatus = "COMPLETED" | "FAILED";

export type VideoCanaryResult = {
  provider: string;
  model: string;
  inputImageUrl: string;
  prompt: string;
  negativePrompt: string;
  duration: string;
  cfgScale: number;
  taskId: string | null;
  outputUrl: string | null;
  estimatedCost: GenerationCostEstimate;
  actualCost: { credits: number | null; currencyCostCents: number | null };
  status: VideoCanaryStatus;
  startedAt: string;
  completedAt: string;
  error: string | null;
};

// --- CANARY de CHARACTER_VIDEO (OmniHuman - audio-driven) --------------
//
// Arquitetura DELIBERADAMENTE paralela ao VideoCanary acima (mesmo
// espirito: sem depender de campanha/generationPlan, um provider
// aprovado, sem fallback pago). OmniHuman e audio-driven (recebe uma
// imagem + um audio, nunca so um prompt) - por isso audioUrl e sempre
// obrigatorio aqui, diferente do VideoCanaryRequestInput (que nao usa
// audio nenhum).
export type CharacterVideoCanaryRequestInput = {
  provider: string;
  identityImageUrl: string;
  audioUrl: string;
  // Duracao REAL medida do audio (ffprobe) - o video gerado acompanha o
  // audio, nunca uma duracao escolhida independentemente. Necessaria pra
  // calcular custo sem inventar um numero.
  durationSeconds: number;
  prompt?: string;
  resolution: "720p" | "1080p";
  // Usado por providers cujo schema aceita aspect_ratio separado da
  // resolucao (ex: HeyGen "9:16") - OmniHuman ignora (nao tem esse campo).
  aspectRatio?: string;
  turboMode?: boolean;
  confirmed: boolean;
  // Teto em CREDITOS Magnific - so faz sentido pra providers cobrados
  // nesse sistema (ex: omni-human-1-5, 180 creditos/s confirmado em
  // 2026-08-09). Nunca converter um custo em creditos DESCONHECIDO pra um
  // teto em BRL so pra ter um numero - preferir bloquear com
  // BLOCKED_UNKNOWN_COST.
  maxCredits?: number;
  // Teto em USD direto - pra providers com wallet/billing nativo em USD
  // (ex: HeyGen, $4/min confirmado para Avatar IV em 2026-08-09 via
  // help.heygen.com). NUNCA converter isso pra "creditos" - unidades
  // diferentes, nunca misturadas.
  maxCostUSD?: number;
  // Opcional, so informativo/auditoria (ex: exibir "~R$ 2,58" numa tela) -
  // NUNCA usado para bloquear/aprovar a execucao (isso e sempre
  // maxCredits/maxCostUSD, conforme o provider).
  maxCostBRL?: number;
  // Forca o caminho mock (nunca chama o provider real) - unica forma de
  // testar o pipeline ponta a ponta sem custo real.
  dryRun?: boolean;
};

export type CharacterVideoCanaryStatus = "COMPLETED" | "FAILED";

export type CharacterVideoCanaryResult = {
  provider: string;
  model: string;
  identityImageUrl: string;
  audioUrl: string;
  prompt: string | null;
  resolution: "720p" | "1080p";
  taskId: string | null;
  outputUrl: string | null;
  // null quando o provider fatura em USD direto (ver estimatedCostUSD) -
  // nunca um valor de creditos inventado so pra preencher o campo.
  estimatedCost: GenerationCostEstimate;
  // So preenchido quando o provider fatura em USD direto (ex: HeyGen
  // wallet) - null para providers de credito Magnific.
  estimatedCostUSD: number | null;
  actualCost: { credits: number | null; currencyCostCents: number | null };
  status: CharacterVideoCanaryStatus;
  startedAt: string;
  completedAt: string;
  error: string | null;
};
