import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ChevronRight,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";
import { formatBRL } from "@/lib/formatters";
import { formatMonthYearPtBr, toAbsoluteSiteUrl } from "@/lib/site";
import { supabaseAdmin } from "@/lib/supabase";

type PageProps = {
  params: { id: string };
};

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  category: string | null;
  image_url: string | null;
  affiliate_url: string | null;
  product_url: string | null;
  brand: string | null;
  seller_name: string | null;
  price: number | string | null;
  old_price: number | string | null;
  original_price: number | string | null;
  price_old: number | string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  rating: number | string | null;
  review_count: number | string | null;
  reviews_count: number | string | null;
  raw_data: unknown;
  status: string | null;
};

type OfferSummary = {
  id: string;
  title: string;
  imageUrl: string | null;
  affiliateUrl: string;
  price: number;
  oldPrice: number | null;
  discountPct: number;
  marketplace: string;
};

type ProductSpec = {
  label: string;
  value: string;
};

export const revalidate = 120;

function buildSupportWhatsAppUrl(message: string): string {
  const supportNumber = (
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "5547992890613"
  ).replace(/\D/g, "");
  return `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value
      .replace(/\./g, "")
      .replace(",", ".")
      .replace(/[^\d.-]/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseRawData(rawData: unknown): Record<string, unknown> {
  if (!rawData) return {};
  if (typeof rawData === "object") return rawData as Record<string, unknown>;
  if (typeof rawData === "string") {
    try {
      const parsed = JSON.parse(rawData);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }
  return {};
}

function resolveOldPrice(row: OfferRow, currentPrice: number): number | null {
  const oldRaw =
    toNumber(row.old_price) ??
    toNumber(row.original_price) ??
    toNumber(row.price_old);
  if (oldRaw === null || oldRaw <= currentPrice) return null;
  return oldRaw;
}

function resolveDiscount(row: OfferRow, currentPrice: number, oldPrice: number | null): number {
  const direct =
    toNumber(row.discount_percent) ??
    toNumber(row.discount_pct) ??
    null;
  if (direct !== null && direct > 0) return Math.round(direct);
  if (oldPrice && oldPrice > currentPrice) {
    return Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
  }
  return 0;
}

function toSummary(row: OfferRow): OfferSummary | null {
  const price = toNumber(row.price);
  if (price === null || price <= 0) return null;

  const oldPrice = resolveOldPrice(row, price);
  const discountPct = resolveDiscount(row, price, oldPrice);

  return {
    id: row.id,
    title: row.title?.trim() || "Oferta sem título",
    imageUrl: row.image_url,
    affiliateUrl: row.affiliate_url || row.product_url || "#",
    price,
    oldPrice,
    discountPct,
    marketplace: row.marketplace?.trim() || "Marketplace",
  };
}

function buildAiAnalysis(summary: OfferSummary, row: OfferRow): string {
  const rating = toNumber(row.rating);
  const reviews = toNumber(row.review_count) ?? toNumber(row.reviews_count);
  const savings = summary.oldPrice ? summary.oldPrice - summary.price : 0;

  if (summary.discountPct >= 30 && savings > 0) {
    return `Oferta com desconto agressivo (${summary.discountPct}% OFF) e economia real de ${formatBRL(
      savings,
    )}. É um cenário de compra favorável para quem já estava monitorando esse item.`;
  }

  if ((rating ?? 0) >= 4.5 && (reviews ?? 0) >= 100) {
    return `Produto com boa validação de mercado (nota ${rating?.toFixed(
      1,
    )} em ${reviews} avaliações) e preço competitivo no momento.`;
  }

  return "Preço atual competitivo para a categoria, com sinais de oportunidade para compra imediata. Recomendamos validar estoque e condições da loja oficial antes de finalizar.";
}

function addSpec(
  list: ProductSpec[],
  seen: Set<string>,
  label: unknown,
  value: unknown,
) {
  const normalizedLabel = String(label ?? "").trim();
  const normalizedValue = String(value ?? "").trim();
  if (!normalizedLabel || !normalizedValue) return;
  const key = normalizedLabel.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  list.push({ label: normalizedLabel, value: normalizedValue });
}

function extractSpecs(row: OfferRow): ProductSpec[] {
  const specs: ProductSpec[] = [];
  const seen = new Set<string>();

  addSpec(specs, seen, "Marketplace", row.marketplace);
  addSpec(specs, seen, "Marca", row.brand);
  addSpec(specs, seen, "Vendedor", row.seller_name);

  const raw = parseRawData(row.raw_data);
  addSpec(specs, seen, "Modelo", raw.model);
  addSpec(specs, seen, "SKU", raw.sku);
  addSpec(specs, seen, "Condição", raw.condition);
  addSpec(specs, seen, "Garantia", raw.warranty);

  const attributesCandidates: unknown[] = [];
  if (Array.isArray(raw.attributes)) attributesCandidates.push(...raw.attributes);
  if (
    raw.item &&
    typeof raw.item === "object" &&
    Array.isArray((raw.item as Record<string, unknown>).attributes)
  ) {
    attributesCandidates.push(
      ...((raw.item as Record<string, unknown>).attributes as unknown[]),
    );
  }

  attributesCandidates.forEach((attr) => {
    if (!attr || typeof attr !== "object") return;
    const item = attr as Record<string, unknown>;
    const label = item.name || item.id || item.label;
    const firstValue = Array.isArray(item.values) ? item.values[0] : undefined;
    const value =
      item.value_name ||
      item.value ||
      item.value_struct ||
      firstValue ||
      item.text;
    addSpec(specs, seen, label, value);
  });

  const technical = raw.specifications;
  if (Array.isArray(technical)) {
    technical.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      const item = entry as Record<string, unknown>;
      addSpec(specs, seen, item.name || item.title, item.value || item.text);
    });
  }

  return specs.slice(0, 12);
}

async function getOfferById(id: string): Promise<OfferRow | null> {
  const { data, error } = await supabaseAdmin
    .from("offers")
    .select(
      [
        "id",
        "title",
        "marketplace",
        "category",
        "image_url",
        "affiliate_url",
        "product_url",
        "brand",
        "seller_name",
        "price",
        "old_price",
        "original_price",
        "price_old",
        "discount_pct",
        "discount_percent",
        "rating",
        "review_count",
        "reviews_count",
        "raw_data",
        "status",
      ].join(","),
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as OfferRow;
}

async function getRelatedOffers(source: OfferRow): Promise<OfferSummary[]> {
  let query = supabaseAdmin
    .from("offers")
    .select(
      "id,title,image_url,affiliate_url,product_url,price,old_price,original_price,price_old,discount_pct,discount_percent,marketplace,status",
    )
    .eq("status", "active")
    .neq("id", source.id)
    .limit(8);

  if (source.category) {
    query = query.eq("category", source.category);
  } else if (source.marketplace) {
    query = query.eq("marketplace", source.marketplace);
  }

  const { data } = await query;
  const normalized = ((data ?? []) as OfferRow[])
    .map(toSummary)
    .filter((offer): offer is OfferSummary => Boolean(offer));
  return normalized.slice(0, 4);
}

function buildOfferPageUrl(id: string): string {
  return toAbsoluteSiteUrl(`/ofertas/${id}`);
}

function buildStructuredData(summary: OfferSummary, row: OfferRow): Record<string, unknown> {
  const rating = toNumber(row.rating);
  const reviewCount = toNumber(row.review_count) ?? toNumber(row.reviews_count);

  const structuredData: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: summary.title,
    description: buildAiAnalysis(summary, row),
    category: row.category || undefined,
    image: summary.imageUrl ? [summary.imageUrl] : undefined,
    brand: row.brand
      ? {
          "@type": "Brand",
          name: row.brand,
        }
      : undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: summary.price,
      availability:
        row.status === "active"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      url: buildOfferPageUrl(summary.id),
      seller: row.seller_name
        ? {
            "@type": "Organization",
            name: row.seller_name,
          }
        : {
            "@type": "Organization",
            name: summary.marketplace,
          },
    },
    url: buildOfferPageUrl(summary.id),
  };

  if (rating !== null && reviewCount !== null && reviewCount > 0) {
    structuredData.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating,
      reviewCount,
    };
  }

  return structuredData;
}

async function generateMetadataLegacy({ params }: PageProps): Promise<Metadata> {
  const offer = await getOfferById(params.id);
  if (!offer) {
    return {
      title: "Oferta não encontrada - Radar Smart",
      description: "A oferta solicitada não foi encontrada no Radar Smart.",
    };
  }

  const summary = toSummary(offer);
  if (!summary) {
    return {
      title: "Oferta indisponível - Radar Smart",
      description: "Esta oferta está indisponível no momento.",
    };
  }

  const savings = summary.oldPrice ? summary.oldPrice - summary.price : 0;
  const title = `${summary.title} - Melhor Preço no Radar Smart`;
  const description = savings > 0
    ? `Economize ${formatBRL(savings)} nesta oferta. ${summary.discountPct}% OFF com análise inteligente do Radar Smart.`
    : `Confira o melhor preço para ${summary.title} com curadoria Radar Smart.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: summary.imageUrl ? [{ url: summary.imageUrl, alt: summary.title }] : [],
    },
  };
}

