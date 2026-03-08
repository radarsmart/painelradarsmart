import { formatBRL } from "@/lib/formatters";
import BotaoAfiliado from "@/components/ui/BotaoAfiliado";

type LinhaLoja = {
  id?: string;
  store?: string;
  marketplace?: string;
  price: number;
  affiliate_url?: string;
  offer_id?: string;
};

export default function TabelaLojas({ rows }: { rows: LinhaLoja[] }) {
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-rs-border bg-white p-4 text-sm text-rs-muted">
        Sem dados de comparação para este item.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rs-border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-navy text-white">
          <tr>
            <th className="px-4 py-3">Loja</th>
            <th className="px-4 py-3">Marketplace</th>
            <th className="px-4 py-3">Preço</th>
            <th className="px-4 py-3 text-right">Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? `${row.store}-${row.marketplace}`} className="border-t border-slate-200">
              <td className="px-4 py-3">{row.store ?? "-"}</td>
              <td className="px-4 py-3">{row.marketplace ?? "-"}</td>
              <td className="px-4 py-3 font-mono font-semibold">
                {formatBRL(row.price)}
              </td>
              <td className="px-4 py-3 text-right">
                <BotaoAfiliado
                  offerId={String(row.offer_id ?? row.id ?? "unknown")}
                  href={row.affiliate_url ?? "#"}
                  source="comparativo_table"
                  label="Ir para oferta"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
