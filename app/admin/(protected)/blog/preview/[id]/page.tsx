import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type FaqItem = { question: string; answer: string };

type RelatedOffer = {
  id: string | number;
  title: string | null;
  price: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  discount_pct: number | string | null;
  discount_percent: number | string | null;
  marketplace?: string | null;
};

type FixedOfferLink = {
  offer_id: string;
  is_primary: boolean;
  sort_order: number;
};

type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image: string | null;
  featured_image: string | null;
  meta_title: string | null;
  meta_description: string | null;
  faq: FaqItem[] | null;
  schema_org: Record<string, unknown> | null;
  published_at: string | null;
  created_at: string;
  status: string | null;
  is_published: boolean | null;
  offer_id?: string | null;
};

async function getPostById(id: string): Promise<BlogPost | null> {
  const selectCandidates = [
    "id,title,slug,excerpt,content,content_md,cover_image,featured_image,meta_title,meta_description,faq,schema_org,published_at,created_at,status,is_published,offer_id",
    "id,title,slug,excerpt,content,cover_image,featured_image,meta_title,meta_description,faq,schema_org,published_at,created_at,status,is_published,offer_id",
    "id,title,slug,excerpt,content,featured_image,meta_title,meta_description,faq,schema_org,published_at,created_at,status,is_published,offer_id",
    "id,title,slug,excerpt,content,featured_image,faq,schema_org,published_at,created_at,status,is_published,offer_id",
    "id,title,slug,excerpt,content,featured_image,published_at,created_at,status,is_published,offer_id",
    "id,title,slug,excerpt,content,featured_image,published_at,created_at,status,is_published",
  ];

  let data: Record<string, unknown> | null = null;

  for (const select of selectCandidates) {
    const query = await supabaseAdmin
      .from("blog_posts")
      .select(select)
      .eq("id", id)
      .maybeSingle();

    if (!query.error && query.data) {
      data = query.data as unknown as Record<string, unknown>;
      break;
    }
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    content:
      data.content ??
      data.content_md ??
      null,
    cover_image: (data.featured_image as string | null) ?? null,
    meta_title: data.meta_title ?? null,
    meta_description: data.meta_description ?? null,
    faq: (data.faq as FaqItem[] | null) ?? null,
    schema_org: (data.schema_org as Record<string, unknown> | null) ?? null,
    offer_id: (data.offer_id as string | null) ?? null,
  } as BlogPost;
}

async function getSelectedOffer(offerId?: string | null) {
  if (!offerId) return null;

  const { data } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,image_url,affiliate_url,discount_pct,discount_percent,marketplace")
    .eq("status", "active")
    .eq("id", offerId)
    .maybeSingle();

  return (data as RelatedOffer | null) ?? null;
}

async function getFixedOfferLinks(postId: string) {
  const { data, error } = await supabaseAdmin
    .from("blog_post_offers")
    .select("offer_id,is_primary,sort_order")
    .eq("post_id", postId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) return [] as FixedOfferLink[];
  return (data ?? []) as FixedOfferLink[];
}

async function getOffersByIds(ids: string[]) {
  if (!ids.length) return [] as RelatedOffer[];

  const { data, error } = await supabaseAdmin
    .from("offers")
    .select("id,title,price,image_url,affiliate_url,discount_pct,discount_percent,marketplace")
    .eq("status", "active")
    .in("id", ids);

  if (error) return [] as RelatedOffer[];

  const byId = new Map<string, RelatedOffer>();
  for (const item of (data ?? []) as RelatedOffer[]) {
    byId.set(String(item.id), item);
  }

  return ids.map((id) => byId.get(id)).filter((item): item is RelatedOffer => Boolean(item));
}

