import Link from "next/link";
import { Search, Bell, Heart, MessageCircle } from "lucide-react";

const navLinks = [
  { href: "/", label: "Início" },
  { href: "/comparativo", label: "Comparativo" },
  { href: "/blog", label: "Blog" },
  { href: "/grupo", label: "Grupo" },
  { href: "/admin", label: "Admin" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-rs-border bg-navy text-white">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="font-display text-xl font-bold tracking-tight">
          Radar <span className="text-orange-3">Smart</span>
        </Link>

        <div className="hidden flex-1 items-center gap-2 rounded-md border border-rs-border bg-white/95 px-3 py-2 text-navy md:flex">
          <Search className="h-4 w-4 text-rs-muted" />
          <input
            aria-label="Buscar ofertas"
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Buscar produto, loja ou categoria"
          />
        </div>

        <nav className="hidden items-center gap-4 text-sm lg:flex">
          {navLinks.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-orange-3">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <button className="rounded-md border border-rs-border p-2 hover:bg-navy-2">
            <Bell className="h-4 w-4" />
          </button>
          <button className="rounded-md border border-rs-border p-2 hover:bg-navy-2">
            <Heart className="h-4 w-4" />
          </button>
          <Link
            href="/grupo"
            className="inline-flex items-center gap-2 rounded-md bg-orange px-3 py-2 text-sm font-semibold text-white hover:bg-orange-2"
          >
            <MessageCircle className="h-4 w-4" />
            Entrar no Grupo
          </Link>
        </div>
      </div>
    </header>
  );
}
