import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GraficoPreco from "@/components/comparativo/GraficoPreco";
import ScoreMomento from "@/components/comparativo/ScoreMomento";
import TabelaLojas from "@/components/comparativo/TabelaLojas";
import { getHistoricoPreco, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type OfferRow = {
  title: string | null;
  affiliate_url: string | null;
};

type PriceHistoryRow = {
  id: string;
  recorded_at: string;
  price: number | string | null;
  buy_score?: number | string | null;
  store?: string | null;
  marketplace?: string | null;
};

export default async function ComparativoDetalhePage({
  params,
}: {
  params: { slug: string };
}) {
  const offerId = params.slug;

  let offer: OfferRow | null = null;
  let history: PriceHistoryRow[] = [];

  try {
    const offerRes = await supabaseAdmin
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();
    offer = (offerRes.data as OfferRow | null) ?? null;
    history = (await getHistoricoPreco(offerId)) as PriceHistoryRow[];
  } catch {
    offer = null;
    history = [];
  }

  const chartData =
    history.length > 0
      ? history.map((h) => ({ recorded_at: h.recorded_at, price: Number(h.price ?? 0) }))
      : [
          {
            recorded_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
            price: 1299,
          },
          {
            recorded_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            price: 1249,
          },
          { recorded_at: new Date().toISOString(), price: 1199 },
        ];

  const tabelaLojas =
    history.length > 0
      ? history.map((h) => ({
          id: h.id,
          store: h.store ?? undefined,
          marketplace: h.marketplace ?? undefined,
          price: Number(h.price ?? 0),
          affiliate_url: offer?.affiliate_url ?? undefined,
          offer_id: offerId,
        }))
      : [];

  const score = Number(history[history.length - 1]?.buy_score ?? 74);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <h1 className="font-display text-3xl font-bold text-navy">
          {offer?.title ?? "Comparativo de oferta"}
        </h1>
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <div className="rounded-xl border border-rs-border bg-white p-4">
            <GraficoPreco data={chartData} />
          </div>
          <ScoreMomento score={score} />
        </div>
        <TabelaLojas rows={tabelaLojas} />
      </main>
      <Footer />
    </>
  );
}
