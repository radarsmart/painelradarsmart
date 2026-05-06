import { AlertCircle, CheckCircle2, Clock3, ListVideo } from "lucide-react";
import type { ReactNode } from "react";
import type { VideoJobsKpis } from "./types";

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "-";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function KpiCard({
  title,
  value,
  description,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-5 shadow-sm">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-400">
          {title}
        </p>
        <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 text-slate-400">{icon}</div>
    </div>
  );
}

export default function VideoJobKpiCards({ kpis }: { kpis: VideoJobsKpis }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        title="Jobs hoje"
        value={kpis.jobsToday}
        description="Criados em America/Sao_Paulo."
        icon={<ListVideo size={20} />}
        color="text-slate-900"
      />
      <KpiCard
        title="Publicados"
        value={kpis.published}
        description="Jobs com MP4 no Storage."
        icon={<CheckCircle2 size={20} />}
        color="text-emerald-600"
      />
      <KpiCard
        title="Falhas"
        value={kpis.failed}
        description="Elegiveis para retry seguro."
        icon={<AlertCircle size={20} />}
        color="text-red-600"
      />
      <KpiCard
        title="Tempo medio"
        value={formatDuration(kpis.averageRenderSeconds)}
        description="Entre rendering e rendered."
        icon={<Clock3 size={20} />}
        color="text-rs-gold"
      />
    </div>
  );
}
