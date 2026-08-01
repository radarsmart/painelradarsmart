function formatMoney(value: number): string {
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  );
}

export type CustomTemplateData = {
  productName: string;
  price: number;
  originalPrice: number | null;
  discountPct: number | null;
  store: string;
  link: string;
};

export function renderCustomTemplate(template: string, data: CustomTemplateData): string {
  return template
    .replace(/\{nome_produto\}/gi, data.productName)
    .replace(/\{preco_original\}/gi, data.originalPrice !== null ? formatMoney(data.originalPrice) : "")
    .replace(/\{preco\}/gi, formatMoney(data.price))
    .replace(/\{desconto\}/gi, data.discountPct !== null ? String(Math.round(data.discountPct)) : "")
    .replace(/\{loja\}/gi, data.store)
    .replace(/\{link\}/gi, data.link);
}
