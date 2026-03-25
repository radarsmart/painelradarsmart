"use client";

import Image from "next/image";

const WHATSAPP_GROUP_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ??
  "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";

const links = [
  { title: "🚀 Ver Ofertas de Hoje", url: "/", highlight: true, external: false },
  {
    title: "⚡ Grupo VIP de Promocoes",
    url: WHATSAPP_GROUP_URL,
    highlight: false,
    external: true,
  },
  { title: "🎁 Cupons de Desconto", url: "/cupons", highlight: false, external: false },
  { title: "🔍 Comparador Inteligente", url: "/comparador", highlight: false, external: false },
];

function LinkButton({
  title,
  url,
  highlight,
  onClick,
}: {
  title: string;
  url: string;
  highlight: boolean;
  onClick: (url: string) => void;
}) {
  const className = `block w-full rounded-2xl py-5 text-center text-base font-black transition-all active:scale-95 shadow-xl ${
    highlight
      ? "bg-orange-500 text-white animate-pulse"
      : "border border-white/20 bg-white/10 text-white backdrop-blur-sm"
  }`;

  return (
    <button
      type="button"
      onClick={() => onClick(url)}
      className={className}
    >
      {title}
    </button>
  );
}

export default function LinksPage() {
  const trackClick = (url: string) => {
    const nextUrl = new URL(url, window.location.origin);
    nextUrl.searchParams.set("utm_source", "radar_bio");
    nextUrl.searchParams.set("utm_medium", "social");
    nextUrl.searchParams.set("utm_campaign", "linktree");
    window.location.assign(nextUrl.toString());
  };

  return (
    <main className="flex min-h-screen flex-col items-center bg-gradient-to-b from-gray-900 to-black p-6">
      <div className="mb-8 mt-12 flex items-center gap-3">
        <Image
          src="/logo.png"
          alt="Radar Smart"
          width={40}
          height={40}
          className="h-10 w-10 rounded-xl object-cover"
          priority
        />
        <h1 className="text-2xl font-black uppercase tracking-tighter text-white">
          Radar <span className="font-medium text-gray-400">Smart</span>
        </h1>
      </div>

      <p className="mb-10 max-w-[250px] text-center text-sm text-gray-400">
        O seu radar de ofertas inteligentes em tempo real. 📡
      </p>

      <div className="w-full max-w-sm space-y-4">
        {links.map((link) => (
          <LinkButton
            key={link.title}
            title={link.title}
            url={link.url}
            highlight={link.highlight}
            onClick={trackClick}
          />
        ))}
      </div>

      <div className="mt-auto pb-10 text-[10px] font-bold uppercase tracking-widest text-gray-600">
        radarsmart.com.br
      </div>
    </main>
  );
}
