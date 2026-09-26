"use client";

import { useState } from "react";
import { Send } from "lucide-react";

const FORM_ID = "bulk-dispatch-form";

export { FORM_ID as OPPORTUNITY_BULK_FORM_ID };

export default function OpportunityBulkActions() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [telegram, setTelegram] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);

  async function submit() {
    const checked = Array.from(
      document.querySelectorAll<HTMLInputElement>(`input[name="offer_ids"][form="${FORM_ID}"]:checked`),
    ).map((input) => input.value);

    if (!checked.length) {
      setMessage("Selecione ao menos uma oferta.");
      return;
    }

    const channels = [telegram ? "telegram" : null, whatsapp ? "whatsapp" : null].filter(
      (item): item is string => Boolean(item),
    );

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish_batch", offer_ids: checked, channels }),
      });
      const payload = (await response.json()) as {
        error?: string;
        approved_count?: number;
        failed_count?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao enviar selecionadas.");
      setMessage(`${payload.approved_count ?? 0} enviadas, ${payload.failed_count ?? 0} falharam.`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao enviar selecionadas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      <form id={FORM_ID} className="hidden" />
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Enviar selecionadas para
        </span>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={telegram} onChange={(event) => setTelegram(event.target.checked)} />
          Telegram
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={whatsapp} onChange={(event) => setWhatsapp(event.target.checked)} />
          WhatsApp
        </label>
        <span className="text-xs text-slate-500">(site é publicado sempre)</span>
      </div>
      <div className="flex items-center gap-3">
        {message ? <p className="text-xs text-slate-500">{message}</p> : null}
        <button
          type="button"
          onClick={submit}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-navy px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          <Send className="h-4 w-4" />
          {loading ? "Enviando..." : "Enviar selecionadas"}
        </button>
      </div>
    </div>
  );
}
