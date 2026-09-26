"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, UploadCloud } from "lucide-react";

import { supabase } from "@/lib/supabase-browser";
import { CHARACTER_REFERENCE_TYPES } from "@/lib/brand-assets/types";
import {
  CHARACTER_CAMERA_ANGLES,
  CHARACTER_EXPRESSIONS,
  CHARACTER_POSES,
  CHARACTER_SHOTS,
} from "@/lib/brand-character/character-types";

const CHARACTER_SLUG = "garota-radar";
const NONE_OPTION = "";

type ScanStatus = "READY" | "DUPLICATE" | "INVALID";

type ScannedAsset = {
  fileName: string;
  relativePath: string;
  folder: string;
  mimeType: string | null;
  size: number;
  sha256: string | null;
  status: ScanStatus;
  invalidReason?: string;
  suggestedMetadata: {
    referenceType?: string;
    expression?: string;
    pose?: string;
    shot?: string;
    cameraAngle?: string;
    outfit?: string;
    environment?: string;
    tags?: string[];
    generationSafe?: boolean;
  };
  name: string;
};

type EditableFields = {
  name: string;
  referenceType: string;
  expression: string;
  pose: string;
  shot: string;
  cameraAngle: string;
  outfit: string;
  environment: string;
  tags: string;
  generationSafe: boolean;
};

