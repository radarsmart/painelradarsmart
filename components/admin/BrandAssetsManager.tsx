"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Star, Trash2, UploadCloud } from "lucide-react";

import { supabase } from "@/lib/supabase-browser";
import {
  ALLOWED_MIME_BY_TYPE,
  BRAND_ASSET_TYPES,
  CHARACTER_REFERENCE_TYPES,
  type BrandAsset,
  type BrandAssetType,
  type CharacterReferenceType,
} from "@/lib/brand-assets/types";
import {
  CHARACTER_CAMERA_ANGLES,
  CHARACTER_EXPRESSIONS,
  CHARACTER_POSES,
  CHARACTER_SHOTS,
  type CharacterCameraAngle,
  type CharacterExpression,
  type CharacterPose,
  type CharacterShot,
} from "@/lib/brand-character/character-types";

const NONE_OPTION = "";

const TYPE_LABEL: Record<BrandAssetType, string> = {
  LOGO: "Logo",
  LOGO_TRANSPARENT: "Logo transparente",
  VIDEO_OUTRO: "Video de encerramento",
  CHARACTER_REFERENCE: "Referencia de personagem",
  GRAPHIC_ELEMENT: "Elemento grafico",
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function AssetPreview({ asset }: { asset: BrandAsset }) {
  if (asset.type === "VIDEO_OUTRO") {
    return (
      <video
        src={asset.fileUrl}
        controls
        className="h-32 w-full rounded-lg bg-black object-contain"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={asset.fileUrl}
      alt={asset.name}
      className="h-32 w-full rounded-lg bg-slate-100 object-contain"
    />
  );
}

export default function BrandAssetsManager() {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [type, setType] = useState<BrandAssetType>("LOGO");
  const [name, setName] = useState("");
  const [usage, setUsage] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [referenceType, setReferenceType] = useState<CharacterReferenceType>("PRIMARY");
  const [referenceDescription, setReferenceDescription] = useState("");
  const [referenceIsPrimary, setReferenceIsPrimary] = useState(false);
  const [characterSlug, setCharacterSlug] = useState("garota-radar");
  const [expression, setExpression] = useState<CharacterExpression | typeof NONE_OPTION>(NONE_OPTION);
  const [pose, setPose] = useState<CharacterPose | typeof NONE_OPTION>(NONE_OPTION);
  const [shot, setShot] = useState<CharacterShot | typeof NONE_OPTION>(NONE_OPTION);
  const [cameraAngle, setCameraAngle] = useState<CharacterCameraAngle | typeof NONE_OPTION>(NONE_OPTION);
  const [outfit, setOutfit] = useState("");
  const [environment, setEnvironment] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const acceptForType = useMemo(() => ALLOWED_MIME_BY_TYPE[type].join(","), [type]);

  async function loadAssets() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/brand-assets", { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar Brand Assets.");
      setAssets(json.assets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Brand Assets.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssets();
  }, []);

  async function handleUpload() {
    if (!file || !name.trim()) return;
    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const headers = await getAuthHeaders();

      const urlRes = await fetch("/api/admin/creative-ai/brand-assets/upload-url", {
        method: "POST",
        headers,
        body: JSON.stringify({ type, mimeType: file.type }),
      });
      const urlJson = await urlRes.json();
      if (!urlRes.ok) throw new Error(urlJson.error ?? "Falha ao gerar URL de upload.");

      const { storagePath, token } = urlJson as { storagePath: string; token: string };

      const { error: uploadError } = await supabase.storage
        .from("ugc-assets")
        .uploadToSignedUrl(storagePath, token, file, { contentType: file.type });

      if (uploadError) throw new Error(`Falha no upload direto ao Storage: ${uploadError.message}`);

      const tags = tagsInput
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const metadata =
        type === "CHARACTER_REFERENCE"
          ? {
              referenceType,
              description: referenceDescription.trim(),
              isPrimary: referenceIsPrimary,
              characterSlug: characterSlug.trim() || undefined,
              expression: expression || undefined,
              pose: pose || undefined,
              shot: shot || undefined,
              cameraAngle: cameraAngle || undefined,
              outfit: outfit.trim() || undefined,
              environment: environment.trim() || undefined,
              tags: tags.length ? tags : undefined,
            }
          : {};

      const confirmRes = await fetch("/api/admin/creative-ai/brand-assets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type,
          storagePath,
          name: name.trim(),
          usage: usage.trim() || null,
          metadata,
          isDefault,
        }),
      });
      const confirmJson = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmJson.error ?? "Falha ao registrar Brand Asset.");

      setSuccess(`"${name.trim()}" cadastrado com sucesso.`);
      setName("");
      setUsage("");
      setIsDefault(false);
      setReferenceDescription("");
      setReferenceIsPrimary(false);
      setExpression(NONE_OPTION);
      setPose(NONE_OPTION);
      setShot(NONE_OPTION);
      setCameraAngle(NONE_OPTION);
      setOutfit("");
      setEnvironment("");
      setTagsInput("");
      setFile(null);
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar Brand Asset.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSetDefault(asset: BrandAsset) {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/brand-assets/${asset.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ isDefault: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao definir como padrao.");
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao definir como padrao.");
    }
  }

  async function handleDelete(asset: BrandAsset) {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/brand-assets/${asset.id}`, {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao excluir.");
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir.");
    }
  }

  const grouped = BRAND_ASSET_TYPES.map((t) => ({
    type: t,
    items: assets.filter((asset) => asset.type === t),
  }));

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9E6A18]">
          Radar Creative AI
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1A1A1A] md:text-4xl">
          Brand Assets
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Logo, video de encerramento e referencias da Garota Radar. Upload direto do navegador
          para o Storage via URL assinada - a chave de servico nunca chega ao navegador.
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {success}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-[#1A1A1A]">Novo asset</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tipo
            </label>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as BrandAssetType)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
            >
              {BRAND_ASSET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Nome
            </label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex: Encerramento Oficial Radar Smart"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Finalidade (opcional)
            </label>
            <input
              type="text"
              value={usage}
              onChange={(event) => setUsage(event.target.value)}
              placeholder="Ex: encerramento padrao dos anuncios"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Arquivo
            </label>
            <input
              type="file"
              accept={acceptForType}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-[#1A1A1A]"
            />
          </div>

          {type === "CHARACTER_REFERENCE" ? (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tipo de referencia
                </label>
                <select
                  value={referenceType}
                  onChange={(event) => setReferenceType(event.target.value as CharacterReferenceType)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                >
                  {CHARACTER_REFERENCE_TYPES.map((rt) => (
                    <option key={rt} value={rt}>
                      {rt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Descricao
                </label>
                <input
                  type="text"
                  value={referenceDescription}
                  onChange={(event) => setReferenceDescription(event.target.value)}
                  placeholder="Ex: rosto de frente, luz neutra"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#1A1A1A]">
                <input
                  type="checkbox"
                  checked={referenceIsPrimary}
                  onChange={(event) => setReferenceIsPrimary(event.target.checked)}
                />
                Esta e a referencia PRIMARY
              </label>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Personagem (slug)
                </label>
                <input
                  type="text"
                  value={characterSlug}
                  onChange={(event) => setCharacterSlug(event.target.value)}
                  placeholder="garota-radar"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Expressao (opcional)
                </label>
                <select
                  value={expression}
                  onChange={(event) => setExpression(event.target.value as CharacterExpression | typeof NONE_OPTION)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                >
                  <option value={NONE_OPTION}>Nao definida</option>
                  {CHARACTER_EXPRESSIONS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pose (opcional)
                </label>
                <select
                  value={pose}
                  onChange={(event) => setPose(event.target.value as CharacterPose | typeof NONE_OPTION)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                >
                  <option value={NONE_OPTION}>Nao definida</option>
                  {CHARACTER_POSES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Enquadramento (opcional)
                </label>
                <select
                  value={shot}
                  onChange={(event) => setShot(event.target.value as CharacterShot | typeof NONE_OPTION)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                >
                  <option value={NONE_OPTION}>Nao definido</option>
                  {CHARACTER_SHOTS.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Angulo de camera (opcional)
                </label>
                <select
                  value={cameraAngle}
                  onChange={(event) => setCameraAngle(event.target.value as CharacterCameraAngle | typeof NONE_OPTION)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                >
                  <option value={NONE_OPTION}>Nao definido</option>
                  {CHARACTER_CAMERA_ANGLES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Outfit (opcional, texto livre)
                </label>
                <input
                  type="text"
                  value={outfit}
                  onChange={(event) => setOutfit(event.target.value)}
                  placeholder="Ex: CORPORATE_GREEN"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Environment (opcional, texto livre)
                </label>
                <input
                  type="text"
                  value={environment}
                  onChange={(event) => setEnvironment(event.target.value)}
                  placeholder="Ex: RADAR_OFFICE"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Tags (opcional, separadas por virgula)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="Ex: sorriso, apontando, escritorio"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </div>
            </>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-[#1A1A1A]">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(event) => setIsDefault(event.target.checked)}
            />
            Definir como padrao deste tipo
          </label>
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={!file || !name.trim() || uploading}
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          Enviar
        </button>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Carregando assets...</p>
      ) : (
        grouped.map(({ type: groupType, items }) => (
          <section key={groupType} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h2 className="text-lg font-bold text-[#1A1A1A]">{TYPE_LABEL[groupType]}</h2>
            {items.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">Nenhum asset cadastrado ainda.</p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {items.map((asset) => (
                  <div key={asset.id} className="rounded-xl border border-slate-100 p-3">
                    <AssetPreview asset={asset} />
                    <div className="mt-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1A1A1A]">
                          {asset.name}
                        </p>
                        <p className="text-xs text-slate-500">{asset.usage || "sem finalidade definida"}</p>
                        {asset.type === "CHARACTER_REFERENCE" ? (
                          <>
                            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#9E6A18]">
                              {String((asset.metadata as { referenceType?: string }).referenceType ?? "")}
                              {(asset.metadata as { isPrimary?: boolean }).isPrimary ? " · PRIMARY" : ""}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {["expression", "pose", "shot", "outfit", "environment"].map((field) => {
                                const value = (asset.metadata as Record<string, unknown>)[field];
                                if (!value) return null;
                                return (
                                  <span
                                    key={field}
                                    className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-600"
                                  >
                                    {String(value)}
                                  </span>
                                );
                              })}
                            </div>
                          </>
                        ) : null}
                      </div>
                      {asset.isDefault ? (
                        <span className="flex items-center gap-1 rounded-full bg-[#FFC300]/20 px-2 py-1 text-[10px] font-bold uppercase text-[#9E6A18]">
                          <Star className="h-3 w-3 fill-current" /> Padrao
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      {!asset.isDefault ? (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(asset)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-[#9E6A18] hover:text-[#9E6A18]"
                        >
                          Marcar como padrao
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDelete(asset)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" /> Excluir
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  );
}
