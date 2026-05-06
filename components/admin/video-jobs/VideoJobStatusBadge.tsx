import { AlertCircle, CheckCircle2, Clock3, Loader2, Upload, Video } from "lucide-react";

const STATUS_STYLES: Record<string, { label: string; className: string; icon: typeof Clock3 }> = {
  preview_generating: {
    label: "Preview",
    className: "bg-sky-100 text-sky-700",
    icon: Loader2,
  },
  preview_ready: {
    label: "Preview pronto",
    className: "bg-cyan-100 text-cyan-700",
    icon: CheckCircle2,
  },
  render_queued: {
    label: "Na fila",
    className: "bg-amber-100 text-amber-700",
    icon: Clock3,
  },
  rendering: {
    label: "Renderizando",
    className: "bg-indigo-100 text-indigo-700",
    icon: Video,
  },
  rendered: {
    label: "Renderizado",
    className: "bg-violet-100 text-violet-700",
    icon: CheckCircle2,
  },
  uploading: {
    label: "Upload",
    className: "bg-orange-100 text-orange-700",
    icon: Upload,
  },
  published: {
    label: "Publicado",
    className: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  failed: {
    label: "Falha",
    className: "bg-red-100 text-red-700",
    icon: AlertCircle,
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-slate-200 text-slate-700",
    icon: AlertCircle,
  },
};

export default function VideoJobStatusBadge({ status }: { status: string | null }) {
  const normalized = String(status ?? "draft");
  const style = STATUS_STYLES[normalized] ?? {
    label: normalized,
    className: "bg-slate-100 text-slate-700",
    icon: Clock3,
  };
  const Icon = style.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${style.className}`}>
      <Icon className={normalized === "rendering" || normalized === "preview_generating" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
      {style.label}
    </span>
  );
}
