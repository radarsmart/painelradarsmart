"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/formatters";

type Ponto = {
  recorded_at: string;
  price: number;
};

export default function GraficoPreco({ data }: { data: Ponto[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="recorded_at"
            tickFormatter={(v) => new Date(v).toLocaleDateString("pt-BR")}
          />
          <YAxis tickFormatter={(v) => `R$ ${Number(v).toFixed(0)}`} />
          <Tooltip
            formatter={(value: number) => formatBRL(Number(value))}
            labelFormatter={(label) =>
              new Date(String(label)).toLocaleString("pt-BR")
            }
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#E47911"
            strokeWidth={3}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
