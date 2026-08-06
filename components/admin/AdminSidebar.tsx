"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Clapperboard,
  FileText,
  FilePlus2,
  Flame,
  LayoutDashboard,
  Menu,
  MessageSquareMore,
  Package,
  PanelsTopLeft,
  Send,
  Settings,
  ShoppingBag,
  Sparkles,
  Store,
  X,
  Zap,
} from "lucide-react";

type SidebarUser = {
  email?: string | null;
  role?: string;
};

type SidebarItem = {
  label: string;
  icon: LucideIcon;
  href?: string;
  activePatterns?: string[];
  disabled?: boolean;
};

type SidebarGroup = {
  group: string;
  items: SidebarItem[];
};

const MENU_ITEMS: SidebarGroup[] = [
  {
    group: "Operacao",
    items: [
      {
        label: "Dashboard",
        icon: LayoutDashboard,
        href: "/admin",
        activePatterns: ["/admin"],
      },
      {
        label: "Agentes de Vendas",
        icon: Bot,
        href: "/admin/agentes",
        activePatterns: ["/admin/agentes"],
      },
      {
        label: "Performance dos Agentes",
        icon: BarChart3,
        href: "/admin/agentes/analytics",
        activePatterns: ["/admin/agentes/analytics"],
      },
      {
        label: "Curadoria Geral",
        icon: ShoppingBag,
        href: "/admin/curadoria",
        activePatterns: ["/admin/curadoria"],
      },
      {
        label: "Central de Oferta",
        icon: FilePlus2,
        href: "/admin/ofertas/nova",
        activePatterns: ["/admin/ofertas/nova", "/admin/extrator"],
      },
      {
        label: "Ofertas Publicadas",
        icon: Package,
        href: "/admin/ofertas",
        activePatterns: ["/admin/ofertas"],
      },
      {
        label: "Painel de Envios",
        icon: Send,
        href: "/admin/envios",
        activePatterns: ["/admin/envios", "/admin/fila"],
      },
      {
        label: "Landing Pages",
        icon: PanelsTopLeft,
        href: "/admin/landing-pages",
        activePatterns: ["/admin/landing-pages"],
      },
    ],
  },
  {
    group: "Marketplace Hubs",
    items: [
      {
        label: "Mercado Livre",
        icon: Store,
        href: "/admin/mercadolivre",
        activePatterns: ["/admin/mercadolivre"],
      },
      {
        label: "Shopee Hub",
        icon: Zap,
        href: "/admin/shopee",
        activePatterns: ["/admin/shopee"],
      },
      {
        label: "Lomadee",
        icon: Store,
        href: "/admin/lomadee",
        activePatterns: ["/admin/lomadee"],
      },
      {
        label: "AWIN",
        icon: Store,
        href: "/admin/awin",
        activePatterns: ["/admin/awin"],
      },
      {
        label: "AWIN Analytics",
        icon: BarChart3,
        href: "/admin/awin/analytics",
        activePatterns: ["/admin/awin/analytics"],
      },
      {
        label: "Hub AWIN",
        icon: Store,
        href: "/admin/hub-awin",
        activePatterns: ["/admin/hub-awin"],
      },
      {
        label: "Automacao AWIN",
        icon: Settings,
        href: "/admin/hub-awin/automation",
        activePatterns: ["/admin/hub-awin/automation"],
      },
      {
        label: "Amazon Hub",
        icon: ShoppingBag,
        href: "/admin/amazon",
        activePatterns: ["/admin/amazon"],
      },
    ],
  },
  {
    group: "Inteligencia & SEO",
    items: [
      {
        label: "Tendencias (IA)",
        icon: Flame,
        href: "/admin/tendencias",
        activePatterns: ["/admin/tendencias"],
      },
      {
        label: "Produtos & SEO",
        icon: Package,
        href: "/admin/produtos",
        activePatterns: ["/admin/produtos"],
      },
      {
        label: "Blog & Reviews",
        icon: FileText,
        href: "/admin/blog",
        activePatterns: ["/admin/blog"],
      },
      {
        label: "Infoprodutos",
        icon: PanelsTopLeft,
        href: "/admin/infoprodutos",
        activePatterns: ["/admin/infoprodutos"],
      },
      {
        label: "Criativos UGC",
        icon: Clapperboard,
        href: "/admin/criativos",
        activePatterns: ["/admin/criativos"],
      },
      {
        label: "Video Jobs",
        icon: BarChart3,
        href: "/admin/criativos/video-jobs",
        activePatterns: ["/admin/criativos/video-jobs"],
      },
      {
        label: "TikTok Engine",
        icon: Clapperboard,
        href: "/admin/criativos/tiktok-engine",
        activePatterns: ["/admin/criativos/tiktok-engine"],
      },
      {
        label: "Prompt Gemini",
        icon: Sparkles,
        href: "/admin/criativos/gemini-video",
        activePatterns: ["/admin/criativos/gemini-video"],
      },
    ],
  },
  {
    group: "Ferramentas",
    items: [
      {
        label: "Canais",
        icon: MessageSquareMore,
        href: "/admin/canais",
        activePatterns: ["/admin/canais"],
      },
      {
        label: "Configuracoes",
        icon: Settings,
        href: "/admin/configuracoes",
        activePatterns: ["/admin/configuracoes"],
      },
    ],
  },
];

