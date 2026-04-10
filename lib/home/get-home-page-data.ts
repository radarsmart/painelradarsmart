import type { OfertaCard } from "@/components/vitrine/CardOferta";
import {
  getBlogPosts,
  getCategorias,
  getDestaques,
  getOfertas,
} from "@/lib/supabase";
import {
  mapBlogPost,
  mapCategory,
  mapHighlight,
  mapOffer,
} from "@/lib/home/home-mappers";
import type { HomePageData } from "@/lib/home/home-types";

const fallbackOffers: OfertaCard[] = [
  {
    id: "demo-1",
    title: "Headset Gamer RGB Wireless",
    marketplace: "Amazon",
    price: 239.9,
    original_price: 399.9,
    discount_pct: 40,
    image_url: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=1200",
    affiliate_url: "https://www.radarsmart.com.br",
  },
  {
    id: "demo-2",
    title: "Smart TV 50 4K HDR",
    marketplace: "Mercado Livre",
    price: 1999,
    original_price: 2499,
    discount_pct: 20,
    image_url: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=1200",
    affiliate_url: "https://www.radarsmart.com.br",
  },
  {
    id: "demo-3",
    title: "Air Fryer 5L Digital",
    marketplace: "Amazon",
    price: 359,
    original_price: 499,
    discount_pct: 28,
    image_url: "https://images.unsplash.com/photo-1585515656800-0cf35f4d2786?w=1200",
    affiliate_url: "https://www.radarsmart.com.br",
  },
];

function getNextRefreshIso(now = new Date()): string {
  const next = new Date(now);
  next.setSeconds(0, 0);

  const minutes = next.getMinutes();
  const remainder = minutes % 20;
  next.setMinutes(minutes + (remainder === 0 ? 20 : 20 - remainder));

  return next.toISOString();
}

function getDiscountLabel(offers: OfertaCard[]): string {
  const valid = offers
    .map((offer) => Number(offer.discount_pct ?? 0))
    .filter((discount) => Number.isFinite(discount) && discount > 0);

  if (!valid.length) return "0%";

  const average = Math.round(valid.reduce((acc, value) => acc + value, 0) / valid.length);
  return `${average}%`;
}

type GetHomePageDataOptions = {
  categorySlug?: string;
  offersLimit?: number;
};

export async function getHomePageData(
  options: GetHomePageDataOptions = {},
): Promise<HomePageData> {
  const categorySlug = options.categorySlug?.trim() || null;
  const offersLimit = options.offersLimit ?? 18;

  const [categoryRows, offerRows, highlightRows, blogRows] = await Promise.all([
    getCategorias(),
    getOfertas(offersLimit, categorySlug ?? undefined),
    getDestaques(6),
    getBlogPosts(4),
  ]);

  const categories = categoryRows.map((row) =>
    mapCategory(row as Record<string, unknown>),
  );
  const approvedOffers = offerRows.length
    ? offerRows.map((row) => mapOffer(row as Record<string, unknown>))
    : fallbackOffers;
  const highlights = highlightRows.map((row) =>
    mapHighlight(row as Record<string, unknown>),
  );
  const recentPosts = blogRows.map((row) =>
    mapBlogPost(row as Record<string, unknown>),
  );
  const featuredOffer = approvedOffers[0] ?? null;
  const flashOffers = approvedOffers
    .filter((offer) => offer.slot_type === "flash")
    .slice(0, 4);
  const bestOffers = approvedOffers
    .filter((offer) => offer.slot_type === "best")
    .slice(0, 8);
  const comparatorOffers = approvedOffers
    .filter((offer) => offer.slot_type === "comparator")
    .slice(0, 3);
  const whatsappHref =
    process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL?.trim() ||
    "/grupo";
  const telegramHref =
    process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() ||
    "/grupo";

  return {
    categorySlug,
    categories,
    approvedOffers,
    hero: {
      totalOffers: approvedOffers.length,
      nextRefreshAt: getNextRefreshIso(),
    },
    stats: {
      totalOffers: approvedOffers.length,
      totalCategories: categories.length,
      totalHighlights: highlights.length,
      totalBlogPosts: recentPosts.length,
    },
    highlights,
    recentPosts,
    sections: {
      hero: {
        badge: "Plataforma de decisão",
        title: "Pare de procurar oferta no escuro.",
        subtitle:
          "A Radar Smart organiza preço, contexto e curadoria para transformar tráfego em clique afiliado e recorrência no grupo.",
        primaryCta: {
          label: "Ver ofertas",
          href: "/ofertas",
        },
        secondaryCta: {
          label: "Entrar no grupo",
          href: "/grupo",
        },
        featuredOffer: featuredOffer
          ? {
              title: featuredOffer.title,
              marketplace: String(featuredOffer.marketplace ?? "Marketplace"),
              price: Number(featuredOffer.price ?? 0),
              oldPrice:
                Number(featuredOffer.old_price ?? featuredOffer.original_price ?? 0) ||
                undefined,
              discountPct: Number(featuredOffer.discount_pct ?? 0) || undefined,
            }
          : null,
      },
      proofBar: [
        {
          id: "offers",
          label: "Ofertas monitoradas",
          value: String(approvedOffers.length),
        },
        {
          id: "categories",
          label: "Categorias ativas",
          value: String(categories.length),
        },
        {
          id: "discount",
          label: "Desconto médio",
          value: getDiscountLabel(approvedOffers),
        },
        {
          id: "content",
          label: "Guias publicados",
          value: String(recentPosts.length),
        },
      ],
      flashShelf: {
        id: "flash",
        title: "Ofertas relâmpago",
        subtitle: "Seleção com mais urgência comercial e desconto percebido.",
        ctaHref: "/ofertas",
        offers: flashOffers,
      },
      bestShelf: {
        id: "best",
        title: "Melhores do dia",
        subtitle: "Base editorial com as ofertas mais fortes para conversão.",
        ctaHref: "/ofertas",
        offers: bestOffers,
      },
      comparator: {
        title: "Comparativos que ajudam a decidir",
        subtitle:
          "A home premium deve puxar produtos com melhor leitura de valor, preço e confiança de compra.",
        ctaHref: "/comparativo",
        offers: comparatorOffers,
      },
      content: {
        title: "Guias e reviews",
        subtitle:
          "Conteúdo editorial para capturar tráfego orgânico e apoiar a decisão antes do clique afiliado.",
        posts: recentPosts,
      },
      communityCta: {
        title: "Entre no grupo para não perder a próxima oportunidade",
        subtitle:
          "Use o site para decidir melhor e o grupo para manter recorrência diária de ofertas.",
        whatsappHref,
        telegramHref,
      },
    },
  };
}
