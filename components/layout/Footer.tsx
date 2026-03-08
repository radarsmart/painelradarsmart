import Link from "next/link";

const footerLinks = [
  { href: "/blog", label: "Blog" },
  { href: "/comparativo", label: "Comparativo" },
  { href: "/grupo", label: "Grupo" },
  { href: "/admin", label: "Admin" },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-rs-border bg-navy-3 text-white">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-3">
        <div>
          <p className="font-display text-xl font-bold">Radar Smart</p>
          <p className="mt-3 max-w-sm text-sm text-rs-muted">
            Plataforma de ofertas afiliadas com curadoria, histórico de preço e
            conteúdo estratégico para compra inteligente.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-3">
            Navegação
          </p>
          <ul className="mt-3 space-y-2 text-sm text-rs-muted">
            {footerLinks.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-orange-3">
            Transparência
          </p>
          <p className="mt-3 text-sm text-rs-muted">
            Contém links de afiliado. Podemos receber comissão sem custo
            adicional ao usuário.
          </p>
        </div>
      </div>
      <div className="border-t border-rs-border px-4 py-4 text-center text-xs text-rs-muted">
        © {new Date().getFullYear()} Radar Smart · radarsmart.com.br
      </div>
    </footer>
  );
}
