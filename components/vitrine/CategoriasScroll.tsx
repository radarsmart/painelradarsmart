import Link from "next/link";

type Categoria = {
  id?: string;
  name?: string;
  slug?: string;
  icon?: string | null;
};

export default function CategoriasScroll({
  categorias,
}: {
  categorias: Categoria[];
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      <Link
        href="/"
        className="whitespace-nowrap rounded-full border border-rs-border bg-white px-4 py-2 text-sm font-medium text-navy hover:border-orange hover:text-orange"
      >
        Todas
      </Link>
      {categorias.map((cat) => (
        <Link
          key={cat.id ?? cat.slug ?? cat.name}
          href={cat.slug ? `/?categoria=${cat.slug}` : "/"}
          className="whitespace-nowrap rounded-full border border-rs-border bg-white px-4 py-2 text-sm font-medium text-navy hover:border-orange hover:text-orange"
        >
          {cat.icon ? `${cat.icon} ` : ""}
          {cat.name ?? "Categoria"}
        </Link>
      ))}
    </div>
  );
}
