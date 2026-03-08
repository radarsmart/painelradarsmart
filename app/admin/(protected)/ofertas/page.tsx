import TabelaOfertas from "@/components/admin/TabelaOfertas";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminOfertasPage() {
  const { data } = await supabaseAdmin
    .from("offers")
    .select("id,title,marketplace,price,status")
    .order("created_at", { ascending: false })
    .limit(80);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-navy">Gestão de Ofertas</h1>
      <TabelaOfertas initialOffers={data ?? []} />
    </div>
  );
}
