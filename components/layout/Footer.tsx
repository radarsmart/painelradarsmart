"use client";

import Image from "next/image";
import Link from "next/link";
import { Instagram } from "lucide-react";
import BrandWordmark from "@/components/layout/BrandWordmark";
import { trackSupportContactClick } from "@/lib/analytics/track-event";

const SUPPORT_WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "5547992890613"
).replace(/\D/g, "");
const SUPPORT_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Vim pelo site Radar Smart e tenho uma dúvida.",
)}`;

const INSTAGRAM_URL =
  process.env.NEXT_PUBLIC_INSTAGRAM_URL ?? "https://www.instagram.com/radarsmart.oficial/";
const FACEBOOK_URL =
  process.env.NEXT_PUBLIC_FACEBOOK_URL ??
  "https://www.facebook.com/profile.php?id=61585280878080";
const TIKTOK_URL =
  process.env.NEXT_PUBLIC_TIKTOK_URL ?? "https://www.tiktok.com/@radarsmart.oferta";
// Ainda sem perfil no X — quando tiver, so preencher NEXT_PUBLIC_X_URL.
const X_URL = process.env.NEXT_PUBLIC_X_URL ?? "";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#22223B] pb-28 pt-12 text-white md:pb-12">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-4">
            <Link href="/" className="group inline-flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Logo Radar Smart"
                width={44}
                height={44}
                priority
                className="h-11 w-11 object-contain transition-transform duration-200 group-hover:scale-105"
              />
              <BrandWordmark variant="footer" />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-slate-400">
              Curadoria premium de ofertas para comprar melhor, mais rapido e com
              seguranca.
            </p>
            <a
              href="mailto:contato@radarsmart.com.br"
              className="block text-sm text-slate-400 transition-all hover:text-[#9e6a18]"
            >
              Email: contato@radarsmart.com.br
            </a>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
              Paginas
            </h3>
            <nav className="flex flex-col gap-3 text-sm font-medium text-slate-300">
              <Link href="/ofertas" className="transition-all hover:text-[#9e6a18]">
                Ofertas
              </Link>
              <Link href="/comparativo" className="transition-all hover:text-[#9e6a18]">
                Comparador
              </Link>
              <Link href="/blog" className="transition-all hover:text-[#9e6a18]">
                Guias e Blog
              </Link>
              <Link href="/parcerias" className="transition-all hover:text-[#9e6a18]">
                Parcerias
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">
              Redes Sociais
            </h3>
            <div className="flex flex-wrap gap-3">
              <a
                href={SUPPORT_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackSupportContactClick("footer")}
                className="rounded-full bg-[#25D366] p-2.5 shadow-lg shadow-green-900/20 transition-all hover:scale-110"
                aria-label="WhatsApp"
              >
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.52 3.48A11.89 11.89 0 0 0 12.05 0C5.48 0 .13 5.35.13 11.92c0 2.1.55 4.15 1.6 5.96L0 24l6.3-1.65a11.87 11.87 0 0 0 5.74 1.47h.01c6.57 0 11.92-5.35 11.92-11.92 0-3.18-1.24-6.16-3.45-8.42Zm-8.47 18.3h-.01a9.9 9.9 0 0 1-5.04-1.38l-.36-.22-3.74.98 1-3.64-.24-.37a9.88 9.88 0 0 1-1.52-5.23c0-5.46 4.45-9.9 9.93-9.9 2.65 0 5.13 1.03 7 2.9a9.85 9.85 0 0 1 2.9 7c0 5.48-4.45 9.93-9.92 9.93Zm5.44-7.42c-.3-.15-1.8-.89-2.08-.99-.28-.1-.48-.15-.68.15-.2.3-.78.99-.95 1.2-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.47a8.9 8.9 0 0 1-1.66-2.07c-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.03-.52-.08-.15-.68-1.64-.94-2.25-.24-.58-.49-.5-.68-.5l-.58-.01c-.2 0-.52.08-.8.37-.27.3-1.04 1.02-1.04 2.49 0 1.47 1.06 2.89 1.21 3.09.15.2 2.1 3.2 5.08 4.49.71.3 1.26.48 1.69.61.71.23 1.35.2 1.86.12.57-.08 1.8-.73 2.06-1.43.25-.7.25-1.3.18-1.42-.08-.12-.28-.2-.58-.35Z" />
                </svg>
              </a>

              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[linear-gradient(135deg,#f58529_0%,#feda77_18%,#dd2a7b_50%,#8134af_78%,#515bd4_100%)] p-2.5 shadow-lg shadow-pink-900/20 transition-all hover:scale-110"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden="true" />
              </a>

              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#1877F2] p-2.5 shadow-lg shadow-blue-900/20 transition-all hover:scale-110"
                aria-label="Facebook"
              >
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>

              <a
                href={TIKTOK_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-white/10 bg-black p-2.5 shadow-lg shadow-black/40 transition-all hover:scale-110"
                aria-label="TikTok"
              >
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.03 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-2.15.03-4.3.07-6.45V0l.04.02z" />
                </svg>
              </a>

              {X_URL ? (
                <a
                  href={X_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-white/10 bg-black p-2.5 shadow-lg shadow-black/40 transition-all hover:scale-110"
                  aria-label="X"
                >
                  <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                  </svg>
                </a>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/5 pt-8 text-center text-[10px] uppercase tracking-widest text-slate-500">
          <p>&copy; 2026 Radar Smart - Inteligencia de Ofertas. Itapema/SC.</p>
        </div>
      </div>
    </footer>
  );
}
