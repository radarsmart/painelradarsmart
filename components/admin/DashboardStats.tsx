import { formatCompactNumber } from "@/lib/formatters";

type ReceitaLinha = { marketplace?: string; receita?: number };

type DashboardStatsProps = {
  totalCliques: number;
  filaQueued: number;
  filaFailed: number;
  totalMembros: number;
  receita: ReceitaLinha[];
};

export default function DashboardStats({
  totalCliques,
  filaQueued,
  filaFailed,
  totalMembros,
  receita,
}: DashboardStatsProps) {
  const totalReceita = receita.reduce(
    (acc, item) => acc + Number(item.receita ?? 0),
    0,
  );

  const cards = [
    { title: "Cliques", value: formatCompactNumber(totalCliques) },
    { title: "Membros", value: formatCompactNumber(totalMembros) },
    { title: "Fila pendente", value: formatCompactNumber(filaQueued) },
    { title: "Fila com falha", value: formatCompactNumber(filaFailed) },
    { title: "Receita", value: `R$ ${formatCompactNumber(totalReceita)}` },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <div key={card.title} className="rounded-xl border border-rs-border bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-rs-muted">{card.title}</p>
          <p className="mt-2 text-2xl font-bold text-navy">{card.value}</p>
        </div>
      ))}
    </div>
  );
}
