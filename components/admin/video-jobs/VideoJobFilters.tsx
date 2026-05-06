import { Search } from "lucide-react";
import type { VideoJobFiltersState } from "./types";

const STATUS_OPTIONS = [
  "all",
  "preview_generating",
  "preview_ready",
  "render_queued",
  "rendering",
  "rendered",
  "uploading",
  "published",
  "failed",
  "cancelled",
];

const PERIOD_OPTIONS = [
  { value: "today", label: "Hoje" },
  { value: "7d", label: "7 dias" },
  { value: "30d", label: "30 dias" },
  { value: "all", label: "Tudo" },
];

export default function VideoJobFilters({
  filters,
  providers,
  onChange,
}: {
  filters: VideoJobFiltersState;
  providers: string[];
  onChange: (filters: VideoJobFiltersState) => void;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
            placeholder="Buscar por produto ou jobId"
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
          />
        </label>

        <select
          value={filters.status}
          onChange={(event) => onChange({ ...filters, status: event.target.value })}
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "Todos status" : status}
            </option>
          ))}
        </select>

        <select
          value={filters.provider}
          onChange={(event) => onChange({ ...filters, provider: event.target.value })}
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
        >
          <option value="all">Todos providers</option>
          {providers.map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>

        <select
          value={filters.period}
          onChange={(event) => onChange({ ...filters, period: event.target.value })}
          className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none transition focus:border-rs-gold focus:bg-white"
        >
          {PERIOD_OPTIONS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
        </select>

        <label className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={filters.errorOnly}
            onChange={(event) => onChange({ ...filters, errorOnly: event.target.checked })}
            className="h-4 w-4 accent-rs-gold"
          />
          Somente erro
        </label>
      </div>
    </div>
  );
}
