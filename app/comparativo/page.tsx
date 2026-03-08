import Link from "next/link";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { getOfertas } from "@/lib/supabase";
import { formatBRL } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export default async function ComparativoPage() {
  let offers: any[] = [];
  try {
    offers = await getOfertas(20);
  } catch {
    offers = [];
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold text-navy">Comparativo</h1>
        <p className="mt-2 text-sm text-rs-muted">
          Acompanhe o histórico de preço e o melhor momento de compra.
        </p>

        <div className="mt-6 overflow-hidden rounded-xl border border-rs-border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3">Oferta</th>
                <th className="px-4 py-3">Marketplace</th>
                <th className="px-4 py-3">Preço atual</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer) => (
                <tr key={offer.id} className="border-t border-slate-200">
                  <td className="px-4 py-3">{offer.title}</td>
                  <td className="px-4 py-3">{offer.marketplace}</td>
                  <td className="px-4 py-3 font-mono">
                    {formatBRL(Number(offer.price ?? 0))}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/comparativo/${offer.id}`}
                      className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      Ver histórico
                    </Link>
                  </td>
                </tr>
              ))}
              {offers.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-rs-muted" colSpan={4}>
                    Sem dados de comparativo no momento.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
      <Footer />
    </>
  );
}
