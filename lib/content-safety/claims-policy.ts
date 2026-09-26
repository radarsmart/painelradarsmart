// Radar Creative AI - Content Safety / Claims Policy
//
// Camada determinística (sem LLM) que impede alegacoes de resultado/saude
// nao sustentadas pelos dados reais da oferta de chegar a qualquer texto
// gerado (Product Intelligence, prompt visual, futuro roteiro/voiceover/
// overlay). Modulo neutro (nao depende de lib/product-intelligence nem
// lib/prompt-builder) para ser importavel dos dois lados sem ciclo.
//
// Regras por categoria - hoje so "suplementos" tem politica definida
// (categoria de maior risco regulatorio: alegacao de saude/desempenho).
// Adicionar uma nova categoria = adicionar uma entrada em
// CLAIMS_POLICY_BY_CATEGORY, nunca inferir regra nenhuma via IA.

export type ClaimRule = {
  id: string;
  label: string;
  pattern: RegExp;
};

export type ClaimViolation = {
  ruleId: string;
  ruleLabel: string;
  matchedText: string;
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Cada regra e testada contra o texto SEM acento e em minusculas - os
// patterns abaixo ja assumem essa normalizacao (nunca usar acento neles).
const SUPPLEMENT_FORBIDDEN_CLAIMS: ClaimRule[] = [
  {
    id: "guaranteed-result",
    label: "resultado garantido",
    pattern: /resultados?\s+garantid[oa]s?/,
  },
  {
    id: "guaranteed-muscle-gain",
    label: "ganho muscular garantido",
    pattern: /ganhos?\s+muscular(es)?\s+garantid[oa]s?/,
  },
  {
    id: "guaranteed-strength",
    label: "aumento garantido de forca",
    pattern: /aumento\s+garantid[oa]\s+de\s+forca/,
  },
  {
    id: "weight-loss",
    label: "emagrecimento",
    pattern: /emagrec\w*/,
  },
  {
    id: "guaranteed-recovery",
    label: "recuperacao garantida",
    pattern: /recuperacao\s+garantid[oa]/,
  },
  {
    id: "body-transformation",
    label: "transformacao corporal",
    pattern: /transformacao\s+(corporal|do\s+corpo|fisica)/,
  },
  {
    id: "result-timeframe",
    label: "prazo/resultado em X dias, semanas ou meses",
    pattern:
      /resultado\w*\s+(em|percebid\w*\s+em|vis[i]ve\w*\s+em|not[a]ve\w*\s+em)\s+(\d+|poucos?|poucas?)\s*(dias?|semanas?|meses?)/,
  },
  {
    id: "medical-effect",
    label: "efeito medico/terapeutico",
    pattern: /efeito\s+(medico|terapeutico)|trata\w*\s+(doenca|doencas)|cura\s+(de|para|do|da)/,
  },
  {
    id: "medical-endorsement",
    label: "recomendacao medica inexistente",
    pattern: /recomendad[oa]\s+por\s+medicos?|aprovad[oa]\s+pel[ao]\s+(anvisa|fda)/,
  },
  {
    id: "fake-certification",
    label: "certificacao inexistente",
    pattern: /certificad[oa]\s+internacionalmente|certificacao\s+(internacional|exclusiva|oficial)/,
  },
];

const CLAIMS_POLICY_BY_CATEGORY: Record<string, ClaimRule[]> = {
  suplementos: SUPPLEMENT_FORBIDDEN_CLAIMS,
};

function getRulesForCategory(category: string): ClaimRule[] {
  return CLAIMS_POLICY_BY_CATEGORY[category] ?? [];
}

export function hasClaimsPolicyForCategory(category: string): boolean {
  return category in CLAIMS_POLICY_BY_CATEGORY;
}

/**
 * Varre UM texto contra a politica da categoria. Nunca lanca excecao,
 * nunca acessa rede/banco - puro. Retorna [] quando nao ha violacao ou
 * quando a categoria nao tem politica definida ainda.
 */
export function scanTextForForbiddenClaims(text: string, category: string): ClaimViolation[] {
  const rules = getRulesForCategory(category);
  if (!rules.length || !text) return [];

  const normalized = stripAccents(text.toLowerCase());
  const violations: ClaimViolation[] = [];

  for (const rule of rules) {
    const match = normalized.match(rule.pattern);
    if (match) {
      violations.push({ ruleId: rule.id, ruleLabel: rule.label, matchedText: match[0] });
    }
  }

  return violations;
}

export function textContainsForbiddenClaims(text: string, category: string): boolean {
  return scanTextForForbiddenClaims(text, category).length > 0;
}

export type FilteredClaimsResult = {
  allowed: string[];
  removed: Array<{ field: string; text: string; violations: ClaimViolation[] }>;
};

/**
 * Filtra uma lista de frases (ex: keyBenefits) removendo qualquer item
 * que viole a politica da categoria. NUNCA substitui o item removido por
 * um claim alternativo inventado - so remove. `field` e so um rotulo para
 * o relatorio de auditoria (ex: "keyBenefits").
 */
export function filterForbiddenClaims(
  items: string[],
  category: string,
  field: string,
): FilteredClaimsResult {
  const allowed: string[] = [];
  const removed: FilteredClaimsResult["removed"] = [];

  for (const item of items) {
    const violations = scanTextForForbiddenClaims(item, category);
    if (violations.length > 0) {
      removed.push({ field, text: item, violations });
    } else {
      allowed.push(item);
    }
  }

  return { allowed, removed };
}

/**
 * Guarda defensiva (belt-and-suspenders) para textos que NUNCA deveriam
 * conter uma claim proibida no momento em que chegam aqui (ex: o
 * positivePrompt final do Prompt Builder, que so e montado a partir de
 * templates fixos - se isso disparar, e sinal de um bug real em outro
 * lugar do pipeline, nao um caso normal a ser silenciosamente filtrado).
 */
export function assertTextIsClaimsSafe(text: string, category: string, context: string): void {
  const violations = scanTextForForbiddenClaims(text, category);
  if (violations.length > 0) {
    const details = violations.map((v) => `"${v.matchedText}" (${v.ruleLabel})`).join("; ");
    throw new Error(
      `Claim nao permitida para a categoria "${category}" encontrada em ${context}: ${details}.`,
    );
  }
}
