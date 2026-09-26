// Radar Creative AI - Generation Orchestrator / Character Video Canary Guardrails
//
// Regras do CANARY de CHARACTER_VIDEO (OmniHuman). Arquitetura PARALELA a
// video-canary-guardrails.ts (mesmo espirito: confirmacao obrigatoria,
// limite de custo obrigatorio, provider aprovado UNICO sem fallback,
// nenhuma promocao automatica de status/productionEligible). Nunca reusa
// aquele arquivo porque os campos de entrada sao diferentes (audio
// SEMPRE obrigatorio aqui, sem negative_prompt, resolution em vez de
// duration/cfgScale).

import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";
import { getProviderProfile } from "@/lib/generation-orchestrator/provider-capabilities";
import type { CharacterVideoCanaryRequestInput, GenerationCostEstimate } from "@/lib/generation-orchestrator/types";

// Unico provider aprovado para este CANARY - ver PRE-FLIGHT. heygen-avatar
// fica de fora (nao aceita a imagem de referencia da Garota Radar
// diretamente, ver provider-capabilities.ts) - nunca fallback automatico
// entre os dois.
export const APPROVED_CHARACTER_VIDEO_CANARY_PROVIDER = "freepik-omnihuman";

export const APPROVED_CHARACTER_VIDEO_CANARY_RESOLUTIONS = ["720p", "1080p"] as const;

// Limite de audio documentado oficialmente (docs.magnific.com,
// 2026-08-09) - depende da resolucao escolhida. Nunca aceitar um audio
// mais longo que isso silenciosamente (o provider rejeitaria, mas
// preferimos falhar cedo com uma mensagem clara).
export const CHARACTER_VIDEO_CANARY_MAX_AUDIO_SECONDS: Record<"720p" | "1080p", number> = {
  "720p": 60,
  "1080p": 30,
};

export type CanaryValidationResult = { ok: true } | { ok: false; reason: string };

export function isValidCharacterVideoCanaryMode(mode: string): boolean {
  return mode === "CANARY";
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
 * Validacao SINCRONA de forma/host - nao chama rede (isso e
 * responsabilidade de uma checagem de acessibilidade separada, feita
 * pelo chamador antes do POST real). So https, nunca localhost/IP
 * privado/file/data, restrito ao Storage do proprio projeto (a imagem de
 * identidade da Garota Radar sempre vem de la, nunca de um host externo).
 */
export function validateCharacterVideoCanaryImageUrl(value: string): CanaryValidationResult {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: `identityImageUrl invalida: "${value}".` };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: `CANARY de CHARACTER_VIDEO so aceita URLs https:// (recebido: "${url.protocol}").` };
  }

  if (!isValidRemoteImageUrl(value)) {
    return { ok: false, reason: "identityImageUrl bloqueada por seguranca (host local/privado nao permitido)." };
  }

  const approvedHost = getApprovedImageHost();
  if (approvedHost && url.hostname !== approvedHost) {
    return {
      ok: false,
      reason: `Host "${url.hostname}" nao esta na lista de hosts aprovados (esperado: "${approvedHost}", o Storage do proprio projeto) - a identidade da Garota Radar sempre vem do nosso Storage.`,
    };
  }

  return { ok: true };
}

/**
 * Audio SEMPRE obrigatorio (OmniHuman e audio-driven - nunca gera sem
 * audio de entrada). Aceita tanto uma URL https (Storage) quanto um
 * caminho LOCAL existente (ver Fase 3 do enunciado - reuso de audio ja
 * aprovado, que pode nao ter sido subido pro Storage ainda). Nunca aceita
 * string vazia.
 */
export function validateCharacterVideoCanaryAudio(
  value: string | null | undefined,
  fileExistsFn: (path: string) => boolean,
): CanaryValidationResult {
  if (!value || !value.trim()) {
    return { ok: false, reason: "audioUrl e OBRIGATORIA para o CANARY de CHARACTER_VIDEO (OmniHuman e audio-driven) - nenhum audio reutilizavel foi fornecido." };
  }

  if (/^https?:\/\//i.test(value)) {
    const urlCheck = validateCharacterVideoCanaryImageUrl(value);
    if (!urlCheck.ok) return { ok: false, reason: `audioUrl invalida: ${urlCheck.reason}` };
    return { ok: true };
  }

  if (!fileExistsFn(value)) {
    return { ok: false, reason: `Arquivo de audio local nao encontrado: "${value}".` };
  }

  return { ok: true };
}