function OfferPageSkeleton() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse px-4 py-8">
      <div className="mb-5 h-4 w-72 rounded bg-slate-200" />
      <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-card md:grid-cols-2">
        <div className="h-[420px] rounded-2xl bg-slate-200" />
        <div className="space-y-4">
          <div className="h-6 w-44 rounded bg-slate-200" />
          <div className="h-10 w-full rounded bg-slate-200" />
          <div className="h-24 w-full rounded bg-slate-200" />
          <div className="h-12 w-full rounded bg-slate-200" />
          <div className="h-5 w-56 rounded bg-slate-200" />
        </div>
      </section>
      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="h-56 rounded-2xl bg-slate-200 md:col-span-2" />
        <div className="h-56 rounded-2xl bg-slate-200" />
      </section>
    </main>
  );
}

async function OfferDetailContent({ id }: { id: string }) {
  const offer = await getOfferById(id);
  if (!offer || offer.status !== "active") {
    notFound();
  }

  const summary = toSummary(offer);
  if (!summary) {
    notFound();
  }

  const relatedOffers = await getRelatedOffers(offer);
  const specs = extractSpecs(offer);
  const aiAnalysis = buildAiAnalysis(summary, offer);
  const structuredData = buildStructuredData(summary, offer);
  const savings = summary.oldPrice ? summary.oldPrice - summary.price : 0;
  const whatsappHref = buildSupportWhatsAppUrl(
    `Olá! Tenho uma dúvida sobre esta oferta: ${summary.title}`,
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 pb-32 md:pb-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <nav
        aria-label="Breadcrumb"
        className="mb-5 flex flex-wrap items-center gap-1 text-sm text-slate-500"
      >
        <Link href="/" className="hover:text-[#9e6a18]">
          Home
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/ofertas?marketplace=${encodeURIComponent(summary.marketplace)}`} className="hover:text-[#9e6a18]">
          {summary.marketplace}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="line-clamp-1 text-slate-700">{summary.title}</span>
      </nav>

      <section className="grid gap-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-card md:grid-cols-2 md:p-7">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <Image
            src={summary.imageUrl || "/next.svg"}
            alt={summary.title}
            width={1200}
            height={900}
            className="h-full w-full object-cover transition duration-300 hover:scale-105"
            priority
          />
        </div>

        <div className="flex flex-col">
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Oferta Verificada pelo Radar
          </div>

          <h1 className="font-display text-3xl font-extrabold leading-tight text-[#22223B] md:text-4xl">
            {summary.title}
          </h1>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            {summary.oldPrice ? (
              <p className="text-sm text-slate-500 line-through">
                {formatBRL(summary.oldPrice)}
              </p>
            ) : null}
            <p className="font-mono text-4xl font-extrabold text-[#22223B]">
              {formatBRL(summary.price)}
            </p>
            {savings > 0 ? (
              <p className="mt-1 text-sm font-semibold text-emerald-700">
                Você economiza {formatBRL(savings)} ({summary.discountPct}% OFF)
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-500">
                Preço competitivo monitorado pelo Radar Smart
              </p>
            )}
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <BotaoAfiliado
              offerId={summary.id}
              href={summary.affiliateUrl}
              source="oferta_detalhe_cta"
              label="IR PARA A LOJA OFICIAL"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#9e6a18] px-5 py-3 text-sm font-bold uppercase tracking-wide text-white transition hover:brightness-110 sm:w-auto"
            />

            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-[#9e6a18] hover:text-[#9e6a18] sm:w-auto"
            >
              <MessageCircleQuestion className="h-4 w-4" />
              Dúvida? Chamar no WhatsApp
            </a>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-6 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card md:col-span-2">
          <h2 className="mb-3 inline-flex items-center gap-2 font-display text-2xl font-bold text-[#22223B]">
            <Sparkles className="h-5 w-5 text-[#9e6a18]" />
            Análise da IA
          </h2>
          <p className="text-sm leading-7 text-slate-700">{aiAnalysis}</p>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
          <h2 className="mb-3 font-display text-xl font-bold text-[#22223B]">
            Ficha Técnica
          </h2>
          {specs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <tbody>
                  {specs.map((spec) => (
                    <tr key={spec.label} className="border-t border-slate-100">
                      <th className="w-[42%] py-2 pr-2 font-semibold text-slate-600">
                        {spec.label}
                      </th>
                      <td className="py-2 text-slate-800">{spec.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Especificações detalhadas serão exibidas conforme o scraper enriquecer os dados.
            </p>
          )}
        </article>
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-[#22223B]">
            Produtos Relacionados
          </h2>
          <Link href="/ofertas" className="text-sm font-semibold text-[#9e6a18] hover:underline">
            Ver mais
          </Link>
        </div>

        {relatedOffers.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6 xl:grid-cols-4">
            {relatedOffers.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"
              >
                <Link href={`/ofertas/${item.id}`} className="block">
                  <Image
                    src={item.imageUrl || "/next.svg"}
                    alt={item.title}
                    width={640}
                    height={420}
                    className="h-40 w-full rounded-xl border border-slate-100 object-cover"
                    loading="lazy"
                  />
                </Link>
                <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-[#22223B]">
                  {item.title}
                </h3>
                <p className="mt-2 font-mono text-xl font-bold text-[#22223B]">
                  {formatBRL(item.price)}
                </p>
                {item.oldPrice ? (
                  <p className="text-xs text-slate-400 line-through">
                    {formatBRL(item.oldPrice)}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                    {item.discountPct}% OFF
                  </span>
                  <BotaoAfiliado
                    offerId={item.id}
                    href={item.affiliateUrl}
                    source="relacionados_card"
                    label="Ver oferta"
                    className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-[#9e6a18] px-3 py-1.5 text-xs font-semibold text-[#9e6a18] hover:bg-[#9e6a18] hover:text-white sm:w-auto"
                  />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
            Ainda não há produtos relacionados disponíveis para esta categoria.
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-[#9e6a18]/20 bg-[#22223B] p-6 text-white shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-[#f4d6a0]">
              Oferta monitorada em tempo real
            </p>
            <p className="mt-1 text-lg font-semibold">
              Pronto para aproveitar? Clique e finalize na loja oficial.
            </p>
          </div>
          <BotaoAfiliado
            offerId={summary.id}
            href={summary.affiliateUrl}
            source="oferta_detalhe_footer_cta"
            label="Comprar agora"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#9e6a18] px-5 py-3 text-sm font-bold text-white transition hover:brightness-110 sm:w-auto"
          />
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-16 z-[120] border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-1 text-[11px] font-bold text-slate-800">{summary.title}</p>
            <p className="text-sm font-black text-green-600">{formatBRL(summary.price)}</p>
          </div>
          <BotaoAfiliado
            offerId={summary.id}
            href={summary.affiliateUrl}
            source="oferta_detalhe_sticky_mobile"
            label="PEGAR OFERTA"
            className="inline-flex w-full max-w-[190px] items-center justify-center rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 text-[11px] font-black uppercase tracking-tight text-white shadow-md transition-all active:scale-95"
          />
        </div>
      </div>
    </main>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const fallbackMetadata = await generateMetadataLegacy({ params });
  const offer = await getOfferById(params.id);
  if (!offer) {
    return {
      ...fallbackMetadata,
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  if (offer.status !== "active") {
    return {
      ...fallbackMetadata,
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const summary = toSummary(offer);
  if (!summary) {
    return {
      ...fallbackMetadata,
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const savings = summary.oldPrice ? summary.oldPrice - summary.price : 0;
  const monthYear = formatMonthYearPtBr();
  const canonicalUrl = buildOfferPageUrl(summary.id);
  const title =
    savings > 0
      ? `${summary.title} com DESCONTO no Radar Smart | Melhor Preco ${monthYear}`
      : `${summary.title} no Radar Smart | Melhor Preco ${monthYear}`;
  const description =
    savings > 0
      ? `Economize ${formatBRL(savings)} nesta oferta. ${summary.discountPct}% OFF com curadoria Radar Smart e monitoramento em tempo real.`
      : `Confira o melhor preco para ${summary.title} com curadoria Radar Smart e link blindado para a loja oficial.`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: "website",
      images: summary.imageUrl ? [{ url: summary.imageUrl, alt: summary.title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: summary.imageUrl ? [summary.imageUrl] : [],
    },
  };
}

export default function OfertaDetailPage({ params }: PageProps) {
  return (
    <>
      <Header />
      <Suspense fallback={<OfferPageSkeleton />}>
        <OfferDetailContent id={params.id} />
      </Suspense>
      <Footer />
    </>
  );
}
