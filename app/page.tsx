import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";
import BotaoGrupoFlutuante from "@/components/layout/BotaoGrupoFlutuante";
import BannerGrupo from "@/components/vitrine/BannerGrupo";
import CategoriasScroll from "@/components/vitrine/CategoriasScroll";
import GridOfertas from "@/components/vitrine/GridOfertas";
import HeroVitrine from "@/components/vitrine/HeroVitrine";
import { getCategorias, getOfertas } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const fallbackOffers = [
  {
    id: "demo-1",
    title: "Headset Gamer RGB Wireless",
    marketplace: "Amazon",
    price: 239.9,
    original_price: 399.9,
    discount_pct: 40,
    image_url: "https://images.unsplash.com/photo-1583394838336-acd977736f90?w=1200",
    affiliate_url: "https://www.radarsmart.com.br",
  },
  {
    id: "demo-2",
    title: "Smart TV 50 4K HDR",
    marketplace: "Mercado Livre",
    price: 1999,
    original_price: 2499,
    discount_pct: 20,
    image_url: "https://images.unsplash.com/photo-1593305841991-05c297ba4575?w=1200",
    affiliate_url: "https://www.radarsmart.com.br",
  },
  {
    id: "demo-3",
    title: "Air Fryer 5L Digital",
    marketplace: "Amazon",
    price: 359,
    original_price: 499,
    discount_pct: 28,
    image_url: "https://images.unsplash.com/photo-1585515656800-0cf35f4d2786?w=1200",
    affiliate_url: "https://www.radarsmart.com.br",
  },
];

export default async function Home({
  searchParams,
}: {
  searchParams: { categoria?: string };
}) {
  const categoria = searchParams?.categoria;

  let categorias: any[] = [];
  let ofertas: any[] = [];

  try {
    [categorias, ofertas] = await Promise.all([
      getCategorias(),
      getOfertas(18, categoria),
    ]);
  } catch {
    categorias = [];
    ofertas = [];
  }

  const list = ofertas.length ? ofertas : fallbackOffers;

  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8">
        <HeroVitrine totalOfertas={list.length} />
        <CategoriasScroll categorias={categorias} />
        <section>
          <h2 className="mb-4 font-display text-2xl font-bold text-navy">
            Ofertas aprovadas
          </h2>
          <GridOfertas offers={list} />
        </section>
        <BannerGrupo />
      </main>
      <Footer />
      <BotaoGrupoFlutuante />
    </>
  );
}
