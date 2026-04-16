import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

type MarketplaceTable =
  | "offers"
  | "post_queue"
  | "post_targets"
  | "ai_analysis_logs"
  | "ml_products_cache"
  | "blog_post_offers"
  | "infoproducts"
  | "awin_automation_config"
  | "awin_product_enrichment_cache"
  | "landing_pages"
  | "landing_page_clicks"
  | "ugc_creatives"
  | "ugc_personas"
  | "ugc_projects"
  | "ugc_templates"
  | "ugc_angles"
  | "ugc_project_assets"
  | "tiktok_engine_briefings"
  | "tiktok_engine_jobs"
  | "tiktok_engine_distributions"
  | "tiktok_engine_scheduled_posts"
  | "tiktok_engine_config";

interface TableAudit {
  table: string;
  exists: boolean;
  row_count: number | null;
  anon_readable?: boolean | null;
  error?: string;
}

const EXPECTED_TABLES: MarketplaceTable[] = [
  "offers",
  "post_queue",
  "post_targets",
  "ai_analysis_logs",
  "ml_products_cache",
  "blog_post_offers",
  "infoproducts",
  "awin_automation_config",
  "awin_product_enrichment_cache",
  "landing_pages",
  "landing_page_clicks",
  "ugc_creatives",
  "ugc_personas",
  "ugc_projects",
  "ugc_templates",
  "ugc_angles",
  "ugc_project_assets",
  "tiktok_engine_briefings",
  "tiktok_engine_jobs",
  "tiktok_engine_distributions",
  "tiktok_engine_scheduled_posts",
  "tiktok_engine_config",
];

const REQUIRED_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function ensureEnv(): { url: string; serviceRole: string } {
  for (const envName of REQUIRED_ENV_NAMES) {
    if (!process.env[envName]) {
      throw new Error(`Variável obrigatória ausente: ${envName}`);
    }
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}

function extractTablesFromMigrations(migrationsDir: string): string[] {
  if (!fs.existsSync(migrationsDir)) return [];

  const names = new Set<string>();
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    const regex =
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:"?public"?\.)?"?([a-zA-Z0-9_]+)"?/gi;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(sql))) {
      const tableName = match[2];
      if (tableName) names.add(tableName.toLowerCase());
    }
  }

  return Array.from(names).sort();
}

async function auditTable(
  supabase: SupabaseClient<any, any, any>,
  tableName: string,
): Promise<TableAudit> {
  try {
    const { count, error } = await supabase
      .from(tableName)
      .select("*", { count: "exact", head: true });

    if (error) {
      const message = error.message || "";
      const relationMissing =
        error.code === "42P01" ||
        message.includes("does not exist") ||
        message.includes("relation") ||
        message.includes("schema cache");

      if (relationMissing) {
        return {
          table: tableName,
          exists: false,
          row_count: null,
          error: error.message,
        };
      }

      return {
        table: tableName,
        exists: true,
        row_count: count ?? null,
        error: error.message,
      };
    }

    return {
      table: tableName,
      exists: true,
      row_count: count ?? 0,
    };
  } catch (error: any) {
    return {
      table: tableName,
      exists: false,
      row_count: null,
      error: error?.message || "Erro desconhecido",
    };
  }
}

async function main() {
  const { url, serviceRole } = ensureEnv();
  const supabase = createClient(url, serviceRole);
  const anonClient = createClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
  const migrationsDir = path.join(process.cwd(), "supabase", "migrations");

  const tablesFromMigrations = extractTablesFromMigrations(migrationsDir);
  const candidateTables = Array.from(
    new Set([...EXPECTED_TABLES, ...tablesFromMigrations]),
  ).sort();

  console.log("════════════════════════════════════════════════════════════");
  console.log(" AUDITORIA SUPABASE REMOTO — RADAR SMART");
  console.log(` Data: ${new Date().toISOString()}`);
  console.log(` URL: ${url}`);
  console.log("════════════════════════════════════════════════════════════\n");

  console.log("📦 Tabelas esperadas (prompt):", EXPECTED_TABLES.length);
  console.log("🧩 Tabelas encontradas nas migrations:", tablesFromMigrations.length);
  console.log("🎯 Tabelas auditadas (união):", candidateTables.length, "\n");

  const audits: TableAudit[] = [];
  for (const tableName of candidateTables) {
    const result = await auditTable(supabase, tableName);
    if (result.exists) {
      const { error: anonError } = await anonClient
        .from(tableName)
        .select("*", { count: "exact", head: true });
      result.anon_readable = !anonError;
    } else {
      result.anon_readable = null;
    }
    audits.push(result);
    const status = result.exists ? "✅" : "❌";
    const countLabel = result.exists ? `(${result.row_count ?? 0} registros)` : "";
    const anonLabel =
      result.anon_readable === null
        ? ""
        : result.anon_readable
          ? " | anon:LEITURA_OK"
          : " | anon:bloqueado";
    const errLabel = result.error ? ` | erro: ${result.error}` : "";
    console.log(`${status} ${tableName} ${countLabel}${anonLabel}${errLabel}`);
  }

  const existing = audits.filter((a) => a.exists);
  const missing = audits.filter((a) => !a.exists);

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`Resumo Tabelas: ${existing.length} existem | ${missing.length} faltam`);

  if (missing.length) {
    console.log("Tabelas faltando:");
    for (const table of missing) {
      console.log(`- ${table.table}`);
    }
  }

  const anonReadable = existing.filter((t) => t.anon_readable);
  console.log(
    `\n🔎 Tabelas com leitura anônima permitida: ${anonReadable.length}/${existing.length}`,
  );
  if (anonReadable.length) {
    for (const table of anonReadable) {
      console.log(`- ${table.table}`);
    }
  }

  console.log("\n🗄️ Storage Buckets");
  const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

  if (bucketsError) {
    console.log(`❌ Erro ao listar buckets: ${bucketsError.message}`);
  } else {
    const foundBuckets = buckets ?? [];
    console.log(`Total: ${foundBuckets.length}`);
    for (const bucket of foundBuckets) {
      console.log(`- ${bucket.name} (${bucket.public ? "public" : "private"})`);
    }
    const mustHave = ["tiktok-engine-assets"];
    for (const bucketName of mustHave) {
      const exists = foundBuckets.some((b) => b.name === bucketName);
      console.log(`${exists ? "✅" : "❌"} bucket obrigatório: ${bucketName}`);
      if (!exists) {
        const { error } = await supabase.storage.createBucket(bucketName, {
          public: true,
        });
        if (error) {
          console.log(`⚠️ Não foi possível criar bucket '${bucketName}': ${error.message}`);
        } else {
          console.log(`✅ Bucket '${bucketName}' criado automaticamente.`);
        }
      }
    }
  }

  console.log("\n🔐 SQL para validar RLS/policies (rodar no SQL Editor ou via db execute):");
  console.log(`
-- Query A: RLS por tabela
SELECT tablename, rowsecurity AS rls_ativo
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Query B: Policies
SELECT tablename, policyname, cmd AS operacao, permissive
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Query C: Registros aproximados
SELECT relname AS tabela, n_live_tup AS registros_aprox
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_live_tup DESC;

-- Query D: Storage policies
SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY policyname;
`);

  console.log("────────────────────────────────────────────────────────────");
}

main().catch((error) => {
  console.error("Falha na auditoria:", error?.message || error);
  process.exit(1);
});
