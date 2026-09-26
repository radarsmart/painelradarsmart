// Radar Creative AI - Creative Director V2 / Script helper compartilhado
//
// Extraido de scripts/run-creative-director-v2-dry-run.js pra ser
// reaproveitado tambem por scripts/run-creative-director-v2-validation.js -
// evita duplicar a logica de "achar uma campanha real com Creative Brief
// completo" e "montar o CommercialDirectorInput" entre os dois scripts.
// So leitura (.select()) - nunca escreve em creative_campaigns/offers/etc.

const PRODUCT_INTELLIGENCE_COLUMNS =
  "id,offer_id,version,category,subcategory,pain_points,desires,objections,purchase_motivations," +
  "key_benefits,emotional_benefits,functional_benefits";

function rowToProductIntelligence(row) {
  return {
    id: row.id,
    offerId: row.offer_id,
    version: row.version,
    category: row.category ?? "geral",
    subcategory: row.subcategory,
    painPoints: row.pain_points ?? [],
    desires: row.desires ?? [],
    objections: row.objections ?? [],
    purchaseMotivations: row.purchase_motivations ?? [],
    keyBenefits: row.key_benefits ?? [],
    emotionalBenefits: row.emotional_benefits ?? [],
    functionalBenefits: row.functional_benefits ?? [],
  };
}

async function findDryRunCampaign(supabaseAdmin, explicitId) {
  if (explicitId) {
    const { data, error } = await supabaseAdmin
      .from("creative_campaigns")
      .select("id,name,offer_id,product_intelligence_id,selected_framework,selected_angle,selected_persona_id")
      .eq("id", explicitId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Campanha ${explicitId} nao encontrada.`);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from("creative_campaigns")
    .select("id,name,offer_id,product_intelligence_id,selected_framework,selected_angle,selected_persona_id")
    .not("offer_id", "is", null)
    .not("product_intelligence_id", "is", null)
    .not("selected_framework", "is", null)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Nenhuma campanha real com Creative Brief completo (offer_id + product_intelligence_id + selected_framework) foi encontrada.");
  }
  return data[0];
}

async function buildInputForCampaign(supabaseAdmin, campaignRow) {
  const [offerRes, piRes, personaRes] = await Promise.all([
    supabaseAdmin
      .from("offers")
      .select("title,category,discount_pct,price,original_price,rating,reviews_count,marketplace")
      .eq("id", campaignRow.offer_id)
      .maybeSingle(),
    supabaseAdmin
      .from("product_intelligence")
      .select(PRODUCT_INTELLIGENCE_COLUMNS)
      .eq("id", campaignRow.product_intelligence_id)
      .maybeSingle(),
    campaignRow.selected_persona_id
      ? supabaseAdmin.from("ugc_personas").select("slug,is_official_brand_character").eq("id", campaignRow.selected_persona_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (offerRes.error) throw new Error(offerRes.error.message);
  if (!offerRes.data) throw new Error("Oferta da campanha nao encontrada.");
  if (piRes.error) throw new Error(piRes.error.message);
  if (!piRes.data) throw new Error("Product Intelligence da campanha nao encontrada.");

  const offer = offerRes.data;
  const productIntelligence = rowToProductIntelligence(piRes.data);
  const persona = personaRes.data;

  const input = {
    offerId: campaignRow.offer_id,
    productTitle: offer.title ?? "produto",
    category: productIntelligence.category,
    discountPct: offer.discount_pct,
    price: offer.price,
    originalPrice: offer.original_price,
    rating: offer.rating,
    reviewsCount: offer.reviews_count,
    marketplace: offer.marketplace,
    primaryPain: productIntelligence.painPoints[0] ?? "",
    primaryDesire: productIntelligence.desires[0] ?? "",
    primaryObjection: productIntelligence.objections[0] ?? "",
    purchaseMotivation: productIntelligence.purchaseMotivations[0] ?? "",
    frameworkSlug: campaignRow.selected_framework,
    angleSlug: campaignRow.selected_angle ?? "",
    officialCharacterSlug: persona && persona.is_official_brand_character ? persona.slug : null,
  };

  return { input, offerTitle: offer.title };
}

module.exports = { findDryRunCampaign, buildInputForCampaign };
