"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, MessageCircle, Search, X } from "lucide-react";
import BrandWordmark from "@/components/layout/BrandWordmark";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <header
      className={`sticky ${
        withTickerOffset ? "top-11" : "top-0"
      } z-[55] h-20 border-b border-slate-200/70 bg-white/70 backdrop-blur-xl`}
    >
      <div className="mx-auto grid h-full max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4">
        <Link
          href="/"
          className="group inline-flex items-center gap-3"
          aria-label="Radar Smart"
          onClick={() => setMobileMenuOpen(false)}
        >
          <Image
            src="/logo.png"
            alt="Logo Radar Smart"
            width={44}
            height={44}
            priority
            className="h-11 w-11 object-contain transition-transform duration-200 group-hover:scale-105"
          />
          <BrandWordmark
            variant="header"
            className="text-sm tracking-[0.14em] sm:text-base lg:text-xl"
          />
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

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/buscar"
            aria-label="Buscar"
            className="hidden items-center justify-center rounded-full border border-slate-200 p-2 text-[#22223B] transition hover:border-[#9e6a18] hover:text-[#9e6a18] lg:inline-flex"
          >
            <Search className="h-4 w-4" />
          </Link>

          <a
            href={GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-2 rounded-full bg-[#9e6a18] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110 lg:inline-flex"
          >
            <MessageCircle className="h-4 w-4" />
            Entrar no Grupo
          </a>

          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-slate-200 p-2 text-[#22223B] transition hover:border-[#9e6a18] hover:text-[#9e6a18] lg:hidden"
            aria-label={mobileMenuOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((current) => !current)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="absolute inset-x-0 top-full border-b border-slate-200/80 bg-white/95 px-4 py-4 shadow-lg backdrop-blur-xl lg:hidden">
          <nav className="flex flex-col gap-2">
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-2xl px-4 py-3 text-sm font-semibold text-[#22223B] transition hover:bg-slate-50 hover:text-[#9e6a18]"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <a
            href={GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#9e6a18] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:brightness-110"
            onClick={() => setMobileMenuOpen(false)}
          >
            <MessageCircle className="h-4 w-4" />
            Entrar no Grupo
          </a>
        </div>
      ) : null}
    </header>
  );
}
