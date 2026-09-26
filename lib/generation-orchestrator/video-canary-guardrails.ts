// Radar Creative AI - Generation Orchestrator / Video Canary Guardrails
//
// Regras do CANARY de image-to-video. Deliberadamente separado de
// canary-guardrails.ts (aquele valida uma SceneExecutionPlan vinda do
// Character Pack; este valida uma inputImageUrl avulsa - arquitetura
// diferente, guardrails proprios).

import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";
import { scanTextForForbiddenClaims } from "@/lib/content-safety/claims-policy";
import type { GenerationCostEstimate, VideoCanaryRequestInput } from "@/lib/generation-orchestrator/types";

// Unico provider aprovado para este primeiro canary de video - ver
// relatorio de preparacao (Kling O1 e interpolacao de frames, nao serve;
// OmniHuman exige audio, nao serve).
export const APPROVED_VIDEO_CANARY_PROVIDER = "freepik-kling-i2v";

// Duracoes aprovadas ate agora - controlado, nao arbitrario. "5" foi
// validado com o 1o canary real (identidade estavel); "10" foi
// adicionado nesta fase para o teste de atuacao/continuidade, apos
// reconfirmar na documentacao oficial (2026-08-08) que o schema aceita
// exatamente enum ["5", "10"].
export const APPROVED_VIDEO_CANARY_DURATIONS = ["5", "10"] as const;
export type ApprovedVideoCanaryDuration = (typeof APPROVED_VIDEO_CANARY_DURATIONS)[number];

// Valores aprovados nesta fase (ver relatorio de preparacao) - servem de
// default no endpoint; documentados aqui como fonte unica de verdade.
export const APPROVED_VIDEO_CANARY_CFG_SCALE = 0.5;

// --- 5 segundos (1o canary, ja validado com resultado real aprovado) ---
export const APPROVED_VIDEO_CANARY_PROMPT =
  "Preserve the exact woman, facial identity, hairstyle, clothing and environment from the input " +
  "image. She maintains natural eye contact with the camera and a warm confident smile. She makes " +
  "a very subtle inviting gesture with her open hand, with minimal natural head movement and " +
  "subtle breathing. Natural realistic human motion. Very subtle hair movement. Professional " +
  "premium commercial performance. Camera remains nearly locked with only a very subtle slow " +
  "push-in. Preserve facial proportions and appearance consistently throughout the entire shot.";

export const APPROVED_VIDEO_CANARY_NEGATIVE_PROMPT =
  "facial morphing, identity drift, distorted hands, extra fingers, body deformation, sudden " +
  "expression changes, exaggerated motion, camera shake, generated text, generated logos, " +
  "watermark, low resolution";

// --- 10 segundos (2o canary - identidade + atuacao/continuidade) ------
export const APPROVED_VIDEO_CANARY_PROMPT_10S =
  "Preserve the exact woman, facial identity, facial proportions, hairstyle, clothing and " +
  "environment from the input image consistently throughout the entire shot. She performs " +
  "naturally as a confident professional commercial presenter. She maintains natural eye contact " +
  "with the camera and a warm, trustworthy smile. Her performance evolves subtly: natural " +
  "breathing, a small relaxed head movement, slight professional body movement, followed by one " +
  "elegant and restrained open-hand presentation gesture. She finishes looking directly at the " +
  "camera with a friendly, confident and inviting expression. Keep all motion subtle, realistic " +
  "and continuous. Maintain realistic hands and fingers throughout the entire shot. Natural skin " +
  "texture, natural hair movement and realistic human motion. Camera remains nearly locked with " +
  "only an optional extremely subtle cinematic slow push-in. Identity consistency and natural " +
  "human performance are more important than dramatic movement.";

export const APPROVED_VIDEO_CANARY_NEGATIVE_PROMPT_10S =
  "facial morphing, identity drift, face transformation, distorted hands, extra fingers, missing " +
  "fingers, fused fingers, body deformation, large arm movements, exaggerated gestures, sudden " +
  "expression changes, unnatural head movement, camera shake, flicker, generated text, generated " +
  "logos, watermark, low resolution";

export type CanaryValidationResult = { ok: true } | { ok: false; reason: string };

// So o literal exato "CANARY" e valido para este fluxo - LIVE e PREVIEW
// (e qualquer outro valor) nunca disparam o provider. Extraido como
// funcao pura para ser testavel sem precisar de uma requisicao HTTP real.
export function isValidVideoCanaryMode(mode: string): boolean {
  return mode === "CANARY";
}

export function validateVideoCanarySelection(inputImageUrls: string[]): CanaryValidationResult {
  if (inputImageUrls.length !== 1) {
    return {
      ok: false,
      reason: `CANARY de video permite exatamente 1 geracao por execucao (recebido: ${inputImageUrls.length}).`,
    };
  }
  return { ok: true };
}

function getApprovedImageHost(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).hostname;
  } catch {
    return null;
  }
}

