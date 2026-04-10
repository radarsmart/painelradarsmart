"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  ExternalLink,
  Loader2,
  PauseCircle,
  PenSquare,
  Search,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type BlogPostRow = {
  id: string;
  title: string;
  slug: string;
  status: string | null;
  is_published: boolean | null;
  featured_image: string | null;
  created_at: string | null;
  excerpt?: string | null;
  content?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  offer_id?: string | null;
};

type GeneratedGuide = {
  id: string;
  slug: string;
  title: string;
  featured_image: string | null;
  preview_url: string;
};

type OfferOption = {
  id: string;
  title: string;
  price: number | null;
  image_url: string | null;
  marketplace: string | null;
};

type GuideOfferItem = {
  offer_id: string;
  title: string;
  price: number | null;
  image_url: string | null;
  marketplace: string | null;
  is_primary: boolean;
  sort_order: number;
};

function formatDate(value: string | null) {
  if (!value) return "Data não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function formatBRL(value: number | null) {
  if (!value || value <= 0) return "Consultar";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function getStatusLabel(post: BlogPostRow) {
  return post.is_published || post.status === "published" ? "Publicado" : "Rascunho";
}

function getStatusTone(post: BlogPostRow) {
  return post.is_published || post.status === "published"
    ? "bg-emerald-50 text-emerald-700"
    : "bg-amber-50 text-amber-700";
}

function normalizeGuideOffers(offers: GuideOfferItem[]) {
  const primaryOfferId =
    offers.find((item) => item.is_primary)?.offer_id ?? offers[0]?.offer_id ?? null;
  return offers.map((item, index) => ({
    ...item,
    sort_order: index,
    is_primary: primaryOfferId ? item.offer_id === primaryOfferId : index === 0,
  }));
}

export default function AdminBlogPage() {
  const [keyword, setKeyword] = useState("");
  const [context, setContext] = useState("");
  const [offerQuery, setOfferQuery] = useState("");
  const [offerResults, setOfferResults] = useState<OfferOption[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<OfferOption | null>(null);
  const [guides, setGuides] = useState<BlogPostRow[]>([]);
  const [generatedGuide, setGeneratedGuide] = useState<GeneratedGuide | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingGenerate, setLoadingGenerate] = useState(false);
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingGuide, setEditingGuide] = useState<BlogPostRow | null>(null);
  const [editingOfferQuery, setEditingOfferQuery] = useState("");
  const [editingOfferResults, setEditingOfferResults] = useState<OfferOption[]>([]);
  const [loadingEditingOffers, setLoadingEditingOffers] = useState(false);
  const [loadingGuideOffers, setLoadingGuideOffers] = useState(false);
  const [savingGuideOffers, setSavingGuideOffers] = useState(false);
  const [guideOffers, setGuideOffers] = useState<GuideOfferItem[]>([]);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  async function getAccessToken() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (sessionError || !token) {
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    return token;
  }

  async function loadGuides() {
    setLoadingList(true);
    setError("");

    try {
      let data: BlogPostRow[] | null = null;
      let queryError: string | null = null;

      const primaryQuery = await supabase
        .from("blog_posts")
        .select(
          "id,title,slug,status,is_published,featured_image,created_at,excerpt,content,meta_title,meta_description,offer_id",
        )
        .order("created_at", { ascending: false });

      if (!primaryQuery.error) {
        data = (primaryQuery.data ?? []) as BlogPostRow[];
      } else if (
        primaryQuery.error.message.toLowerCase().includes("meta_title") ||
        primaryQuery.error.message.toLowerCase().includes("meta_description")
      ) {
        const fallbackWithoutMeta = await supabase
          .from("blog_posts")
          .select(
            "id,title,slug,status,is_published,featured_image,created_at,excerpt,content,offer_id",
          )
          .order("created_at", { ascending: false });

        if (!fallbackWithoutMeta.error) {
          data = (fallbackWithoutMeta.data ?? []) as BlogPostRow[];
        } else if (fallbackWithoutMeta.error.message.toLowerCase().includes("offer_id")) {
          const fallbackWithoutOffer = await supabase
            .from("blog_posts")
            .select("id,title,slug,status,is_published,featured_image,created_at,excerpt,content")
            .order("created_at", { ascending: false });

          if (!fallbackWithoutOffer.error) {
            data = (fallbackWithoutOffer.data ?? []) as BlogPostRow[];
          } else {
            queryError = fallbackWithoutOffer.error.message;
          }
        } else {
          queryError = fallbackWithoutMeta.error.message;
        }
      } else {
        queryError = primaryQuery.error.message;
      }

      if (queryError) {
        throw new Error(queryError);
      }

      setGuides(data ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Falha ao carregar guias.");
      setGuides([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    void loadGuides();
  }, []);

  async function searchOffersByTitle(
    query: string,
    setResults: (offers: OfferOption[]) => void,
    setLoading: (value: boolean) => void,
  ) {
    const safeQuery = query.trim();
    if (safeQuery.length < 2) {
      setResults([]);
      setError("Digite pelo menos 2 caracteres para buscar ofertas.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: queryError } = await supabase
        .from("offers")
        .select("id,title,price,image_url,marketplace")
        .eq("status", "active")
        .ilike("title", `%${safeQuery}%`)
        .order("updated_at", { ascending: false })
        .limit(12);

      if (queryError) {
        throw new Error(queryError.message);
      }

      setResults(
        ((data ?? []) as Array<Record<string, unknown>>).map((item) => ({
          id: String(item.id ?? ""),
          title: String(item.title ?? "Oferta sem título"),
          price: typeof item.price === "number" ? item.price : Number(item.price ?? 0) || null,
          image_url: String(item.image_url ?? "").trim() || null,
          marketplace: String(item.marketplace ?? "").trim() || null,
        })),
      );
    } catch (searchError) {
      setResults([]);
      setError(searchError instanceof Error ? searchError.message : "Falha ao buscar ofertas.");
    } finally {
      setLoading(false);
    }
  }

  async function searchOffers() {
    await searchOffersByTitle(offerQuery, setOfferResults, setLoadingOffers);
  }

  async function searchOffersForGuide() {
    await searchOffersByTitle(
      editingOfferQuery,
      setEditingOfferResults,
      setLoadingEditingOffers,
    );
  }

  async function openGuideOfferEditor(guide: BlogPostRow) {
    setEditingGuide(guide);
    setEditingOfferQuery("");
    setEditingOfferResults([]);
    setGuideOffers([]);
    setLoadingGuideOffers(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch(
        `/api/admin/blog/offers?post_id=${encodeURIComponent(guide.id)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as {
        success?: boolean;
        offers?: GuideOfferItem[];
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao carregar ofertas do guia.");
      }

      setGuideOffers(normalizeGuideOffers(payload.offers ?? []));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Falha ao carregar ofertas do guia.",
      );
    } finally {
      setLoadingGuideOffers(false);
    }
  }

  async function handleGenerate() {
    const safeKeyword = keyword.trim();
    if (!safeKeyword && !selectedOffer) {
      setError("Informe uma keyword ou selecione uma oferta principal.");
      return;
    }

    setLoadingGenerate(true);
    setFeedback("");
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          keyword: safeKeyword,
          context: context.trim(),
          offer_id: selectedOffer?.id ?? null,
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        id?: string;
        slug?: string;
        title?: string;
        cover_image?: string | null;
        featured_image?: string | null;
        preview_url?: string;
        error?: string;
      };

      if (!response.ok || !payload.success || !payload.id || !payload.slug || !payload.title) {
        throw new Error(payload.error || "Falha ao gerar guia com IA.");
      }

      setGeneratedGuide({
        id: payload.id,
        slug: payload.slug,
        title: payload.title,
        featured_image: payload.featured_image ?? payload.cover_image ?? null,
        preview_url: payload.preview_url || `/admin/blog/preview/${payload.id}`,
      });

      setFeedback(
        selectedOffer
          ? "Guia gerado com sucesso e vinculado à oferta selecionada."
          : "Guia gerado com sucesso e salvo como rascunho.",
      );
      await loadGuides();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Falha ao gerar guia.");
    } finally {
      setLoadingGenerate(false);
    }
  }

  async function handlePublish(id: string) {
    setPublishingId(id);
    setFeedback("");
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/publish", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao publicar guia.");
      }

      setFeedback("Guia publicado com sucesso.");
      await loadGuides();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Falha ao publicar guia.");
    } finally {
      setPublishingId(null);
    }
  }

  async function handlePause(id: string) {
    setPausingId(id);
    setFeedback("");
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/manage", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id, action: "pause" }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao pausar guia.");
      }

      setFeedback("Guia pausado com sucesso.");
      await loadGuides();
    } catch (pauseError) {
      setError(pauseError instanceof Error ? pauseError.message : "Falha ao pausar guia.");
    } finally {
      setPausingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir este guia permanentemente?")) {
      return;
    }

    setDeletingId(id);
    setFeedback("");
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/manage", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao excluir guia.");
      }

      setFeedback("Guia excluído com sucesso.");
      await loadGuides();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir guia.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm("Excluir todos os posts do blog permanentemente?")) {
      return;
    }

    setDeletingAll(true);
    setFeedback("");
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/manage", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ all: true }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao excluir todos os guias.");
      }

      setGeneratedGuide(null);
      setFeedback("Todos os posts do blog foram excluídos.");
      await loadGuides();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao excluir todos os guias.",
      );
    } finally {
      setDeletingAll(false);
    }
  }

  function addOfferToGuide(offer: OfferOption) {
    setGuideOffers((current) => {
      if (current.some((item) => item.offer_id === offer.id)) {
        return current;
      }

      return normalizeGuideOffers([
        ...current,
        {
          offer_id: offer.id,
          title: offer.title,
          price: offer.price,
          image_url: offer.image_url,
          marketplace: offer.marketplace,
          is_primary: current.length === 0,
          sort_order: current.length,
        },
      ]);
    });

    setEditingOfferResults((current) => current.filter((item) => item.id !== offer.id));
    setEditingOfferQuery("");
  }

  function removeGuideOffer(offerId: string) {
    setGuideOffers((current) =>
      normalizeGuideOffers(current.filter((item) => item.offer_id !== offerId)),
    );
  }

  function setPrimaryGuideOffer(offerId: string) {
    setGuideOffers((current) =>
      normalizeGuideOffers(
        current.map((item) => ({
          ...item,
          is_primary: item.offer_id === offerId,
        })),
      ),
    );
  }

  function moveGuideOffer(offerId: string, direction: -1 | 1) {
    setGuideOffers((current) => {
      const index = current.findIndex((item) => item.offer_id === offerId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const cloned = [...current];
      const [moved] = cloned.splice(index, 1);
      cloned.splice(nextIndex, 0, moved);
      return normalizeGuideOffers(cloned);
    });
  }

  async function saveGuideOffers() {
    if (!editingGuide) return;

    setSavingGuideOffers(true);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/blog/offers", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          post_id: editingGuide.id,
          offers: guideOffers.map((item, index) => ({
            offer_id: item.offer_id,
            sort_order: index,
            is_primary: item.is_primary,
          })),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        offers?: GuideOfferItem[];
        error?: string;
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao salvar ofertas do guia.");
      }

      setGuideOffers(normalizeGuideOffers(payload.offers ?? []));
      setFeedback("Ofertas fixas do guia atualizadas com sucesso.");
      setEditingGuide(null);
      setEditingOfferQuery("");
      setEditingOfferResults([]);
      await loadGuides();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Falha ao salvar ofertas do guia.",
      );
    } finally {
      setSavingGuideOffers(false);
    }
  }

  const publishedCount = useMemo(
    () => guides.filter((item) => item.is_published || item.status === "published").length,
    [guides],
  );

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <BookOpenText className="text-[#9e6a18]" />
            Guias de Compra
          </h1>
          <p className="mt-1 text-sm font-medium text-muted-foreground">
            Gere, revise e publique conteúdos otimizados para SEO, GEO e conversão.
          </p>
        </div>
      </div>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#9e6a18]" />
          <h2 className="text-xl font-bold text-[#1A1A1A]">Gerador de guia com IA</h2>
        </div>

        <div className="grid gap-4">
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Keyword principal
            </label>
            <input
              type="text"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Opcional se você já selecionar a oferta principal"
              className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
            />
            <p className="text-xs text-slate-500">
              Melhor fluxo: escolha a oferta principal e deixe a IA inferir a keyword de compra.
            </p>
          </div>

          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Contexto adicional
            </label>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              rows={4}
              placeholder="Informações extras, público, intenção de compra, marcas ou limites de preço."
              className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200 bg-[#FAF8F5] p-4">
            <div>
              <p className="text-sm font-bold text-[#1A1A1A]">Oferta principal do guia</p>
              <p className="text-xs text-slate-500">
                Selecione uma oferta ativa para virar o produto em destaque dentro do post.
              </p>
            </div>

            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                <input
                  type="text"
                  value={offerQuery}
                  onChange={(event) => setOfferQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void searchOffers();
                    }
                  }}
                  placeholder="Buscar oferta ativa por título"
                  className="w-full rounded-2xl border border-gray-100 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
                />
              </div>
              <button
                type="button"
                onClick={() => void searchOffers()}
                disabled={loadingOffers}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingOffers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Buscar ofertas
              </button>
            </div>

            {selectedOffer ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-white">
                  {selectedOffer.image_url ? (
                    <Image
                      src={selectedOffer.image_url}
                      alt={selectedOffer.title}
                      fill
                      className="object-contain"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                      Sem imagem
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold text-[#1A1A1A]">
                    {selectedOffer.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedOffer.marketplace || "Marketplace"} • {formatBRL(selectedOffer.price)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOffer(null)}
                  className="rounded-full p-2 text-slate-500 hover:bg-white"
                  aria-label="Remover oferta selecionada"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {!selectedOffer && offerResults.length > 0 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {offerResults.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => {
                      setSelectedOffer(offer);
                      setOfferResults([]);
                      setOfferQuery(offer.title);
                    }}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition hover:border-[#9e6a18]"
                  >
                    <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-[#F8FAFC]">
                      {offer.image_url ? (
                        <Image
                          src={offer.image_url}
                          alt={offer.title}
                          fill
                          className="object-contain"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                          Sem imagem
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-[#1A1A1A]">
                        {offer.title}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {offer.marketplace || "Marketplace"} • {formatBRL(offer.price)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={loadingGenerate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loadingGenerate ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Gerar com IA
                </>
              )}
            </button>
            {loadingGenerate ? (
              <p className="text-sm font-medium text-slate-600">
                Gerando conteúdo e imagem de capa com IA...
              </p>
            ) : null}
          </div>
        </div>

        {generatedGuide ? (
          <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-semibold text-emerald-700">Guia gerado</p>
            <div className="mt-3 flex flex-col gap-4 md:flex-row">
              <div className="relative h-36 w-full overflow-hidden rounded-2xl bg-white md:w-56">
                {generatedGuide.featured_image ? (
                  <Image
                    src={generatedGuide.featured_image}
                    alt={generatedGuide.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Sem capa
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <p className="text-lg font-bold text-[#1A1A1A]">{generatedGuide.title}</p>
                <p className="text-sm text-slate-600">Slug: {generatedGuide.slug}</p>
                {selectedOffer ? (
                  <p className="text-sm text-slate-600">
                    Oferta em destaque: <span className="font-semibold">{selectedOffer.title}</span>
                  </p>
                ) : null}
                <Link
                  href={generatedGuide.preview_url}
                  target="_blank"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black"
                >
                  Ver preview
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniCard title="Guias cadastrados" value={String(guides.length)} color="bg-white text-gray-900" />
          <MiniCard title="Publicados" value={String(publishedCount)} color="bg-emerald-50 text-emerald-700" />
          <MiniCard title="Rascunhos" value={String(guides.length - publishedCount)} color="bg-amber-50 text-amber-700" />
        </div>

        {error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {error}
          </div>
        ) : null}

        {!error && feedback ? (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
            {feedback}
          </div>
        ) : null}

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-[#1A1A1A]">Guias existentes</h2>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleDeleteAll()}
                disabled={deletingAll || !guides.length}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deletingAll ? "Excluindo..." : "Excluir todos"}
              </button>
              <button
                type="button"
                onClick={() => void loadGuides()}
                disabled={loadingList}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingList ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>
          </div>

          {loadingList ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`guide-skeleton-${index}`} className="overflow-hidden rounded-3xl border border-slate-100 bg-white p-5">
                  <div className="h-40 animate-pulse rounded-2xl bg-gray-100" />
                  <div className="mt-4 h-4 animate-pulse rounded bg-gray-100" />
                  <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-gray-100" />
                  <div className="mt-4 h-10 animate-pulse rounded-xl bg-gray-100" />
                </div>
              ))}
            </div>
          ) : guides.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {guides.map((guide) => {
                const published = guide.is_published || guide.status === "published";
                return (
                  <article
                    key={guide.id}
                    className="overflow-hidden rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"
                  >
                    <div className="relative h-40 overflow-hidden rounded-2xl bg-[#F8FAFC]">
                      {guide.featured_image ? (
                        <Image
                          src={guide.featured_image}
                          alt={guide.title}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400">
                          Sem imagem de capa
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getStatusTone(guide)}`}
                      >
                        {getStatusLabel(guide)}
                      </span>
                      <span className="text-xs text-slate-500">{formatDate(guide.created_at)}</span>
                    </div>

                    <h3 className="mt-3 line-clamp-2 text-base font-bold leading-6 text-[#1A1A1A]">
                      {guide.title}
                    </h3>
                    <p className="mt-2 text-xs text-slate-500">Slug: {guide.slug}</p>
                    {guide.offer_id ? (
                      <p className="mt-2 text-xs font-semibold text-[#9e6a18]">
                        Oferta principal vinculada
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">Sem oferta principal definida</p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handlePublish(guide.id)}
                        disabled={published || publishingId === guide.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-3 py-2 text-xs font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {publishingId === guide.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        {published ? "Publicado" : "Publicar"}
                      </button>

                      <Link
                        href={
                          published
                            ? `/blog/${guide.slug}`
                            : `/admin/blog/preview/${guide.id}`
                        }
                        target="_blank"
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        {published ? "Ver" : "Preview"}
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <Link
                        href={`/admin/blog/editar/${guide.id}`}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        <PenSquare className="h-4 w-4" />
                        Editar
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handlePause(guide.id)}
                        disabled={!published || pausingId === guide.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {pausingId === guide.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <PauseCircle className="h-4 w-4" />
                        )}
                        Pausar
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(guide.id)}
                        disabled={deletingId === guide.id}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === guide.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        Excluir
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openGuideOfferEditor(guide)}
                      className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-[#9e6a18]/20 px-3 py-2 text-xs font-bold text-[#9e6a18] transition hover:bg-[#9e6a18]/5"
                    >
                      Gerenciar ofertas do guia
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 bg-white p-12">
              <div className="mb-4 rounded-full bg-amber-50 p-5">
                <BookOpenText size={32} className="text-[#9e6a18]" />
              </div>
              <h2 className="text-xl font-bold text-[#1A1A1A]">Nenhum guia cadastrado</h2>
              <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
                Gere seu primeiro guia com IA para começar a alimentar o portal editorial.
              </p>
            </div>
          )}
        </div>
      </section>

      {editingGuide ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-5xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-[#1A1A1A]">Gerenciar ofertas fixas do guia</h3>
                <p className="mt-1 text-sm text-slate-500">{editingGuide.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingGuide(null);
                  setEditingOfferQuery("");
                  setEditingOfferResults([]);
                  setGuideOffers([]);
                }}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr]">
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-[#FAF8F5] p-4">
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">Ofertas fixas atuais</p>
                  <p className="text-xs text-slate-500">
                    Defina uma oferta principal, reordene e remova itens antes de salvar.
                  </p>
                </div>

                {loadingGuideOffers ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando ofertas do guia...
                  </div>
                ) : guideOffers.length > 0 ? (
                  <div className="space-y-3">
                    {guideOffers.map((offer, index) => (
                      <div
                        key={`${editingGuide.id}-${offer.offer_id}`}
                        className="rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-[#F8FAFC]">
                            {offer.image_url ? (
                              <Image
                                src={offer.image_url}
                                alt={offer.title}
                                fill
                                className="object-contain"
                                unoptimized
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                                Sem imagem
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {offer.is_primary ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                                  <Star className="h-3 w-3" />
                                  Principal
                                </span>
                              ) : null}
                              <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                #{index + 1}
                              </span>
                            </div>
                            <p className="mt-2 line-clamp-2 text-sm font-semibold text-[#1A1A1A]">
                              {offer.title}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {offer.marketplace || "Marketplace"} • {formatBRL(offer.price)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPrimaryGuideOffer(offer.offer_id)}
                            className="rounded-xl border border-amber-200 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50"
                          >
                            Definir principal
                          </button>
                          <button
                            type="button"
                            onClick={() => moveGuideOffer(offer.offer_id, -1)}
                            disabled={index === 0}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveGuideOffer(offer.offer_id, 1)}
                            disabled={index === guideOffers.length - 1}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGuideOffer(offer.offer_id)}
                            className="rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-700 hover:bg-red-50"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Nenhuma oferta fixa cadastrada neste guia.
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-2xl border border-slate-200 bg-[#FAF8F5] p-4">
                <div>
                  <p className="text-sm font-bold text-[#1A1A1A]">Adicionar novas ofertas</p>
                  <p className="text-xs text-slate-500">
                    Busque ofertas ativas e monte a vitrine fixa deste guia.
                  </p>
                </div>

                <div className="flex flex-col gap-3 md:flex-row">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 text-slate-400" size={18} />
                    <input
                      type="text"
                      value={editingOfferQuery}
                      onChange={(event) => setEditingOfferQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void searchOffersForGuide();
                        }
                      }}
                      placeholder="Buscar ofertas para adicionar ao guia"
                      className="w-full rounded-2xl border border-gray-100 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:ring-2 focus:ring-[#9e6a18]/20"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void searchOffersForGuide()}
                    disabled={loadingEditingOffers}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingEditingOffers ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                    Buscar ofertas
                  </button>
                </div>

                <div className="space-y-3">
                  {editingOfferResults.map((offer) => {
                    const alreadyAdded = guideOffers.some((item) => item.offer_id === offer.id);
                    return (
                      <div
                        key={`${editingGuide.id}-search-${offer.id}`}
                        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                      >
                        <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-[#F8FAFC]">
                          {offer.image_url ? (
                            <Image
                              src={offer.image_url}
                              alt={offer.title}
                              fill
                              className="object-contain"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-[10px] text-slate-400">
                              Sem imagem
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-semibold text-[#1A1A1A]">
                            {offer.title}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {offer.marketplace || "Marketplace"} • {formatBRL(offer.price)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addOfferToGuide(offer)}
                          disabled={alreadyAdded}
                          className="rounded-xl bg-[#1A1A1A] px-3 py-2 text-xs font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {alreadyAdded ? "Adicionada" : "Adicionar"}
                        </button>
                      </div>
                    );
                  })}
                  {!loadingEditingOffers && !editingOfferResults.length ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-sm text-slate-500">
                      Busque ofertas para adicionar ao guia.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingGuide(null);
                  setEditingOfferQuery("");
                  setEditingOfferResults([]);
                  setGuideOffers([]);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveGuideOffers()}
                disabled={savingGuideOffers || loadingGuideOffers}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingGuideOffers ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Salvar ofertas do guia
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MiniCard({ title, value, color }: { title: string; value: string; color: string }) {
  return (
    <div className={`${color} flex flex-col rounded-2xl p-5 shadow-sm`}>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</span>
      <span className="mt-1 text-xl font-black">{value}</span>
    </div>
  );
}
