const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf-8").split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const [key, ...rest] = trimmed.split("=");
  env[key.trim()] = rest.join("=").trim();
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function extractMlItemId(value) {
  const match = String(value ?? "").toUpperCase().match(/MLB-?\d{6,}/);
  return match ? match[0].replace("MLB-", "MLB") : null;
}

async function main() {
  const { data, error } = await supabase
    .from("offers")
    .select("item_id,external_offer_id,product_url,source_url,marketplace")
    .eq("marketplace", "mercadolivre")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const ids = new Set();

  for (const row of data ?? []) {
    const candidates = [
      extractMlItemId(row.item_id),
      extractMlItemId(row.external_offer_id),
      extractMlItemId(row.product_url),
      extractMlItemId(row.source_url),
    ].filter(Boolean);

    for (const id of candidates) {
      ids.add(id);
      if (ids.size >= 20) break;
    }

    if (ids.size >= 20) break;
  }

  const rows = Array.from(ids).map((id) => ({
    id,
    title: "",
    price: 0,
    thumbnail: "",
    permalink: "",
    category_id: null,
    sold_quantity: 0,
    updated_at: new Date(0).toISOString(),
  }));

  if (!rows.length) {
    throw new Error("Nenhum item_id real de Mercado Livre foi encontrado em offers.");
  }

  const { error: upsertError } = await supabase
    .from("ml_products_cache")
    .upsert(rows, { onConflict: "id" });

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  console.log(`Seed concluído com ${rows.length} IDs reais do Mercado Livre.`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