function isItemActive(pathname: string, item: SidebarItem) {
  if (!item.href) return false;
  if (item.href === "/admin/hub-awin" && pathname.startsWith("/admin/hub-awin/automation")) {
    return false;
  }
  if (
    item.href === "/admin/criativos" &&
    (pathname.startsWith("/admin/criativos/tiktok-engine") ||
      pathname.startsWith("/admin/criativos/video-jobs") ||
      pathname.startsWith("/admin/criativos/gemini-video"))
  ) {
    return false;
  }

  const patterns = item.activePatterns?.length ? item.activePatterns : [item.href];
  return patterns.some((pattern) =>
    pattern === "/admin" || pattern === "/admin/ofertas" || pattern === "/admin/awin"
      ? pathname === pattern
      : pathname.startsWith(pattern),
  );
}

function filterMenuForRole(role?: string): SidebarGroup[] {
  if (role !== "central_oferta") return MENU_ITEMS;

  const centralOferta = MENU_ITEMS.flatMap((group) => group.items).find(
    (item) => item.href === "/admin/ofertas/nova",
  );

  return centralOferta ? [{ group: "Operacao", items: [centralOferta] }] : [];
}

function NavList({
  groups,
  pathname,
}: {
  groups: SidebarGroup[];
  pathname: string;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.group}>
          <h3 className="mb-4 px-2 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">
            {group.group}
          </h3>

          <div className="space-y-1">
            {group.items.map((item) => {
              const active = isItemActive(pathname, item);
              const Icon = item.icon;
              const baseClass =
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200";
              const activeClass =
                "bg-[#FFC300] text-black shadow-lg shadow-[#FFC300]/10";
              const idleClass = item.disabled
                ? "cursor-not-allowed text-gray-600"
                : "text-gray-400 hover:bg-white/5 hover:text-white";
              const iconClass = active ? "text-black" : item.disabled ? "text-gray-700" : "text-gray-500";

              if (!item.href || item.disabled) {
                return (
                  <div
                    key={`${group.group}-${item.label}`}
                    className={`${baseClass} ${idleClass}`}
                    aria-disabled="true"
                  >
                    <Icon size={18} className={iconClass} />
                    <span className="flex-1">{item.label}</span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      Em breve
                    </span>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${baseClass} ${active ? activeClass : idleClass}`}
                >
                  <Icon size={18} className={iconClass} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function getProfileLabel(user?: SidebarUser) {
  if (!user?.email) {
    return {
      name: "Radar Smart",
      role: "Admin Master",
      initials: "RS",
    };
  }

  const local = user.email.split("@")[0] || "admin";
  const name = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return {
    name: name || "Radar Smart",
    role: user.role === "central_oferta" ? "Colaborador" : user.email,
    initials: initials || "RS",
  };
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFC300]">
        <Zap className="h-5 w-5 fill-black text-black" />
      </div>
      <span className="text-xl font-bold tracking-tighter">
        RADAR <span className="text-[#FFC300]">SMART</span>
      </span>
    </div>
  );
}

export default function AdminSidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname();
  const profile = getProfileLabel(user);
  const groups = filterMenuForRole(user?.role);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    setIsDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-white/10 bg-[#1A1A1A] p-4 text-white lg:hidden">
        <Wordmark />
        <button
          type="button"
          onClick={() => setIsDrawerOpen(true)}
          className="rounded-lg border border-white/10 p-2 text-white"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      </header>

      {isDrawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-[#1A1A1A] text-white shadow-xl">
            <div className="flex items-center justify-between border-b border-white/5 p-6">
              <Wordmark />
              <button
                type="button"
                onClick={() => setIsDrawerOpen(false)}
                className="rounded-lg border border-white/10 p-2 text-white"
                aria-label="Fechar menu"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 space-y-8 overflow-y-auto p-4">
              <NavList groups={groups} pathname={pathname} />
            </nav>
            <div className="border-t border-white/5 bg-black/20 p-4">
              <div className="flex items-center gap-3 px-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFC300] text-xs font-bold text-black">
                  {profile.initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{profile.name}</p>
                  <p className="truncate text-[10px] text-gray-500">{profile.role}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-white/10 bg-[#1A1A1A] text-white lg:flex">
        <div className="border-b border-white/5 p-6">
          <Wordmark />
        </div>

        <nav className="flex-1 space-y-8 overflow-y-auto p-4">
          <NavList groups={groups} pathname={pathname} />
        </nav>

        <div className="border-t border-white/5 bg-black/20 p-4">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFC300] text-xs font-bold text-black">
              {profile.initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold">{profile.name}</p>
              <p className="truncate text-[10px] text-gray-500">{profile.role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
