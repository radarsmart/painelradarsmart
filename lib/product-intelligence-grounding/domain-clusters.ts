// Radar Creative AI - Product Intelligence Grounding V1 - Domain Clusters
//
// Taxonomia PEQUENA e DELIBERADAMENTE GENERICA (item 6 do pedido - "nao
// precisa criar taxonomia gigantesca... objetivo e detectar
// incompatibilidades FORTES"). Nunca contem palavra especifica de um
// produto real (nunca "kokeshi", nunca "colageno" isolado sem contexto de
// dominio) - cada cluster e reutilizavel para qualquer oferta futura.
//
// Cada cluster separa DUAS listas de palavras-chave com papeis diferentes:
// - identityKeywords: o que o PRODUTO EM SI parece ser (testado contra
//   titulo real + texto de embalagem real - fontes TIER1/TIER2, nunca
//   contra o Product Intelligence, que e justamente o que estamos
//   auditando).
// - domainLanguageKeywords: de que dominio uma CLAIM de texto (pain point/
//   desire/beneficio) parece estar falando (testado contra o texto da
//   propria claim).
//
// "colageno"/"colágeno" e deliberadamente OMITIDO de qualquer lista aqui -
// e um ingrediente real usado tanto em skincare quanto em suplementos
// ingeriveis (a mesma ambiguidade que causou o bug real em
// lib/product-intelligence/analyze.ts#detectCategory) - nao deve ser usado
// como sinal forte de identidade para NENHUM cluster.

import type { DomainClusterId, DomainClusterProfile } from "@/lib/product-intelligence-grounding/types";

export const DOMAIN_CLUSTERS: Record<DomainClusterId, DomainClusterProfile> = {
  SPORTS_FITNESS: {
    id: "SPORTS_FITNESS",
    identityKeywords: ["whey", "creatina", "termogenico", "pre-treino", "bcaa", "barra proteica", "halter", "anilha", "academia"],
    domainLanguageKeywords: ["treino", "muscular", "recuperacao muscular", "energia para o treino", "repeticoes", "performance no treino", "academia", "exercicio fisico"],
  },
  FOOD_SUPPLEMENT: {
    id: "FOOD_SUPPLEMENT",
    identityKeywords: ["suplemento", "capsula", "comprimido", "multivitaminico", "sache", "po para diluir"],
    domainLanguageKeywords: ["consumo diario", "ingestao", "dose diaria", "suporte nutricional", "nutrientes", "digestao"],
  },
  SKINCARE: {
    id: "SKINCARE",
    identityKeywords: ["facial", "creme", "gel", "serum", "sérum", "locao", "loção", "hidratante", "pele", "rosto", "esfoliante", "protetor solar"],
    domainLanguageKeywords: ["textura", "absorcao", "aplicacao na pele", "rotina de skincare", "hidratacao da pele", "pele", "rosto"],
  },
  HAIRCARE: {
    id: "HAIRCARE",
    identityKeywords: ["shampoo", "condicionador", "capilar", "mascara capilar", "leave-in", "oleo capilar"],
    domainLanguageKeywords: ["fios", "cabelo", "couro cabeludo", "brilho capilar", "queda de cabelo"],
  },
  HOME: {
    id: "HOME",
    identityKeywords: ["organizador", "utensilio domestico", "decoracao", "eletrodomestico", "utilidades domesticas"],
    domainLanguageKeywords: ["organizar a casa", "espaco em casa", "ambiente domestico", "limpeza da casa"],
  },
  ELECTRONICS: {
    id: "ELECTRONICS",
    identityKeywords: ["eletronico", "celular", "smartphone", "fone de ouvido", "carregador", "smartwatch", "notebook"],
    domainLanguageKeywords: ["bateria", "conectividade", "tela", "performance do dispositivo", "aplicativo"],
  },
  FASHION: {
    id: "FASHION",
    identityKeywords: ["roupa", "calcado", "tenis", "vestido", "bolsa", "acessorio de moda"],
    domainLanguageKeywords: ["caimento", "tendencia", "look", "estilo", "tamanho"],
  },
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function detectClustersInText(text: string, keywordSelector: (cluster: DomainClusterProfile) => string[]): Record<DomainClusterId, string[]> {
  const normalized = normalize(text);
  const hits = {} as Record<DomainClusterId, string[]>;
  for (const clusterId of Object.keys(DOMAIN_CLUSTERS) as DomainClusterId[]) {
    const cluster = DOMAIN_CLUSTERS[clusterId];
    const matched = keywordSelector(cluster).filter((kw) => normalized.includes(normalize(kw)));
    hits[clusterId] = matched;
  }
  return hits;
}

export function clustersWithHits(hits: Record<DomainClusterId, string[]>): DomainClusterId[] {
  return (Object.keys(hits) as DomainClusterId[]).filter((id) => hits[id].length > 0);
}
