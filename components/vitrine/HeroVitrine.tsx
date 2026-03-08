import Link from "next/link";
import CountdownTimer from "./CountdownTimer";
import { formatCompactNumber } from "@/lib/formatters";

type HeroVitrineProps = {
  totalOfertas: number;
};

export default function HeroVitrine({ totalOfertas }: HeroVitrineProps) {
  const endAt = new Date(Date.now() + 1000 * 60 * 60 * 5).toISOString();

  return (
    <section className="rounded-2xl border border-rs-border bg-gradient-to-r from-navy to-navy-2 p-8 text-white shadow-card">
      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr]">
        <div>
          <p className="inline-flex rounded-full bg-orange px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            Radar de ofertas ativo
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight">
            Economize com inteligência e velocidade
          </h1>
          <p className="mt-3 max-w-xl text-sm text-slate-300">
            Curadoria AIDA com comparativo de preço, score de compra e alertas
            de oportunidade em tempo real.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/ofertas"
              className="rounded-lg bg-orange px-4 py-2 text-sm font-semibold text-white hover:bg-orange-2"
            >
              Ver ofertas agora
            </Link>
            <Link
              href="/grupo"
              className="rounded-lg border border-rs-border px-4 py-2 text-sm font-semibold hover:bg-white/10"
            >
              Entrar no grupo
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-rs-border bg-black/20 p-5">
          <p className="text-xs uppercase tracking-wide text-slate-300">
            Flash da rodada
          </p>
          <p className="mt-2 text-3xl font-bold text-orange-3">
            {formatCompactNumber(totalOfertas)} ofertas
          </p>
          <p className="mt-2 text-sm text-slate-300">
            Próxima atualização em:
          </p>
          <div className="mt-3">
            <CountdownTimer endAt={endAt} />
          </div>
        </div>
      </div>
    </section>
  );
}
