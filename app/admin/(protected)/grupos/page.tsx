"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  Globe2,
  ListChecks,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";

import { supabase } from "@/lib/supabase-browser";

type TabKey = "monitor" | "protecao" | "campanhas";
type ScanMode = "basic" | "complete" | "international";

type WhatsAppGroup = {
  id: string;
  name: string;
  member_count: number;
  is_admin: boolean;
  is_selected: boolean;
  is_active: boolean;
  invite_url: string | null;
  niche: string | null;
  last_synced_at: string | null;
};

type CampaignTarget = {
  group_id: string;
  member_limit: number;
  joined_count: number;
  whatsapp_groups?: WhatsAppGroup | null;
};

type GroupCampaign = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "paused" | "archived";
  total_clicks: number;
  total_members_joined: number;
  created_at: string;
  group_campaign_targets?: CampaignTarget[];
};

type ProtectionSettings = {
  shield_enabled: boolean;
  ddi_filter_enabled: boolean;
  blocklist: string[];
};

type DashboardPayload = {
  groups: WhatsAppGroup[];
  campaigns: GroupCampaign[];
  settings: ProtectionSettings;
  scan_result?: {
    mode: ScanMode;
    checked_groups: number;
    checked_members: number;
    matches: number;
    international_numbers: number;
    scanned_at: string;
    notes: string[];
  };
  metrics: {
    active_groups: number;
    reached_members: number;
    sent_messages: number;
  };
  imported?: number;
  warnings?: unknown;
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("Sessao expirada. Faca login novamente.");
  return token;
}

async function adminFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Falha na requisicao (${response.status}).`);
  return payload;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function appOrigin() {
  if (typeof window === "undefined") return "";
  return window.location.origin;
}

function StatCard({
  label,
  value,
  tone = "dark",
}: {
  label: string;
  value: string | number;
  tone?: "dark" | "gold" | "green";
}) {
  const toneClass =
    tone === "gold" ? "text-[#9e6a18]" : tone === "green" ? "text-emerald-600" : "text-[#1A1A1A]";
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-black ${toneClass}`}>{value}</p>
    </div>
  );
}

const SCAN_OPTIONS: Array<{
  id: ScanMode;
  title: string;
  description: string;
  label: string;
  icon: typeof Shield;
}> = [
  {
    id: "basic",
    title: "Scan Basico",
    description: "Verifica somente os numeros da sua propria blocklist.",
    label: "Sua blocklist",
    icon: Shield,
  },
  {
    id: "complete",
    title: "Scan Completo",
    description: "Verifica todos os numeros na blocklist, incluindo os de outros usuarios.",
    label: "Blacklist global",
    icon: ListChecks,
  },
  {
    id: "international",
    title: "Scan Internacional",
    description: "Encontra numeros estrangeiros nos grupos que nao comecam com +55.",
    label: "Nao brasileiros",
    icon: Globe2,
  },
];