type ImportResult = {
  relativePath: string;
  status: "SUCCESS" | "SKIPPED_DUPLICATE" | "FAILED";
  brandAssetId?: string;
  error?: string;
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const STATUS_BADGE: Record<ScanStatus, string> = {
  READY: "bg-emerald-100 text-emerald-700",
  DUPLICATE: "bg-amber-100 text-amber-700",
  INVALID: "bg-red-100 text-red-700",
};

/**
 * A rota de preview exige admin (requireAdmin) - um <img src> comum nao
 * envia o Authorization header, entao buscamos o arquivo autenticado e
 * convertemos pra object URL. Libera o object URL ao desmontar.
 */
function AuthenticatedPreview({ relativePath, alt }: { relativePath: string; alt: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentUrl: string | null = null;

    async function load() {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/admin/creative-ai/brand-character/import/preview?characterSlug=${CHARACTER_SLUG}&relativePath=${encodeURIComponent(relativePath)}`,
          { headers },
        );
        if (!res.ok || !active) return;
        const blob = await res.blob();
        currentUrl = URL.createObjectURL(blob);
        if (active) setObjectUrl(currentUrl);
      } catch {
        // preview falhou - card mostra placeholder, nao trava a tela
      }
    }

    load();
    return () => {
      active = false;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [relativePath]);

  if (!objectUrl) {
    return <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-[10px] text-slate-400">carregando...</div>;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={objectUrl} alt={alt} className="h-28 w-full rounded-lg bg-slate-100 object-cover" />;
}

export default function CharacterPackImporter() {
  const [assets, setAssets] = useState<ScannedAsset[]>([]);
  const [edits, setEdits] = useState<Record<string, EditableFields>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  async function loadScan() {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/brand-character/import/scan?characterSlug=${CHARACTER_SLUG}`, {
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao escanear pasta do Character Pack.");

      const scanned = (json.assets ?? []) as ScannedAsset[];
      setAssets(scanned);

      const nextEdits: Record<string, EditableFields> = {};
      for (const asset of scanned) {
        nextEdits[asset.relativePath] = {
          name: asset.name,
          referenceType: asset.suggestedMetadata.referenceType ?? "OTHER",
          expression: asset.suggestedMetadata.expression ?? NONE_OPTION,
          pose: asset.suggestedMetadata.pose ?? NONE_OPTION,
          shot: asset.suggestedMetadata.shot ?? NONE_OPTION,
          cameraAngle: asset.suggestedMetadata.cameraAngle ?? NONE_OPTION,
          outfit: asset.suggestedMetadata.outfit ?? "",
          environment: asset.suggestedMetadata.environment ?? "",
          tags: (asset.suggestedMetadata.tags ?? []).join(", "),
          generationSafe: asset.suggestedMetadata.generationSafe === true,
        };
      }
      setEdits(nextEdits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao escanear pasta do Character Pack.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadScan();
  }, []);

  const readyCount = useMemo(() => assets.filter((a) => a.status === "READY").length, [assets]);
  const selectedCount = Object.values(selected).filter(Boolean).length;

  function updateEdit(relativePath: string, field: keyof EditableFields, value: string) {
    setEdits((prev) => ({ ...prev, [relativePath]: { ...prev[relativePath], [field]: value } }));
  }

  function toggleGenerationSafe(relativePath: string, value: boolean) {
    setEdits((prev) => ({ ...prev, [relativePath]: { ...prev[relativePath], generationSafe: value } }));
  }

  async function handleImport() {
    const selections = assets
      .filter((asset) => selected[asset.relativePath] && asset.status === "READY")
      .map((asset) => {
        const edit = edits[asset.relativePath];
        return {
          relativePath: asset.relativePath,
          name: edit.name,
          referenceType: edit.referenceType,
          expression: edit.expression || undefined,
          pose: edit.pose || undefined,
          shot: edit.shot || undefined,
          cameraAngle: edit.cameraAngle || undefined,
          outfit: edit.outfit.trim() || undefined,
          environment: edit.environment.trim() || undefined,
          tags: edit.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          generationSafe: edit.generationSafe || undefined,
        };
      });

    if (!selections.length) return;

    setImporting(true);
    setError(null);
    setResults(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/brand-character/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ characterSlug: CHARACTER_SLUG, selections }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao importar Character Pack.");
      setResults(json.results ?? []);
      setSelected({});
      await loadScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao importar Character Pack.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9E6A18]">
          Radar Creative AI
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1A1A1A] md:text-4xl">
          Importar Character Pack
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Escaneia <code>temp-brand-assets/garota-radar/</code> no servidor. Nenhum arquivo e
          enviado automaticamente - selecione e confirme abaixo. Todas as importacoes viram
          referencias de suporte; a PRIMARY atual nunca e alterada por aqui.
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      {results ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-semibold text-[#1A1A1A]">Resultado da importacao</p>
          <div className="mt-2 space-y-1">
            {results.map((result) => (
              <p key={result.relativePath} className="text-xs text-slate-600">
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    result.status === "SUCCESS"
                      ? "bg-emerald-100 text-emerald-700"
                      : result.status === "SKIPPED_DUPLICATE"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {result.status}
                </span>
                {result.relativePath}
                {result.error ? ` — ${result.error}` : ""}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {loading ? "Escaneando..." : `${assets.length} arquivo(s) encontrado(s), ${readyCount} prontos.`}
        </p>
        <button
          type="button"
          onClick={handleImport}
          disabled={!selectedCount || importing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Importar selecionadas ({selectedCount})
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : assets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
          Nenhum arquivo encontrado em <code>temp-brand-assets/garota-radar/</code>.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assets.map((asset) => {
            const edit = edits[asset.relativePath];
            const disabled = asset.status !== "READY";

            return (
              <div key={asset.relativePath} className="rounded-xl border border-slate-100 bg-white p-3">
                <AuthenticatedPreview relativePath={asset.relativePath} alt={asset.fileName} />

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[asset.status]}`}>
                      {asset.status}
                    </span>
                    {edit?.generationSafe ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        GENERATION SAFE
                      </span>
                    ) : null}
                  </div>
                  {!disabled ? (
                    <label className="flex items-center gap-1 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={Boolean(selected[asset.relativePath])}
                        onChange={(event) =>
                          setSelected((prev) => ({ ...prev, [asset.relativePath]: event.target.checked }))
                        }
                      />
                      selecionar
                    </label>
                  ) : null}
                </div>

                <p className="mt-1 truncate text-xs font-semibold text-[#1A1A1A]" title={asset.relativePath}>
                  {asset.relativePath}
                </p>
                <p className="text-[10px] text-slate-400">
                  {formatBytes(asset.size)} · {asset.mimeType ?? "MIME desconhecido"} · sha256:{" "}
                  {asset.sha256 ? asset.sha256.slice(0, 10) : "-"}
                </p>
                {asset.invalidReason ? (
                  <p className="mt-1 text-[10px] text-red-600">{asset.invalidReason}</p>
                ) : null}

                {!disabled && edit ? (
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="text"
                      value={edit.name}
                      onChange={(event) => updateEdit(asset.relativePath, "name", event.target.value)}
                      placeholder="Nome"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    />
                    <select
                      value={edit.referenceType}
                      onChange={(event) => updateEdit(asset.relativePath, "referenceType", event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      {CHARACTER_REFERENCE_TYPES.map((rt) => (
                        <option key={rt} value={rt}>{rt}</option>
                      ))}
                    </select>
                    <select
                      value={edit.expression}
                      onChange={(event) => updateEdit(asset.relativePath, "expression", event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value={NONE_OPTION}>expressao: nenhuma</option>
                      {CHARACTER_EXPRESSIONS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <select
                      value={edit.pose}
                      onChange={(event) => updateEdit(asset.relativePath, "pose", event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value={NONE_OPTION}>pose: nenhuma</option>
                      {CHARACTER_POSES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <select
                      value={edit.shot}
                      onChange={(event) => updateEdit(asset.relativePath, "shot", event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value={NONE_OPTION}>shot: nenhum</option>
                      {CHARACTER_SHOTS.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <select
                      value={edit.cameraAngle}
                      onChange={(event) => updateEdit(asset.relativePath, "cameraAngle", event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    >
                      <option value={NONE_OPTION}>angulo: nenhum</option>
                      {CHARACTER_CAMERA_ANGLES.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={edit.outfit}
                      onChange={(event) => updateEdit(asset.relativePath, "outfit", event.target.value)}
                      placeholder="outfit"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={edit.environment}
                      onChange={(event) => updateEdit(asset.relativePath, "environment", event.target.value)}
                      placeholder="environment"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={edit.tags}
                      onChange={(event) => updateEdit(asset.relativePath, "tags", event.target.value)}
                      placeholder="tags separadas por virgula"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    />
                    <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={edit.generationSafe}
                        onChange={(event) => toggleGenerationSafe(asset.relativePath, event.target.checked)}
                      />
                      generation safe (sem logo/texto/marca - pode ser enviado a provider real)
                    </label>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {results?.some((r) => r.status === "SUCCESS") ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Importacao concluida. Confira as novas referencias em /admin/creative-ai/brand-character.
        </div>
      ) : null}
    </div>
  );
}
