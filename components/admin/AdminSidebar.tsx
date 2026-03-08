import Link from "next/link";

const items = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/ofertas", label: "Ofertas" },
  { href: "/admin/ofertas/nova", label: "Nova oferta" },
  { href: "/admin/blog/novo", label: "Novo post" },
  { href: "/admin/fila", label: "Fila" },
  { href: "/admin/configuracoes", label: "Configurações" },
];

export default function AdminSidebar({ user }: { user?: { email?: string } }) {
  return (
    <aside className="hidden w-72 border-r border-rs-border bg-navy-3 text-white lg:block">
      <div className="border-b border-rs-border px-5 py-4">
        <p className="font-display text-xl font-bold">
          Radar <span className="text-orange-3">Admin</span>
        </p>
        <p className="mt-1 truncate text-xs text-rs-muted">{user?.email}</p>
      </div>
      <nav className="space-y-1 p-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-navy-2"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
