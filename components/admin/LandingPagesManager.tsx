"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Layers3,
  Loader2,
  Monitor,
  RefreshCw,
  Save,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";

import { supabase } from "@/lib/supabase";

type LandingPageStatus = "draft" | "published" | "archived";

type OfferOption = {
  id: string;
  title: string | null;
  marketplace: string | null;
  price: number | string | null;
  old_price: number | string | null;
  image_url: string | null;
  affiliate_url: string | null;
  updated_at: string | null;
};

type LandingPageRow = {
  id: string;
  title: string;
  slug: string;
  status: LandingPageStatus;
  offer_id: string | null;
  marketplace: string | null;
  headline: string;
  subheadline: string | null;
  badge_text: string | null;
  hero_image_url: string | null;
  hero_video_url: string | null;
  product_title: string | null;
  product_price: number | null;
  product_old_price: number | null;
  affiliate_url: string;
  site_url: string | null;
  group_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  instagram_url: string | null;
  telegram_url: string | null;
  whatsapp_url: string | null;
  primary_cta_label: string;
  group_cta_label: string;
  site_cta_label: string;
  price_note: string | null;
  benefits: string[] | null;
  technical_details: string[] | null;
  social_proof: string[] | null;
  disclaimer: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type LandingPagesResponse = {
  landingPages?: LandingPageRow[];
  offers?: OfferOption[];
  success?: boolean;
  id?: string;
  slug?: string;
  status?: LandingPageStatus;
  error?: string;
};

type GeneratedLandingCopy = {
  title?: string;
  headline?: string;
  subheadline?: string;
  badge_text?: string;
  product_title?: string;
  primary_cta_label?: string;
  group_cta_label?: string;
  site_cta_label?: string;
  price_note?: string;
  benefits?: string[];
  technical_details?: string[];
  social_proof?: string[];
  disclaimer?: string;
  creative_angle?: string;
  ad_primary_text?: string;
  ad_headline?: string;
  ad_description?: string;
};

type CampaignMode = "product_champion" | "flash_offer" | "group_capture";

type AdCopyState = {
  creative_angle: string;
  ad_primary_text: string;
  ad_headline: string;
  ad_description: string;
};

type CampaignBreakdown = {
  value: string;
  clicks: number;
};

type LandingAnalyticsRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  totalClicks: number;
  lastClickAt: string | null;
  ctaBreakdown: Array<{ ctaType: string; count: number }>;
  topCampaign: string;
  topSource: string;
};

type RecentLandingClick = {
  id: string;
  landingPageId: string;
  title: string;
  slug: string;
  ctaType: string;
  campaign: string;
  source: string;
  createdAt: string;
  destinationUrl: string;
};

type LandingAnalyticsResponse = {
  summary?: {
    totalClicks: number;
    affiliateClicks: number;
    groupClicks: number;
    siteClicks: number;
    socialClicks: number;
    otherClicks: number;
    activeLandings: number;
    lastClickAt: string | null;
  };
  filters?: {
    period: string;
    campaign: string;
    campaigns: CampaignBreakdown[];
  };
  byLanding?: LandingAnalyticsRow[];
  recentClicks?: RecentLandingClick[];
  error?: string;
};

type FormState = {
  title: string;
  offer_id: string;
  marketplace: string;
  headline: string;
  subheadline: string;
  badge_text: string;
  hero_image_url: string;
  hero_video_url: string;
  product_title: string;
  product_price: string;
  product_old_price: string;
  affiliate_url: string;
  site_url: string;
  group_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  instagram_url: string;
  telegram_url: string;
  whatsapp_url: string;
  primary_cta_label: string;
  group_cta_label: string;
  site_cta_label: string;
  price_note: string;
  benefits: string;
  technical_details: string;
  social_proof: string;
  disclaimer: string;
  status: LandingPageStatus;
};

const INITIAL_FORM: FormState = {
  title: "",
  offer_id: "",
  marketplace: "",
  headline: "",
  subheadline: "",
  badge_text: "Oferta campeã do Radar Smart",
  hero_image_url: "",
  hero_video_url: "",
  product_title: "",
  product_price: "",
  product_old_price: "",
  affiliate_url: "",
  site_url: "https://radarsmart.com.br/ofertas",
  group_url:
    process.env.NEXT_PUBLIC_WHATSAPP_GROUP_URL ??
    "https://chat.whatsapp.com/G5fdVL51Zr94XDoqOexP9d",
  utm_source: "",
  utm_medium: "paid_social",
  utm_campaign: "",
  utm_content: "",
  instagram_url: "",
  telegram_url: "",
  whatsapp_url: "",
  primary_cta_label: "Quero ver a oferta e comprar com segurança",
  group_cta_label: "Entrar grátis no Grupo VIP",
  site_cta_label: "Conhecer o Radar Smart",
  price_note: "",
  benefits: "",
  technical_details: "",
  social_proof: "",
  disclaimer:
    "Oferta e condições sujeitas a alteração pelo lojista. Este conteúdo pode conter link de afiliado.",
  status: "draft",
};

