import { RefreshCw, Search, ShoppingBag, Zap } from "lucide-react";

import DashboardRefreshButton from "@/components/admin/DashboardRefreshButton";

type AmazonMiniCardProps = {
  title: string;
  value: string;
  color: string;
};

export default function AmazonHub() {
  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <ShoppingBag className="text-[#FF9900]" />
            Amazon Hub
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Curadoria de Elite: Foco em <span className="font-bold text-blue-600">Prime</span> e
            Ofertas do Dia.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl bg-[#FF9900] px-4 py-2 text-sm font-bold text-black shadow-lg shadow-orange-500/10 transition-all hover:bg-[#FF8800]"
          >
            <RefreshCw size={16} />
            Sincronizar Amazon
          </button>
          <DashboardRefreshButton />
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <div className="min-w-[280px] flex-1 space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Minerar na Amazon
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Buscar produtos com alto potencial Prime..."
              className="w-full rounded-2xl border border-gray-100 py-2.5 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-[#FF9900]/20"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Selo
          </label>
          <select className="w-full rounded-2xl border border-gray-100 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 outline-none">
            <option>Somente Prime</option>
            <option>Tudo</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
            Desconto
          </label>
          <select className="w-full rounded-2xl border border-gray-100 px-4 py-2.5 text-sm font-bold outline-none">
            <option>Qualquer</option>
            <option>+15% OFF</option>
            <option>+30% OFF</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <AmazonMiniCard title="Tracking ID" value="radarsmart202-20" color="bg-gray-900 text-white" />
        <AmazonMiniCard title="Ofertas Ativas" value="842" color="bg-white text-gray-900" />
        <AmazonMiniCard title="Taxa de Prime" value="92%" color="bg-blue-50 text-blue-700" />
        <AmazonMiniCard
          title="Conversao Est."
          value="4.8%"
          color="bg-emerald-50 text-emerald-700"
        />
      </div>

      <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 bg-white p-12">
        <div className="mb-4 rounded-full bg-orange-50 p-5">
          <Zap size={32} className="text-[#FF9900]" />
        </div>
        <h2 className="text-xl font-bold text-[#1A1A1A]">Pronto para Minerar</h2>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          Clique em sincronizar para buscar as ultimas ofertas da Amazon com o seu Tracking ID
          automatico.
        </p>
      </div>
    </div>
  );
}

function AmazonMiniCard({ title, value, color }: AmazonMiniCardProps) {
  return (
    <div className={`${color} flex flex-col rounded-2xl p-5 shadow-sm`}>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</span>
      <span className="mt-1 text-xl font-black">{value}</span>
    </div>
  );
}
