// Radar Creative AI - Product Intelligence
// Acesso a tabela public.product_intelligence via supabaseAdmin (service
// role), igual ao resto do projeto (ver app/api/admin/criativos/*).
// Versionamento calculado em app (nao ha trigger SQL no projeto para isso -
// ver docs/skills-radar-smart.md, secao "Triggers SQL versionadas").

import { supabaseAdmin } from "@/lib/supabase";
import type {
  ProductIntelligence,
  ProductIntelligenceCategory,
  ProductIntelligenceDraft,
} from "@/lib/product-intelligence/types";

type ProductIntelligenceRow = {
  id: string;
  offer_id: string;
  version: number;
  category: string | null;
  subcategory: string | null;
  target_audience: ProductIntelligenceDraft["targetAudience"];
  pain_points: string[];
  desires: string[];
  objections: string[];
  purchase_motivations: string[];
  key_benefits: string[];
  emotional_benefits: string[];
  functional_benefits: string[];
  recommended_angles: ProductIntelligenceDraft["recommendedAngles"];
  recommended_frameworks: ProductIntelligenceDraft["recommendedFrameworks"];
  summary: string | null;
  source: string;
  model: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

const SELECT_COLUMNS =
  "id,offer_id,version,category,subcategory,target_audience,pain_points,desires,objections," +
  "purchase_motivations,key_benefits,emotional_benefits,functional_benefits,recommended_angles," +
  "recommended_frameworks,summary,source,model,created_by_user_id,created_by_email,created_at,updated_at";

function rowToProductIntelligence(row: ProductIntelligenceRow): ProductIntelligence {
  return {
    id: row.id,
    offerId: row.offer_id,
    version: row.version,
    category: (row.category ?? "geral") as ProductIntelligenceCategory,
    subcategory: row.subcategory,
    targetAudience: row.target_audience ?? { description: "", interests: [] },
    painPoints: row.pain_points ?? [],
    desires: row.desires ?? [],
    objections: row.objections ?? [],
    purchaseMotivations: row.purchase_motivations ?? [],
    keyBenefits: row.key_benefits ?? [],
    emotionalBenefits: row.emotional_benefits ?? [],
    functionalBenefits: row.functional_benefits ?? [],
    recommendedAngles: row.recommended_angles ?? [],
    recommendedFrameworks: row.recommended_frameworks ?? [],
    summary: row.summary ?? "",
    source: row.source,
    model: row.model,
    createdByUserId: row.created_by_user_id,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getLatestProductIntelligence(
  offerId: string,
): Promise<ProductIntelligence | null> {
  const { data, error } = await supabaseAdmin
    .from("product_intelligence")
    .select(SELECT_COLUMNS)
    .eq("offer_id", offerId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar Product Intelligence: ${error.message}`);
  return data ? rowToProductIntelligence(data as unknown as ProductIntelligenceRow) : null;
}

export async function listProductIntelligenceVersions(
  offerId: string,
): Promise<ProductIntelligence[]> {
  const { data, error } = await supabaseAdmin
    .from("product_intelligence")
    .select(SELECT_COLUMNS)
    .eq("offer_id", offerId)
    .order("version", { ascending: false });

  if (error) throw new Error(`Falha ao listar versoes de Product Intelligence: ${error.message}`);
  return ((data ?? []) as unknown as ProductIntelligenceRow[]).map(rowToProductIntelligence);
}

export async function getProductIntelligenceById(
  id: string,
): Promise<ProductIntelligence | null> {
  const { data, error } = await supabaseAdmin
    .from("product_intelligence")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Falha ao buscar Product Intelligence por id: ${error.message}`);
  return data ? rowToProductIntelligence(data as unknown as ProductIntelligenceRow) : null;
}

/**
 * Salva uma NOVA versao de analise para a oferta. Nunca sobrescreve a
 * versao anterior - cada chamada cria a linha com version = max(version)+1.
 */
export async function saveProductIntelligenceVersion(
  offerId: string,
  draft: ProductIntelligenceDraft,
  creator: { userId?: string | null; email?: string | null } = {},
): Promise<ProductIntelligence> {
  const latest = await getLatestProductIntelligence(offerId);
  const nextVersion = (latest?.version ?? 0) + 1;

  const payload = {
    offer_id: offerId,
    version: nextVersion,
    category: draft.category,
    subcategory: draft.subcategory,
    target_audience: draft.targetAudience,
    pain_points: draft.painPoints,
    desires: draft.desires,
    objections: draft.objections,
    purchase_motivations: draft.purchaseMotivations,
    key_benefits: draft.keyBenefits,
    emotional_benefits: draft.emotionalBenefits,
    functional_benefits: draft.functionalBenefits,
    recommended_angles: draft.recommendedAngles,
    recommended_frameworks: draft.recommendedFrameworks,
    summary: draft.summary,
    source: draft.source,
    model: draft.model,
    created_by_user_id: creator.userId ?? null,
    created_by_email: creator.email ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("product_intelligence")
    .insert(payload)
    .select(SELECT_COLUMNS)
    .single();

  if (error) throw new Error(`Falha ao salvar Product Intelligence: ${error.message}`);
  return rowToProductIntelligence(data as unknown as ProductIntelligenceRow);
}
