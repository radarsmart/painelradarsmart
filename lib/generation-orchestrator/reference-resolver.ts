// Radar Creative AI - Generation Orchestrator / Reference Resolver
//
// UNICA parte impura desta fase alem do executor: resolve as referencias
// necessarias para GERACAO REAL a partir do que o Prompt Builder/
// Commercial Director planejaram, e busca a imagem real do produto na
// oferta (offers.image_url) quando existir. Nunca inventa uma URL - se
// nao houver asset/imagem, o campo fica null.
//
// REGRA CRITICA (generationSafe): o Commercial Director seleciona a
// support reference para fins de PLANEJAMENTO/preview (creative_brief),
// sem exigir generationSafe - isso continua exatamente como estava, ver
// lib/commercial-director/director.ts. Mas para GERACAO REAL, este
// modulo IGNORA a support reference do planejamento e reconsulta o
// Character Pack exigindo generationSafe=true com os mesmos criterios de
// expression/pose/shot. Se nao houver nenhuma support generation-safe
// compativel, a cena fica sem support (supportReferenceError preenchido)
// e o guardrail em guardrails.ts bloqueia a geracao - nunca cai
// silenciosamente para uma referencia com logo/texto de fundo.
//
// PRIMARY nunca e afetada por essa regra - ela e sempre a mesma
// identityReference definida pelo planejamento, resolvida diretamente.

import { supabaseAdmin } from "@/lib/supabase";
import { getBrandAssetById } from "@/lib/brand-assets/repository";
import { selectBestCharacterReference } from "@/lib/brand-character/character-pack";
import { fetchRemoteImageDimensions, type ImageDimensions } from "@/lib/generation-orchestrator/image-dimensions";
import { assessProductReferenceQuality } from "@/lib/generation-orchestrator/product-reference-quality";
import type { CampaignPromptPlan, SceneGenerationPrompt } from "@/lib/prompt-builder/types";
import type { ResolvedSceneReferences } from "@/lib/generation-orchestrator/types";

const NO_SAFE_SUPPORT_ERROR = "No generation-safe support reference available.";

async function resolveOfferImageUrl(offerId: string | null): Promise<string | null> {
  if (!offerId) return null;

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("image_url")
    .eq("id", offerId)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar imagem da oferta: ${error.message}`);
  const row = data as { image_url: string | null } | null;
  return row?.image_url ?? null;
}

async function resolveAssetUrl(assetId: string | null): Promise<string | null> {
  if (!assetId) return null;
  const asset = await getBrandAssetById(assetId);
  return asset?.fileUrl ?? null;
}

/**
 * Descobre o characterSlug da identity reference - via metadata.characterSlug
 * quando presente, ou (referencias legadas, como a PRIMARY original) via a
 * persona atualmente marcada como personagem oficial. Mesma logica de
 * fallback ja usada em lib/brand-character/character-pack.ts, aplicada
 * aqui explicitamente porque selectBestCharacterReference exige o slug.
 */
async function resolveCharacterSlugForIdentity(identityAssetId: string): Promise<string | null> {
  const asset = await getBrandAssetById(identityAssetId);
  const metadataSlug = (asset?.metadata as { characterSlug?: string } | undefined)?.characterSlug;
  if (metadataSlug) return metadataSlug;

  const { data, error } = await supabaseAdmin
    .from("ugc_personas")
    .select("slug")
    .eq("is_official_brand_character", true)
    .maybeSingle();

  if (error) throw new Error(`Falha ao localizar personagem oficial: ${error.message}`);
  return (data as { slug: string } | null)?.slug ?? null;
}

async function resolveCharacterSceneReferences(
  scene: SceneGenerationPrompt,
): Promise<Pick<ResolvedSceneReferences, "identityReferenceUrl" | "supportReferenceAssetId" | "supportReferenceUrl" | "supportReferenceError">> {
  if (!scene.identityReferenceAssetId) {
    // PRODUCT_ONLY - nao exige Character Pack.
    return { identityReferenceUrl: null, supportReferenceAssetId: null, supportReferenceUrl: null, supportReferenceError: null };
  }

  const identityReferenceUrl = await resolveAssetUrl(scene.identityReferenceAssetId);

  const characterSlug = await resolveCharacterSlugForIdentity(scene.identityReferenceAssetId);
  if (!characterSlug) {
    return {
      identityReferenceUrl,
      supportReferenceAssetId: null,
      supportReferenceUrl: null,
      supportReferenceError: NO_SAFE_SUPPORT_ERROR,
    };
  }

  const safeMatch = await selectBestCharacterReference({
    characterSlug,
    expression: scene.expression ?? undefined,
    pose: scene.pose ?? undefined,
    shot: scene.shot ?? undefined,
    generationSafe: true,
  });

  if (!safeMatch) {
    return {
      identityReferenceUrl,
      supportReferenceAssetId: null,
      supportReferenceUrl: null,
      supportReferenceError: NO_SAFE_SUPPORT_ERROR,
    };
  }

  return {
    identityReferenceUrl,
    supportReferenceAssetId: safeMatch.asset.id,
    supportReferenceUrl: safeMatch.asset.fileUrl,
    supportReferenceError: null,
  };
}

export async function resolveCampaignSceneReferences(
  promptPlan: CampaignPromptPlan,
  offerId: string | null,
  // Categoria do Product Intelligence - so usada pelo Product Reference
  // Quality Gate (sinal fraco, ver product-reference-quality.ts). "geral"
  // quando o chamador nao tiver a categoria disponivel (nunca bloqueia a
  // resolucao das outras referencias por causa disso).
  category = "geral",
): Promise<Record<string, ResolvedSceneReferences>> {
  const productReferenceUrl = await resolveOfferImageUrl(offerId);

  // Uma unica busca por campanha - a imagem da oferta e a mesma para
  // todas as cenas, entao medir dimensoes uma vez so evita N fetches
  // identicos. null quando nao ha productReferenceUrl ou a imagem nao
  // pode ser lida (formato desconhecido/URL inacessivel) - tratado de
  // forma conservadora dentro de assessProductReferenceQuality.
  const productReferenceDimensions: ImageDimensions | null = productReferenceUrl
    ? await fetchRemoteImageDimensions(productReferenceUrl)
    : null;

  const entries = await Promise.all(
    promptPlan.scenes.map(async (scene) => {
      const characterRefs = await resolveCharacterSceneReferences(scene);

      const productReferenceQuality = productReferenceUrl
        ? assessProductReferenceQuality({
            width: productReferenceDimensions?.width ?? null,
            height: productReferenceDimensions?.height ?? null,
            category,
            mediaType: scene.mediaType,
            productIntegrityRisk: scene.productIntegrityRisk,
          })
        : null;

      const resolved: ResolvedSceneReferences = {
        ...characterRefs,
        productReferenceUrl,
        productReferenceQuality,
      };

      return [scene.sceneId, resolved] as const;
    }),
  );

  return Object.fromEntries(entries);
}
