import { Zap, TrendingUp, AlertTriangle } from "lucide-react";

export function QualityScoreBadge({ score, isPriority }: { score?: number | null, isPriority?: boolean | null }) {
  const safeScore = score || 0;

  if (isPriority || safeScore >= 70) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-500/20">
        <Zap className="h-3 w-3" />
        PRIORIDADE ALTA {safeScore > 0 ? `(${safeScore})` : ''}
      </div>
    );
  }

  if (safeScore >= 40) {
    return (
      <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-600 dark:bg-amber-500/20 dark:text-amber-400 border border-amber-500/20">
        <TrendingUp className="h-3 w-3" />
        SCORE {safeScore}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-600 dark:bg-red-500/20 dark:text-red-400 border border-red-500/20">
      <AlertTriangle className="h-3 w-3" />
      SCORE {safeScore}
    </div>
  );
}
