"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Inicio", icon: "🏠", path: "/" },
  { label: "Ofertas", icon: "⚡", path: "/ofertas" },
  { label: "Buscar", icon: "🔍", path: "/buscar" },
  { label: "Cupons", icon: "🏷️", path: "/cupons" },
];

function isActivePath(pathname: string, itemPath: string): boolean {
  if (itemPath === "/") return pathname === "/";
  if (itemPath === "/buscar") {
    return pathname === "/buscar" || pathname.startsWith("/comparativo");
  }
  if (itemPath === "/cupons") {
    return pathname === "/cupons" || pathname.startsWith("/grupo");
  }
  return pathname === itemPath || pathname.startsWith(`${itemPath}/`);
}

export function BottomNav() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin") || pathname === "/links") {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[130] md:hidden">
      <div className="flex items-center justify-between border-t border-gray-100 bg-white/80 px-6 py-3 shadow-[0_-5px_20px_rgba(0,0,0,0.05)] backdrop-blur-lg">
        {navItems.map((item) => {
          const isActive = isActivePath(pathname, item.path);

          return (
            <Link
              key={item.path}
              href={item.path}
              className="flex flex-col items-center gap-1 transition-all"
            >
              <span
                className={`text-xl ${
                  isActive ? "scale-110" : "grayscale opacity-70"
                }`}
              >
                {item.icon}
              </span>
              <span
                className={`text-[10px] font-black uppercase tracking-tighter ${
                  isActive ? "text-orange-500" : "text-gray-400"
                }`}
              >
                {item.label}
              </span>
              {isActive ? <div className="mt-0.5 h-1 w-1 rounded-full bg-orange-500" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