async function getRelatedOffers(title: string, excludeIds: string[] = []) {
  const keyword = title.split(" ").slice(0, 2).join(" ");
  let query = supabaseAdmin
    .from("offers")
    .select("id,title,price,image_url,affiliate_url,discount_pct,discount_percent,marketplace")
    .eq("status", "active")
    .ilike("title", `%${keyword}%`);

  const uniqueExcludeIds = Array.from(new Set(excludeIds.filter(Boolean)));
  if (uniqueExcludeIds.length) {
    query = query.not("id", "in", `(${uniqueExcludeIds.join(",")})`);
  }

  const { data } = await query.order("updated_at", { ascending: false }).limit(4);
  return (data ?? []) as RelatedOffer[];
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export default async function AdminBlogPreviewPage({
  params,
}: {
  params: { id: string };
}) {
  const post = await getPostById(params.id);
  if (!post) {
    notFound();
  }

  const fixedLinks = await getFixedOfferLinks(post.id);
  const fixedIds = fixedLinks.map((item) => item.offer_id);
  const primaryOfferId =
    post.offer_id ?? fixedLinks.find((item) => item.is_primary)?.offer_id ?? null;
  const [selectedOffer, fixedOffers, relatedOffers] = await Promise.all([
    getSelectedOffer(primaryOfferId),
    getOffersByIds(fixedIds),
    getRelatedOffers(post.title, primaryOfferId ? [primaryOfferId, ...fixedIds] : fixedIds),
  ]);
  const additionalFixedOffers = fixedOffers.filter(
    (item) => String(item.id) !== String(selectedOffer?.id ?? ""),
  );

  const faq = Array.isArray(post.faq) ? post.faq : [];
  const publishedDate = post.published_at || post.created_at;

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-4 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-amber-700">
        Preview de rascunho
      </div>

      <nav className="mb-6 flex items-center gap-2 text-xs text-slate-500">
        <Link href="/admin/blog" className="hover:underline">
          Admin blog
        </Link>
        <span>/</span>
        <span className="text-slate-700">{post.title}</span>
      </nav>

      <header className="mb-8">
        <h1 className="text-3xl font-black leading-tight text-[#22223B] md:text-4xl">
          {post.title}
        </h1>
        {post.excerpt ? <p className="mt-4 text-lg text-slate-600">{post.excerpt}</p> : null}
        <p className="mt-3 text-xs text-slate-400">
          Atualizado em{" "}
          {new Date(publishedDate).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </p>
      </header>

      {(post.cover_image || post.featured_image) && (
        <div className="mb-8 overflow-hidden rounded-2xl">
          <Image
            src={post.cover_image || post.featured_image || "/logo.png"}
            alt={post.title}
            width={1792}
            height={1024}
            className="h-64 w-full object-cover md:h-80"
            priority
          />
        </div>
      )}

      {post.content ? (
        <article
          className="prose prose-slate max-w-none prose-headings:font-black prose-headings:text-[#22223B] prose-a:text-[#9e6a18]"
          dangerouslySetInnerHTML={{ __html: post.content.replace(/\n/g, "<br/>") }}
        />
      ) : null}

      {selectedOffer ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-black text-[#22223B]">
            Oferta em destaque deste guia
          </h2>
          <a
            href={`/go/${String(selectedOffer.id)}?source=blog_featured_offer`}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="grid gap-4 rounded-2xl border border-[#9e6a18]/20 bg-white p-4 shadow-sm md:grid-cols-[160px_1fr]"
          >
            <div className="relative h-40 overflow-hidden rounded-xl bg-[#F8FAFC]">
              {selectedOffer.image_url ? (
                <Image
                  src={String(selectedOffer.image_url)}
                  alt={String(selectedOffer.title)}
                  fill
                  className="object-contain"
                />
              ) : null}
            </div>
            <div className="flex flex-col justify-between gap-3">
              <div>
                <span className="inline-flex rounded-full bg-[#9e6a18]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#9e6a18]">
                  {selectedOffer.marketplace || "Oferta selecionada"}
                </span>
                <h3 className="mt-3 text-xl font-bold text-[#22223B]">
                  {selectedOffer.title}
                </h3>
                <p className="mt-3 text-2xl font-black text-emerald-600">
                  {formatBRL(Number(selectedOffer.price))}
                </p>
              </div>
              <span className="inline-flex w-fit rounded-xl bg-[#22223B] px-4 py-2 text-sm font-bold text-white">
                Ver oferta
              </span>
            </div>
          </a>
        </section>
      ) : null}

      {additionalFixedOffers.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-black text-[#22223B]">
            Ofertas selecionadas para este guia
          </h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {additionalFixedOffers.map((offer) => (
              <a
                key={`fixed-${String(offer.id)}`}
                href={`/go/${String(offer.id)}?source=blog_fixed_offer`}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:border-[#9e6a18]"
              >
                {offer.image_url ? (
                  <Image
                    src={String(offer.image_url)}
                    alt={String(offer.title)}
                    width={160}
                    height={160}
                    className="mx-auto mb-2 h-20 w-20 object-contain"
                  />
                ) : null}
                <p className="line-clamp-2 text-xs font-semibold text-slate-700">
                  {String(offer.title)}
                </p>
                <p className="mt-1 font-bold text-[#22223B]">{formatBRL(Number(offer.price))}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {relatedOffers.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-4 text-2xl font-black text-[#22223B]">Ofertas relacionadas</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {relatedOffers.map((offer) => (
              <a
                key={String(offer.id)}
                href={`/go/${String(offer.id)}?source=blog_related`}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="rounded-xl border border-slate-200 bg-white p-3 text-center hover:border-[#9e6a18]"
              >
                {offer.image_url ? (
                  <Image
                    src={String(offer.image_url)}
                    alt={String(offer.title)}
                    width={160}
                    height={160}
                    className="mx-auto mb-2 h-20 w-20 object-contain"
                  />
                ) : null}
                <p className="line-clamp-2 text-xs font-semibold text-slate-700">
                  {String(offer.title)}
                </p>
                <p className="mt-1 font-bold text-[#22223B]">{formatBRL(Number(offer.price))}</p>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {faq.length > 0 ? (
        <section className="mt-12">
          <h2 className="mb-6 text-2xl font-black text-[#22223B]">Perguntas frequentes</h2>
          <div className="space-y-4">
            {faq.map((item, i) => (
              <details key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
                <summary className="cursor-pointer font-bold text-[#22223B]">
                  {item.question}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
