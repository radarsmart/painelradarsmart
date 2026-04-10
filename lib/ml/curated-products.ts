export type CuratedMlProduct = {
  id: string;
  title: string;
  price: number;
  image: string;
  link: string;
  category_id: string | null;
  sold_quantity: number | null;
};

function withTag(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.searchParams.set("tag", "radarsmart");
    return url.toString();
  } catch {
    return rawUrl;
  }
}

export const CURATED_ML_PRODUCTS: CuratedMlProduct[] = [
  {
    id: "MLB18593981",
    title: "TP-Link Tapo C200 Câmera de Segurança Wi‑Fi 1080P 360° Pan/Tilt",
    price: 199.9,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_984810-MLA95712397240_102025-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/tp-link-tapo-c200-cmera-de-seguranca-wifi-1080p-360-pantilt/p/MLB18593981",
    ),
    category_id: "MLB1051",
    sold_quantity: 9800,
  },
  {
    id: "MLB63656249",
    title: "Bicicleta Spinning Ergométrica 20kg WCT Fitness Preto/Verde",
    price: 2900.9,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_691328-MLA107806158074_032026-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/bicicleta-spinning-ergometrica-roda-inercia-20kg-mbx-fit-amarelo/p/MLB63656249",
    ),
    category_id: "MLB1276",
    sold_quantity: 1200,
  },
  {
    id: "MLB13409957",
    title: "Chaleira Elétrica Atacama 1,8L Prateada 127V Unitermi 1200W",
    price: 1179,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_79118-MLA106601417062_022026-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/chaleira-eletrica-atacama-18l-prateado-127-v-unitermi-1200-w/p/MLB13409957",
    ),
    category_id: "MLB1000",
    sold_quantity: 2400,
  },
  {
    id: "MLB3677840813",
    title: "Monitor Gamer Samsung Odyssey G5 32\" QHD 165Hz 1ms",
    price: 1179,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_870582-MLA80591383811_112024-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/monitor-gamer-samsung-odyssey-g5-32-qhd-165hz-1ms-hdmi-dp-preto/p/MLB3677840813",
    ),
    category_id: "MLB1648",
    sold_quantity: 3100,
  },
  {
    id: "MLB3677840814",
    title: "Relógio Casio Masculino G‑Shock Digital Preto DW‑5600BB‑1DR",
    price: 499.9,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_997563-MLA80591476559_112024-F.webp",
    link: withTag("https://meli.la/1DjwKW5"),
    category_id: "MLB1430",
    sold_quantity: 5200,
  },
  {
    id: "MLB3677840815",
    title: "Caixa de Som Boombox Aiwa Bluetooth Potência Alta",
    price: 349,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_754776-MLA80602456141_112024-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/caixa-de-som-boombox-aiwa-bluetooth-preta/p/MLB3677840815",
    ),
    category_id: "MLB1000",
    sold_quantity: 1800,
  },
  {
    id: "MLB3677840816",
    title: "Smart TV 50\" 4K UHD com HDR e Apps Integrados",
    price: 2299,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_903771-MLA80612433421_112024-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/smart-tv-50-4k-uhd-hdr-preta/p/MLB3677840816",
    ),
    category_id: "MLB1002",
    sold_quantity: 2700,
  },
  {
    id: "MLB3677840817",
    title: "Fritadeira Elétrica Air Fryer 5L Preta Antiaderente",
    price: 289.9,
    image: "https://http2.mlstatic.com/D_NQ_NP_2X_745162-MLA80613592855_112024-F.webp",
    link: withTag(
      "https://www.mercadolivre.com.br/fritadeira-eletrica-air-fryer-5l-preta/p/MLB3677840817",
    ),
    category_id: "MLB1000",
    sold_quantity: 8600,
  },
];
