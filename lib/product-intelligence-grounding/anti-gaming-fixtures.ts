// Radar Creative AI - Product Intelligence Grounding V1 - Anti-Gaming Fixtures
//
// 8 fixtures sinteticas (item 17 do pedido) - nenhuma especifica de
// Kokeshi. Provam que a camada de grounding: reconhece produto/categoria/
// claims corretos (A); detecta categoria errada (B); detecta contaminacao
// parcial mesmo com categoria correta (C); nunca inventa confianca quando
// falta dado (D); nao gera falso positivo em combinacao genuinamente
// hibrida (E); marca uma claim "bem escrita" como contaminada quando o
// dominio esta errado, independente de quao persuasiva ela soe (F); nunca
// penaliza um angulo de preco real sem desconto (G); e sempre bloqueia
// desconto fabricado quando discount_pct=0 (H).

import type { ObservedPackagingTextInput, RawOfferInput, RawProductIntelligenceInput } from "@/lib/product-intelligence-grounding/types";

// --- A) CORRECT_CATEGORY_CORRECT_CLAIMS - esperado: PASS ---------------------
export const FIXTURE_A_OFFER: RawOfferInput = { title: "Tênis Esportivo Confort Runner", price: 89.9, originalPrice: 112.4, discountPct: 20, marketplace: "shopee", brand: null };
export const FIXTURE_A_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Calçado esportivo confortável", observedVia: "fixture" }];
export const FIXTURE_A_PI: RawProductIntelligenceInput = {
  category: "moda",
  painPoints: ["calçado que machuca o pé depois de um tempo de uso"],
  desires: ["tênis confortável para o dia a dia"],
  objections: ["duvida sobre o caimento do tamanho"],
  purchaseMotivations: ["visual moderno e na tendencia"],
  keyBenefits: ["conforto no uso diario"],
  emotionalBenefits: ["autoestima ao usar um visual atual"],
  functionalBenefits: ["solado resistente para uso diario"],
};

// --- B) WRONG_CATEGORY (skincare classificado como suplemento) - esperado: FAIL
export const FIXTURE_B_OFFER: RawOfferInput = { title: "Sérum Facial Antioxidante Vitamina C", price: 45, originalPrice: null, discountPct: 0, marketplace: "tiktokshop", brand: null };
export const FIXTURE_B_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Sérum para o rosto", observedVia: "fixture" }, { text: "Textura leve, rápida absorção", observedVia: "fixture" }];
export const FIXTURE_B_PI: RawProductIntelligenceInput = {
  category: "suplementos",
  painPoints: ["falta de energia ou resultado lento no treino"],
  desires: ["mais disposicao para o treino"],
  objections: ["duvida se causa algum efeito colateral"],
  purchaseMotivations: ["prova social de quem ja sentiu o resultado no treino"],
  keyBenefits: ["resultado percebido apos semanas de treino"],
  emotionalBenefits: ["sensacao de disciplina e progresso na academia"],
  functionalBenefits: ["recuperacao muscular", "mais energia para o treino"],
};

// --- C) MIXED_CLAIMS (produto/categoria corretos + 1 claim contaminada) -----
// Esperado: FAIL ou quarentena material (nao precisa reprovar o gate
// inteiro - uma claim isolada e ruido, nao um padrao sistemico, ver item 4
// do gate/DOMAIN_CONSISTENCY).
export const FIXTURE_C_OFFER: RawOfferInput = { title: "Creme Hidratante Corporal Nutritivo", price: 32, originalPrice: null, discountPct: 0, marketplace: "shopee", brand: null };
export const FIXTURE_C_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Hidratante corporal", observedVia: "fixture" }];
export const FIXTURE_C_PI: RawProductIntelligenceInput = {
  category: "beleza",
  painPoints: ["pele ressecada no inverno"],
  desires: ["pele hidratada e macia"],
  objections: ["duvida se serve para pele sensivel"],
  purchaseMotivations: ["preco abaixo de marca conhecida"],
  keyBenefits: ["hidratacao prolongada"],
  emotionalBenefits: ["sensacao de autocuidado"],
  functionalBenefits: ["recuperação muscular pós-treino"], // a claim contaminada isolada
};

