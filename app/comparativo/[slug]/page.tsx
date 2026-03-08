import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GraficoPreco from "@/components/comparativo/GraficoPreco";
import ScoreMomento from "@/components/comparativo/ScoreMomento";
import TabelaLojas from "@/components/comparativo/TabelaLojas";
import { getHistoricoPreco, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function ComparativoDetalhePage({
  params,
}: {
  params: { slug: string };
}) {
  const offerId = params.slug;

  let offer: any = null;
  let history: any[] = [];

  try {
    const offerRes = await supabaseAdmin
      .from("offers")
      .select("*")
      .eq("id", offerId)
      .maybeSingle();
    offer = offerRes.data;
    history = await getHistoricoPreco(offerId);
  } catch {
    offer = null;
    history = [];
  }

  const chartData =
    history.length > 0
      ? history.map((h) => ({ recorded_at: h.recorded_at, price: Number(h.price) }))
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
          store: h.store,
          marketplace: h.marketplace,
          price: Number(h.price),
          affiliate_url: offer?.affiliate_url,
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
