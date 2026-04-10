"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

type TrackedCtaLinkProps = {
  landingPageId: string;
  offerId?: string | null;
  slug: string;
  ctaType: string;
  href: string;
  className: string;
  children: React.ReactNode;
  openInNewTab?: boolean;
  defaultUtmParams?: Record<string, string>;
};

function buildUtmParams(
  params: URLSearchParams,
  defaultUtmParams?: Record<string, string>,
) {
  const entries: Record<string, string> = {};

  Object.entries(defaultUtmParams ?? {}).forEach(([key, value]) => {
    if (key.toLowerCase().startsWith("utm_") && value) {
      entries[key] = value;
    }
  });

  params.forEach((value, key) => {
    if (key.toLowerCase().startsWith("utm_") && value) {
      entries[key] = value;
    }
  });
  return entries;
}

function appendUtmParams(url: string, utmParams: Record<string, string>) {
  if (!url) return "";

  try {
    const targetUrl = new URL(url);

    Object.entries(utmParams).forEach(([key, value]) => {
      if (!key || !value) return;
      if (!key.toLowerCase().startsWith("utm_")) return;
      if (!targetUrl.searchParams.has(key)) {
        targetUrl.searchParams.set(key, value);
      }
    });

    return targetUrl.toString();
  } catch {
    return url;
  }
}

export default function TrackedCtaLink({
  landingPageId,
  offerId,
  slug,
  ctaType,
  href,
  className,
  children,
  openInNewTab = false,
  defaultUtmParams,
}: TrackedCtaLinkProps) {
  const searchParams = useSearchParams();
  const utmParams = useMemo(
    () => buildUtmParams(searchParams, defaultUtmParams),
    [searchParams, defaultUtmParams],
  );
  const finalHref = useMemo(() => appendUtmParams(href, utmParams), [href, utmParams]);

  async function handleClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented) return;

    try {
      void fetch("/api/landing-pages/click", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        keepalive: true,
        body: JSON.stringify({
          landingPageId,
          offerId,
          slug,
          ctaType,
          destinationUrl: finalHref,
          utmParams,
        }),
      });
    } catch {}
  }

  return (
    <a
      href={finalHref}
      onClick={handleClick}
      target={openInNewTab ? "_blank" : undefined}
      rel={openInNewTab ? "noopener noreferrer sponsored" : undefined}
      className={className}
    >
      {children}
    </a>
  );
}
