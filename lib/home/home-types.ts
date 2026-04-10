import type { OfertaCard } from "@/components/vitrine/CardOferta";

export type HomeCategory = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
};

export type HomeBlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
};

export type HomeHighlight = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
};

export type HomeHeroData = {
  totalOffers: number;
  nextRefreshAt: string;
};

export type HomeHeroSection = {
  badge: string;
  title: string;
  subtitle: string;
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta: {
    label: string;
    href: string;
  };
  featuredOffer: {
    title: string;
    marketplace: string;
    price: number;
    oldPrice?: number;
    discountPct?: number;
  } | null;
};

export type HomeProofItem = {
  id: string;
  label: string;
  value: string;
};

export type HomeOfferShelf = {
  id: string;
  title: string;
  subtitle: string | null;
  ctaHref: string | null;
  offers: OfertaCard[];
};

export type HomeComparatorSpotlight = {
  title: string;
  subtitle: string;
  ctaHref: string;
  offers: OfertaCard[];
};

export type HomeContentSection = {
  title: string;
  subtitle: string;
  posts: HomeBlogPost[];
};

export type HomeCommunityCta = {
  title: string;
  subtitle: string;
  whatsappHref: string;
  telegramHref: string;
};

export type HomeStats = {
  totalOffers: number;
  totalCategories: number;
  totalHighlights: number;
  totalBlogPosts: number;
};

export type HomePageData = {
  categorySlug: string | null;
  categories: HomeCategory[];
  approvedOffers: OfertaCard[];
  hero: HomeHeroData;
  stats: HomeStats;
  highlights: HomeHighlight[];
  recentPosts: HomeBlogPost[];
  sections: {
    hero: HomeHeroSection;
    proofBar: HomeProofItem[];
    flashShelf: HomeOfferShelf;
    bestShelf: HomeOfferShelf;
    comparator: HomeComparatorSpotlight;
    content: HomeContentSection;
    communityCta: HomeCommunityCta;
  };
};
