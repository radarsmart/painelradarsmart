"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Lock, Loader2, Pencil, Sparkles, Unlock, X } from "lucide-react";

import { supabase } from "@/lib/supabase-browser";
import {
  CHARACTER_CAMERA_ANGLES,
  CHARACTER_EXPRESSIONS,
  CHARACTER_POSES,
  CHARACTER_SHOTS,
} from "@/lib/brand-character/character-types";
import { CHARACTER_REFERENCE_TYPES } from "@/lib/brand-assets/types";

type OfficialPersona = {
  id: string;
  slug: string;
  name: string;
  archetype: string;
  avatar_image_url: string | null;
  is_official_brand_character: boolean;
  identity_locked: boolean;
  character_notes: string | null;
};

type AvailablePersona = {
  id: string;
  slug: string;
  name: string;
  archetype: string;
};

type ReferenceMetadata = {
  referenceType?: string;
  isPrimary?: boolean;
  description?: string;
  expression?: string;
  pose?: string;
  shot?: string;
  cameraAngle?: string;
  outfit?: string;
  environment?: string;
  tags?: string[];
  generationSafe?: boolean;
};

type ReferenceAsset = {
  id: string;
  name: string;
  fileUrl: string;
  metadata: ReferenceMetadata;
};

const NONE_OPTION = "";

type ReferenceGroup = "PRIMARY" | "ANGULOS" | "EXPRESSOES" | "CORPO_INTEIRO" | "POSES" | "OUTRAS";

const GROUP_LABEL: Record<ReferenceGroup, string> = {
  PRIMARY: "PRIMARY",
  ANGULOS: "Angulos",
  EXPRESSOES: "Expressoes",
  CORPO_INTEIRO: "Corpo inteiro",
  POSES: "Poses",
  OUTRAS: "Outras",
};

const GROUP_ORDER: ReferenceGroup[] = ["PRIMARY", "ANGULOS", "EXPRESSOES", "CORPO_INTEIRO", "POSES", "OUTRAS"];

/**
 * Heuristica de agrupamento visual - a metadata nao tem um campo "group"
 * proprio, entao inferimos a partir de referenceType/expression/pose/shot
 * ja existentes. Documentado aqui porque nao existe uma unica fonte de
 * verdade para isso ainda.
 */
