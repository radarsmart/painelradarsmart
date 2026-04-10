import type { Metadata } from "next";
import { notFound } from "next/navigation";

import LandingPageView from "@/components/landing/LandingPageView";
import { getPublishedLandingBundleBySlug } from "@/lib/landing-pages";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const bundle = await getPublishedLandingBundleBySlug(params.slug);
  if (!bundle) {
    return { title: "Landing page nao encontrada | Radar Smart" };
  }

  return {
    title: `${bundle.landingPage.title} | Radar Smart`,
    description: bundle.subheadline ?? bundle.headline,
    openGraph: {
      title: bundle.headline,
      description: bundle.subheadline ?? bundle.headline,
      images: bundle.heroImageUrl ? [{ url: bundle.heroImageUrl }] : [],
    },
  };
}

export default async function ProductLandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const bundle = await getPublishedLandingBundleBySlug(params.slug);
  if (!bundle) {
    notFound();
  }

  return <LandingPageView bundle={bundle} />;
}