/**
 * Validacao completa do request - cobre confirmacao, limite de custo,
 * provider aprovado (sem fallback), identity reference, audio obrigatorio
 * e resolucao aprovada. estimatedCost ja deve ter sido calculado pelo
 * cost-estimator.ts ANTES de chamar isso (nunca inventado aqui) - custo
 * null (desconhecido) sempre bloqueia, nunca vira zero silenciosamente.
 */
export function validateCharacterVideoCanaryRequest(
  input: CharacterVideoCanaryRequestInput,
  estimatedCost: GenerationCostEstimate,
  fileExistsFn: (path: string) => boolean = () => false,
): CanaryValidationResult {
  if (!input.confirmed) {
    return { ok: false, reason: "CANARY de CHARACTER_VIDEO exige confirmacao explicita (confirmed=true)." };
  }

  if (typeof input.maxCredits !== "number" || !Number.isFinite(input.maxCredits) || input.maxCredits <= 0) {
    return { ok: false, reason: "CANARY de CHARACTER_VIDEO exige um limite maximo em CREDITOS (maxCredits > 0) - nunca executar sem limite." };
  }

  if (input.dryRun) {
    if (!input.identityImageUrl) return { ok: false, reason: "identityImageUrl e obrigatoria (mesmo em dryRun)." };
    return { ok: true };
  }

  // Provider aprovado UNICO - sem fallback pago pra heygen-avatar nem
  // para qualquer outro provider, seja qual for o status dele hoje
  // (ACTIVE/UNVERIFIED/DISABLED/DEPRECATED).
  if (input.provider !== APPROVED_CHARACTER_VIDEO_CANARY_PROVIDER) {
    return {
      ok: false,
      reason: `Provider "${input.provider}" nao e o provider aprovado para este CANARY (${APPROVED_CHARACTER_VIDEO_CANARY_PROVIDER}) - sem fallback para outro provider pago.`,
    };
  }

  // O provider aprovado precisa estar registrado e elegivel a rodar um
  // CANARY (ACTIVE ou UNVERIFIED - nunca DISABLED/DEPRECATED, ver
  // provider-capabilities.ts#canProviderRunCanary).
  const profile = getProviderProfile(input.provider);
  if (!profile || (profile.status !== "ACTIVE" && profile.status !== "UNVERIFIED")) {
    return {
      ok: false,
      reason: `Provider "${input.provider}" tem status "${profile?.status ?? "nao registrado"}" - nao pode rodar nem um CANARY controlado.`,
    };
  }

  const imageCheck = validateCharacterVideoCanaryImageUrl(input.identityImageUrl);
  if (!imageCheck.ok) return imageCheck;

  const audioCheck = validateCharacterVideoCanaryAudio(input.audioUrl, fileExistsFn);
  if (!audioCheck.ok) return audioCheck;

  if (!(APPROVED_CHARACTER_VIDEO_CANARY_RESOLUTIONS as readonly string[]).includes(input.resolution)) {
    return {
      ok: false,
      reason: `Resolucao "${input.resolution}" nao aprovada - so ${APPROVED_CHARACTER_VIDEO_CANARY_RESOLUTIONS.map((r) => `"${r}"`).join(" ou ")} sao aceitas.`,
    };
  }

  const maxAudioSeconds = CHARACTER_VIDEO_CANARY_MAX_AUDIO_SECONDS[input.resolution];
  if (input.durationSeconds > maxAudioSeconds) {
    return {
      ok: false,
      reason: `Audio de ${input.durationSeconds.toFixed(1)}s excede o limite documentado para ${input.resolution} (${maxAudioSeconds}s).`,
    };
  }

  if (estimatedCost.estimatedCredits === null) {
    return {
      ok: false,
      reason: "Custo do CANARY nao pode ser calculado (sem costModel documentado/confirmado) - nunca executar com custo desconhecido.",
    };
  }

  // Comparacao SEMPRE em creditos - nunca converte um teto em BRL pra
  // decidir isso (ver docstring do campo maxCredits). maxCostBRL, quando
  // informado, e so espelhado no relatorio/preview, nunca usado aqui.
  if (estimatedCost.estimatedCredits > input.maxCredits) {
    return {
      ok: false,
      reason: `Custo estimado (${estimatedCost.estimatedCredits} creditos) acima do limite maximo informado (${input.maxCredits} creditos).`,
    };
  }

  return { ok: true };
}
