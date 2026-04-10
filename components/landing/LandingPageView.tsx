"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  Instagram,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Timer,
} from "lucide-react";

import BrandWordmark from "@/components/layout/BrandWordmark";
import TrackedCtaLink from "@/components/landing/TrackedCtaLink";
import type { LandingPageBundle } from "@/lib/landing-pages";

function formatBRL(value?: number | null) {
  if (!value) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function LandingActionLink({
  previewMode,
  children,
  href,
  className,
  openInNewTab = false,
  landingPageId,
  offerId,
  slug,
  ctaType,
  defaultUtmParams,
}: {
  previewMode: boolean;
  children: React.ReactNode;
  href: string;
  className: string;
  openInNewTab?: boolean;
  landingPageId: string;
  offerId: string | null;
  slug: string;
  ctaType: string;
  defaultUtmParams: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
  };
}) {
  if (previewMode) {
    return (
      <a
        href={href}
        target={openInNewTab ? "_blank" : undefined}
        rel={openInNewTab ? "noopener noreferrer" : undefined}
        className={className}
      >
        {children}
      </a>
    );
  }

  return (
    <TrackedCtaLink
      landingPageId={landingPageId}
      offerId={offerId}
      slug={slug}
      ctaType={ctaType}
      href={href}
      defaultUtmParams={defaultUtmParams}
      openInNewTab={openInNewTab}
      className={className}
    >
      {children}
    </TrackedCtaLink>
  );
}

