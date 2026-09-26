// Radar Creative AI - Generation Orchestrator / Character Video HeyGen Canary Guardrails
//
// Regras do CANARY de CHARACTER_VIDEO via HeyGen. Arquitetura PARALELA a
// character-video-canary-guardrails.ts (OmniHuman) - nunca compartilha
// logica de aprovacao de provider entre CANARYs diferentes (mesmo
// principio ja usado entre video-canary-guardrails.ts e aquele).
//
// Diferenca importante: "heygen-image-avatar" (o modo type="image" +
// audio_url que queremos validar aqui) ainda NAO tem entrada no registry
// de provider-capabilities.ts - so existe "heygen-avatar" (o fluxo antigo
// de avatar_id de biblioteca, que NAO aceita imagem customizada). Por
// isso este guardrail NAO consulta getProviderProfile() para aprovar o
// provider (nao haveria o que encontrar) - so compara contra a constante
// aprovada, mesmo padrao mais simples ja usado em video-canary-guardrails.ts.

import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";
import type { CharacterVideoCanaryRequestInput } from "@/lib/generation-orchestrator/types";

// Nome PROPOSTO (ainda nao registrado) para o modo image+audio_url -
// deliberadamente distinto de "heygen-avatar" (biblioteca). Ver relatorio,
// item "provider registry recomendado".
export const APPROVED_CHARACTER_VIDEO_HEYGEN_CANARY_PROVIDER = "heygen-image-avatar";

export const APPROVED_HEYGEN_CANARY_RESOLUTIONS = ["720p", "1080p", "4k"] as const;
export const APPROVED_HEYGEN_CANARY_ASPECT_RATIOS = ["auto", "16:9", "9:16", "4:5", "5:4", "1:1"] as const;

export type CanaryValidationResult = { ok: true } | { ok: false; reason: string };

// Custo CONFIRMADO em 2026-08-09 (help.heygen.com/en/articles/10060327,
// "HeyGen API Pricing Explained", fonte primaria/oficial do proprio
// HeyGen): "$4 por 1 minuto de output 1080p" para o engine Avatar IV -
// o motor por tras do modo type="image" (nao ha campo "engine" exposto
// no schema pra confirmar essa associacao byte a byte, e uma leitura
// razoavel da documentacao, documentada aqui como tal). SO 1080p tem
// preco confirmado pela fonte oficial - 720p/4k ficam desconhecidos de
// proposito (nunca extrapolados/inventados a partir do numero de 1080p).
const HEYGEN_AVATAR_IV_USD_PER_MINUTE_1080P = 4;

/**
 * PURA - nunca inventa custo pra uma resolucao sem numero confirmado.
 */
export function estimateHeyGenCostUSD(resolution: string, durationSeconds: number): number | null {
  if (resolution !== "1080p") return null;
  return (durationSeconds / 60) * HEYGEN_AVATAR_IV_USD_PER_MINUTE_1080P;
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

export function validateHeyGenCanaryUrl(value: string, fieldName: string): CanaryValidationResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `${fieldName} invalida: "${value}".` };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: `CANARY de CHARACTER_VIDEO (HeyGen) so aceita URLs https:// (recebido em ${fieldName}: "${url.protocol}").` };
  }

  if (!isValidRemoteImageUrl(value)) {
    return { ok: false, reason: `${fieldName} bloqueada por seguranca (host local/privado nao permitido).` };
  }

  const approvedHost = getApprovedImageHost();
  if (approvedHost && url.hostname !== approvedHost) {
    return {
      ok: false,
      reason: `Host "${url.hostname}" nao esta na lista de hosts aprovados (esperado: "${approvedHost}", o Storage do proprio projeto) para ${fieldName}.`,
    };
  }

  return { ok: true };
}

/**
 * Validacao completa do request. Custo SEMPRE em USD direto (wallet do
 * HeyGen, ver types.ts#maxCostUSD) - nunca em "creditos" Magnific (unidade
 * diferente, nunca misturada). Se maxCostUSD nao for informado, ou custo
 * estimado nao puder ser calculado, bloqueia - nunca assume zero.
 */
export function validateHeyGenCanaryRequest(
  input: CharacterVideoCanaryRequestInput,
  estimatedCostUSD: number | null,
): CanaryValidationResult {
  if (!input.confirmed) {
    return { ok: false, reason: "CANARY de CHARACTER_VIDEO (HeyGen) exige confirmacao explicita (confirmed=true)." };
  }

  if (typeof input.maxCostUSD !== "number" || !Number.isFinite(input.maxCostUSD) || input.maxCostUSD <= 0) {
    return { ok: false, reason: "CANARY de CHARACTER_VIDEO (HeyGen) exige um limite maximo em USD (maxCostUSD > 0) - nunca executar sem limite." };
  }

  if (input.dryRun) {
    if (!input.identityImageUrl) return { ok: false, reason: "identityImageUrl e obrigatoria (mesmo em dryRun)." };
    if (!input.audioUrl) return { ok: false, reason: "audioUrl e obrigatoria (mesmo em dryRun)." };
    return { ok: true };
  }

  if (input.provider !== APPROVED_CHARACTER_VIDEO_HEYGEN_CANARY_PROVIDER) {
    return {
      ok: false,
      reason: `Provider "${input.provider}" nao e o provider aprovado para este CANARY (${APPROVED_CHARACTER_VIDEO_HEYGEN_CANARY_PROVIDER}) - sem fallback para outro provider pago.`,
    };
  }

  if (!input.identityImageUrl) {
    return { ok: false, reason: "identityImageUrl e obrigatoria para o CANARY de CHARACTER_VIDEO (HeyGen)." };
  }
  const imageCheck = validateHeyGenCanaryUrl(input.identityImageUrl, "identityImageUrl");
  if (!imageCheck.ok) return imageCheck;

  if (!input.audioUrl) {
    return { ok: false, reason: "audioUrl e OBRIGATORIA para o CANARY de CHARACTER_VIDEO (HeyGen) - type=image+audio_url exige audio externo." };
  }
  const audioCheck = validateHeyGenCanaryUrl(input.audioUrl, "audioUrl");
  if (!audioCheck.ok) return audioCheck;

  if (!(APPROVED_HEYGEN_CANARY_RESOLUTIONS as readonly string[]).includes(input.resolution)) {
    return {
      ok: false,
      reason: `Resolucao "${input.resolution}" nao aprovada - so ${APPROVED_HEYGEN_CANARY_RESOLUTIONS.map((r) => `"${r}"`).join(", ")} sao aceitas.`,
    };
  }

  const aspectRatio = input.aspectRatio ?? "auto";
  if (!(APPROVED_HEYGEN_CANARY_ASPECT_RATIOS as readonly string[]).includes(aspectRatio)) {
    return {
      ok: false,
      reason: `aspect_ratio "${aspectRatio}" nao aprovado - so ${APPROVED_HEYGEN_CANARY_ASPECT_RATIOS.map((a) => `"${a}"`).join(", ")} sao aceitos.`,
    };
  }

  if (estimatedCostUSD === null) {
    return {
      ok: false,
      reason: "Custo do CANARY (HeyGen) nao pode ser calculado - nunca executar com custo desconhecido.",
    };
  }

  if (estimatedCostUSD > input.maxCostUSD) {
    return {
      ok: false,
      reason: `Custo estimado ($${estimatedCostUSD.toFixed(4)}) acima do limite maximo informado ($${input.maxCostUSD.toFixed(2)}).`,
    };
  }

  return { ok: true };
}
