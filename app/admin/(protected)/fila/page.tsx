import FilaMonitor from "@/components/admin/FilaMonitor";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function AdminFilaPage() {
  const { data } = await supabaseAdmin
    .from("post_queue")
    .select("*")
    .order("scheduled_at", { ascending: true })
    .limit(100);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-bold text-navy">Fila de Postagem</h1>
      <FilaMonitor items={data ?? []} />
    </div>
  );
}