/**
 * Validacao SINCRONA de forma/host da URL - nao faz nenhuma chamada de
 * rede aqui (isso fica em validateInputImageAccessible). So https, nunca
 * localhost/IP privado/file/data.
 *
 * `restrictToProjectHost` (default true) alem disso restringe ao host de
 * Storage do proprio projeto - apropriado para o uso original deste
 * canary (testes de identidade da Garota Radar, onde a imagem sempre
 * deveria vir do nosso Storage). Passar false quando a URL e uma
 * productReferenceUrl JA RESOLVIDA server-side a partir de offers.image_url
 * (nunca digitada livremente por quem chama o endpoint) - nesse caso o
 * host legitimamente e o CDN do marketplace (ex: mlstatic.com), e a
 * protecao contra SSRF/host malicioso continua vindo de
 * isValidRemoteImageUrl() acima.
 */
export function validateCanaryInputImageUrl(
  value: string,
  options: { restrictToProjectHost?: boolean } = {},
): CanaryValidationResult {
  const { restrictToProjectHost = true } = options;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `inputImageUrl invalida: "${value}".` };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: `CANARY de video so aceita URLs https:// (recebido: "${url.protocol}").`,
    };
  }

  if (!isValidRemoteImageUrl(value)) {
    return { ok: false, reason: "inputImageUrl bloqueada por seguranca (host local/privado nao permitido)." };
  }

  if (restrictToProjectHost) {
    const approvedHost = getApprovedImageHost();
    if (approvedHost && url.hostname !== approvedHost) {
      return {
        ok: false,
        reason:
          `Host "${url.hostname}" nao esta na lista de hosts aprovados para o CANARY de video ` +
          `(esperado: "${approvedHost}", o Storage do proprio projeto).`,
      };
    }
  }

  return { ok: true };
}

/**
 * Validacao completa do request - cobre confirmacao, limite de custo,
 * provider aprovado, duracao aprovada e a URL de entrada. estimatedCost
 * ja deve ter sido calculado pelo cost-estimator.ts ANTES de chamar isso
 * (nunca inventado aqui).
 */
export function validateVideoCanaryRequest(
  input: VideoCanaryRequestInput,
  estimatedCost: GenerationCostEstimate,
): CanaryValidationResult {
  if (!input.confirmed) {
    return { ok: false, reason: "CANARY de video exige confirmacao explicita (confirmed=true)." };
  }

  if (typeof input.maxCostBRL !== "number" || !Number.isFinite(input.maxCostBRL) || input.maxCostBRL <= 0) {
    return {
      ok: false,
      reason: "CANARY de video exige um limite maximo de custo (maxCostBRL > 0) - nunca executar sem limite.",
    };
  }

  if (input.dryRun) {
    // Dry-run so vai para o mock - provider/duracao/URL nao importam pro
    // caminho mock, mas a URL ainda precisa ser minimamente valida.
    if (!input.inputImageUrl) {
      return { ok: false, reason: "inputImageUrl e obrigatoria (mesmo em dryRun)." };
    }
    return { ok: true };
  }

  if (input.provider !== APPROVED_VIDEO_CANARY_PROVIDER) {
    return {
      ok: false,
      reason:
        `Provider "${input.provider}" nao e o provider aprovado para este CANARY de video ` +
        `(${APPROVED_VIDEO_CANARY_PROVIDER}) - sem fallback para outro provider pago.`,
    };
  }

  if (!input.inputImageUrl) {
    return { ok: false, reason: "inputImageUrl e obrigatoria para o CANARY de video." };
  }

  // Cenas comerciais reais (category informada) usam a productReferenceUrl
  // ja resolvida server-side a partir de offers.image_url - legitimamente
  // um CDN de marketplace, nao o Storage do projeto. Ver docstring de
  // validateCanaryInputImageUrl.
  const urlCheck = validateCanaryInputImageUrl(input.inputImageUrl, {
    restrictToProjectHost: !input.category,
  });
  if (!urlCheck.ok) return urlCheck;

  // Claims safety: so roda quando o chamador informa a categoria do
  // produto (cenas comerciais reais) - o prompt aprovado de identidade da
  // Garota Radar nao tem categoria de produto associada. Nunca corrige o
  // prompt automaticamente - so bloqueia.
  if (input.category) {
    const violations = scanTextForForbiddenClaims(input.prompt, input.category);
    if (violations.length > 0) {
      const details = violations.map((v) => `"${v.matchedText}" (${v.ruleLabel})`).join("; ");
      return {
        ok: false,
        reason: `Claim nao permitida para a categoria "${input.category}" encontrada no prompt: ${details}.`,
      };
    }
  }

  if (!(APPROVED_VIDEO_CANARY_DURATIONS as readonly string[]).includes(input.duration)) {
    return {
      ok: false,
      reason:
        `Duracao "${input.duration}" nao aprovada para o CANARY de video - so ` +
        `${APPROVED_VIDEO_CANARY_DURATIONS.map((d) => `"${d}"`).join(" ou ")} sao aceitas nesta fase.`,
    };
  }

  if (
    estimatedCost.estimatedCurrencyCostCents !== null &&
    estimatedCost.estimatedCurrencyCostCents > Math.round(input.maxCostBRL * 100)
  ) {
    return {
      ok: false,
      reason:
        `Custo estimado (R$ ${(estimatedCost.estimatedCurrencyCostCents / 100).toFixed(2)}) acima do ` +
        `limite maximo informado (R$ ${input.maxCostBRL.toFixed(2)}).`,
    };
  }

  return { ok: true };
}
