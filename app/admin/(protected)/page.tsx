import DashboardStats from "@/components/admin/DashboardStats";
import { getDashboardStats, supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  const { data: aprovadasHoje } = await supabaseAdmin
    .from("v_offers_approved_today")
    .select("*")
    .limit(8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Dashboard Admin</h1>
        <p className="text-sm text-rs-muted">
          Visão operacional de cliques, fila e receita por marketplace.
        </p>
      </div>

      <DashboardStats
        totalCliques={stats.totalCliques}
        filaQueued={stats.filaQueued}
        filaFailed={stats.filaFailed}
        totalMembros={stats.totalMembros}
        receita={stats.receita}
      />

      <section className="rounded-xl border border-rs-border bg-white p-4">
        <h2 className="text-lg font-semibold text-navy">Aprovadas hoje</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(aprovadasHoje ?? []).map((item: any) => (
            <li key={item.id} className="rounded-lg border border-slate-200 p-3">
              {item.title}
            </li>
          ))}
          {!aprovadasHoje?.length ? (
            <li className="rounded-lg border border-dashed border-slate-300 p-3 text-rs-muted">
              Sem registros hoje.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
