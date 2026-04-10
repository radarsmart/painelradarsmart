import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type Product = {
  id: string;
  name: string;
  slug: string;
  headline: string;
  description: string | null;
  benefits: string[] | null;
  platform: string;
  affiliate_url: string;
  cover_image: string | null;
  price: number | null;
  commission_pct: number | null;
  niche: string | null;
};

async function getProduct(slug: string): Promise<Product | null> {
  const { data } = await supabaseAdmin
    .from("infoproducts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();

  return data as Product | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await getProduct(params.slug);
  if (!product) {
    return { title: "Produto não encontrado — Radar Smart" };
  }

  return {
    title: `${product.headline} — Radar Smart`,
    description: product.description ?? product.headline,
    openGraph: {
      title: product.headline,
      description: product.description ?? "",
      images: product.cover_image ? [{ url: product.cover_image }] : [],
    },
  };
}

const PLATFORM_LABEL: Record<string, string> = {
  hotmart: "Hotmart",
  kiwify: "Kiwify",
  monetizze: "Monetizze",
  eduzz: "Eduzz",
  braip: "Braip",
  outro: "Parceiro",
};

export default async function LandingPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = await getProduct(params.slug);
  if (!product) {
    notFound();
  }

  const benefits = Array.isArray(product.benefits) ? product.benefits : [];
  const platformLabel = PLATFORM_LABEL[product.platform] ?? product.platform;

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      <section className="bg-[#22223B] text-white">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <span className="inline-block rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs uppercase tracking-widest">
            {platformLabel} · Curadoria Radar Smart
          </span>
          <h1 className="mt-6 text-3xl font-black leading-tight md:text-5xl">
            {product.headline}
          </h1>
          {product.description ? (
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-300">
              {product.description}
            </p>
          ) : null}
          <button
            id="cta-top"
            data-id={product.id}
            data-url={product.affiliate_url}
            className="mt-8 inline-block rounded-full bg-[#9e6a18] px-10 py-4 text-lg font-black uppercase tracking-wide text-white shadow-lg hover:brightness-110"
          >
            Quero acessar agora
          </button>
          {product.price ? (
            <p className="mt-3 text-sm text-slate-400">
              A partir de R$ {product.price.toFixed(2).replace(".", ",")}
            </p>
          ) : null}
        </div>
      </section>

      {product.cover_image ? (
        <div className="mx-auto max-w-2xl px-4 -mt-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.cover_image}
            alt={product.name}
            className="w-full rounded-2xl shadow-xl"
          />
        </div>
      ) : null}

      {benefits.length > 0 ? (
        <section className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="mb-8 text-center text-2xl font-black text-[#22223B]">
            O que você vai conquistar
          </h2>
          <ul className="space-y-4">
            {benefits.map((benefit, index) => (
              <li
                key={`${product.id}-${index}`}
                className="flex items-start gap-4 rounded-2xl bg-white p-5 shadow-sm"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#9e6a18] text-xs font-black text-white">
                  {index + 1}
                </span>
                <span className="text-slate-700">{benefit}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mx-auto max-w-3xl px-4 pb-20 text-center">
        <div className="rounded-3xl bg-[#22223B] p-10 text-white">
          <p className="text-sm uppercase tracking-widest text-slate-400">
            Oferta especial
          </p>
          <h2 className="mt-2 text-2xl font-black">{product.headline}</h2>
          {product.price ? (
            <p className="mt-2 text-3xl font-black text-[#F6C453]">
              R$ {product.price.toFixed(2).replace(".", ",")}
            </p>
          ) : null}
          <button
            id="cta-bottom"
            data-id={product.id}
            data-url={product.affiliate_url}
            className="mt-6 inline-block rounded-full bg-[#9e6a18] px-10 py-4 text-lg font-black uppercase tracking-wide text-white hover:brightness-110"
          >
            Garantir meu acesso
          </button>
          <p className="mt-4 text-xs text-slate-400">
            Você será redirecionado para {platformLabel} com segurança
          </p>
        </div>
      </section>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            document.querySelectorAll('[data-id]').forEach(btn => {
              btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const fallback = btn.getAttribute('data-url');
                try {
                  const res = await fetch('/api/infoproducts/click', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                  });
                  const data = await res.json();
                  window.open(data.url || fallback, '_blank');
                } catch {
                  window.open(fallback, '_blank');
                }
              });
            });
          `,
        }}
      />
    </div>
  );
}
