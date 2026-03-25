"use client";

import Image from "next/image";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

type HeaderProps = {
  withTickerOffset?: boolean;
};

const navLinks = [
  { href: "/", label: "Inicio" },
  { href: "/ofertas", label: "Ofertas" },
  { href: "/comparativo", label: "Comparador" },
  { href: "/blog", label: "Guias" },
];

const GROUP_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ??
  "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";

export default function Header({ withTickerOffset = false }: HeaderProps) {
  return (
    <header
      className={`sticky ${
        withTickerOffset ? "top-11" : "top-0"
      } z-[55] h-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl`}
    >
      <div className="mx-auto grid h-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4">
        <Link href="/" className="inline-flex items-center gap-3" aria-label="Radar Smart">
          <Image
            src="/logo.png"
            alt="Logo Radar Smart"
            width={160}
            height={40}
            priority
            className="h-10 w-auto"
          />
          <span className="hidden text-base font-black tracking-wide text-[#22223B] sm:inline">
            RADAR SMART
          </span>
        </Link>

        <nav className="hidden items-center justify-center gap-6 text-sm font-semibold text-[#22223B] lg:flex">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="transition-all duration-200 hover:text-[#9e6a18]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <a
          href={GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-2 rounded-full bg-[#9e6a18] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 sm:inline-flex"
        >
          <MessageCircle className="h-4 w-4" />
          Entrar no Grupo
        </a>
      </div>
    </header>
  );
}