export default function LandingPageView({
  bundle,
  previewMode = false,
}: {
  bundle: LandingPageBundle;
  previewMode?: boolean;
}) {
  const {
    landingPage,
    affiliateUrl,
    badgeText,
    benefits,
    currentPrice,
    discount,
    headline,
    heroImageUrl,
    heroVideoUrl,
    marketplace,
    oldPrice,
    productTitle,
    socialProof,
    subheadline,
    technicalDetails,
  } = bundle;

  const groupUrl =
    landingPage.group_url || landingPage.whatsapp_url || landingPage.telegram_url;
  const siteUrl = landingPage.site_url || "https://radarsmart.com.br/ofertas";
  const currentPriceLabel = formatBRL(currentPrice);
  const oldPriceLabel = formatBRL(oldPrice);
  const defaultUtmParams = {
    utm_source: landingPage.utm_source || "",
    utm_medium: landingPage.utm_medium || "",
    utm_campaign: landingPage.utm_campaign || "",
    utm_content: landingPage.utm_content || "",
  };

  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: productTitle,
    description: subheadline ?? headline,
    image: heroImageUrl ? [heroImageUrl] : undefined,
    offers: affiliateUrl
      ? {
          "@type": "Offer",
          priceCurrency: "BRL",
          price: currentPrice ?? undefined,
          availability: "https://schema.org/InStock",
          url: affiliateUrl,
        }
      : undefined,
  };

  return (
    <div className="min-h-screen bg-[#F5F1ED] text-[#1A1A1A]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      {previewMode ? (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-800">
          Preview de rascunho. Esta landing page ainda não está publicada no site.
        </div>
      ) : null}

      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="group inline-flex items-center gap-3">
            <Image
              src="/logo.png"
              alt="Radar Smart"
              width={44}
              height={44}
              className="h-11 w-11 object-contain"
            />
            <BrandWordmark
              variant="header"
              className="text-sm tracking-[0.14em] sm:text-base"
            />
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <LandingActionLink
              previewMode={previewMode}
              landingPageId={landingPage.id}
              offerId={landingPage.offer_id}
              slug={landingPage.slug}
              ctaType="site_header"
              href={siteUrl}
              defaultUtmParams={defaultUtmParams}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#9e6a18] hover:text-[#9e6a18]"
            >
              {landingPage.site_cta_label}
            </LandingActionLink>
            {groupUrl ? (
              <LandingActionLink
                previewMode={previewMode}
                landingPageId={landingPage.id}
                offerId={landingPage.offer_id}
                slug={landingPage.slug}
                ctaType="group_header"
                href={groupUrl}
                defaultUtmParams={defaultUtmParams}
                openInNewTab
                className="rounded-full bg-[#9e6a18] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
              >
                {landingPage.group_cta_label}
              </LandingActionLink>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 pb-14 pt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#9e6a18]/20 bg-[#9e6a18]/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-[#9e6a18]">
              <Timer className="h-4 w-4" />
              {badgeText}
            </span>

            <h1 className="mt-6 text-4xl font-black leading-[1.02] tracking-[-0.04em] text-[#22223B] md:text-5xl lg:text-6xl">
              {headline}
            </h1>

            {subheadline ? (
              <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
                {subheadline}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-slate-500 shadow-sm">
                {marketplace}
              </span>
              {discount ? (
                <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm">
                  {discount}% OFF
                </span>
              ) : null}
            </div>

            <div className="mt-8 rounded-[28px] bg-white p-6 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
                Oferta atual
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {currentPriceLabel ? (
                  <span className="text-4xl font-black leading-none text-[#0f766e] md:text-5xl">
                    {currentPriceLabel}
                  </span>
                ) : null}
                {oldPriceLabel ? (
                  <span className="pb-1 text-lg font-semibold text-slate-400 line-through">
                    {oldPriceLabel}
                  </span>
                ) : null}
              </div>

              {landingPage.price_note ? (
                <p className="mt-3 text-sm font-medium text-slate-500">
                  {landingPage.price_note}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <LandingActionLink
                  previewMode={previewMode}
                  landingPageId={landingPage.id}
                  offerId={landingPage.offer_id}
                  slug={landingPage.slug}
                  ctaType="affiliate_primary"
                  href={affiliateUrl}
                  defaultUtmParams={defaultUtmParams}
                  openInNewTab
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#9e6a18] px-6 py-4 text-center text-sm font-black uppercase tracking-[0.14em] text-white transition hover:brightness-110"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {landingPage.primary_cta_label}
                </LandingActionLink>

                {groupUrl ? (
                  <LandingActionLink
                    previewMode={previewMode}
                    landingPageId={landingPage.id}
                    offerId={landingPage.offer_id}
                    slug={landingPage.slug}
                    ctaType="group_primary"
                    href={groupUrl}
                    defaultUtmParams={defaultUtmParams}
                    openInNewTab
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#22223B]/15 px-6 py-4 text-center text-sm font-black uppercase tracking-[0.14em] text-[#22223B] transition hover:border-[#9e6a18] hover:text-[#9e6a18]"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {landingPage.group_cta_label}
                  </LandingActionLink>
                ) : null}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[32px] bg-[#22223B] p-4 shadow-[0_24px_60px_rgba(34,34,59,0.2)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(211,155,50,0.2),transparent_45%)]" />
            <div className="relative overflow-hidden rounded-[24px] bg-white">
              {heroVideoUrl ? (
                <video
                  src={heroVideoUrl}
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls={false}
                  className="h-full w-full object-cover"
                />
              ) : heroImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroImageUrl}
                  alt={productTitle}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex min-h-[360px] items-center justify-center bg-slate-100 text-sm text-slate-500">
                  Hero da campanha
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 pb-12 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              icon: ShieldCheck,
              title: "Compra com segurança",
              text: "Use o link rastreado e vá direto para o lojista.",
            },
            {
              icon: Timer,
              title: "Oferta com timing",
              text: "Campanha pronta para girar enquanto o preço estiver competitivo.",
            },
            {
              icon: Store,
              title: "Curadoria real",
              text: "O produto foi selecionado manualmente antes de entrar na campanha.",
            },
            {
              icon: Star,
              title: "Funil completo",
              text: "Compra, grupo VIP e retorno para o ecossistema Radar Smart.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-[24px] bg-white p-5 shadow-sm">
              <item.icon className="h-6 w-6 text-[#9e6a18]" />
              <h2 className="mt-4 text-lg font-black text-[#22223B]">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 pb-14 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-[#22223B]">
              Por que esse produto chama atenção
            </h2>
            <div className="mt-6 space-y-4">
              {benefits.length > 0 ? (
                benefits.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-2xl bg-slate-50 px-4 py-4"
                  >
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#0f766e]" />
                    <p className="text-sm leading-6 text-slate-700">{benefit}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  Cadastre benefícios no painel para fortalecer a copy desta landing.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[28px] bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-black text-[#22223B]">
              Detalhes técnicos e quebra de objeção
            </h2>
            <div className="mt-6 space-y-4">
              {technicalDetails.length > 0 ? (
                technicalDetails.map((detail) => (
                  <div key={detail} className="rounded-2xl border border-slate-200 px-4 py-4">
                    <p className="text-sm leading-6 text-slate-700">{detail}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm leading-6 text-slate-500">
                  Adicione detalhes técnicos para responder às principais dúvidas do usuário antes do clique.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-14">
          <div className="rounded-[32px] bg-[#22223B] px-6 py-10 text-white shadow-[0_20px_60px_rgba(34,34,59,0.18)] md:px-10">
            <span className="text-[11px] font-black uppercase tracking-[0.22em] text-[#D39B32]">
              Radar Smart
            </span>
            <h2 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
              Achou essa oferta forte? Entre no grupo e receba as próximas antes de todo mundo.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
              O Radar Smart rastreia oportunidades em marketplaces, seleciona produtos com potencial de clique
              e mantém um fluxo contínuo de ofertas para utilidades, casa, eletrônicos e compras impulsivas.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <LandingActionLink
                previewMode={previewMode}
                landingPageId={landingPage.id}
                offerId={landingPage.offer_id}
                slug={landingPage.slug}
                ctaType="affiliate_section"
                href={affiliateUrl}
                defaultUtmParams={defaultUtmParams}
                openInNewTab
                className="inline-flex items-center gap-2 rounded-full bg-[#D39B32] px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-[#22223B] transition hover:brightness-105"
              >
                <ShoppingBag className="h-4 w-4" />
                Ver oferta no {marketplace}
              </LandingActionLink>

              {groupUrl ? (
                <LandingActionLink
                  previewMode={previewMode}
                  landingPageId={landingPage.id}
                  offerId={landingPage.offer_id}
                  slug={landingPage.slug}
                  ctaType="group_section"
                  href={groupUrl}
                  defaultUtmParams={defaultUtmParams}
                  openInNewTab
                  className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:border-[#D39B32] hover:text-[#D39B32]"
                >
                  <MessageCircle className="h-4 w-4" />
                  {landingPage.group_cta_label}
                </LandingActionLink>
              ) : null}

              <LandingActionLink
                previewMode={previewMode}
                landingPageId={landingPage.id}
                offerId={landingPage.offer_id}
                slug={landingPage.slug}
                ctaType="site_section"
                href={siteUrl}
                defaultUtmParams={defaultUtmParams}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:border-[#D39B32] hover:text-[#D39B32]"
              >
                <Store className="h-4 w-4" />
                {landingPage.site_cta_label}
              </LandingActionLink>
            </div>

            <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-300">
              {landingPage.instagram_url ? (
                <LandingActionLink
                  previewMode={previewMode}
                  landingPageId={landingPage.id}
                  offerId={landingPage.offer_id}
                  slug={landingPage.slug}
                  ctaType="instagram"
                  href={landingPage.instagram_url}
                  defaultUtmParams={defaultUtmParams}
                  openInNewTab
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <Instagram className="h-4 w-4" />
                  Instagram
                </LandingActionLink>
              ) : null}
              {landingPage.telegram_url ? (
                <LandingActionLink
                  previewMode={previewMode}
                  landingPageId={landingPage.id}
                  offerId={landingPage.offer_id}
                  slug={landingPage.slug}
                  ctaType="telegram"
                  href={landingPage.telegram_url}
                  defaultUtmParams={defaultUtmParams}
                  openInNewTab
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <ExternalLink className="h-4 w-4" />
                  Telegram
                </LandingActionLink>
              ) : null}
              {landingPage.whatsapp_url ? (
                <LandingActionLink
                  previewMode={previewMode}
                  landingPageId={landingPage.id}
                  offerId={landingPage.offer_id}
                  slug={landingPage.slug}
                  ctaType="whatsapp"
                  href={landingPage.whatsapp_url}
                  defaultUtmParams={defaultUtmParams}
                  openInNewTab
                  className="inline-flex items-center gap-2 hover:text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </LandingActionLink>
              ) : null}
            </div>
          </div>
        </section>

        {socialProof.length > 0 ? (
          <section className="mx-auto max-w-6xl px-4 pb-16">
            <h2 className="text-2xl font-black text-[#22223B]">Prova social</h2>
            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {socialProof.map((item) => (
                <div key={item} className="rounded-[24px] bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-1 text-[#D39B32]">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Star key={`${item}-${index}`} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-slate-700">{item}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>Radar Smart · Todos os direitos reservados.</p>
          <p>{landingPage.disclaimer || "Oferta válida no momento da publicação."}</p>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-6xl gap-3">
          <LandingActionLink
            previewMode={previewMode}
            landingPageId={landingPage.id}
            offerId={landingPage.offer_id}
            slug={landingPage.slug}
            ctaType="affiliate_sticky_mobile"
            href={affiliateUrl}
            defaultUtmParams={defaultUtmParams}
            openInNewTab
            className="flex-1 rounded-full bg-[#9e6a18] px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-white"
          >
            Comprar
          </LandingActionLink>
          {groupUrl ? (
            <LandingActionLink
              previewMode={previewMode}
              landingPageId={landingPage.id}
              offerId={landingPage.offer_id}
              slug={landingPage.slug}
              ctaType="group_sticky_mobile"
              href={groupUrl}
              defaultUtmParams={defaultUtmParams}
              openInNewTab
              className="flex-1 rounded-full border border-slate-200 px-4 py-3 text-center text-xs font-black uppercase tracking-[0.14em] text-[#22223B]"
            >
              Grupo VIP
            </LandingActionLink>
          ) : null}
        </div>
      </div>
    </div>
  );
}