// --- D) UNKNOWN_CATEGORY (sem informacao suficiente) - esperado: nunca inventar
export const FIXTURE_D_OFFER: RawOfferInput = { title: "Produto XYZ-100", price: 19.9, originalPrice: null, discountPct: 0, marketplace: "shopee", brand: null };
export const FIXTURE_D_PACKAGING: ObservedPackagingTextInput[] = [];
export const FIXTURE_D_PI: RawProductIntelligenceInput = {
  category: "geral",
  painPoints: ["preco alto para o orcamento"],
  desires: ["bom custo beneficio"],
  objections: ["duvida sobre qualidade"],
  purchaseMotivations: ["preco abaixo do usual"],
  keyBenefits: ["atende a necessidade"],
  emotionalBenefits: ["sensacao de bom negocio"],
  functionalBenefits: ["cumpre o proposito basico"],
};

// --- E) PLAUSIBLE_CROSS_CATEGORY (produto genuinamente hibrido) -------------
// Suplemento INGERIVEL de colageno com beneficio de pele/cabelo - real e
// legitimo, nao deve gerar falso positivo de contaminacao.
export const FIXTURE_E_OFFER: RawOfferInput = { title: "Cápsulas de Colágeno Hidrolisado com Biotina", price: 55, originalPrice: null, discountPct: 0, marketplace: "shopee", brand: null };
export const FIXTURE_E_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Suplemento alimentar em cápsulas", observedVia: "fixture" }];
export const FIXTURE_E_PI: RawProductIntelligenceInput = {
  category: "suplementos",
  painPoints: ["preco alto de suplementos importados"],
  desires: ["pele com aspecto mais saudável e viçoso"],
  objections: ["duvida se realmente absorve bem"],
  purchaseMotivations: ["praticidade de tomar em capsulas"],
  keyBenefits: ["suporte a beleza de dentro para fora"],
  emotionalBenefits: ["cabelo com mais brilho e força"],
  functionalBenefits: ["absorcao facilitada"],
};

// --- F) STRONG_CREATIVE_BUT_BAD_GROUNDING ------------------------------------
// Claim bem escrita/persuasiva, mas de dominio errado - deve reprovar o
// grounding independente de quao boa a ideia criativa pareca.
export const FIXTURE_F_OFFER: RawOfferInput = { title: "Óleo Capilar Reparador Profissional", price: 42, originalPrice: null, discountPct: 0, marketplace: "shopee", brand: null };
export const FIXTURE_F_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Óleo capilar para pontas duplas", observedVia: "fixture" }];
export const FIXTURE_F_PI: RawProductIntelligenceInput = {
  category: "beleza",
  painPoints: ["cabelo ressecado e sem brilho"],
  desires: ["cabelo com mais maciez"],
  objections: [],
  purchaseMotivations: [],
  keyBenefits: [],
  emotionalBenefits: [],
  functionalBenefits: ["performance no treino de alta intensidade"], // criativo, persuasivo, dominio errado
};

// --- G) SAFE_PRICE_ANGLE (preco real sem desconto) - esperado: permitido ----
export const FIXTURE_G_OFFER: RawOfferInput = { title: "Fone de Ouvido Bluetooth Compacto", price: 39.9, originalPrice: null, discountPct: 0, marketplace: "shopee", brand: null };
export const FIXTURE_G_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Fone bluetooth sem fio", observedVia: "fixture" }];
export const FIXTURE_G_PI: RawProductIntelligenceInput = {
  category: "eletronicos",
  painPoints: [],
  desires: [],
  objections: [],
  purchaseMotivations: ["preço de entrada baixo sem precisar de cupom"],
  keyBenefits: [],
  emotionalBenefits: [],
  functionalBenefits: [],
};

// --- H) FAKE_DISCOUNT (discount_pct=0 virando desconto) - esperado: FAIL ----
export const FIXTURE_H_OFFER: RawOfferInput = { title: "Fone de Ouvido Bluetooth Compacto", price: 39.9, originalPrice: null, discountPct: 0, marketplace: "shopee", brand: null };
export const FIXTURE_H_PACKAGING: ObservedPackagingTextInput[] = [{ text: "Fone bluetooth sem fio", observedVia: "fixture" }];
export const FIXTURE_H_PI: RawProductIntelligenceInput = {
  category: "eletronicos",
  painPoints: [],
  desires: [],
  objections: [],
  purchaseMotivations: ["até 40% de desconto por tempo limitado"],
  keyBenefits: [],
  emotionalBenefits: [],
  functionalBenefits: [],
};
