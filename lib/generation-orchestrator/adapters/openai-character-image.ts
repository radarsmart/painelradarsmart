// Radar Creative AI - Generation Orchestrator / Adapter: OpenAI Character Image
//
// UNICO provider real hoje capaz de gerar/editar imagem a partir de uma
// imagem de referencia (identity/support) em vez de so texto - via
// OpenAI gpt-image-2 (endpoint /v1/images/edits).
//
// Modelo verificado em 2026-08-07 direto na API real da conta (GET
// /v1/models) e na documentacao oficial antes de usar aqui - nao
// assumido: gpt-image-2 esta disponivel, aceita multiplas imagens em
// image[] no /v1/images/edits (mesmo mecanismo do gpt-image-1, usado em
// lib/ai/product-image.ts, aqui reaproveitado como adapter dedicado a
// CHARACTER_IMAGE), aceita 1024x1536 (dentro dos limites documentados:
// borda <=3840px, bordas multiplas de 16px, razao <=3:1, 655.360 a
// 8.294.400 pixels totais), e - diferenca relevante para preservacao de
// identidade - FORCA input_fidelity alto automaticamente em todas as
// imagens de entrada (o parametro input_fidelity deve ser omitido para
// este modelo, que e exatamente o que este adapter ja faz).
//
// LIMITACOES CONHECIDAS (documentadas, nao escondidas):
// - o endpoint /v1/images/edits NAO tem parametro de negative prompt -
//   o negativePrompt do NormalizedGenerationRequest e apenas anexado ao
//   prompt textual como instrucao "avoid:", sem garantia de efeito;
// - passar duas imagens (identity + support) e mecanicamente aceito pela
//   API (campo image[] repetido), mas a OpenAI nao documenta um
//   contrato "imagem 1 = identidade, imagem 2 = pose" - a preservacao de
//   identidade com esse metodo AINDA NAO FOI VALIDADA e e exatamente o
//   que o teste CANARY existe para responder;
// - a resposta da API confirmadamente NAO inclui nenhum campo de
//   custo/uso - por isso costModel fica null em provider-capabilities.ts
//   e actualCost tambem fica null aqui, nunca inventado.

import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase";
import { isValidRemoteImageUrl } from "@/lib/story-image-allowlist";
import type { NormalizedGenerationRequest } from "@/lib/generation-orchestrator/types";
import type { ProviderAdapter, ProviderAdapterResult } from "@/lib/generation-orchestrator/adapters/types";

const STORAGE_BUCKET = "ugc-assets";

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function sizeForAspectRatio(aspectRatio: string): "1024x1024" | "1024x1536" | "1536x1024" {
  if (aspectRatio === "9:16") return "1024x1536";
  if (aspectRatio === "16:9") return "1536x1024";
  return "1024x1024";
}

async function fetchReferenceImage(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isValidRemoteImageUrl(url)) {
    throw new Error(`Referencia de imagem invalida ou de host nao permitido: ${url}`);
  }

  const upstream = await fetch(url, { redirect: "follow", cache: "no-store" });
  if (!upstream.ok) {
    throw new Error(`Falha ao baixar imagem de referencia (${upstream.status}): ${url}`);
  }

  const contentType = upstream.headers.get("content-type") ?? "image/png";
  const arrayBuffer = await upstream.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: contentType.startsWith("image/") ? contentType : "image/png",
  };
}

function buildPrompt(request: NormalizedGenerationRequest): string {
  const base = request.prompt.trim();
  const negative = request.negativePrompt.trim();
  if (!negative) return base;
  // O endpoint nao tem campo negative_prompt - a unica forma de tentar
  // influenciar isso e embutir como instrucao textual, sem garantia.
  return `${base}\n\nAvoid: ${negative}`;
}

// Descreve o request especifico do provider SEM chamar a rede - usado
// para mostrar "o request que seria enviado" antes de qualquer execucao
// real (secao 13 do canary: nao executar ainda, so demonstrar).
export function describeOpenAiCharacterImageRequest(request: NormalizedGenerationRequest): {
  endpoint: string;
  model: string;
  size: string;
  prompt: string;
  imageInputs: Array<"identity" | "support">;
} {
  return {
    endpoint: "https://api.openai.com/v1/images/edits",
    model: "gpt-image-2",
    size: sizeForAspectRatio(request.aspectRatio),
    prompt: buildPrompt(request),
    imageInputs: [
      ...(request.references.identity ? (["identity"] as const) : []),
      ...(request.references.support ? (["support"] as const) : []),
    ],
  };
}

export const openaiCharacterImageAdapter: ProviderAdapter = {
  provider: "openai-image-edit",

  async execute(request: NormalizedGenerationRequest): Promise<ProviderAdapterResult> {
    try {
      const openaiKey = toText(process.env.OPENAI_API_KEY);
      if (!openaiKey) {
        return { status: "error", outputUrl: null, requestId: null, error: "OPENAI_API_KEY nao configurada." };
      }

      const identityUrl = request.references.identity;
      if (!identityUrl) {
        return {
          status: "error",
          outputUrl: null,
          requestId: null,
          error: "CHARACTER_IMAGE sem identityReference - PARE (nao pode gerar sem PRIMARY).",
        };
      }

      const identityImage = await fetchReferenceImage(identityUrl);
      const supportImage = request.references.support
        ? await fetchReferenceImage(request.references.support)
        : null;

      const form = new FormData();
      form.append("model", "gpt-image-2");
      form.append("prompt", buildPrompt(request));
      form.append("size", sizeForAspectRatio(request.aspectRatio));
      form.append(
        "image[]",
        new Blob([new Uint8Array(identityImage.buffer)], { type: identityImage.contentType }),
        "identity-reference.png",
      );
      if (supportImage) {
        form.append(
          "image[]",
          new Blob([new Uint8Array(supportImage.buffer)], { type: supportImage.contentType }),
          "support-reference.png",
        );
      }

      const requestId = randomUUID();
      const openaiResponse = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}` },
        body: form,
      });

      if (!openaiResponse.ok) {
        const errText = await openaiResponse.text().catch(() => "");
        return {
          status: "error",
          outputUrl: null,
          requestId,
          error: `OpenAI images/edits falhou (${openaiResponse.status}): ${errText.slice(0, 500)}`,
        };
      }

      const openaiJson = (await openaiResponse.json()) as { data?: Array<{ b64_json?: string }> };
      const b64 = openaiJson?.data?.[0]?.b64_json;
      if (!b64) {
        return { status: "error", outputUrl: null, requestId, error: "OpenAI nao retornou imagem gerada." };
      }

      const outputBuffer = Buffer.from(b64, "base64");
      // Prefixo "canary/" dedicado - nunca grava em produto-ai/ (usado
      // pelo fluxo de produto) nem em brand-assets/ (Character Pack).
      // Isso e so um teste, nao vira asset oficial automaticamente.
      const storagePath = `canary/${requestId}.png`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, outputBuffer, { contentType: "image/png", upsert: false });

      if (uploadError) {
        return {
          status: "error",
          outputUrl: null,
          requestId,
          error: `Falha no upload da imagem do canary: ${uploadError.message}`,
        };
      }

      const { data: publicUrlData } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);

      return { status: "success", outputUrl: publicUrlData.publicUrl, requestId, error: null };
    } catch (error) {
      return {
        status: "error",
        outputUrl: null,
        requestId: null,
        error: error instanceof Error ? error.message : "Erro desconhecido no adapter openai-image-edit.",
      };
    }
  },
};
