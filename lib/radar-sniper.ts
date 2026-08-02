export const RADAR_SNIPER_MIN_PRICE = 49.9;

export type RadarCategory =
  | "Tecnologia"
  | "Casa"
  | "Fitness"
  | "Beleza"
  | "Eletrodomesticos"
  | "Bebes"
  | "Moda"
  | "Geral";

export type RelevanceSignals = {
  hasBestSeller: boolean;
  hasPrimeOrFull: boolean;
};

type SniperInput = {
  title?: string | null;
  marketplace?: string | null;
  price?: number | null;
  oldPrice?: number | null;
  discountPct?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  raw?: unknown;
  badges?: string[] | null;
  isPrime?: boolean | null;
  isFull?: boolean | null;
  isBestSeller?: boolean | null;
  commissionRatePct?: number | null;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: unknown): string {
  return toText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function classifyOfferCategory(title: string): RadarCategory {
  const text = normalizeText(title);

  const tecnologia = [
    "notebook", "monitor", "smartphone", "iphone", "samsung", "xiaomi", "tv", 
    "smart tv", "fone", "headset", "teclado", "mouse", "ssd", "placa de video", 
    "console", "ps5", "xbox", "smartwatch", "processador", "ram", "hd externo",
    "tablet", "ipad", "kindle", "alexa", "echo dot"
  ];

  const casa = [
    "aspirador", "chaleira", "sofa", "cama", "mesa", "cadeira", "guarda roupa", 
    "colchao", "travesseiro", "decoracao", "quadro", "espelho", "tapete", "cortina",
    "luminaria", "abajur", "ferramenta", "furadeira", "parafusadeira", "jardim"
  ];

  const eletrodomesticos = [
    "air fryer", "cafeteira", "geladeira", "fogao", "microondas", "liquidificador", 
    "batedeira", "lava e seca", "maquina de lavar", "panela", "ar condicionado",
    "ventilador", "purificador", "bebedouro", "forno", "cooktop", "depurador"
  ];

  const fitness = [
    "whey", "creatina", "halter", "esteira", "bicicleta ergometrica", "garrafa termica",
    "tenis corrida", "faixa elastica", "suplemento", "yoga", "academia", "esporte", "chuteira"
  ];

  const beleza = [
    "perfume", "maquiagem", "batom", "shampoo", "condicionador", "hidratante", "protetor solar",
    "barbeador", "depilador", "secador", "chapinha", "escova secadora", "skincare"
  ];

  const bebes = [
    "fralda", "carrinho", "bebe conforto", "mamadeira", "brinquedo", "lego", "boneca",
    "andador", "berco", "pampers", "huggies", "fisher price"
  ];

  const moda = [
    "camisa", "camiseta", "calca", "vestido", "saia", "bermuda", "bolsa", "relogio",
    "oculos", "joia", "brinco", "colar", "pulseira"
  ];

  if (tecnologia.some((keyword) => text.includes(keyword))) return "Tecnologia";
  if (eletrodomesticos.some((keyword) => text.includes(keyword))) return "Eletrodomesticos";
  if (casa.some((keyword) => text.includes(keyword))) return "Casa";
  if (fitness.some((keyword) => text.includes(keyword))) return "Fitness";
  if (beleza.some((keyword) => text.includes(keyword))) return "Beleza";
  if (bebes.some((keyword) => text.includes(keyword))) return "Bebes";
  if (moda.some((keyword) => text.includes(keyword))) return "Moda";
  
  return "Geral";
}

export function computeDiscountPct(
  price: number | null,
  oldPrice: number | null,
  fallback: number | null = null,
): number {
  if (oldPrice && price && oldPrice > price) {
    return clamp(Math.round(((oldPrice - price) / oldPrice) * 100), 0, 100);
  }
  const normalizedFallback = toNumber(fallback) ?? 0;
  return clamp(Math.round(normalizedFallback), 0, 100);
}

export function getRelevanceSignals(input: SniperInput): RelevanceSignals {
  const title = normalizeText(input.title);
  const badges =
    Array.isArray(input.badges) && input.badges.length
      ? input.badges.map((badge) => normalizeText(badge)).join(" ")
      : "";
  const raw = normalizeText(input.raw);
  const textBlob = `${title} ${badges} ${raw}`;

  const hasBestSellerBoolean = Boolean(input.isBestSeller);
  const hasPrimeBoolean = Boolean(input.isPrime || input.isFull);

  const hasBestSellerText =
    textBlob.includes("best seller") ||
    textBlob.includes("mais vendido") ||
    textBlob.includes("mais vendidos");
  const hasPrimeOrFullText =
    textBlob.includes("prime") ||
    textBlob.includes("full") ||
    textBlob.includes("entrega full") ||
    textBlob.includes("envio full");

  return {
    hasBestSeller: hasBestSellerBoolean || hasBestSellerText,
    hasPrimeOrFull: hasPrimeBoolean || hasPrimeOrFullText,
  };
}

export function computePopularityScore(input: SniperInput): number {
  const rating = clamp(toNumber(input.rating) ?? 0, 0, 5);
  const reviewCount = Math.max(0, Math.round(toNumber(input.reviewCount) ?? 0));
  const signals = getRelevanceSignals(input);

  const ratingScore = (rating / 5) * 45;
  const reviewScore = clamp(Math.log10(reviewCount + 1) * 20, 0, 35);
  const relevanceBonus = signals.hasBestSeller || signals.hasPrimeOrFull ? 20 : 0;

  return clamp(Math.round(ratingScore + reviewScore + relevanceBonus), 0, 100);
}

export function computeProfitPotential(input: SniperInput): number {
  const price = toNumber(input.price);
  const oldPrice = toNumber(input.oldPrice);
  const discountPct = computeDiscountPct(price, oldPrice, input.discountPct ?? null);
  const popularity = computePopularityScore(input);
  return clamp(Math.round((discountPct + popularity) / 2), 0, 100);
}

export function passesRadarSniperPreFilter(input: SniperInput): boolean {
  const price = toNumber(input.price) ?? 0;
  if (price < RADAR_SNIPER_MIN_PRICE) return false;

  const signals = getRelevanceSignals(input);
  const popularity = computePopularityScore(input);
  if (signals.hasBestSeller || signals.hasPrimeOrFull || popularity >= 55) return true;

  // Algumas fontes (ex.: busca do Mercado Livre) nao expoe rating/reviewCount,
  // entao popularidade fica sempre 0 e o filtro nunca passaria. Nesses casos,
  // usa o desconto como sinal substituto de potencial de conversao.
  const hasPopularitySignal = input.rating !== null && input.rating !== undefined
    ? true
    : input.reviewCount !== null && input.reviewCount !== undefined;
  if (!hasPopularitySignal) {
    const discountPct = toNumber(input.discountPct) ?? 0;
    if (discountPct > 0) return discountPct >= 30;

    // Sem popularidade nem desconto (ex.: Shopee, cuja API so expoe faixa de
    // preco por variante, nao desconto real) — usa a comissao real do
    // afiliado como ultimo sinal substituto de potencial de conversao.
    const commissionRatePct = toNumber(input.commissionRatePct) ?? 0;
    if (commissionRatePct > 0) return commissionRatePct >= 15;

    return false;
  }

  return false;
}

type SniperDiscoveryItem = SniperInput & {
  id?: string;
  title: string;
  price: number;
};

export function rankSniperCandidates<T extends SniperDiscoveryItem>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const scoreB = computeProfitPotential(b);
    const scoreA = computeProfitPotential(a);
    return scoreB - scoreA;
  });
}
