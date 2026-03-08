import Link from "next/link";

export default function BannerGrupo() {
  return (
    <section className="rounded-2xl border border-rs-border bg-gradient-to-r from-teal to-teal-2 p-8 text-white shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-3">
        Comunidade Radar
      </p>
      <h2 className="mt-3 font-display text-3xl font-bold">
        Receba alertas no momento certo
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-teal-100">
        Entre no WhatsApp e Telegram da Radar Smart para receber ofertas
        verificadas, comparativos e sinais de compra em tempo real.
      </p>
      <div className="mt-5">
        <Link
          href="/grupo"
          className="inline-flex items-center rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-2"
        >
          Entrar no grupo agora
        </Link>
      </div>
    </section>
  );
}