const STATUS_LABEL: Record<LandingPageStatus, string> = {
  draft: "Rascunho",
  published: "Publicada",
  archived: "Arquivada",
};

function toText(value: unknown): string {
  return String(value ?? "").trim();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatBRL(value?: number | string | null) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(numeric);
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return token;
}

function statusBadgeClass(status: LandingPageStatus) {
  if (status === "published") return "bg-emerald-50 text-emerald-700";
  if (status === "archived") return "bg-slate-100 text-slate-600";
  return "bg-amber-50 text-amber-700";
}

export default function LandingPagesManager() {
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingCopy, setGeneratingCopy] = useState(false);
  const [campaignMode, setCampaignMode] = useState<CampaignMode>("product_champion");
  const [adCopy, setAdCopy] = useState<AdCopyState>({
    creative_angle: "",
    ad_primary_text: "",
    ad_headline: "",
    ad_description: "",
  });
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState("");
  const [savedSlug, setSavedSlug] = useState("");
  const [savedStatus, setSavedStatus] = useState<LandingPageStatus>("draft");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [exportingCsv, setExportingCsv] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState("7");
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [analytics, setAnalytics] = useState<LandingAnalyticsResponse>({
    summary: {
      totalClicks: 0,
      affiliateClicks: 0,
      groupClicks: 0,
      siteClicks: 0,
      socialClicks: 0,
      otherClicks: 0,
      activeLandings: 0,
      lastClickAt: null,
    },
    filters: {
      period: "7",
      campaign: "",
      campaigns: [],
    },
    byLanding: [],
    recentClicks: [],
  });

  async function loadLandingPages() {
    setLoading(true);
    setError("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/landing-pages", {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json()) as LandingPagesResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar landing pages.");
      }

      setLandingPages(Array.isArray(payload.landingPages) ? payload.landingPages : []);
      setOffers(Array.isArray(payload.offers) ? payload.offers : []);
    } catch (err) {
      setLandingPages([]);
      setOffers([]);
      setError(err instanceof Error ? err.message : "Falha ao carregar landing pages.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLandingPages();
  }, []);

  const loadAnalytics = useCallback(async (period: string, campaign: string) => {
    setAnalyticsLoading(true);
    setAnalyticsError("");

    try {
      const accessToken = await getAccessToken();
      const query = new URLSearchParams();
      query.set("period", period);
      if (campaign) query.set("campaign", campaign);

      const response = await fetch(`/api/admin/landing-pages/analytics?${query.toString()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const payload = (await response.json()) as LandingAnalyticsResponse;
      if (!response.ok) {
        throw new Error(payload.error || "Falha ao carregar analytics das landing pages.");
      }

      setAnalytics(payload);
    } catch (err) {
      setAnalytics({
        summary: {
          totalClicks: 0,
          affiliateClicks: 0,
          groupClicks: 0,
          siteClicks: 0,
          socialClicks: 0,
          otherClicks: 0,
          activeLandings: 0,
          lastClickAt: null,
        },
        filters: {
          period,
          campaign,
          campaigns: [],
        },
        byLanding: [],
        recentClicks: [],
      });
      setAnalyticsError(
        err instanceof Error ? err.message : "Falha ao carregar analytics das landing pages.",
      );
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics(selectedPeriod, selectedCampaign);
  }, [loadAnalytics, selectedCampaign, selectedPeriod]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function applyOfferTemplate(offerId: string) {
    updateField("offer_id", offerId);

    const offer = offers.find((item) => item.id === offerId);
    if (!offer) return;

    setForm((current) => ({
      ...current,
      offer_id: offer.id,
      title: current.title || toText(offer.title),
      marketplace: current.marketplace || toText(offer.marketplace),
      headline: current.headline || `Oferta campeã: ${toText(offer.title)}`,
      product_title: current.product_title || toText(offer.title),
      product_price: current.product_price || (offer.price ? String(offer.price) : ""),
      product_old_price:
        current.product_old_price || (offer.old_price ? String(offer.old_price) : ""),
      affiliate_url: current.affiliate_url || toText(offer.affiliate_url),
      hero_image_url: current.hero_image_url || toText(offer.image_url),
    }));
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setEditingId(null);
    setSavedId("");
    setSavedSlug("");
    setSavedStatus("draft");
    setCampaignMode("product_champion");
    setAdCopy({
      creative_angle: "",
      ad_primary_text: "",
      ad_headline: "",
      ad_description: "",
    });
  }

  async function handleGenerateAiCopy() {
    setGeneratingCopy(true);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/landing-pages/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...form,
          campaign_mode: campaignMode,
        }),
      });

      const payload = (await response.json()) as {
        generated?: GeneratedLandingCopy;
        error?: string;
      };

      if (!response.ok || !payload.generated) {
        throw new Error(payload.error || "Falha ao gerar copy com IA.");
      }

      const generated = payload.generated;
      setForm((current) => ({
        ...current,
        title: generated.title || current.title,
        headline: generated.headline || current.headline,
        subheadline: generated.subheadline || current.subheadline,
        badge_text: generated.badge_text || current.badge_text,
        product_title: generated.product_title || current.product_title,
        primary_cta_label: generated.primary_cta_label || current.primary_cta_label,
        group_cta_label: generated.group_cta_label || current.group_cta_label,
        site_cta_label: generated.site_cta_label || current.site_cta_label,
        price_note: generated.price_note || current.price_note,
        benefits:
          Array.isArray(generated.benefits) && generated.benefits.length > 0
            ? generated.benefits.join("\n")
            : current.benefits,
        technical_details:
          Array.isArray(generated.technical_details) && generated.technical_details.length > 0
            ? generated.technical_details.join("\n")
            : current.technical_details,
        social_proof:
          Array.isArray(generated.social_proof) && generated.social_proof.length > 0
            ? generated.social_proof.join("\n")
            : current.social_proof,
        disclaimer: generated.disclaimer || current.disclaimer,
      }));
      setAdCopy({
        creative_angle: generated.creative_angle || "",
        ad_primary_text: generated.ad_primary_text || "",
        ad_headline: generated.ad_headline || "",
        ad_description: generated.ad_description || "",
      });

      setFeedback("Copy da landing page e anúncio gerada com IA. Revise o texto antes de salvar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar copy com IA.");
    } finally {
      setGeneratingCopy(false);
    }
  }

  async function handleCopyText(label: string, value: string) {
    if (!value.trim()) {
      setError(`Nenhum conteúdo disponível para copiar em "${label}".`);
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setError("");
      setFeedback(`${label} copiado para a área de transferência.`);
    } catch {
      setError(`Não foi possível copiar "${label}".`);
    }
  }

  async function handleCopyPublicUrl(slug: string) {
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "https://radarsmart.com.br";
      const url = `${origin}/lp/${slug}`;
      await navigator.clipboard.writeText(url);
      setError("");
      setFeedback("URL pública copiada para a área de transferência.");
    } catch {
      setError("Não foi possível copiar a URL pública.");
    }
  }

  async function handleExportCsv() {
    setExportingCsv(true);
    setAnalyticsError("");

    try {
      const accessToken = await getAccessToken();
      const query = new URLSearchParams();
      query.set("period", selectedPeriod);
      if (selectedCampaign) query.set("campaign", selectedCampaign);

      const response = await fetch(
        `/api/admin/landing-pages/analytics/export?${query.toString()}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "Falha ao exportar CSV.");
      }

      const csv = await response.text();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `landing-pages-clicks-${selectedPeriod}d${selectedCampaign ? `-${selectedCampaign}` : ""}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setAnalyticsError(err instanceof Error ? err.message : "Falha ao exportar CSV.");
    } finally {
      setExportingCsv(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setFeedback("");

    try {
      const currentEditingId = editingId;
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/landing-pages", {
        method: currentEditingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...(currentEditingId ? { id: currentEditingId } : {}),
          ...form,
          offer_id: form.offer_id || null,
          benefits: form.benefits,
          technical_details: form.technical_details,
          social_proof: form.social_proof,
        }),
      });

      const payload = (await response.json()) as LandingPagesResponse;
      if (!response.ok || !payload.success || !payload.slug || !payload.status) {
        throw new Error(payload.error || "Falha ao salvar landing page.");
      }

      const nextStatus = payload.status as LandingPageStatus;

      if (currentEditingId) {
        setEditingId(currentEditingId);
        setSavedId(payload.id ?? currentEditingId);
        setSavedSlug(payload.slug);
        setSavedStatus(nextStatus);
        setForm((current) => ({
          ...current,
          status: nextStatus,
        }));
        setFeedback("Landing page atualizada com sucesso.");
      } else {
        setFeedback("Landing page criada com sucesso.");
        resetForm();
        setSavedId(payload.id ?? "");
        setSavedSlug(payload.slug);
        setSavedStatus(nextStatus);
      }
      await Promise.all([loadLandingPages(), loadAnalytics(selectedPeriod, selectedCampaign)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar landing page.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(page: LandingPageRow) {
    setEditingId(page.id);
    setSavedId(page.id);
    setSavedSlug(page.slug);
    setSavedStatus(page.status);
    setAdCopy({
      creative_angle: "",
      ad_primary_text: "",
      ad_headline: "",
      ad_description: "",
    });
    setError("");
    setFeedback(`Editando: ${page.title}`);
    setForm({
      title: page.title,
      offer_id: page.offer_id ?? "",
      marketplace: page.marketplace ?? "",
      headline: page.headline,
      subheadline: page.subheadline ?? "",
      badge_text: page.badge_text ?? "",
      hero_image_url: page.hero_image_url ?? "",
      hero_video_url: page.hero_video_url ?? "",
      product_title: page.product_title ?? "",
      product_price: page.product_price ? String(page.product_price) : "",
      product_old_price: page.product_old_price ? String(page.product_old_price) : "",
      affiliate_url: page.affiliate_url,
      site_url: page.site_url ?? "",
      group_url: page.group_url ?? "",
      utm_source: page.utm_source ?? "",
      utm_medium: page.utm_medium ?? "",
      utm_campaign: page.utm_campaign ?? "",
      utm_content: page.utm_content ?? "",
      instagram_url: page.instagram_url ?? "",
      telegram_url: page.telegram_url ?? "",
      whatsapp_url: page.whatsapp_url ?? "",
      primary_cta_label: page.primary_cta_label,
      group_cta_label: page.group_cta_label,
      site_cta_label: page.site_cta_label,
      price_note: page.price_note ?? "",
      benefits: Array.isArray(page.benefits) ? page.benefits.join("\n") : "",
      technical_details: Array.isArray(page.technical_details)
        ? page.technical_details.join("\n")
        : "",
      social_proof: Array.isArray(page.social_proof) ? page.social_proof.join("\n") : "",
      disclaimer: page.disclaimer ?? "",
      status: page.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleToggleStatus(page: LandingPageRow) {
    const nextStatus: LandingPageStatus = page.status === "published" ? "draft" : "published";
    setUpdatingId(page.id);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/landing-pages", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: page.id, status: nextStatus }),
      });

      const payload = (await response.json()) as LandingPagesResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao atualizar status.");
      }

      setFeedback(
        nextStatus === "published"
          ? "Landing page publicada com sucesso."
          : "Landing page movida para rascunho.",
      );
      await Promise.all([loadLandingPages(), loadAnalytics(selectedPeriod, selectedCampaign)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(page: LandingPageRow) {
    const confirmed = window.confirm(`Excluir a landing "${page.title}"?`);
    if (!confirmed) return;

    setUpdatingId(page.id);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/landing-pages", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ id: page.id }),
      });

      const payload = (await response.json()) as LandingPagesResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao excluir landing page.");
      }

      if (editingId === page.id) {
        resetForm();
      }

      setFeedback("Landing page excluida com sucesso.");
      await Promise.all([loadLandingPages(), loadAnalytics(selectedPeriod, selectedCampaign)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao excluir landing page.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDuplicate(page: LandingPageRow) {
    setUpdatingId(page.id);
    setError("");
    setFeedback("");

    try {
      const accessToken = await getAccessToken();
      const response = await fetch("/api/admin/landing-pages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ duplicate_from_id: page.id }),
      });

      const payload = (await response.json()) as LandingPagesResponse;
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Falha ao duplicar landing page.");
      }

      setFeedback("Landing page duplicada com sucesso.");
      await Promise.all([loadLandingPages(), loadAnalytics(selectedPeriod, selectedCampaign)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao duplicar landing page.");
    } finally {
      setUpdatingId(null);
    }
  }

  const stats = useMemo(() => {
    const total = landingPages.length;
    const published = landingPages.filter((page) => page.status === "published").length;
    const drafts = landingPages.filter((page) => page.status === "draft").length;
    return { total, published, drafts };
  }, [landingPages]);

  const analyticsByLanding = useMemo(
    () => new Map((analytics.byLanding ?? []).map((item) => [item.id, item])),
    [analytics.byLanding],
  );

  return (
    <div className="min-h-screen flex-1 space-y-8 bg-[#F5F1ED] p-8 pt-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight text-[#1A1A1A]">
            <Layers3 className="text-[#9e6a18]" />
            Landing Pages
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-600">
            Crie páginas de conversão para campanhas pagas, produtos campeões e captação para o grupo.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void Promise.all([loadLandingPages(), loadAnalytics(selectedPeriod, selectedCampaign)])
          }
          disabled={loading || analyticsLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
        >
          <RefreshCw className={`h-4 w-4 ${loading || analyticsLoading ? "animate-spin" : ""}`} />
          {loading || analyticsLoading ? "Atualizando..." : "Atualizar lista"}
        </button>
      </div>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="flex items-center gap-2 text-2xl font-bold text-[#1A1A1A]">
          <FileText className="h-5 w-5 text-[#9e6a18]" />
          {editingId ? "Editar landing page" : "Nova landing page"}
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Monte a estrutura da campanha com headline, hero, CTA de compra, CTA para grupo e prova social.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Use a IA para montar a copy inicial da campanha a partir dos dados do produto, preço e marketplace.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Modo da campanha
            </label>
            <select
              value={campaignMode}
              onChange={(event) => setCampaignMode(event.target.value as CampaignMode)}
              className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm font-semibold outline-none"
            >
              <option value="product_champion">Produto campeão</option>
              <option value="flash_offer">Oferta relâmpago</option>
              <option value="group_capture">Captação para grupo</option>
            </select>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-[#FCFCFD] px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Como a IA vai responder</p>
            <p className="mt-1">
              O modo selecionado ajusta o ângulo da copy, o foco dos CTAs e também o texto do anúncio para tráfego pago.
            </p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Título interno"
            value={form.title}
            onChange={(value) => updateField("title", value)}
            placeholder="Ex: Rodo magnético dupla face para janelas"
          />
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Oferta vinculada
            </label>
            <select
              value={form.offer_id}
              onChange={(event) => applyOfferTemplate(event.target.value)}
              className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm font-semibold outline-none"
            >
              <option value="">Sem vínculo com oferta</option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {toText(offer.title) || "Oferta sem título"} - {toText(offer.marketplace) || "Marketplace"}
                </option>
              ))}
            </select>
          </div>

          <Field
            label="Headline"
            value={form.headline}
            onChange={(value) => updateField("headline", value)}
            placeholder="Ex: Cansado de arriscar a vida para limpar janelas?"
          />
          <Field
            label="Subheadline"
            value={form.subheadline}
            onChange={(value) => updateField("subheadline", value)}
            placeholder="Ex: A solução segura, rápida e barata que está viralizando."
          />

          <Field
            label="Marketplace"
            value={form.marketplace}
            onChange={(value) => updateField("marketplace", value)}
            placeholder="Ex: Mercado Livre"
          />
          <Field
            label="Badge superior"
            value={form.badge_text}
            onChange={(value) => updateField("badge_text", value)}
            placeholder="Ex: Oferta campeã do Radar Smart"
          />

          <Field
            label="Hero image"
            value={form.hero_image_url}
            onChange={(value) => updateField("hero_image_url", value)}
            placeholder="https://..."
          />
          <Field
            label="Hero video"
            value={form.hero_video_url}
            onChange={(value) => updateField("hero_video_url", value)}
            placeholder="https://..."
          />

          <Field
            label="Título do produto"
            value={form.product_title}
            onChange={(value) => updateField("product_title", value)}
            placeholder="Ex: Rodo Mágico Magnético Dupla Face"
          />
          <Field
            label="Link afiliado"
            value={form.affiliate_url}
            onChange={(value) => updateField("affiliate_url", value)}
            placeholder="https://..."
          />

          <Field
            label="Preço atual"
            value={form.product_price}
            onChange={(value) => updateField("product_price", value)}
            placeholder="Ex: 24,90"
          />
          <Field
            label="Preço antigo"
            value={form.product_old_price}
            onChange={(value) => updateField("product_old_price", value)}
            placeholder="Ex: 39,90"
          />

          <Field
            label="Site Radar Smart"
            value={form.site_url}
            onChange={(value) => updateField("site_url", value)}
            placeholder="https://radarsmart.com.br/ofertas"
          />
          <Field
            label="Link do grupo"
            value={form.group_url}
            onChange={(value) => updateField("group_url", value)}
            placeholder="https://chat.whatsapp.com/..."
          />

          <Field
            label="UTM source"
            value={form.utm_source}
            onChange={(value) => updateField("utm_source", value)}
            placeholder="Ex: facebook"
          />
          <Field
            label="UTM medium"
            value={form.utm_medium}
            onChange={(value) => updateField("utm_medium", value)}
            placeholder="Ex: paid_social"
          />

          <Field
            label="UTM campaign"
            value={form.utm_campaign}
            onChange={(value) => updateField("utm_campaign", value)}
            placeholder="Ex: janela-magnetica-abril"
          />
          <Field
            label="UTM content"
            value={form.utm_content}
            onChange={(value) => updateField("utm_content", value)}
            placeholder="Ex: criativo-video-01"
          />

          <Field
            label="Instagram"
            value={form.instagram_url}
            onChange={(value) => updateField("instagram_url", value)}
            placeholder="https://instagram.com/..."
          />
          <Field
            label="Telegram"
            value={form.telegram_url}
            onChange={(value) => updateField("telegram_url", value)}
            placeholder="https://t.me/..."
          />

          <Field
            label="WhatsApp"
            value={form.whatsapp_url}
            onChange={(value) => updateField("whatsapp_url", value)}
            placeholder="https://wa.me/..."
          />
          <div className="space-y-2">
            <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
              Status
            </label>
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as LandingPageStatus)}
              className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm font-semibold outline-none"
            >
              <option value="draft">Rascunho</option>
              <option value="published">Publicada</option>
              <option value="archived">Arquivada</option>
            </select>
          </div>

          <Field
            label="CTA principal"
            value={form.primary_cta_label}
            onChange={(value) => updateField("primary_cta_label", value)}
            placeholder="Ex: Quero ver a oferta e comprar com seguranca"
          />
          <Field
            label="CTA grupo"
            value={form.group_cta_label}
            onChange={(value) => updateField("group_cta_label", value)}
            placeholder="Ex: Entrar grátis no Grupo VIP"
          />

          <Field
            label="CTA site"
            value={form.site_cta_label}
            onChange={(value) => updateField("site_cta_label", value)}
            placeholder="Ex: Conhecer o Radar Smart"
          />
          <Field
            label="Observação de preço"
            value={form.price_note}
            onChange={(value) => updateField("price_note", value)}
            placeholder="Ex: Oferta por tempo limitado"
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <TextAreaField
            label="Benefícios"
            value={form.benefits}
            onChange={(value) => updateField("benefits", value)}
            placeholder={"Uma linha por benefício.\nEx: Segurança em primeiro lugar\nEx: Limpeza dupla face"}
          />
          <TextAreaField
            label="Detalhes técnicos"
            value={form.technical_details}
            onChange={(value) => updateField("technical_details", value)}
            placeholder={"Uma linha por detalhe.\nEx: Ideal para vidros de 3 mm a 8 mm\nEx: Design triangular para cantos"}
          />
          <TextAreaField
            label="Prova social"
            value={form.social_proof}
            onChange={(value) => updateField("social_proof", value)}
            placeholder={"Uma linha por prova social.\nEx: Avaliação média de 4,7 estrelas\nEx: Centenas de compras confirmadas"}
          />
          <TextAreaField
            label="Disclaimer"
            value={form.disclaimer}
            onChange={(value) => updateField("disclaimer", value)}
            placeholder="Aviso de afiliado, validade de oferta e observacoes regulatorias."
            rows={3}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleGenerateAiCopy()}
            disabled={generatingCopy}
            className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {generatingCopy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {generatingCopy ? "Gerando copy com IA..." : "Gerar copy com IA"}
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : editingId ? "Atualizar landing" : "Salvar landing"}
          </button>

          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
            >
              Cancelar edição
            </button>
          ) : null}

          {savedSlug && savedStatus === "published" ? (
            <Link
              href={`/lp/${savedSlug}`}
              target="_blank"
              className="inline-flex items-center gap-2 rounded-xl border border-[#1A1A1A] bg-white px-5 py-3 text-sm font-semibold text-[#1A1A1A] transition hover:bg-slate-50"
            >
              Ver página pública
              <ExternalLink className="h-4 w-4" />
            </Link>
          ) : null}
          {savedId ? (
            <>
              <Link
                href={`/admin/landing-pages/preview/${savedId}?viewport=desktop`}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                <Monitor className="h-4 w-4" />
                Preview desktop
              </Link>
              <Link
                href={`/admin/landing-pages/preview/${savedId}?viewport=mobile`}
                target="_blank"
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
              >
                <Smartphone className="h-4 w-4" />
                Preview mobile
              </Link>
            </>
          ) : null}
          {savedSlug && savedStatus === "published" ? (
            <button
              type="button"
              onClick={() => void handleCopyPublicUrl(savedSlug)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
            >
              <Copy className="h-4 w-4" />
              Copiar URL pública
            </button>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Rascunhos não abrem em <span className="font-semibold">/lp/[slug]</span>. Use o preview para revisar antes de publicar.
        </p>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1A1A]">Copy do anúncio</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use este bloco para levar a copy da landing para Meta Ads, Google Ads ou criativos de teste.
            </p>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-violet-700">
            {campaignMode === "flash_offer"
              ? "Oferta relâmpago"
              : campaignMode === "group_capture"
                ? "Captação para grupo"
                : "Produto campeão"}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-[#FCFCFD] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Ângulo criativo
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {adCopy.creative_angle || "Gere a copy com IA para preencher o ângulo criativo da campanha."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyText("Ângulo criativo", adCopy.creative_angle)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-[#FCFCFD] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Headline do anúncio
                </p>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-900">
                  {adCopy.ad_headline || "A headline do anúncio aparecerá aqui."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyText("Headline do anúncio", adCopy.ad_headline)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-[#FCFCFD] p-4 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Texto principal do anúncio
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {adCopy.ad_primary_text || "O texto principal do anúncio aparecerá aqui após a geração com IA."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyText("Texto principal do anúncio", adCopy.ad_primary_text)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-[#FCFCFD] p-4 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                  Descrição complementar
                </p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {adCopy.ad_description || "A descrição complementar do anúncio aparecerá aqui."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyText("Descrição complementar", adCopy.ad_description)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MiniCard title="Landing pages" value={String(stats.total)} color="bg-white text-gray-900" />
        <MiniCard title="Publicadas" value={String(stats.published)} color="bg-emerald-50 text-emerald-700" />
        <MiniCard title="Rascunhos" value={String(stats.drafts)} color="bg-amber-50 text-amber-700" />
      </div>

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-bold text-[#1A1A1A]">
              <BarChart3 className="h-5 w-5 text-[#9e6a18]" />
              Analytics das landing pages
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe cliques por CTA, campanha e performance das páginas publicadas.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                Período
              </label>
              <select
                value={selectedPeriod}
                onChange={(event) => setSelectedPeriod(event.target.value)}
                className="w-full min-w-[180px] rounded-2xl border border-gray-100 px-4 py-3 text-sm font-semibold outline-none"
              >
                <option value="1">Últimas 24 horas</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="all">Todo o período</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
                Campanha UTM
              </label>
              <select
                value={selectedCampaign}
                onChange={(event) => setSelectedCampaign(event.target.value)}
                className="w-full min-w-[220px] rounded-2xl border border-gray-100 px-4 py-3 text-sm font-semibold outline-none"
              >
                <option value="">Todas as campanhas</option>
                {(analytics.filters?.campaigns ?? []).map((campaign) => (
                  <option key={campaign.value} value={campaign.value}>
                    {campaign.value} ({campaign.clicks})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExportCsv()}
            disabled={exportingCsv || analyticsLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {exportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {exportingCsv ? "Exportando CSV..." : "Exportar CSV dos cliques"}
          </button>
          <p className="text-xs text-slate-500">
            O arquivo segue os filtros de período e campanha aplicados acima.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
          <MiniCard
            title="Cliques totais"
            value={String(analytics.summary?.totalClicks ?? 0)}
            color="bg-slate-50 text-slate-900"
          />
          <MiniCard
            title="Compra"
            value={String(analytics.summary?.affiliateClicks ?? 0)}
            color="bg-emerald-50 text-emerald-700"
          />
          <MiniCard
            title="Grupo"
            value={String(analytics.summary?.groupClicks ?? 0)}
            color="bg-blue-50 text-blue-700"
          />
          <MiniCard
            title="Site"
            value={String(analytics.summary?.siteClicks ?? 0)}
            color="bg-amber-50 text-amber-700"
          />
          <MiniCard
            title="Social"
            value={String(analytics.summary?.socialClicks ?? 0)}
            color="bg-fuchsia-50 text-fuchsia-700"
          />
          <MiniCard
            title="Último clique"
            value={analytics.summary?.lastClickAt ? formatDate(analytics.summary.lastClickAt) : "-"}
            color="bg-white text-slate-900"
          />
        </div>

        {analyticsError ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {analyticsError}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-100 bg-[#FCFCFD] p-5">
            <h3 className="text-lg font-bold text-[#1A1A1A]">Landings mais clicadas</h3>
            <p className="mt-1 text-sm text-slate-500">Resumo por página, CTA dominante e campanha principal.</p>

            {analyticsLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={`analytics-skeleton-${index}`} className="h-20 animate-pulse rounded-2xl bg-slate-200/60" />
                ))}
              </div>
            ) : (analytics.byLanding?.length ?? 0) > 0 ? (
              <div className="mt-4 space-y-3">
                {(analytics.byLanding ?? []).slice(0, 8).map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[#1A1A1A]">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">/lp/{item.slug || "-"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-black text-[#1A1A1A]">{item.totalClicks}</p>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">cliques</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
                      {item.ctaBreakdown.slice(0, 4).map((cta) => (
                        <span key={`${item.id}-${cta.ctaType}`} className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                          {cta.ctaType}: {cta.count}
                        </span>
                      ))}
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600 md:grid-cols-3">
                      <p><span className="font-semibold text-slate-900">Último clique:</span> {formatDate(item.lastClickAt)}</p>
                      <p><span className="font-semibold text-slate-900">Campanha:</span> {item.topCampaign}</p>
                      <p><span className="font-semibold text-slate-900">Origem:</span> {item.topSource}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Nenhum clique registrado neste filtro.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-100 bg-[#FCFCFD] p-5">
            <h3 className="text-lg font-bold text-[#1A1A1A]">Cliques recentes</h3>
              <p className="mt-1 text-sm text-slate-500">Últimas interações registradas nas landing pages.</p>

            {analyticsLoading ? (
              <div className="mt-4 space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={`recent-click-skeleton-${index}`} className="h-16 animate-pulse rounded-2xl bg-slate-200/60" />
                ))}
              </div>
            ) : (analytics.recentClicks?.length ?? 0) > 0 ? (
              <div className="mt-4 space-y-3">
                {(analytics.recentClicks ?? []).slice(0, 10).map((click) => (
                  <div key={click.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#1A1A1A]">{click.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          CTA: {click.ctaType} • campanha: {click.campaign}
                        </p>
                      </div>
                      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        {formatDate(click.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Origem: {click.source} • /lp/{click.slug || "-"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                Nenhum clique recente para exibir.
              </div>
            )}
          </div>
        </div>
      </section>

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

      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-[#1A1A1A]">Páginas criadas</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use esta lista para publicar, pausar e revisar as campanhas ativas.
          </p>
        </div>

        {loading ? (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`landing-skeleton-${index}`} className="rounded-3xl bg-[#F8FAFC] p-5">
                <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
                <div className="mt-4 h-4 animate-pulse rounded bg-gray-200" />
                <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : landingPages.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {landingPages.map((page) => {
              const isBusy = updatingId === page.id;
              const pageHref = `/lp/${page.slug}`;
              const previewDesktopHref = `/admin/landing-pages/preview/${page.id}?viewport=desktop`;
              const previewMobileHref = `/admin/landing-pages/preview/${page.id}?viewport=mobile`;
              const pageAnalytics = analyticsByLanding.get(page.id);

              return (
                <article
                  key={page.id}
                  className="overflow-hidden rounded-3xl border border-slate-100 bg-[#FCFCFD] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl bg-white">
                      {page.hero_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={page.hero_image_url} alt={page.title} className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-xs text-gray-400">Sem hero</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statusBadgeClass(page.status)}`}
                        >
                          {STATUS_LABEL[page.status]}
                        </span>
                        {page.marketplace ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                            {page.marketplace}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-3 line-clamp-2 text-base font-bold leading-6 text-[#1A1A1A]">
                        {page.title}
                      </h3>
                      <p className="mt-2 line-clamp-2 text-sm text-slate-600">{page.headline}</p>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                        <p><span className="font-semibold text-slate-900">Preço:</span> {formatBRL(page.product_price)}</p>
                        <p><span className="font-semibold text-slate-900">Oferta:</span> {page.offer_id ? "Vinculada" : "Manual"}</p>
                        <p><span className="font-semibold text-slate-900">Atualizada:</span> {formatDate(page.updated_at)}</p>
                        <p><span className="font-semibold text-slate-900">Publicada:</span> {formatDate(page.published_at)}</p>
                        <p><span className="font-semibold text-slate-900">Cliques:</span> {pageAnalytics?.totalClicks ?? 0}</p>
                        <p><span className="font-semibold text-slate-900">Último clique:</span> {formatDate(pageAnalytics?.lastClickAt)}</p>
                      </div>

                      {page.utm_campaign ? (
                        <p className="mt-3 text-xs text-slate-500">
                          <span className="font-semibold text-slate-900">UTM campanha:</span> {page.utm_campaign}
                        </p>
                      ) : null}

                      {pageAnalytics?.ctaBreakdown?.length ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pageAnalytics.ctaBreakdown.slice(0, 3).map((cta) => (
                            <span
                              key={`${page.id}-${cta.ctaType}`}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600"
                            >
                              {cta.ctaType}: {cta.count}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {page.status === "published" ? (
                        <Link
                          href={pageHref}
                          target="_blank"
                          className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#9e6a18] hover:underline"
                        >
                          {pageHref}
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      ) : (
                        <p className="mt-4 text-xs font-medium text-slate-500">
                          Rascunho: use o preview para revisar antes de publicar.
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        <Link
                          href={previewDesktopHref}
                          target="_blank"
                          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                        >
                          <Monitor className="h-4 w-4" />
                          Desktop
                        </Link>
                        <Link
                          href={previewMobileHref}
                          target="_blank"
                          className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 transition hover:bg-amber-100"
                        >
                          <Smartphone className="h-4 w-4" />
                          Mobile
                        </Link>
                        {page.status === "published" ? (
                          <button
                            type="button"
                            onClick={() => void handleCopyPublicUrl(page.slug)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                          >
                            <Copy className="h-4 w-4" />
                            Copiar URL
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => handleEdit(page)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A]"
                        >
                          <Edit3 className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDuplicate(page)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-[#1A1A1A] hover:text-[#1A1A1A] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Copy className="h-4 w-4" />
                          Duplicar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleToggleStatus(page)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#1A1A1A] px-4 py-2 text-xs font-bold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                          {page.status === "published" ? "Mover para rascunho" : "Publicar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(page)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-bold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          <Trash2 className="h-4 w-4" />
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-100 bg-[#FCFCFD] p-12">
            <div className="mb-4 rounded-full bg-[#F6C453]/15 p-5">
              <Layers3 size={32} className="text-[#9e6a18]" />
            </div>
            <h2 className="text-xl font-bold text-[#1A1A1A]">Nenhuma landing page criada</h2>
            <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
              Monte a primeira página acima para usar em campanhas pagas e direcionar o tráfego para oferta e grupo.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#1A1A1A]/10"
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <div className="space-y-2">
      <label className="ml-1 text-[10px] font-black uppercase tracking-widest text-gray-400">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full rounded-2xl border border-gray-100 px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[#1A1A1A]/10"
      />
    </div>
  );
}

function MiniCard({
  title,
  value,
  color,
}: {
  title: string;
  value: string;
  color: string;
}) {
  return (
    <div className={`${color} flex flex-col rounded-2xl p-5 shadow-sm`}>
      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">{title}</span>
      <span className="mt-1 text-xl font-black">{value}</span>
    </div>
  );
}
