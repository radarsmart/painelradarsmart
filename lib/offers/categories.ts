// Agrupa os valores crus de `offers.category` (que vem da taxonomia de cada
// marketplace/fonte, tipo "Utilidades Domésticas (low ticket)" ou "Acessórios
// para Celular") em um punhado de categorias com nome e ícone pensados pra
// quem visita o site, não pra quem opera o sistema por trás.

export type CategoryInfo = {
  slug: string;
  label: string;
  icon: string;
};

type CategoryRule = CategoryInfo & { keywords: string[] };

const CATEGORY_RULES: CategoryRule[] = [
  { slug: "celular", label: "Celular & Acessórios", icon: "📱", keywords: ["celular", "smartphone", "acessorio"] },
  { slug: "tech", label: "Informática & Tech", icon: "💻", keywords: ["informat", "tecnologia", "escritorio", "eletronic"] },
  { slug: "casa", label: "Casa & Utilidades", icon: "🏠", keywords: ["casa", "cozinha", "utilidades", "domestic", "eletrodomestic"] },
  { slug: "beleza", label: "Beleza & Cuidados", icon: "💄", keywords: ["beleza", "cuidado", "perfum", "cosmetic"] },
  { slug: "moda", label: "Moda & Calçados", icon: "👕", keywords: ["moda", "calcado", "roupa", "vestuario"] },
  { slug: "fitness", label: "Fitness & Bem-estar", icon: "🏋️", keywords: ["fitness", "bem-estar", "bem estar", "esporte", "suplement"] },
];

const FALLBACK_CATEGORY: CategoryInfo = { slug: "outros", label: "Outros", icon: "🛍️" };

export const CATEGORY_MENU: CategoryInfo[] = [
  ...CATEGORY_RULES.map(({ slug, label, icon }) => ({ slug, label, icon })),
  FALLBACK_CATEGORY,
];

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function resolveCategory(rawCategory: string | null | undefined): CategoryInfo {
  const normalized = stripAccents(String(rawCategory ?? "").toLowerCase());
  if (!normalized || normalized === "geral") return FALLBACK_CATEGORY;

  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return { slug: rule.slug, label: rule.label, icon: rule.icon };
    }
  }

  return FALLBACK_CATEGORY;
}