export default function AdminGroupsPage() {
  const [tab, setTab] = useState<TabKey>("monitor");
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [selectionOpen, setSelectionOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaignLimit, setCampaignLimit] = useState(1024);
  const [campaignGroupIds, setCampaignGroupIds] = useState<string[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>("complete");
  const [scanResult, setScanResult] = useState<DashboardPayload["scan_result"] | null>(null);
  const [editingGroup, setEditingGroup] = useState<WhatsAppGroup | null>(null);
  const [editInviteUrl, setEditInviteUrl] = useState("");
  const [editNiche, setEditNiche] = useState("");
  const [settings, setSettings] = useState<ProtectionSettings>({
    shield_enabled: false,
    ddi_filter_enabled: false,
    blocklist: [],
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await adminFetch<DashboardPayload>("/api/admin/groups");
      setPayload(data);
      setSelectedIds(data.groups.filter((group) => group.is_selected).map((group) => group.id));
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar grupos.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: string, body: Record<string, unknown> = {}) {
    setBusy(action);
    setError("");
    setInfo("");
    try {
      const data = await adminFetch<DashboardPayload>("/api/admin/groups", {
        method: "POST",
        body: JSON.stringify({ action, ...body }),
      });
      setPayload(data);
      setSelectedIds(data.groups.filter((group) => group.is_selected).map((group) => group.id));
      setSettings(data.settings);
      if (data.scan_result) setScanResult(data.scan_result);
      if (action === "sync") setInfo(`${data.imported ?? 0} grupo(s) sincronizado(s).`);
      else if (action === "scan-protection") setInfo("Scan concluido.");
      else setInfo("Atualizado.");
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao processar acao.");
      return null;
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const groups = payload?.groups ?? [];
  const activeGroups = groups.filter((group) => group.is_selected && group.is_active);
  const campaigns = payload?.campaigns ?? [];

  function toggleSelection(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function toggleCampaignGroup(id: string) {
    setCampaignGroupIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function saveSelection() {
    await runAction("select-groups", { group_ids: selectedIds });
    setSelectionOpen(false);
  }

  async function saveSettings() {
    await runAction("save-settings", settings);
  }

  async function startProtectionScan() {
    await runAction("scan-protection", { mode: scanMode });
  }

  async function createCampaign() {
    const data = await runAction("create-campaign", {
      name: campaignName,
      member_limit: campaignLimit,
      group_ids: campaignGroupIds,
    });
    if (data) {
      setCampaignName("");
      setCampaignGroupIds([]);
      setCampaignOpen(false);
    }
  }

  async function saveGroupEdit() {
    if (!editingGroup) return;
    const data = await runAction("update-group", {
      id: editingGroup.id,
      invite_url: editInviteUrl,
      niche: editNiche,
    });
    if (data) setEditingGroup(null);
  }

  return (
    <div className="min-h-screen space-y-7 bg-[#F5F1ED] p-6 md:p-8">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-[#1A1A1A]">
            <Users className="text-[#9e6a18]" />
            Meus Grupos
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitore grupos, proteja a entrada e crie links rotativos para campanhas.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runAction("sync")}
            disabled={Boolean(busy)}
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {busy === "sync" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Escanear grupos
          </button>
          <button
            type="button"
            onClick={() => setSelectionOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FFC300] px-4 text-sm font-black text-black transition hover:brightness-95"
          >
            <Check className="h-4 w-4" />
            Selecionar grupos
          </button>
        </div>
      </div>

      <div className="flex gap-5 border-b border-slate-200">
        {[
          ["monitor", "Monitor"],
          ["protecao", "Protecao"],
          ["campanhas", "Campanhas"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as TabKey)}
            className={`border-b-2 px-0 pb-3 text-sm font-bold transition ${
              tab === key ? "border-[#FFC300] text-[#1A1A1A]" : "border-transparent text-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          {info}
        </div>
      ) : null}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl bg-white text-sm font-semibold text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Carregando grupos...
        </div>
      ) : null}

      {!loading && tab === "monitor" ? (
        <section className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <StatCard label="Grupos ativos" value={payload?.metrics.active_groups ?? 0} />
            <StatCard label="Membros alcancados" value={payload?.metrics.reached_members ?? 0} />
            <StatCard label="Mensagens enviadas" value={payload?.metrics.sent_messages ?? 0} tone="gold" />
          </div>

          {activeGroups.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="font-black text-[#1A1A1A]">Nenhum grupo por aqui ainda</p>
              <p className="mt-2 text-sm text-slate-500">
                Use Escanear grupos e depois Selecionar grupos para escolher quais grupos aparecem aqui.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {activeGroups.map((group) => (
                <article key={group.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-[#1A1A1A]">{group.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{group.id}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${group.is_admin ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                      {group.is_admin ? "Admin" : "Nao confirmado"}
                    </span>
                  </div>
                  <p className="mt-5 text-3xl font-black text-[#1A1A1A]">{group.member_count}</p>
                  <p className="text-xs font-semibold text-slate-500">membros</p>
                  <div className="mt-4 border-t border-slate-100 pt-4 text-sm text-slate-600">
                    <p>Ultima leitura: {formatDateTime(group.last_synced_at)}</p>
                    <p className="mt-1">Convite: {group.invite_url ? "cadastrado" : "pendente"}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingGroup(group);
                      setEditInviteUrl(group.invite_url ?? "");
                      setEditNiche(group.niche ?? "");
                    }}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar convite
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {!loading && tab === "protecao" ? (
        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-black text-[#1A1A1A]">Scan</h2>
              <p className="text-sm text-slate-500">
                Verifique quais membros estao presentes nos grupos cadastrados. Escolha o tipo de scan abaixo.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-3 xl:grid-cols-3">
              {SCAN_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = scanMode === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setScanMode(option.id)}
                    className={`flex min-h-32 flex-col justify-between rounded-2xl border p-4 text-left transition ${
                      selected
                        ? "border-[#1A2B3F] bg-[#EAF4FF] shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span>
                        <span className="block font-black text-[#1A1A1A]">{option.title}</span>
                        <span className="mt-2 block text-sm leading-5 text-slate-500">{option.description}</span>
                      </span>
                      <span
                        className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          selected ? "border-[#1A2B3F]" : "border-slate-300"
                        }`}
                      >
                        {selected ? <span className="h-2 w-2 rounded-full bg-[#1A2B3F]" /> : null}
                      </span>
                    </span>
                    <span className={`mt-4 inline-flex items-center gap-2 text-xs font-bold ${selected ? "text-[#6D4DFF]" : "text-slate-600"}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <button
                type="button"
                onClick={() => void startProtectionScan()}
                disabled={Boolean(busy)}
                className="inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-[#1A2B3F] px-5 text-sm font-black text-white transition hover:bg-[#102033] disabled:opacity-60"
              >
                {busy === "scan-protection" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Iniciar scan
              </button>

              {scanResult ? (
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Grupos</p>
                    <p className="text-lg font-black text-[#1A1A1A]">{scanResult.checked_groups}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Membros</p>
                    <p className="text-lg font-black text-[#1A1A1A]">{scanResult.checked_members}</p>
                  </div>
                  <div className="rounded-xl bg-red-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-300">Blocklist</p>
                    <p className="text-lg font-black text-red-700">{scanResult.matches}</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-4 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">DDI</p>
                    <p className="text-lg font-black text-blue-700">{scanResult.international_numbers}</p>
                  </div>
                </div>
              ) : null}
            </div>

            {scanResult?.notes.length ? (
              <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm font-semibold text-amber-800">
                {scanResult.notes.join(" ")}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="flex items-center gap-3">
                <span className="rounded-xl bg-emerald-50 p-3 text-emerald-600"><Shield className="h-5 w-5" /></span>
                <span>
                  <span className="block font-black text-[#1A1A1A]">Escudo</span>
                  <span className="text-sm text-slate-500">Remove quem entrar com numero na blocklist.</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.shield_enabled}
                onChange={(event) => setSettings((current) => ({ ...current, shield_enabled: event.target.checked }))}
                className="h-5 w-5 accent-[#FFC300]"
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <span className="flex items-center gap-3">
                <span className="rounded-xl bg-blue-50 p-3 text-blue-600"><Eye className="h-5 w-5" /></span>
                <span>
                  <span className="block font-black text-[#1A1A1A]">Filtro de DDI</span>
                  <span className="text-sm text-slate-500">Marca entradas fora do +55 para limpeza.</span>
                </span>
              </span>
              <input
                type="checkbox"
                checked={settings.ddi_filter_enabled}
                onChange={(event) => setSettings((current) => ({ ...current, ddi_filter_enabled: event.target.checked }))}
                className="h-5 w-5 accent-[#FFC300]"
              />
            </label>
          </div>

          <div className="rounded-3xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="rounded-xl bg-red-50 p-3 text-red-600"><Trash2 className="h-5 w-5" /></span>
              <div className="flex-1">
                <p className="font-black text-[#1A1A1A]">Guilhotina</p>
                <p className="mt-1 text-sm text-slate-500">
                  Limpeza em massa fica salva como configuracao, mas a remocao real deve passar por preview e confirmacao.
                </p>
                <textarea
                  value={settings.blocklist.join("\n")}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      blocklist: event.target.value.split("\n").map((line) => line.trim()).filter(Boolean),
                    }))
                  }
                  placeholder="Um numero por linha"
                  className="mt-4 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm outline-none focus:border-[#FFC300] focus:ring-2 focus:ring-[#FFC300]/20"
                />
                <button
                  type="button"
                  onClick={() => void saveSettings()}
                  disabled={Boolean(busy)}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy === "save-settings" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                  Salvar protecao
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && tab === "campanhas" ? (
        <section className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setCampaignGroupIds(activeGroups.map((group) => group.id));
                setCampaignOpen(true);
              }}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#FFC300] px-4 text-sm font-black text-black"
            >
              <Plus className="h-4 w-4" />
              Nova campanha
            </button>
          </div>

          {campaigns.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="font-black text-[#1A1A1A]">Nenhuma campanha ainda</p>
              <p className="mt-2 text-sm text-slate-500">
                Crie uma campanha, escolha os grupos e o limite de membros. O link rotativo cuida do resto.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {campaigns.map((campaign) => {
                const url = `${appOrigin()}/g/${campaign.slug}`;
                return (
                  <article key={campaign.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-[#1A1A1A]">{campaign.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{campaign.group_campaign_targets?.length ?? 0} grupo(s)</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${campaign.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {campaign.status === "active" ? "Ativa" : "Pausada"}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Cliques</p>
                        <p className="font-black text-[#1A1A1A]">{campaign.total_clicks}</p>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3">
                        <p className="text-xs text-slate-500">Entradas estimadas</p>
                        <p className="font-black text-[#1A1A1A]">{campaign.total_members_joined}</p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="break-all font-semibold">{url}</p>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(url)}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Copiar
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Abrir
                      </a>
                      <button
                        type="button"
                        onClick={() =>
                          void runAction("toggle-campaign", {
                            id: campaign.id,
                            status: campaign.status === "active" ? "paused" : "active",
                          })
                        }
                        className="inline-flex h-9 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700"
                      >
                        {campaign.status === "active" ? "Pausar" : "Ativar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {selectionOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="border-b border-slate-100 p-5">
              <p className="font-black text-[#1A1A1A]">Selecionar grupos</p>
              <p className="mt-1 text-sm text-slate-500">Marque os grupos que aparecem em Meus Grupos.</p>
            </div>
            <div className="max-h-[56vh] space-y-2 overflow-y-auto p-5">
              {groups.map((group) => (
                <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-4">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(group.id)}
                    onChange={() => toggleSelection(group.id)}
                    className="h-5 w-5 accent-[#FFC300]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-[#1A1A1A]">{group.name}</span>
                    <span className="text-xs text-slate-500">{group.member_count} membros {group.is_admin ? "- admin confirmado" : "- admin nao confirmado"}</span>
                  </span>
                </label>
              ))}
              {groups.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum grupo sincronizado ainda.</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <button type="button" onClick={() => setSelectionOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="button" onClick={() => void saveSelection()} className="h-10 rounded-xl bg-[#FFC300] px-4 text-sm font-black text-black">Salvar selecao</button>
            </div>
          </div>
        </div>
      ) : null}

      {campaignOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[86vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-xl">
            <div className="border-b border-slate-100 p-5">
              <p className="flex items-center gap-2 font-black text-[#1A1A1A]"><Megaphone className="h-4 w-4" /> Nova campanha</p>
              <p className="mt-1 text-sm text-slate-500">Escolha os grupos e o limite de membros de cada um.</p>
            </div>
            <div className="max-h-[56vh] space-y-4 overflow-y-auto p-5">
              <input
                value={campaignName}
                onChange={(event) => setCampaignName(event.target.value)}
                placeholder="Nome da campanha"
                className="h-11 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#FFC300] focus:ring-2 focus:ring-[#FFC300]/20"
              />
              <input
                type="number"
                value={campaignLimit}
                onChange={(event) => setCampaignLimit(Number(event.target.value))}
                min={1}
                className="h-11 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#FFC300] focus:ring-2 focus:ring-[#FFC300]/20"
              />
              <div className="space-y-2">
                {activeGroups.map((group) => (
                  <label key={group.id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 p-4">
                    <input
                      type="checkbox"
                      checked={campaignGroupIds.includes(group.id)}
                      onChange={() => toggleCampaignGroup(group.id)}
                      className="h-5 w-5 accent-[#FFC300]"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-[#1A1A1A]">{group.name}</span>
                      <span className="text-xs text-slate-500">{group.invite_url ? "convite cadastrado" : "convite pendente"}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <button type="button" onClick={() => setCampaignOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="button" onClick={() => void createCampaign()} className="h-10 rounded-xl bg-[#FFC300] px-4 text-sm font-black text-black">Criar campanha</button>
            </div>
          </div>
        </div>
      ) : null}

      {editingGroup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-xl">
            <div className="border-b border-slate-100 p-5">
              <p className="font-black text-[#1A1A1A]">{editingGroup.name}</p>
              <p className="mt-1 text-sm text-slate-500">Cadastre o convite usado pelo link rotativo.</p>
            </div>
            <div className="space-y-4 p-5">
              <input
                value={editInviteUrl}
                onChange={(event) => setEditInviteUrl(event.target.value)}
                placeholder="https://chat.whatsapp.com/..."
                className="h-11 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#FFC300] focus:ring-2 focus:ring-[#FFC300]/20"
              />
              <input
                value={editNiche}
                onChange={(event) => setEditNiche(event.target.value)}
                placeholder="Nicho do grupo"
                className="h-11 w-full rounded-xl border border-slate-200 px-4 outline-none focus:border-[#FFC300] focus:ring-2 focus:ring-[#FFC300]/20"
              />
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                <AlertCircle className="mr-2 inline h-4 w-4" />
                O WhatsApp nem sempre entrega o link de convite pela API. Quando vier vazio, cole o convite manualmente.
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-100 p-5">
              <button type="button" onClick={() => setEditingGroup(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancelar</button>
              <button type="button" onClick={() => void saveGroupEdit()} className="h-10 rounded-xl bg-[#1A1A1A] px-4 text-sm font-bold text-white">Salvar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
