import { unstable_noStore as noStore } from "next/cache";

import GarimparQueueList, { type GarimparQueueItem } from "@/components/admin/GarimparQueueList";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function loadPendingItems(): Promise<GarimparQueueItem[]> {
  const { data } = await supabaseAdmin
    .from("offers")
    .select(
      "id,title,marketplace,image_url,price,old_price,product_url,affiliate_url,rating,sales,coupon_code,created_at",
    )
    .eq("source", "extensao")
    .eq("curations_status", "review")
    .order("created_at", { ascending: false })
    .limit(300);

  return (data ?? []) as GarimparQueueItem[];
}

export default async function GarimparPage() {
  noStore();
  const items = await loadPendingItems();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold text-navy">Garimpar</h1>
        <p className="mt-1 text-sm text-rs-muted">
          Produtos capturados pela extensao, aguardando curadoria antes de irem pra fila de disparo.
        </p>
      </div>

      <GarimparQueueList items={items} />
    </div>
  );
}
