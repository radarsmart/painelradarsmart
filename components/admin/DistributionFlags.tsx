"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { supabase } from "@/lib/supabase";

type DistributionFlags = {
  distribution_enabled: boolean;
  auto_distribute_on_complete: boolean;
  channels: {
    whatsapp: { enabled: boolean; groups: string[] };
    telegram: { enabled: boolean; chats: string[] };
    instagram: { enabled: boolean; post_as_reel: boolean };
  };
  scheduling: {
    delay_between_posts_minutes: number;
    max_posts_per_day: number;
    best_hours: number[];
    timezone: string;
  };
};

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return token;
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
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
  const json = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(json.error || `Falha na API (${response.status}).`);
  }
  return json;
}

function parseMultilineIds(value: string): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export default function DistributionFlagsPanel() {
  const [flags, setFlags] = useState<DistributionFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [whatsAppGroupsText, setWhatsAppGroupsText] = useState("");
  const [telegramChatsText, setTelegramChatsText] = useState("");

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await apiFetch<{ success: boolean; flags: DistributionFlags }>(
          "/api/admin/distribution/flags",
        );
        if (!mounted) return;
        setFlags(data.flags);
        setWhatsAppGroupsText((data.flags.channels.whatsapp.groups ?? []).join("\n"));
        setTelegramChatsText((data.flags.channels.telegram.chats ?? []).join("\n"));
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar flags.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const disabled = useMemo(() => loading || saving || !flags, [loading, saving, flags]);

  async function savePartial(updates: Partial<DistributionFlags>) {
    if (!flags) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const data = await apiFetch<{ success: boolean; flags: DistributionFlags }>(
        "/api/admin/distribution/flags",
        {
          method: "PATCH",
          body: JSON.stringify(updates),
        },
      );
      setFlags(data.flags);
      setWhatsAppGroupsText((data.flags.channels.whatsapp.groups ?? []).join("\n"));
      setTelegramChatsText((data.flags.channels.telegram.chats ?? []).join("\n"));
      setMessage("Configuracoes salvas.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar flags.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando feature flags de distribuicao...
        </div>
      </section>
    );
  }

  if (!flags) {
    return (
      <section className="rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || "Nao foi possivel carregar as feature flags."}
      </section>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-black text-[#1A1A1A]">Feature Flags de Distribuicao</h2>
        {saving ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Salvando
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">Distribuicao ativa</span>
          <input
            type="checkbox"
            checked={flags.distribution_enabled}
            disabled={disabled}
            onChange={(event) =>
              void savePartial({ distribution_enabled: event.target.checked })
            }
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">
            Auto-distribuir ao concluir video
          </span>
          <input
            type="checkbox"
            checked={flags.auto_distribute_on_complete}
            disabled={disabled}
            onChange={(event) =>
              void savePartial({
                auto_distribute_on_complete: event.target.checked,
              })
            }
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">WhatsApp</span>
          <input
            type="checkbox"
            checked={flags.channels.whatsapp.enabled}
            disabled={disabled}
            onChange={(event) =>
              void savePartial({
                channels: { whatsapp: { enabled: event.target.checked } },
              } as Partial<DistributionFlags>)
            }
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">Telegram</span>
          <input
            type="checkbox"
            checked={flags.channels.telegram.enabled}
            disabled={disabled}
            onChange={(event) =>
              void savePartial({
                channels: { telegram: { enabled: event.target.checked } },
              } as Partial<DistributionFlags>)
            }
          />
        </label>
        <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-700">Instagram</span>
          <input
            type="checkbox"
            checked={flags.channels.instagram.enabled}
            disabled={disabled}
            onChange={(event) =>
              void savePartial({
                channels: { instagram: { enabled: event.target.checked } },
              } as Partial<DistributionFlags>)
            }
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700">Grupos WhatsApp (1 por linha)</p>
          <textarea
            className="mt-2 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={whatsAppGroupsText}
            onChange={(event) => setWhatsAppGroupsText(event.target.value)}
            placeholder="120363419430095574@g.us"
            disabled={disabled}
          />
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            onClick={() =>
              void savePartial({
                channels: {
                  whatsapp: { groups: parseMultilineIds(whatsAppGroupsText) },
                },
              } as Partial<DistributionFlags>)
            }
            disabled={disabled}
          >
            <Save className="h-3.5 w-3.5" />
            Salvar grupos
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-700">Chats Telegram (1 por linha)</p>
          <textarea
            className="mt-2 h-28 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            value={telegramChatsText}
            onChange={(event) => setTelegramChatsText(event.target.value)}
            placeholder="-1001234567890"
            disabled={disabled}
          />
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            onClick={() =>
              void savePartial({
                channels: {
                  telegram: { chats: parseMultilineIds(telegramChatsText) },
                },
              } as Partial<DistributionFlags>)
            }
            disabled={disabled}
          >
            <Save className="h-3.5 w-3.5" />
            Salvar chats
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <label className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
          Intervalo entre posts (min)
          <input
            type="number"
            min={1}
            max={240}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3"
            value={flags.scheduling.delay_between_posts_minutes}
            disabled={disabled}
            onChange={(event) =>
              setFlags((prev) =>
                prev
                  ? {
                      ...prev,
                      scheduling: {
                        ...prev.scheduling,
                        delay_between_posts_minutes: Math.max(
                          1,
                          Number(event.target.value || 1),
                        ),
                      },
                    }
                  : prev,
              )
            }
            onBlur={() =>
              void savePartial({
                scheduling: {
                  delay_between_posts_minutes:
                    flags.scheduling.delay_between_posts_minutes,
                },
              } as Partial<DistributionFlags>)
            }
          />
        </label>
        <label className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
          Maximo de posts por dia
          <input
            type="number"
            min={1}
            max={100}
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3"
            value={flags.scheduling.max_posts_per_day}
            disabled={disabled}
            onChange={(event) =>
              setFlags((prev) =>
                prev
                  ? {
                      ...prev,
                      scheduling: {
                        ...prev.scheduling,
                        max_posts_per_day: Math.max(1, Number(event.target.value || 1)),
                      },
                    }
                  : prev,
              )
            }
            onBlur={() =>
              void savePartial({
                scheduling: {
                  max_posts_per_day: flags.scheduling.max_posts_per_day,
                },
              } as Partial<DistributionFlags>)
            }
          />
        </label>
        <label className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
          Timezone
          <input
            type="text"
            className="mt-2 h-10 w-full rounded-xl border border-slate-200 px-3"
            value={flags.scheduling.timezone}
            disabled={disabled}
            onChange={(event) =>
              setFlags((prev) =>
                prev
                  ? {
                      ...prev,
                      scheduling: { ...prev.scheduling, timezone: event.target.value },
                    }
                  : prev,
              )
            }
            onBlur={() =>
              void savePartial({
                scheduling: { timezone: flags.scheduling.timezone },
              } as Partial<DistributionFlags>)
            }
          />
        </label>
      </div>
    </section>
  );
}
