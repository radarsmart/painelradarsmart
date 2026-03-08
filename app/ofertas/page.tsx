import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import GridOfertas from "@/components/vitrine/GridOfertas";
import { getOfertas } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function OfertasPage() {
  let offers: any[] = [];
  try {
    offers = await getOfertas(48);
  } catch {
    offers = [];
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="font-display text-3xl font-bold text-navy">Ofertas</h1>
        <p className="mt-2 text-sm text-rs-muted">
          Lista de ofertas aprovadas e ativas no Radar Smart.
        </p>
        <div className="mt-6">
          <GridOfertas offers={offers} />
        </div>
      </main>
      <Footer />
    </>
  );
}
