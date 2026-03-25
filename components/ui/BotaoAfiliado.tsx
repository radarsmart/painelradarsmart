"use client";

type BotaoAfiliadoProps = {
  offerId: string;
  href: string;
  source?: string;
  label: string;
  className?: string;
};

export default function BotaoAfiliado({
  offerId,
  href,
  source = "site",
  label,
  className,
}: BotaoAfiliadoProps) {
  const safeOfferId = String(offerId ?? "").trim();
  const trackedHref =
    safeOfferId && safeOfferId !== "unknown"
      ? `/go/${safeOfferId}?source=${encodeURIComponent(source)}`
      : href;

  return (
    <a
      href={trackedHref}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className={
        className ??
        "inline-flex items-center justify-center rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-2"
      }
    >
      {label}
    </a>
  );
}
