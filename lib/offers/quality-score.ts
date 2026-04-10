export interface OfferQualityData {
  title?: string;
  price?: number;
  original_price?: number;
  price_old?: number;
  image_url?: string;
  affiliate_url?: string;
  product_url?: string;
  historical_price_avg?: number | null;
}

export interface QualityScoreResult {
  quality_score: number;
  is_priority: boolean;
}

/**
 * Calcula o Quality Score (0 a 100) para priorização de curadoria.
 * 
 * Critérios:
 * 1. Desconto real vs histórico (40% de peso)
 * 2. Qualidade do título (20% de peso)
 * 3. Presença de imagem (20% de peso)
 * 4. Presença de link de afiliado rastreável (20% de peso)
 */
export function calculateQualityScore(offer: OfferQualityData): QualityScoreResult {
  let score = 0;

  // 1. Desconto real vs price_history (Peso 40%)
  // Tenta usar o histórico; se não existir, cai para original_price
  const referencePrice = offer.historical_price_avg || offer.original_price || offer.price_old;
  const currentPrice = offer.price;

  if (referencePrice && currentPrice && referencePrice > currentPrice) {
    const discountPct = ((referencePrice - currentPrice) / referencePrice) * 100;
    
    if (discountPct >= 30) {
      score += 40; // Desconto real excelente
    } else if (discountPct >= 10) {
      score += 20; // Desconto real mediano
    }
    // Abaixo de 10% = 0 pontos
  }

  // 2. Qualidade do Título (Peso 20%)
  // Considera bom se tiver mais de 5 palavras para evitar títulos curtos genéricos
  const title = (offer.title || '').trim();
  const wordCount = title.split(/\s+/).filter(word => word.length > 0).length;
  
  if (wordCount > 5) {
    score += 20;
  }

  // 3. Presença de Imagem (Peso 20%)
  // Deve ter uma URL válida retornada no payload
  if (offer.image_url && offer.image_url.startsWith('http')) {
    score += 20;
  }

  // 4. Presença de Affiliate URL válido (Peso 20%)
  // Deve ser um link distinto do produto base que identifique o rastreamento
  if (offer.affiliate_url && offer.affiliate_url.startsWith('http')) {
    // Validação extra caso seja só o link cru repetido acidentalmente
    if (offer.affiliate_url !== offer.product_url) {
      score += 20;
    }
  }

  // Garante que o score fique rigidamente entre 0 e 100
  score = Math.min(Math.max(score, 0), 100);

  return {
    quality_score: Math.round(score),
    is_priority: score >= 70, // >= 70 qualifica automaticamente como alta prioridade
  };
}
