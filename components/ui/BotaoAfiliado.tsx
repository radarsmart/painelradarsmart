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
  const onClick = async () => {
    try {
      await fetch("/api/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, source }),
        keepalive: true,
      });
    } catch {
      // não bloquear navegação do usuário se rastreamento falhar
    }
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center justify-center rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-2"
      }
    >
      {label}
    </a>
  );
}
