"use client";

import type { ReactNode } from "react";
import {
  ArrowUpRight,
  BarChart3,
  Brain,
  Flame,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import DashboardRefreshButton from "@/components/admin/DashboardRefreshButton";

type MomentumPoint = {
  time: string;
  score: number;
};

type CategoryPoint = {
  name: string;
  momentum: number;
  color: string;
};

type BITrendCardProps = {
  title: string;
  value: string;
  detail: string;
  icon: ReactNode;
};

const dataMomentum: MomentumPoint[] = [
  { time: "08:00", score: 45 },
  { time: "10:00", score: 58 },
  { time: "12:00", score: 82 },
  { time: "14:00", score: 75 },
  { time: "16:00", score: 91 },
  { time: "18:00", score: 88 },
];

const dataCategorias: CategoryPoint[] = [
  { name: "Eletronicos", momentum: 92, color: "#7C3AED" },
  { name: "Casa/Cozinha", momentum: 78, color: "#2563EB" },
  { name: "Beleza", momentum: 64, color: "#DB2777" },
  { name: "Moda", momentum: 42, color: "#059669" },
];

export default function TendenciasPage() {
  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <TrendingUp className="text-purple-600" />
            Tendencias & BI
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analise preditiva baseada no{" "}
            <span className="font-bold text-purple-600">Radar Smart Rank</span>.
          </p>
        </div>

        <DashboardRefreshButton />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <BITrendCard
          title="Nicho Quente"
          value="Smartphones"
          detail="+24% interesse"
          icon={<Flame className="text-orange-500" />}
        />
        <BITrendCard
          title="Melhor Conversao"
          value="Amazon Prime"
          detail="Media 4.8% CTR"
          icon={<Target className="text-blue-600" />}
        />
        <BITrendCard
          title="Sugestao de Post"
          value="Fones Bluetooth"
          detail="Alta demanda agora"
          icon={<Brain className="text-purple-600" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-7">
        <div className="rounded-3xl bg-white p-6 shadow-sm lg:col-span-4">
          <h2 className="mb-6 flex items-center gap-2 font-bold text-[#1A1A1A]">
            <Zap size={18} className="fill-amber-500 text-amber-500" />
            Historico de Momentum (24h)
          </h2>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataMomentum}>
                <defs>
                  <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F3F4F6" />
                <XAxis
                  dataKey="time"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#9CA3AF" }}
                />
                <YAxis hide />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#7C3AED"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorScore)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-sm lg:col-span-3">
          <h2 className="mb-6 flex items-center gap-2 font-bold text-[#1A1A1A]">
            <BarChart3 size={18} className="text-blue-600" />
            Forca por Categoria
          </h2>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataCategorias} layout="vertical">
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontWeight: "bold", fill: "#4B5563" }}
                />
                <Tooltip cursor={{ fill: "transparent" }} />
                <Bar dataKey="momentum" radius={[0, 4, 4, 0]} barSize={20}>
                  {dataCategorias.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="relative flex items-start gap-6 overflow-hidden rounded-3xl bg-[#1A1A1A] p-8 text-white shadow-xl">
        <div className="shrink-0 rounded-2xl bg-purple-600 p-4">
          <Brain size={32} />
        </div>
        <div className="z-10 space-y-2">
          <h2 className="text-xl font-bold">Analise Estrategica Radar Smart</h2>
          <p className="max-w-2xl text-sm leading-relaxed text-gray-400">
            O momentum atual indica um pico de interesse em{" "}
            <span className="font-bold text-white">Eletronicos de Consumo</span>. Sugerimos focar
            os proximos 3 disparos do Telegram em acessorios para smartphones (Fones e
            Carregadores) na faixa de <span className="font-bold text-emerald-400">R$ 50 - R$ 150</span>.
            A taxa de conversao para esses itens subiu 18% desde as 12:00.
          </p>
        </div>
        <div className="absolute right-0 top-0 -mr-32 -mt-32 h-64 w-64 rounded-full bg-purple-600/10 blur-3xl" />
      </div>
    </div>
  );
}

function BITrendCard({ title, value, detail, icon }: BITrendCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-white p-6 shadow-sm">
      <div className="rounded-xl bg-gray-50 p-3">{icon}</div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</p>
        <h3 className="text-xl font-black leading-tight text-[#1A1A1A]">{value}</h3>
        <p className="flex items-center gap-1 text-xs font-bold text-emerald-600">
          <ArrowUpRight size={12} />
          {detail}
        </p>
      </div>
    </div>
  );
}
