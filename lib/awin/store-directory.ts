// Merchant IDs conhecidos de lojas na rede AWIN — mesmos valores ja
// estabelecidos em app/admin/(protected)/ofertas/nova/page.tsx
// (AWIN_STORE_ADVERTISER_IDS), centralizados aqui pra tambem servir o
// Garimpar (extensao) sem duplicar a lista em dois lugares divergentes.
export const KNOWN_AWIN_MERCHANTS: Record<string, string> = {
  "aliexpress.com": "18879",
  "cea.com.br": "17648",
  "natura.com.br": "17658",
  "rede.natura.net": "17658",
  "centauro.com.br": "17806",
  "kabum.com.br": "17729",
  "dafiti.com.br": "17697",
};

// AliExpress BR & LATAM — fallback quando a loja nao e reconhecida.
export const DEFAULT_AWIN_MERCHANT_ID = "18879";

export function resolveAwinMerchantId(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    for (const [domain, merchantId] of Object.entries(KNOWN_AWIN_MERCHANTS)) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return merchantId;
      }
    }
  } catch {
    // URL invalida — cai no default abaixo.
  }
  return DEFAULT_AWIN_MERCHANT_ID;
}
