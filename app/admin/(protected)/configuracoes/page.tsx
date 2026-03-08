import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminConfiguracoesPage() {
  const { data } = await supabaseAdmin
    .from("affiliate_programs")
    .select("*")
    .order("marketplace");

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-navy">
        Configurações de Afiliado
      </h1>
      <div className="overflow-hidden rounded-xl border border-rs-border bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-100">
            <tr>
              <th className="px-4 py-3">Marketplace</th>
              <th className="px-4 py-3">Tracking tag</th>
              <th className="px-4 py-3">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((item: any) => (
              <tr key={item.marketplace} className="border-t border-slate-200">
                <td className="px-4 py-3">{item.marketplace}</td>
                <td className="px-4 py-3">{item.tracking_tag ?? "-"}</td>
                <td className="px-4 py-3">{item.active ? "Sim" : "Não"}</td>
              </tr>
            ))}
            {!data?.length ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-rs-muted">
                  Sem programas cadastrados.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
