type QueueItem = {
  id: string;
  status: string;
  target_id?: string;
  attempt_count?: number;
  error_message?: string;
  scheduled_at?: string;
};

export default function FilaMonitor({ items }: { items: QueueItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-rs-border bg-white p-6 text-sm text-rs-muted">
        Fila vazia.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-rs-border bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Tentativas</th>
            <th className="px-4 py-3">Agendado</th>
            <th className="px-4 py-3">Erro</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-t border-slate-200">
              <td className="px-4 py-3 font-mono text-xs">{item.id}</td>
              <td className="px-4 py-3">{item.status}</td>
              <td className="px-4 py-3">{item.attempt_count ?? 0}</td>
              <td className="px-4 py-3">
                {item.scheduled_at
                  ? new Date(item.scheduled_at).toLocaleString("pt-BR")
                  : "-"}
              </td>
              <td className="px-4 py-3 text-rs-red">
                {item.error_message ? item.error_message.slice(0, 80) : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
