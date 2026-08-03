import type { Metadata } from "next";
import { ArrowUpRight, BadgeCheck, Handshake, Megaphone, Newspaper, Tag } from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { toAbsoluteSiteUrl } from "@/lib/site";

const PAGE_TITLE = "Parcerias";
const PAGE_DESCRIPTION =
  "Sua marca na frente de quem já decidiu comprar. Conheça os formatos de parceria com o Radar Smart.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: toAbsoluteSiteUrl("/parcerias"),
  },
  openGraph: {
    title: `${PAGE_TITLE} | Radar Smart`,
    description: PAGE_DESCRIPTION,
    url: toAbsoluteSiteUrl("/parcerias"),
    type: "website",
  },
};

const SUPPORT_WHATSAPP_NUMBER = (
  process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "5547992890613"
).replace(/\D/g, "");
const PARTNERSHIP_WHATSAPP_URL = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(
  "Olá! Tenho interesse em fazer uma parceria com o Radar Smart.",
)}`;
const PARTNERSHIP_EMAIL_URL = `mailto:contato@radarsmart.com.br?subject=${encodeURIComponent(
  "Parceria com o Radar Smart",
)}`;

const FORMATS = [
  {
    icon: Tag,
    title: "Destaque na vitrine",
    description:
      "Sua oferta aparece com curadoria nos blocos de Ofertas Relâmpago ou Melhores Ofertas do site, com link direto de compra.",
  },
  {
    icon: BadgeCheck,
    title: "Cupom em destaque",
    description:
      "Se a sua marca tem um cupom de desconto ativo, damos destaque especial pra ele nas ofertas divulgadas.",
  },
  {
    icon: Newspaper,
    title: "Conteúdo no blog",
    description:
      "Guias de compra e reviews mencionando seu produto — conteúdo que continua trazendo visita meses depois de publicado.",
  },
  {
    icon: Megaphone,
    title: "Divulgação no grupo",
    description:
      "Anúncio direto para quem já está no grupo VIP de ofertas, esperando a próxima oportunidade de comprar.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Você entra em contato",
    description: "Pelo WhatsApp ou e-mail, conta um pouco sobre a marca e o produto.",
  },
  {
    number: "02",
    title: "Alinhamos o formato",
    description: "Definimos juntos qual tipo de divulgação faz mais sentido pro seu produto.",
  },
  {
    number: "03",
    title: "Publicamos e acompanhamos",
    description: "Colocamos no ar e te damos retorno real sobre o resultado da divulgação.",
  },
];

export default function ParceriasPage() {
  return (
    <>
      <Header />
      <main className="bg-[#F3F6F9]">
        <section className="relative isolate overflow-hidden bg-[#22223B] text-white">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(158,106,24,0.28),transparent_55%)]" />
          <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:py-28">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-100">
              <Handshake className="h-3.5 w-3.5 text-[#D39B32]" />
              Parcerias Radar Smart
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl font-hero text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
              Sua marca na frente de quem já está{" "}
              <span className="text-[#D39B32]">pronto para comprar</span>
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
              Curamos ofertas reais todos os dias para quem quer economizar de verdade.
              Vamos colocar seu produto direto na frente desse público, com a credibilidade
              de uma curadoria de confiança.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={PARTNERSHIP_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#9e6a18] px-7 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_24px_rgba(158,106,24,0.4)] transition hover:brightness-110"
              >
                Falar no WhatsApp <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href={PARTNERSHIP_EMAIL_URL}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Enviar e-mail
              </a>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-2xl font-bold text-navy sm:text-3xl">
              Como funciona hoje
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-500 sm:text-base">
              Todos os dias monitoramos e curamos ofertas reais de Mercado Livre, Shopee,
              AWIN e outros marketplaces, e distribuímos direto para quem já está no site
              e no grupo de WhatsApp — gente que abriu o link pronta para decidir, não só
              navegando à toa.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FORMATS.map((format) => (
              <div
                key={format.title}
                className="rounded-3xl border border-slate-200 bg-white p-6 shadow-card transition hover:-translate-y-1"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#9e6a18]/10">
                  <format.icon className="h-5 w-5 text-[#9e6a18]" />
                </div>
                <h3 className="mt-4 font-display text-lg font-bold text-navy">{format.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  {format.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-display text-2xl font-bold text-navy sm:text-3xl">
                O processo é simples
              </h2>
            </div>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <div key={step.number} className="relative text-center sm:text-left">
                  <span className="font-display text-5xl font-extrabold text-[#9e6a18]/15">
                    {step.number}
                  </span>
                  <h3 className="mt-2 font-display text-lg font-bold text-navy">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    {step.description}
                  </p>
                  {index < STEPS.length - 1 ? (
                    <div className="mx-auto mt-6 hidden h-px w-full bg-slate-200 sm:block" />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 py-16 sm:py-20">
          <div className="rounded-3xl border border-slate-200 bg-[#22223B] p-10 text-center text-white shadow-card sm:p-14">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              Vamos conversar sobre a sua marca?
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-300 sm:text-base">
              Conte um pouco sobre o seu produto e a gente responde com as opções que fazem
              mais sentido pra sua marca.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={PARTNERSHIP_WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#9e6a18] px-7 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-[0_0_24px_rgba(158,106,24,0.4)] transition hover:brightness-110"
              >
                Falar no WhatsApp <ArrowUpRight className="h-4 w-4" />
              </a>
              <a
                href={PARTNERSHIP_EMAIL_URL}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/30 px-7 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                contato@radarsmart.com.br
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
