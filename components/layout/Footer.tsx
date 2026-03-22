"use client";

import Image from "next/image";
import Link from "next/link";

const GROUP_URL = "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[#22223B] py-12 text-white">
      <div className="mx-auto max-w-7xl px-4">
        <div className="grid gap-10 md:grid-cols-3">
          {/* LADO ESQUERDO: LOGO + NOME */}
          <div className="space-y-4">
            <Link href="/" className="group inline-flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Logo Radar Smart"
                width={40}
                height={40}
                className="h-10 w-auto brightness-0 invert"
                style={{ filter: "brightness(0) invert(1)" }}
              />
              <span className="text-xl font-black tracking-wider transition-colors group-hover:text-[#9e6a18]">
                RADAR <span className="text-[#9e6a18]">SMART</span>
              </span>
            </Link>
            <p className="max-w-xs text-sm leading-relaxed text-slate-400">
              Curadoria premium de ofertas para comprar melhor, mais rápido e com segurança.
            </p>
          </div>

          {/* CENTRO: PAGINAS */}
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Páginas</h3>
            <nav className="flex flex-col gap-3 text-sm font-medium text-slate-300">
              <Link href="/ofertas" className="hover:text-[#9e6a18]">
                Ofertas
              </Link>
              <Link href="/comparativo" className="hover:text-[#9e6a18]">
                Comparador
              </Link>
              <Link href="/blog" className="hover:text-[#9e6a18]">
                Guias e Blog
              </Link>
            </nav>
          </div>

          {/* DIREITA: REDES SOCIAIS (SVGS INJETADOS DIRETAMENTE) */}
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-widest text-slate-500">Redes</h3>
            <div className="flex flex-wrap gap-3">
              {/* WhatsApp - Link CORRIGIDO para o Grupo */}
              <a
                href={GROUP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-[#25D366] p-2.5 transition-all hover:scale-110 shadow-lg"
              >
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.587-5.771-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.299.045-.677.063-1.092-.069-.252-.08-1.557-.459-2.702-1.454-.915-.795-1.526-1.782-1.704-2.087-.178-.306-.019-.471.132-.622.137-.137.305-.355.458-.533.153-.178.203-.305.305-.508.102-.203.051-.381-.025-.533-.076-.153-.687-1.654-.941-2.264-.247-.595-.5-.514-.687-.523-.178-.009-.381-.01-.585-.01-.203 0-.534.076-.814.381-.28.305-1.067 1.042-1.067 2.542 0 1.5 1.093 2.948 1.246 3.152.153.203 2.152 3.284 5.213 4.608.728.315 1.296.503 1.739.643.73.232 1.393.199 1.918.121.585-.087 1.801-.736 2.056-1.446.253-.71.253-1.319.178-1.446-.077-.127-.28-.203-.585-.356z" />
                </svg>
              </a>

              {/* Instagram */}
              <a href="#" className="rounded-full bg-[#E4405F] p-2.5 transition-all hover:scale-110 shadow-lg">
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 1.17.054 1.805.249 2.227.412.56.216.96.474 1.38.894.42.42.678.82.894 1.38.163.422.358 1.057.412 2.227.058 1.266.07 1.646.07 4.85s-.012 3.584-.07 4.85c-.054 1.17-.249 1.805-.412 2.227-.216.56-.474.96-.894 1.38-.42.42-.82.678-1.38.894-.422.163-1.057.358-2.227.412-1.266.058-1.646.07-4.85.07s-3.584-.012-4.85-.07c-1.17-.054-1.805-.249-2.227-.412-.56-.216-.96-.474-1.38-.894-.42-.42-.678-.82-.894-1.38-.163-.422-.358-1.057-.412-2.227-.058-1.266-.07-1.646-.07-4.85s.012-3.584.07-4.85c.054-1.17.249-1.805.412-2.227.216-.56.474-.96.894-1.38.42-.42.82-.678 1.38-.894.422-.163 1.057-.358 2.227-.412 1.266-.058 1.646-.07 4.85-.07zm0-2.163c-3.259 0-3.667.014-4.947.072-1.277.057-2.148.258-2.911.554-.788.306-1.457.715-2.122 1.38s-1.074 1.334-1.38 2.122c-.296.763-.497 1.634-.554 2.911-.058 1.28-.072 1.688-.072 4.947s.014 3.667.072 4.947c.057 1.277.258 2.148.554 2.911.306.788.715 1.457 1.38 2.122s1.334 1.074 2.122 1.38c.763.296 1.634.497 2.911.554 1.28.058 1.688.072 4.947.072s3.667-.014 4.947-.072c1.277-.057 2.148-.258 2.911-.554.788-.306 1.457-.715 2.122-1.38s1.074-1.334 1.38-2.122c.296-.763.497-1.634.554-2.911.058-1.28.072-1.688.072-4.947s-.014-3.667-.072-4.947c-.057-1.277-.258-2.148-.554-2.911-.306-.788-.715-1.457-1.38-2.122s-1.334-1.074-2.122-1.38c-.763-.296-1.634-.497-2.911-.554-1.28-.058-1.688-.072-4.947-.072z" />
                </svg>
              </a>

              {/* Facebook */}
              <a href="#" className="rounded-full bg-[#1877F2] p-2.5 transition-all hover:scale-110 shadow-lg">
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </a>

              {/* TikTok - Ícone Atualizado */}
              <a href="#" className="rounded-full bg-black p-2.5 transition-all hover:scale-110 border border-white/10 shadow-lg">
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.06-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.03 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-2.15.03-4.3.07-6.45V0l.04.02z" />
                </svg>
              </a>

              {/* X (Twitter) - Ícone Atualizado */}
              <a href="#" className="rounded-full bg-black p-2.5 transition-all hover:scale-110 border border-white/10 shadow-lg">
                <svg className="h-5 w-5 fill-white" viewBox="0 0 24 24">
                  <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-white/5 pt-8 text-center text-[10px] uppercase tracking-widest text-slate-500">
          <p>© 2026 Radar Smart - Inteligência de Ofertas. Itapema/SC.</p>
        </div>
      </div>
    </footer>
  );
}
