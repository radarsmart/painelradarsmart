type ScoreMomentoProps = {
  score: number;
};

export default function ScoreMomento({ score }: ScoreMomentoProps) {
  const bounded = Math.max(0, Math.min(100, score));

  return (
    <div className="rounded-xl border border-rs-border bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-rs-muted">
        Buy score
      </p>
      <p className="mt-2 font-mono text-3xl font-bold text-navy">{bounded}/100</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-rs-green transition-all"
          style={{ width: `${bounded}%` }}
        />
      </div>
    </div>
  );
}