function groupForReference(reference: ReferenceAsset): ReferenceGroup {
  const metadata = reference.metadata;
  if (metadata.isPrimary) return "PRIMARY";
  if (["FRONT", "THREE_QUARTER", "PROFILE"].includes(metadata.referenceType ?? "")) return "ANGULOS";
  if (metadata.referenceType === "EXPRESSION" || metadata.expression) return "EXPRESSOES";
  if (["FULL_BODY", "HALF_BODY"].includes(metadata.referenceType ?? "") || metadata.shot) return "CORPO_INTEIRO";
  if (metadata.pose || metadata.referenceType === "OTHER") return "POSES";
  return "OUTRAS";
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export default function BrandCharacterManager() {
  const [official, setOfficial] = useState<OfficialPersona | null>(null);
  const [availablePersonas, setAvailablePersonas] = useState<AvailablePersona[]>([]);
  const [references, setReferences] = useState<ReferenceAsset[]>([]);
  const [primaryReference, setPrimaryReference] = useState<ReferenceAsset | null>(null);
  const [allowedPresets, setAllowedPresets] = useState<string[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ReferenceMetadata>({});
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/brand-character", { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao carregar Garota Radar.");
      setOfficial(json.official ?? null);
      setAvailablePersonas(json.availablePersonas ?? []);
      setReferences(json.references ?? []);
      setPrimaryReference(json.primaryReference ?? null);
      setAllowedPresets(json.allowedPresets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar Garota Radar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSetOfficial() {
    if (!selectedPersonaId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/brand-character", {
        method: "POST",
        headers,
        body: JSON.stringify({ personaId: selectedPersonaId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao definir Garota Radar oficial.");
      setSuccess(`"${json.official?.name}" agora e a Garota Radar oficial.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao definir Garota Radar oficial.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateGarotaRadar() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/brand-character/garota-radar", {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao criar a Garota Radar.");
      setSuccess(
        json.created
          ? "Garota Radar criada e marcada como personagem oficial."
          : "Garota Radar ja existia - status oficial confirmado.",
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar a Garota Radar.");
    } finally {
      setSaving(false);
    }
  }

  function handleStartEdit(reference: ReferenceAsset) {
    setEditingId(reference.id);
    setEditForm({
      referenceType: reference.metadata.referenceType,
      expression: reference.metadata.expression,
      pose: reference.metadata.pose,
      shot: reference.metadata.shot,
      cameraAngle: reference.metadata.cameraAngle,
      outfit: reference.metadata.outfit ?? "",
      environment: reference.metadata.environment ?? "",
      tags: reference.metadata.tags,
      generationSafe: reference.metadata.generationSafe ?? false,
    });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditForm({});
  }

  async function handleSaveEdit(reference: ReferenceAsset) {
    setSavingEdit(true);
    setError(null);
    setSuccess(null);
    try {
      const headers = await getAuthHeaders();
      // isPrimary NUNCA e enviado aqui de proposito - trocar a PRIMARY so
      // acontece marcando outra referencia como isPrimary=true no upload,
      // nao editando esta. O backend tambem bloqueia essa tentativa.
      const metadata: ReferenceMetadata = {
        ...reference.metadata,
        referenceType: editForm.referenceType || reference.metadata.referenceType,
        expression: editForm.expression || undefined,
        pose: editForm.pose || undefined,
        shot: editForm.shot || undefined,
        cameraAngle: editForm.cameraAngle || undefined,
        outfit: editForm.outfit?.trim() || undefined,
        environment: editForm.environment?.trim() || undefined,
        generationSafe: editForm.generationSafe || undefined,
      };

      const res = await fetch(`/api/admin/creative-ai/brand-assets/${reference.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ metadata }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao atualizar referencia.");
      setSuccess(`Metadata de "${reference.name}" atualizada.`);
      setEditingId(null);
      setEditForm({});
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar referencia.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9E6A18]">
          Radar Creative AI
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1A1A1A] md:text-4xl">
          Garota Radar
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          A persona oficial e reconhecivel da Radar Smart. Identidade facial fixa; roupa, cenario,
          pose e expressao podem variar por preset. Somente uma persona pode ser oficial por vez.
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

      {loading ? (
        <p className="text-sm text-slate-500">Carregando...</p>
      ) : (
        <>
          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            {official ? (
              <div className="grid gap-6 md:grid-cols-[200px_1fr]">
                <div className="h-48 w-48 overflow-hidden rounded-xl bg-slate-100">
                  {primaryReference?.fileUrl || official.avatar_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={primaryReference?.fileUrl || official.avatar_image_url || ""}
                      alt={official.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-slate-400">
                      Sem imagem principal
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#FFC300]" />
                    <h2 className="text-xl font-bold text-[#1A1A1A]">{official.name}</h2>
                  </div>
                  <p className="text-sm text-slate-500">Persona oficial: {official.slug}</p>
                  <p className="flex items-center gap-2 text-sm text-[#1A1A1A]">
                    {official.identity_locked ? (
                      <>
                        <Lock className="h-4 w-4 text-emerald-600" /> Identidade bloqueada
                      </>
                    ) : (
                      <>
                        <Unlock className="h-4 w-4 text-amber-500" /> Identidade nao bloqueada
                      </>
                    )}
                  </p>
                  <p className="text-sm text-slate-600">
                    Referencias cadastradas: <strong>{references.length}</strong>
                  </p>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Presets permitidos
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {allowedPresets.map((preset) => (
                        <span
                          key={preset}
                          className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600"
                        >
                          {preset}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Link
                      href="/admin/creative-ai/brand-assets"
                      className="inline-block text-xs font-semibold text-[#9E6A18] underline"
                    >
                      Gerenciar referencias em Brand Assets
                    </Link>
                    <Link
                      href="/admin/creative-ai/brand-character/import"
                      className="inline-block text-xs font-semibold text-[#9E6A18] underline"
                    >
                      Importar Character Pack
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <p className="text-sm text-slate-500">
                  Nenhuma persona esta marcada como Garota Radar ainda.
                </p>

                <div className="rounded-xl border border-[#9E6A18]/30 bg-[#9E6A18]/5 p-4">
                  <p className="text-sm font-semibold text-[#1A1A1A]">
                    Criar a persona oficial &quot;Garota Radar&quot;
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Cria uma persona propria (nao reaproveita nenhuma das personas existentes) ja
                    marcada como personagem oficial e com identidade bloqueada. Operacao idempotente
                    - clicar de novo nao cria duplicata.
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateGarotaRadar}
                    disabled={saving}
                    className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Criar Garota Radar
                  </button>
                </div>

                <details className="text-sm text-slate-500">
                  <summary className="cursor-pointer font-semibold text-slate-600">
                    Ou usar uma persona ja existente (nao recomendado para a marca oficial)
                  </summary>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <select
                      value={selectedPersonaId}
                      onChange={(event) => setSelectedPersonaId(event.target.value)}
                      className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                    >
                      <option value="">Selecione uma persona</option>
                      {availablePersonas.map((persona) => (
                        <option key={persona.id} value={persona.id}>
                          {persona.name} ({persona.archetype})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleSetOfficial}
                      disabled={!selectedPersonaId || saving}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-600 transition hover:border-[#9E6A18] hover:text-[#9E6A18] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Tornar oficial
                    </button>
                  </div>
                </details>
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
            <h2 className="text-lg font-bold text-[#1A1A1A]">Reference Pack</h2>
            {references.length === 0 ? (
              <p className="mt-3 text-sm text-slate-400">
                Nenhuma referencia cadastrada. Envie em Brand Assets com tipo &quot;Referencia de
                personagem&quot;.
              </p>
            ) : (
              GROUP_ORDER.map((group) => {
                const items = references.filter((ref) => groupForReference(ref) === group);
                if (!items.length) return null;

                return (
                  <div key={group} className="mt-5 first:mt-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      {GROUP_LABEL[group]} ({items.length})
                    </p>
                    <div className="mt-2 grid gap-4 md:grid-cols-3 xl:grid-cols-4">
                      {items.map((ref) => (
                        <div key={ref.id} className="rounded-xl border border-slate-100 p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ref.fileUrl}
                            alt={ref.name}
                            className="h-28 w-full rounded-lg bg-slate-100 object-cover"
                          />
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[#9E6A18]">
                            {ref.metadata.referenceType}
                            {ref.metadata.isPrimary ? " · PRIMARY" : ""}
                          </p>
                          {ref.metadata.generationSafe ? (
                            <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
                              GENERATION SAFE
                            </span>
                          ) : null}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(["expression", "pose", "shot", "outfit", "environment"] as const).map((field) => {
                              const value = ref.metadata[field];
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
                          <p className="mt-1 truncate text-xs text-slate-500">{ref.name}</p>

                          {editingId === ref.id ? (
                            <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-2">
                              <select
                                value={editForm.referenceType ?? ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, referenceType: event.target.value }))
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              >
                                {CHARACTER_REFERENCE_TYPES.map((rt) => (
                                  <option key={rt} value={rt}>{rt}</option>
                                ))}
                              </select>
                              <select
                                value={editForm.expression ?? NONE_OPTION}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, expression: event.target.value }))
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              >
                                <option value={NONE_OPTION}>expressao: nenhuma</option>
                                {CHARACTER_EXPRESSIONS.map((item) => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                              <select
                                value={editForm.pose ?? NONE_OPTION}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, pose: event.target.value }))}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              >
                                <option value={NONE_OPTION}>pose: nenhuma</option>
                                {CHARACTER_POSES.map((item) => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                              <select
                                value={editForm.shot ?? NONE_OPTION}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, shot: event.target.value }))}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              >
                                <option value={NONE_OPTION}>shot: nenhum</option>
                                {CHARACTER_SHOTS.map((item) => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                              <select
                                value={editForm.cameraAngle ?? NONE_OPTION}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, cameraAngle: event.target.value }))
                                }
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              >
                                <option value={NONE_OPTION}>angulo: nenhum</option>
                                {CHARACTER_CAMERA_ANGLES.map((item) => (
                                  <option key={item} value={item}>{item}</option>
                                ))}
                              </select>
                              <input
                                type="text"
                                value={editForm.outfit ?? ""}
                                onChange={(event) => setEditForm((prev) => ({ ...prev, outfit: event.target.value }))}
                                placeholder="outfit"
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              />
                              <input
                                type="text"
                                value={editForm.environment ?? ""}
                                onChange={(event) =>
                                  setEditForm((prev) => ({ ...prev, environment: event.target.value }))
                                }
                                placeholder="environment"
                                className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs"
                              />
                              <label className="flex items-center gap-2 text-[10px] text-slate-600">
                                <input
                                  type="checkbox"
                                  checked={editForm.generationSafe ?? false}
                                  onChange={(event) =>
                                    setEditForm((prev) => ({ ...prev, generationSafe: event.target.checked }))
                                  }
                                />
                                generation safe
                              </label>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEdit(ref)}
                                  disabled={savingEdit}
                                  className="flex-1 rounded-lg bg-[#9E6A18] px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                >
                                  Salvar
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEdit}
                                  className="rounded-lg border border-slate-200 p-1 text-slate-500"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEdit(ref)}
                              className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-semibold text-slate-600 hover:border-[#9E6A18] hover:text-[#9E6A18]"
                            >
                              <Pencil className="h-3 w-3" /> Editar metadata
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </section>
        </>
      )}
    </div>
  );
}
