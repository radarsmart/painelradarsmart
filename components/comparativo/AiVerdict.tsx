import { Sparkles } from "lucide-react";
import type { CompareOffer } from "./ComparativoClient";

type AiVerdictProps = {
  offerA: CompareOffer | null;
  offerB: CompareOffer | null;
};

function scoreOffer(offer: CompareOffer, maxPrice: number): number {
  const discountScore = Math.max(0, offer.discountPct) * 1.2;
  const ratingScore = Math.max(0, offer.rating ?? 0) * 10;
  const priceScore =
    maxPrice > 0 ? Math.max(0, ((maxPrice - offer.price) / maxPrice) * 100) : 0;
  return discountScore + ratingScore + priceScore;
}

export default function AiVerdict({ offerA, offerB }: AiVerdictProps) {
  if (!offerA || !offerB) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
        <p className="text-sm text-slate-600">
          Selecione dois produtos para gerar o veredito inteligente do Radar.
        </p>
      </section>
    );
  }

  const maxPrice = Math.max(offerA.price, offerB.price, 1);
  const scoreA = scoreOffer(offerA, maxPrice);
  const scoreB = scoreOffer(offerB, maxPrice);
  const winner = scoreA >= scoreB ? offerA : offerB;
  const loser = winner.id === offerA.id ? offerB : offerA;
  const winnerScore = Math.max(scoreA, scoreB);
  const loserScore = Math.max(1, Math.min(scoreA, scoreB));
  const superiority = Math.max(
    1,
    Math.round(((winnerScore - loserScore) / loserScore) * 100),
  );

  return (
    <section className="rounded-2xl border border-[#9e6a18]/30 bg-gradient-to-br from-amber-50 to-white p-5 shadow-card">
      <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#9e6a18]/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9e6a18]">
        <Sparkles className="h-4 w-4" />
        Veredito do Radar
      </div>

      <p className="text-sm leading-7 text-slate-700">
        O Radar Smart recomenda o{" "}
        <strong>{winner.title}</strong> porque ele apresenta um custo-benefício{" "}
        <strong>{superiority}% superior</strong> ao{" "}
        <strong>{loser.title}</strong> no momento.
      </p>
    </section>
  );
}

