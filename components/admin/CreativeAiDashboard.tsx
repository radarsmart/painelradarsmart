"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Beaker,
  Brain,
  Clapperboard,
  FlaskConical,
  Film,
  Image as ImageIcon,
  Loader2,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";

import { supabase } from "@/lib/supabase-browser";
import { formatBRL } from "@/lib/formatters";
import { resolveCommercialCreationApprovalValidation } from "@/lib/commercial-video/creation-modes/approval-state";
import type { CommercialCreationApprovalValidation } from "@/lib/commercial-video/creation-modes/approval-state";
import type {
  CommercialContractApprovalState,
  CommercialCreationMode,
  CommercialCreativeContract,
  CommercialPrimaryObjective,
  CommercialStoryboardPreview,
  PresenterPreference,
  ProductUsagePreference,
} from "@/lib/commercial-video/creation-modes/types";
import type { ProductIntelligence } from "@/lib/product-intelligence/types";
import type { CreativeBrief } from "@/lib/creative-brain/types";
import type { CommercialDirection } from "@/lib/commercial-director/types";
import type { CampaignPromptPlan } from "@/lib/prompt-builder/types";
import type {
  CampaignExecutionPlan,
  CanaryResult,
  SceneExecutionResult,
} from "@/lib/generation-orchestrator/types";
import { APPROVED_CANARY_PROVIDER } from "@/lib/generation-orchestrator/canary-guardrails";
import { CommercialFactoryPanel } from "@/components/admin/commercial-video/CommercialFactoryPanel";

type OfferOption = {
  id: string;
  title: string | null;
  marketplace: string | null;
  category: string | null;
  price: number | null;
  image_url: string | null;
};

type CampaignRow = {
  id: string;
  offer_id: string | null;
  product_intelligence_id: string | null;
  name: string;
  status: string;
  selected_framework: string | null;
  selected_angle: string | null;
  creative_brief: CreativeBrief | Record<string, never>;
  created_at: string;
};

const CREATION_MODE_OPTIONS: Array<{
  value: CommercialCreationMode;
  label: string;
  description: string;
}> = [
  {
    value: "PRODUCT_COMMERCIAL",
    label: "Produto em Destaque",
    description: "Produto real, embalagem fiel, demonstracao e oferta.",
  },
  {
    value: "PRESENTER_UGC",
    label: "Apresentadora / UGC",
    description: "Garota Radar com linguagem de achado e prova visual.",
  },
  {
    value: "HYBRID_SALES",
    label: "Hibrido de Vendas",
    description: "Hook com apresentadora, demo de produto, oferta e CTA.",
  },
  {
    value: "TREND_REFERENCE_REMIX",
    label: "Inspirar em Video",
    description: "Extrai mecanica criativa sem copiar pessoa, marca ou cenas.",
  },
];

const DURATION_OPTIONS = [10, 15, 20, 30] as const;

function splitContractLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatCostCents(value: number | null | undefined): string {
  return value === null || value === undefined ? "sem estimativa" : formatBRL(value / 100);
}

function formatUsdCents(value: number | null | undefined): string {
  return value === null || value === undefined ? "sem estimativa" : `US$ ${(value / 100).toFixed(2)}`;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function OverviewCard({
  icon,
  title,
  description,
  badge,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge: string;
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-slate-100 p-2.5">{icon}</div>
        <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {badge}
        </span>
      </div>
      <p className="mt-4 text-sm font-bold text-[#1A1A1A]">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 transition hover:ring-[#9E6A18]/40"
      >
        {content}
      </Link>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">{content}</section>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-[#1A1A1A]">{value || "-"}</p>
    </div>
  );
}

export default function CreativeAiDashboard() {
  const commercialFactoryRef = useRef<HTMLDivElement | null>(null);
  const [offers, setOffers] = useState<OfferOption[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [campaignName, setCampaignName] = useState("");

  const [intelligence, setIntelligence] = useState<ProductIntelligence | null>(null);
  const [campaign, setCampaign] = useState<CampaignRow | null>(null);
  const [brief, setBrief] = useState<CreativeBrief | null>(null);
  const [commercialDirection, setCommercialDirection] = useState<CommercialDirection | null>(null);
  const [promptPlan, setPromptPlan] = useState<CampaignPromptPlan | null>(null);
  const [generationPlan, setGenerationPlan] = useState<
    (CampaignExecutionPlan & { results?: SceneExecutionResult[] }) | null
  >(null);
  const [creationMode, setCreationMode] = useState<CommercialCreationMode>("PRODUCT_COMMERCIAL");
  const [userPrompt, setUserPrompt] = useState("");
  const [targetDuration, setTargetDuration] = useState<number>(15);
  const [customDuration, setCustomDuration] = useState("");
  const [primaryObjective, setPrimaryObjective] = useState<CommercialPrimaryObjective>("PRODUCT_SALE");
  const [tone, setTone] = useState("direto e persuasivo");
  const [visualStyle, setVisualStyle] = useState("Radar Smart premium");
  const [ctaText, setCtaText] = useState("Ver oferta no Radar Smart\nEntrar no Grupo VIP Radar Smart");
  const [mustShowText, setMustShowText] = useState("");
  const [mustSayText, setMustSayText] = useState("");
  const [mustAvoidText, setMustAvoidText] = useState("");
  const [presenterPreference, setPresenterPreference] = useState<PresenterPreference>("AUTO");
  const [productUsagePreference, setProductUsagePreference] = useState<ProductUsagePreference>("AUTO");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [referencePreserveStructure, setReferencePreserveStructure] = useState(true);
  const [referencePreservePacing, setReferencePreservePacing] = useState(true);
  const [referencePreserveHook, setReferencePreserveHook] = useState(true);
  const [referencePreserveCamera, setReferencePreserveCamera] = useState(false);
  const [referencePreserveDemo, setReferencePreserveDemo] = useState(true);
  const [referencePreserveCta, setReferencePreserveCta] = useState(true);
  const [storyboardPreview, setStoryboardPreview] = useState<CommercialStoryboardPreview | null>(null);
  const [creationApprovalState, setCreationApprovalState] =
    useState<CommercialContractApprovalState>("DRAFT");
  const [storyboardApprovalStaleMessage, setStoryboardApprovalStaleMessage] = useState<string | null>(null);

  const [loadingOffers, setLoadingOffers] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [buildingBrief, setBuildingBrief] = useState(false);
  const [buildingDirection, setBuildingDirection] = useState(false);
  const [buildingPrompts, setBuildingPrompts] = useState(false);
  const [preparingGeneration, setPreparingGeneration] = useState(false);
  const [generatingMock, setGeneratingMock] = useState(false);
  const [buildingStoryboard, setBuildingStoryboard] = useState(false);
  const [updatingStoryboardApproval, setUpdatingStoryboardApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [canaryOpenSceneId, setCanaryOpenSceneId] = useState<string | null>(null);
  const [canaryMaxCostBRL, setCanaryMaxCostBRL] = useState("1.00");
  const [canaryConfirmed, setCanaryConfirmed] = useState(false);
  const [canaryAcknowledgeUnknownCost, setCanaryAcknowledgeUnknownCost] = useState(false);
  const [canaryDryRun, setCanaryDryRun] = useState(true);
  const [canaryRunning, setCanaryRunning] = useState(false);
  const [canaryResults, setCanaryResults] = useState<Record<string, CanaryResult>>({});
  const [canaryError, setCanaryError] = useState<string | null>(null);

  const [officialCharacterName, setOfficialCharacterName] = useState<string | null>(null);
  const [referencesCount, setReferencesCount] = useState(0);
  const [brandAssetStatus, setBrandAssetStatus] = useState({
    logo: false,
    logoTransparent: false,
    videoOutro: false,
  });

  useEffect(() => {
    async function loadInitialData() {
      try {
        const headers = await getAuthHeaders();
        const [offersRes, campaignsRes, brandCharacterRes, brandAssetsRes] = await Promise.all([
          fetch("/api/admin/criativos/offers", { headers }),
          fetch("/api/admin/creative-ai/campaigns", { headers }),
          fetch("/api/admin/creative-ai/brand-character", { headers }),
          fetch("/api/admin/creative-ai/brand-assets", { headers }),
        ]);

        const offersJson = await offersRes.json().catch(() => ({}));
        const campaignsJson = await campaignsRes.json().catch(() => ({}));
        const brandCharacterJson = await brandCharacterRes.json().catch(() => ({}));
        const brandAssetsJson = await brandAssetsRes.json().catch(() => ({}));

        setOffers(offersJson.offers ?? []);
        setCampaigns(campaignsJson.campaigns ?? []);
        setOfficialCharacterName(brandCharacterJson.official?.name ?? null);
        setReferencesCount((brandCharacterJson.references ?? []).length);

        const assets = (brandAssetsJson.assets ?? []) as Array<{ type: string; isDefault: boolean }>;
        setBrandAssetStatus({
          logo: assets.some((a) => a.type === "LOGO" && a.isDefault),
          logoTransparent: assets.some((a) => a.type === "LOGO_TRANSPARENT" && a.isDefault),
          videoOutro: assets.some((a) => a.type === "VIDEO_OUTRO" && a.isDefault),
        });
      } catch {
        setError("Nao foi possivel carregar ofertas/campanhas.");
      } finally {
        setLoadingOffers(false);
      }
    }

    loadInitialData();
  }, []);

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [offers, selectedOfferId],
  );

  async function handleAnalyze() {
    if (!selectedOfferId) return;
    setAnalyzing(true);
    setError(null);
    setIntelligence(null);
    setCampaign(null);
    setBrief(null);
    setStoryboardPreview(null);
    setCreationApprovalState("DRAFT");
    setStoryboardApprovalStaleMessage(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/product-intelligence", {
        method: "POST",
        headers,
        body: JSON.stringify({ offerId: selectedOfferId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao analisar produto.");
      setIntelligence(json.productIntelligence);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao analisar produto.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleCreateCampaign() {
    if (!selectedOfferId || !intelligence || !campaignName.trim()) return;
    setCreatingCampaign(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/creative-ai/campaigns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          offerId: selectedOfferId,
          name: campaignName.trim(),
          productIntelligenceId: intelligence.id,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao criar campanha.");
      setCampaign(json.campaign);
      setCampaigns((prev) => [json.campaign, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao criar campanha.");
    } finally {
      setCreatingCampaign(false);
    }
  }

  async function handleBuildBrief() {
    if (!campaign) return;
    setBuildingBrief(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/build-brief`, {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao montar o Creative Brief.");
      setBrief(json.brief);
      setCampaign(json.campaign);
      setCommercialDirection(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao montar o Creative Brief.");
    } finally {
      setBuildingBrief(false);
    }
  }

  async function handleBuildCommercialDirection() {
    if (!campaign) return;
    setBuildingDirection(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/build-commercial-direction`, {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao montar a direcao comercial.");
      setCommercialDirection(json.commercialDirection);
      setCampaign(json.campaign);
      setPromptPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao montar a direcao comercial.");
    } finally {
      setBuildingDirection(false);
    }
  }

  async function handleBuildPrompts() {
    if (!campaign) return;
    setBuildingPrompts(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/build-prompts`, {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao preparar os prompts.");
      setPromptPlan(json.promptPlan);
      setCampaign(json.campaign);
      setGenerationPlan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preparar os prompts.");
    } finally {
      setBuildingPrompts(false);
    }
  }

  async function handlePrepareGeneration() {
    if (!campaign) return;
    setPreparingGeneration(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/prepare-generation`, {
        method: "POST",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao preparar a geracao.");
      setGenerationPlan(json.generationPlan);
      setCampaign(json.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao preparar a geracao.");
    } finally {
      setPreparingGeneration(false);
    }
  }

  function buildCreativeContract(): CommercialCreativeContract | null {
    if (!campaign || !selectedOfferId) return null;
    const requestedDuration = customDuration.trim()
      ? Number(customDuration.replace(",", "."))
      : targetDuration;

    return {
      productId: selectedOfferId,
      campaignId: campaign.id,
      creationMode,
      userPrompt,
      targetDuration: Number.isFinite(requestedDuration) ? requestedDuration : 15,
      tone,
      visualStyle,
      primaryObjective,
      callToActions: splitContractLines(ctaText),
      mustShow: splitContractLines(mustShowText),
      mustSay: splitContractLines(mustSayText),
      mustAvoid: splitContractLines(mustAvoidText),
      presenterPreference,
      productUsagePreference,
      referenceVideo:
        creationMode === "TREND_REFERENCE_REMIX"
          ? {
              sourceUrl: referenceUrl.trim() || null,
              sourceLabel: referenceUrl.trim() ? "referencia do usuario" : null,
              preserveStructure: referencePreserveStructure,
              preservePacing: referencePreservePacing,
              preserveHookMechanism: referencePreserveHook,
              preserveCameraLanguage: referencePreserveCamera,
              preserveProductPresentationMechanism: referencePreserveDemo,
              preserveCtaMechanism: referencePreserveCta,
            }
          : null,
    };
  }

  async function handleGenerateStoryboard() {
    const contract = buildCreativeContract();
    if (!campaign || !contract) return;
    setBuildingStoryboard(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/commercial-creation-preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ contract }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao gerar storyboard.");
      setStoryboardPreview(json.storyboard);
      setCreationApprovalState(json.storyboard?.approvalState ?? "READY_FOR_REVIEW");
      setStoryboardApprovalStaleMessage(
        (json.approvalValidation as CommercialCreationApprovalValidation | undefined)?.staleReason ?? null,
      );
      setCommercialDirection(json.storyboard?.commercialDirection ?? null);
      setPromptPlan(json.storyboard?.promptPlan ?? null);
      setGenerationPlan(json.storyboard?.generationPlan ?? null);
      setCampaign(json.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar storyboard.");
    } finally {
      setBuildingStoryboard(false);
    }
  }

  async function handleStoryboardApproval(action: "APPROVE" | "REJECT") {
    if (!campaign) return;
    setUpdatingStoryboardApproval(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/commercial-creation-approval`, {
        method: "POST",
        headers,
        body: JSON.stringify({ action, storyboardFingerprint: storyboardPreview?.storyboardFingerprint ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao atualizar aprovacao.");
      const approvalValidation = json.approvalValidation as CommercialCreationApprovalValidation | undefined;
      setCreationApprovalState(approvalValidation?.resolvedApprovalState ?? json.approvalState);
      setStoryboardApprovalStaleMessage(approvalValidation?.staleReason ?? null);
      setStoryboardPreview((current) =>
        current ? { ...current, approvalState: approvalValidation?.resolvedApprovalState ?? json.approvalState } : current,
      );
      setCampaign(json.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar aprovacao.");
    } finally {
      setUpdatingStoryboardApproval(false);
    }
  }

  async function handleGenerateMock() {
    if (!campaign) return;
    setGeneratingMock(true);
    setError(null);

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ mode: "MOCK" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao rodar a geracao mock.");
      setGenerationPlan(json.generationPlan);
      setCampaign(json.campaign);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao rodar a geracao mock.");
    } finally {
      setGeneratingMock(false);
    }
  }

  async function handleRunCanary(sceneId: string) {
    if (!campaign) return;
    setCanaryRunning(true);
    setCanaryError(null);

    const maxCostBRL = Number(canaryMaxCostBRL.replace(",", "."));

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/creative-ai/campaigns/${campaign.id}/generate-canary`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          mode: "CANARY",
          sceneId,
          confirmed: canaryConfirmed,
          maxCostBRL,
          acknowledgeUnknownCost: canaryAcknowledgeUnknownCost,
          dryRun: canaryDryRun,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Falha ao rodar o teste real (canary).");
      setCanaryResults((prev) => ({ ...prev, [sceneId]: json.result }));
    } catch (err) {
      setCanaryError(err instanceof Error ? err.message : "Falha ao rodar o teste real (canary).");
    } finally {
      setCanaryRunning(false);
    }
  }

  function handleSelectExistingCampaign(item: CampaignRow) {
    setCampaign(item);
    setSelectedOfferId(item.offer_id ?? "");
    setBrief(null);
    setCommercialDirection(null);
    setPromptPlan(null);
    setGenerationPlan(null);
    const storedBrief = item.creative_brief as Record<string, unknown> | null;
    const storedStoryboard = storedBrief?.commercialCreationStoryboard as CommercialStoryboardPreview | undefined;
    const approvalValidation = resolveCommercialCreationApprovalValidation({
      approvalStatus: storedBrief?.commercialCreationStatus,
      currentStoryboardFingerprint: storedStoryboard?.storyboardFingerprint,
      approvedStoryboardFingerprint: storedBrief?.commercialCreationApprovedFingerprint,
    });
    setStoryboardPreview(
      storedStoryboard
        ? { ...storedStoryboard, approvalState: approvalValidation.resolvedApprovalState }
        : null,
    );
    setCreationApprovalState(approvalValidation.resolvedApprovalState);
    setStoryboardApprovalStaleMessage(approvalValidation.staleReason);
    setError(null);

    window.requestAnimationFrame(() => {
      commercialFactoryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#9E6A18]">
          Radar Smart Command
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#1A1A1A] md:text-4xl">
          Radar Creative AI
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Inteligencia de produto e Creative Brain para preparar campanhas. Nesta fase nenhuma
          midia e gerada e nenhum provider pago e chamado - tudo roda com dados mock.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverviewCard
          icon={<Brain className="h-5 w-5 text-[#9E6A18]" />}
          title="Inteligencia de Produtos"
          description="Analise mock de publico, dor, desejo e objecao por oferta."
          badge={`${campaigns.length ? "Ativo" : "Pronto"}`}
        />
        <OverviewCard
          icon={<Clapperboard className="h-5 w-5 text-[#9E6A18]" />}
          title="Campanhas"
          description={`${campaigns.length} campanha(s) registrada(s) ate agora.`}
          badge="Ativo"
        />
        <OverviewCard
          href="/admin/creative-ai/brand-character"
          icon={<UserRound className="h-5 w-5 text-[#9E6A18]" />}
          title="Garota Radar"
          description={
            officialCharacterName
              ? `${officialCharacterName} · ${referencesCount} referencia(s) cadastrada(s).`
              : "Nenhuma persona oficial definida ainda."
          }
          badge={officialCharacterName ? "Configurada" : "Nao configurada"}
        />
        <OverviewCard
          href="/admin/creative-ai/brand-assets"
          icon={<ImageIcon className="h-5 w-5 text-[#9E6A18]" />}
          title="Brand Assets"
          description={
            `Logo: ${brandAssetStatus.logo ? "✓" : "—"} · ` +
            `Transparente: ${brandAssetStatus.logoTransparent ? "✓" : "—"} · ` +
            `Encerramento: ${brandAssetStatus.videoOutro ? "✓" : "—"} · ` +
            `Referencias: ${referencesCount}`
          }
          badge={brandAssetStatus.videoOutro ? "Pronto" : "Pendente"}
        />
      </section>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#FFC300]" />
          <h2 className="text-lg font-bold text-[#1A1A1A]">Criar campanha</h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Selecione oferta &rarr; analise o produto &rarr; crie a campanha &rarr; monte o brief.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              1. Oferta
            </label>
            <select
              value={selectedOfferId}
              onChange={(event) => {
                setSelectedOfferId(event.target.value);
                setIntelligence(null);
                setCampaign(null);
                setBrief(null);
                setStoryboardPreview(null);
                setCreationApprovalState("DRAFT");
                setStoryboardApprovalStaleMessage(null);
              }}
              disabled={loadingOffers}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
            >
              <option value="">
                {loadingOffers ? "Carregando ofertas..." : "Selecione uma oferta"}
              </option>
              {offers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.title ?? "Oferta sem titulo"}
                  {offer.price ? ` - ${formatBRL(offer.price)}` : ""}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleAnalyze}
              disabled={!selectedOfferId || analyzing}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
              2. Analisar produto (mock)
            </button>

            {intelligence ? (
              <>
                <input
                  type="text"
                  value={campaignName}
                  onChange={(event) => setCampaignName(event.target.value)}
                  placeholder="Nome da campanha"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
                <button
                  type="button"
                  onClick={handleCreateCampaign}
                  disabled={!campaignName.trim() || creatingCampaign || Boolean(campaign)}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creatingCampaign ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Clapperboard className="h-4 w-4" />
                  )}
                  3. Criar campanha
                </button>
              </>
            ) : null}

            {campaign ? (
              <button
                type="button"
                onClick={handleBuildBrief}
                disabled={buildingBrief}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FFC300] px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {buildingBrief ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                4. Montar Creative Brief
              </button>
            ) : null}
          </div>

          <div className="rounded-xl border border-dashed border-slate-200 p-4">
            {selectedOffer ? (
              <div className="space-y-1">
                <p className="text-sm font-bold text-[#1A1A1A]">{selectedOffer.title}</p>
                <p className="text-xs text-slate-500">
                  {selectedOffer.marketplace ?? "Marketplace"} &bull;{" "}
                  {selectedOffer.category ?? "Categoria geral"}
                </p>
                {selectedOffer.price ? (
                  <p className="text-sm font-semibold text-[#9E6A18]">
                    {formatBRL(selectedOffer.price)}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Nenhuma oferta selecionada ainda.</p>
            )}
          </div>
        </div>
      </section>

      {campaign ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Film className="h-5 w-5 text-[#9E6A18]" />
                <h2 className="text-lg font-bold text-[#1A1A1A]">Criar Comercial</h2>
              </div>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Contrato criativo, storyboard revisavel e plano de geracao dry-run. Nenhuma
                midia e gerada antes da aprovacao manual.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {creationApprovalState}
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {CREATION_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCreationMode(option.value)}
                aria-pressed={creationMode === option.value}
                className={`min-h-[116px] rounded-xl border p-4 text-left transition ${
                  creationMode === option.value
                    ? "border-[#9E6A18] bg-[#9E6A18]/5"
                    : "border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className="text-sm font-bold text-[#1A1A1A]">{option.label}</span>
                <span className="mt-2 block text-xs leading-5 text-slate-500">{option.description}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prompt do usuario
                </span>
                <textarea
                  value={userPrompt}
                  onChange={(event) => setUserPrompt(event.target.value)}
                  rows={4}
                  placeholder="Ex.: Quero um comercial direto, com demo do produto, preco real e CTA para o Grupo VIP."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Objetivo
                  </span>
                  <select
                    value={primaryObjective}
                    onChange={(event) => setPrimaryObjective(event.target.value as CommercialPrimaryObjective)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  >
                    <option value="PRODUCT_SALE">Venda de produto</option>
                    <option value="SALES">Venda direta</option>
                    <option value="VIP_GROUP">Grupo VIP Radar Smart</option>
                    <option value="TRAFFIC">Trafego Radar Smart</option>
                    <option value="ENGAGEMENT">Engajamento</option>
                    <option value="CUSTOM">Personalizado</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    CTA
                  </span>
                  <textarea
                    value={ctaText}
                    onChange={(event) => setCtaText(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tom
                  </span>
                  <input
                    type="text"
                    value={tone}
                    onChange={(event) => setTone(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Estilo
                  </span>
                  <input
                    type="text"
                    value={visualStyle}
                    onChange={(event) => setVisualStyle(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Duracao custom
                  </span>
                  <input
                    type="number"
                    min={6}
                    max={45}
                    value={customDuration}
                    onChange={(event) => setCustomDuration(event.target.value)}
                    placeholder={`${targetDuration}s`}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((seconds) => (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => {
                      setTargetDuration(seconds);
                      setCustomDuration("");
                    }}
                    className={`h-9 rounded-full px-4 text-xs font-bold ${
                      !customDuration && targetDuration === seconds
                        ? "bg-[#1A1A1A] text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {seconds}s
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Apresentadora
                  </span>
                  <select
                    value={presenterPreference}
                    onChange={(event) => setPresenterPreference(event.target.value as PresenterPreference)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  >
                    <option value="AUTO">Automatico por modo</option>
                    <option value="NO_PRESENTER">Sem apresentadora</option>
                    <option value="HOOK_AND_CTA">Hook e CTA</option>
                    <option value="PRESENTER_LED">Apresentadora lidera</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Uso do produto
                  </span>
                  <select
                    value={productUsagePreference}
                    onChange={(event) => setProductUsagePreference(event.target.value as ProductUsagePreference)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  >
                    <option value="AUTO">Automatico por modo</option>
                    <option value="PACKSHOT_FIRST">Packshot primeiro</option>
                    <option value="DEMONSTRATE_USE">Demonstrar uso</option>
                    <option value="HOLD_AND_POINT">Segurar/apontar</option>
                    <option value="NO_USAGE_DEMO">Sem demo de uso</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-1">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Deve mostrar
                  </span>
                  <textarea
                    value={mustShowText}
                    onChange={(event) => setMustShowText(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Deve falar
                  </span>
                  <textarea
                    value={mustSayText}
                    onChange={(event) => setMustSayText(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Evitar
                  </span>
                  <textarea
                    value={mustAvoidText}
                    onChange={(event) => setMustAvoidText(event.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                  />
                </label>
              </div>
            </div>
          </div>

          {creationMode === "TREND_REFERENCE_REMIX" ? (
            <div className="mt-5 rounded-xl border border-slate-200 p-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Link/arquivo de referencia
                </span>
                <input
                  type="text"
                  value={referenceUrl}
                  onChange={(event) => setReferenceUrl(event.target.value)}
                  placeholder="URL ou identificador de arquivo. Ingestao futura, sem download aqui."
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-[#1A1A1A]"
                />
              </label>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {(
                  [
                    { label: "Estrutura", checked: referencePreserveStructure, setter: setReferencePreserveStructure },
                    { label: "Ritmo", checked: referencePreservePacing, setter: setReferencePreservePacing },
                    { label: "Tipo de gancho", checked: referencePreserveHook, setter: setReferencePreserveHook },
                    { label: "Camera", checked: referencePreserveCamera, setter: setReferencePreserveCamera },
                    { label: "Demonstracao", checked: referencePreserveDemo, setter: setReferencePreserveDemo },
                    { label: "CTA", checked: referencePreserveCta, setter: setReferencePreserveCta },
                  ] satisfies Array<{
                    label: string;
                    checked: boolean;
                    setter: (value: boolean) => void;
                  }>
                ).map((option) => (
                  <label key={option.label} className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={option.checked}
                      onChange={(event) => option.setter(event.target.checked)}
                    />
                    Preservar {option.label}
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Adaptar sempre: Garota Radar, ambiente, produto, falas, identidade Radar Smart.
              </p>
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateStoryboard}
              disabled={buildingStoryboard}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {buildingStoryboard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              GERAR STORYBOARD
            </button>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Dry-run: contrato, storyboard, prompts e plano. Zero midia.
            </span>
          </div>

          {storyboardPreview ? (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-base font-bold text-[#1A1A1A]">A) Novo Storyboard Atual</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Plano pronto para revisao humana antes de qualquer geracao.
                  </p>
                </div>
                <div className="grid gap-1 text-right text-xs text-slate-500">
                  <span>Video: {storyboardPreview.totals.estimatedVideoCredits ?? "sem estimativa"} creditos</span>
                  <span>TTS: {storyboardPreview.totals.estimatedTtsCredits ?? "sem estimativa"} creditos</span>
                  <span>BRL: {formatCostCents(storyboardPreview.totals.estimatedCurrencyCostCents)}</span>
                  <span>USD: {formatUsdCents(storyboardPreview.totals.estimatedUsdCostCents)}</span>
                </div>
              </div>

              {storyboardPreview.optimizerAudit.conflicts.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                  {storyboardPreview.optimizerAudit.conflicts.join(" | ")}
                </div>
              ) : null}

              {storyboardApprovalStaleMessage ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
                  {storyboardApprovalStaleMessage}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <InfoRow
                  label="Storyboard"
                  value={creationApprovalState}
                />
                <InfoRow
                  label="Modo pedido/resolvido"
                  value={`${storyboardPreview.creationTrace?.requestedCreationMode ?? "-"} -> ${storyboardPreview.creationTrace?.resolvedCreationMode ?? "-"}`}
                />
                <InfoRow
                  label="Presenter pedido/resolvido"
                  value={`${storyboardPreview.creationTrace?.requestedPresenterPreference ?? "-"} -> ${storyboardPreview.creationTrace?.resolvedPresenterStrategy ?? "-"}`}
                />
                <InfoRow
                  label="Fingerprint"
                  value={storyboardPreview.storyboardFingerprint ?? "-"}
                />
                <InfoRow
                  label="Copy legado"
                  value={storyboardPreview.creationTrace?.legacyCopySourcesUsed ? "usada" : "bloqueada"}
                />
              </div>

              {storyboardPreview.creativeDna ? (
                <div className="mt-4 rounded-xl border border-slate-200 p-4 text-xs text-slate-600">
                  <span className="font-bold uppercase tracking-wide text-[#1A1A1A]">CreativeDNA: </span>
                  {storyboardPreview.creativeDna.hookMechanism} | {storyboardPreview.creativeDna.pacing} | CTA em{" "}
                  {storyboardPreview.creativeDna.ctaTimingSecond}s
                </div>
              ) : null}

              <div className="mt-4 space-y-4">
                {storyboardPreview.scenes.map((scene) => (
                  <div key={scene.sceneId} className="rounded-xl border border-slate-100 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[10px] font-bold text-white">
                        Cena {scene.sceneNumber}
                      </span>
                      <span className="rounded-full bg-[#FFC300]/20 px-2.5 py-1 text-[10px] font-bold uppercase text-[#9E6A18]">
                        {scene.purpose}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">{scene.durationSeconds}s</span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {scene.estimatedCapability} / {scene.estimatedProvider}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <InfoRow label="Objetivo" value={scene.commercialObjective} />
                      <InfoRow label="Visual" value={scene.visual} />
                      <InfoRow label="Ambiente" value={scene.environment} />
                      <InfoRow label="Produto" value={`${scene.productAppearance} | ${scene.productUse}`} />
                      <InfoRow
                        label="Garota Radar"
                        value={`${scene.garotaRadarAppearance} | ${scene.garotaRadarRole} | ${scene.garotaRadarAction}`}
                      />
                      <InfoRow label="Camera/movimento" value={`${scene.camera} | ${scene.motion}`} />
                      <InfoRow label="Instrucao da cena" value={scene.sceneInstruction ?? "-"} />
                      <InfoRow label="Fala/Narracao" value={scene.spokenNarration ?? scene.narration} />
                      <InfoRow label="Overlay/preco/CTA" value={[scene.overlay, scene.price, scene.cta].filter(Boolean).join(" | ")} />
                      <InfoRow label="Por que existe" value={scene.whyThisSceneExists} />
                      <InfoRow label="Por que continua" value={scene.whyViewerKeepsWatching} />
                    </div>

                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Custo cena: video {scene.cost.estimatedVideoCredits ?? "sem estimativa"} creditos | TTS{" "}
                      {scene.cost.estimatedTtsCredits ?? "sem estimativa"} creditos | BRL{" "}
                      {formatCostCents(scene.cost.estimatedCurrencyCostCents)} | USD{" "}
                      {formatUsdCents(scene.cost.estimatedUsdCostCents)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleStoryboardApproval("APPROVE")}
                  disabled={updatingStoryboardApproval || creationApprovalState === "APPROVED_FOR_GENERATION"}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  APROVAR STORYBOARD
                </button>
                <button
                  type="button"
                  onClick={() => handleStoryboardApproval("REJECT")}
                  disabled={updatingStoryboardApproval}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 px-5 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AlertTriangle className="h-4 w-4" />
                  REJEITAR
                </button>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 text-sm font-semibold text-slate-400"
                >
                  <Film className="h-4 w-4" />
                  GERAR COMERCIAL (futuro)
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {intelligence || brief || commercialDirection || promptPlan || generationPlan || campaign ? (
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-600">
            B) Historico / Pipeline Legado
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Os blocos abaixo sao diagnostico e fluxo legado. O custo/plano valido para aprovacao e
            somente o do Novo Storyboard Atual com o mesmo fingerprint.
          </p>
        </section>
      ) : null}

      {intelligence ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-bold text-[#1A1A1A]">
            Product Intelligence (v{intelligence.version})
          </h2>
          <p className="mt-1 text-sm text-slate-500">{intelligence.summary}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoRow label="Categoria" value={intelligence.category} />
            <InfoRow label="Publico-alvo" value={intelligence.targetAudience.description} />
            <InfoRow label="Dor principal" value={intelligence.painPoints[0] ?? ""} />
            <InfoRow label="Desejo principal" value={intelligence.desires[0] ?? ""} />
            <InfoRow label="Objecao principal" value={intelligence.objections[0] ?? ""} />
            <InfoRow
              label="Motivacao de compra"
              value={intelligence.purchaseMotivations[0] ?? ""}
            />
          </div>
        </section>
      ) : null}

      {brief ? (
        <section className="rounded-2xl bg-[#1A1A1A] p-6 text-white shadow-sm">
          <h2 className="text-lg font-bold">Creative Brief</h2>
          <p className="mt-1 text-sm text-slate-300">{brief.reasoningSummary}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Publico
              </p>
              <p className="mt-1 text-sm">{brief.targetAudience}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Dor principal
              </p>
              <p className="mt-1 text-sm">{brief.primaryPain}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Desejo
              </p>
              <p className="mt-1 text-sm">{brief.primaryDesire}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Objecao
              </p>
              <p className="mt-1 text-sm">{brief.primaryObjection}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Motivacao de compra
              </p>
              <p className="mt-1 text-sm">{brief.purchaseMotivation}</p>
            </div>
            <div className="rounded-xl bg-[#FFC300]/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#FFC300]">
                Framework escolhido
              </p>
              <p className="mt-1 text-sm">{brief.selectedFramework?.name ?? "-"}</p>
            </div>
            <div className="rounded-xl bg-[#FFC300]/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#FFC300]">
                Angulo escolhido
              </p>
              <p className="mt-1 text-sm">{brief.selectedAngle?.name ?? "-"}</p>
            </div>
            <div className="rounded-xl bg-[#FFC300]/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#FFC300]">
                Persona
              </p>
              <p className="mt-1 text-sm">{brief.selectedPersona?.name ?? "Sem persona indicada"}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Estrategia de gancho
              </p>
              <p className="mt-1 text-sm">{brief.hookDirection || "-"}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Direcao visual
              </p>
              <p className="mt-1 text-sm">{brief.visualDirection || "-"}</p>
            </div>
            <div className="rounded-xl bg-white/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                CTA
              </p>
              <p className="mt-1 text-sm">{brief.ctaDirection || "-"}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleBuildCommercialDirection}
            disabled={buildingDirection}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FFC300] px-5 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buildingDirection ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            Montar Direcao Comercial
          </button>
        </section>
      ) : null}

      {commercialDirection ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-bold text-[#1A1A1A]">Commercial Direction</h2>
          <p className="mt-1 text-sm text-slate-500">{commercialDirection.reasoningSummary}</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InfoRow label="Argumento principal" value={commercialDirection.sellingArgument} />
            <InfoRow label="Hook" value={commercialDirection.hookStrategy} />
            <InfoRow label="Duracao" value={`${commercialDirection.durationSeconds}s`} />
            <InfoRow label="Estrutura" value={commercialDirection.storyStructure} />
            <InfoRow label="Ritmo" value={commercialDirection.pace} />
            <InfoRow label="Estilo visual" value={commercialDirection.visualStyle} />
            <InfoRow label="Presenter Strategy" value={commercialDirection.presenterStrategy} />
            <InfoRow label="Prova social" value={commercialDirection.proofStrategy} />
            <InfoRow
              label="Estrategia de preco"
              value={commercialDirection.offerStrategy.priceReveal}
            />
            <InfoRow label="CTA" value={commercialDirection.ctaStrategy.ctaText} />
          </div>

          <h3 className="mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Scene Plan</h3>
          <div className="mt-3 space-y-2">
            {commercialDirection.scenes.map((scene) => (
              <div
                key={scene.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3"
              >
                <span className="rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[10px] font-bold text-white">
                  {scene.startSecond}-{scene.endSecond}s
                </span>
                <span className="rounded-full bg-[#FFC300]/20 px-2.5 py-1 text-[10px] font-bold uppercase text-[#9E6A18]">
                  {scene.purpose}
                </span>
                <span className="text-xs text-slate-500">{scene.visualSubject}</span>
                <span className="text-[10px] text-slate-400">presenter: {scene.presenter}</span>
                {scene.characterDirection ? (
                  <span className="text-[10px] text-slate-400">
                    {scene.characterDirection.expression} · {scene.characterDirection.pose} ·{" "}
                    {scene.characterDirection.shot}
                  </span>
                ) : null}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleBuildPrompts}
            disabled={buildingPrompts}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {buildingPrompts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Preparar Prompts
          </button>
        </section>
      ) : null}

      {promptPlan ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-bold text-[#1A1A1A]">Prompt Plan</h2>
          <p className="mt-1 text-sm text-slate-500">
            Prompts estruturados por cena - nenhuma geracao foi feita, isso e so planejamento.
          </p>

          <div className="mt-4 space-y-4">
            {promptPlan.scenes.map((scene) => (
              <div key={scene.sceneId} className="rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[10px] font-bold text-white">
                    {scene.purpose}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                    {scene.mediaType}
                  </span>
                  <span className="text-[10px] text-slate-400">{scene.durationSeconds}s</span>
                  <span className="text-[10px] text-slate-400">
                    identity: {scene.identityReferenceAssetId ? scene.identityReferenceAssetId.slice(0, 8) : "-"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    support: {scene.supportReferenceAssetId ? scene.supportReferenceAssetId.slice(0, 8) : "-"}
                  </span>
                  <span className="text-[10px] text-slate-400">safe area: {scene.safeAreaDirection}</span>
                </div>

                <p className="mt-2 text-xs text-slate-600">
                  <span className="font-semibold text-[#1A1A1A]">Positive: </span>
                  {scene.positivePrompt}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  <span className="font-semibold text-slate-500">Negative: </span>
                  {scene.negativePrompt}
                </p>

                {scene.overlayInstructions.priceText ||
                scene.overlayInstructions.discountText ||
                scene.overlayInstructions.ctaText ? (
                  <p className="mt-1 text-xs text-[#9E6A18]">
                    Overlay: {[scene.overlayInstructions.priceText, scene.overlayInstructions.discountText, scene.overlayInstructions.ctaText]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}

                <p className="mt-1 text-[10px] text-slate-400">
                  providerHints: {JSON.stringify(scene.providerHints)}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePrepareGeneration}
            disabled={preparingGeneration}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1A1A1A] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {preparingGeneration ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Settings2 className="h-4 w-4" />
            )}
            Preparar Geracao
          </button>
        </section>
      ) : null}

      {generationPlan ? (
        <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#9E6A18]" />
            <h2 className="text-lg font-bold text-[#1A1A1A]">Generation Plan</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Capability, provider e custo estimado por cena. Nenhuma midia foi gerada ainda - isso
            e so planejamento de execucao.
          </p>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
            Modo {generationPlan.mode} - nenhum credito sera consumido
          </div>

          <div className="mt-4 space-y-3">
            {generationPlan.scenes.map((scene) => {
              const result = generationPlan.results?.find((r) => r.sceneId === scene.sceneId);
              return (
                <div key={scene.sceneId} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#1A1A1A] px-2.5 py-1 text-[10px] font-bold text-white">
                      {scene.mediaType}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">
                      {scene.providerCapability}
                    </span>
                    <span className="rounded-full bg-[#FFC300]/20 px-2.5 py-1 text-[10px] font-bold uppercase text-[#9E6A18]">
                      provider: {scene.selectedProvider}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                        scene.status === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : scene.status === "COMPLETED"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {scene.status}
                    </span>
                    <span className="text-[10px] text-slate-400">{scene.durationSeconds}s</span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-400">
                    <span>
                      identity: {scene.identityReferenceUrl ? "resolvida" : scene.identityReferenceAssetId ? "id sem URL" : "-"}
                    </span>
                    <span>
                      support: {scene.supportReferenceUrl ? "resolvida" : scene.supportReferenceAssetId ? "id sem URL" : "-"}
                    </span>
                    <span>produto: {scene.productReferenceUrl ? "resolvida" : "-"}</span>
                    <span>
                      custo estimado:{" "}
                      {scene.estimatedCost.estimatedCredits === null
                        ? "sem estimativa"
                        : `${scene.estimatedCost.estimatedCredits} creditos`}
                    </span>
                  </div>

                  {scene.statusReason ? (
                    <p className="mt-2 text-xs text-red-600">{scene.statusReason}</p>
                  ) : null}

                  {result ? (
                    <p className="mt-2 text-xs text-slate-600">
                      <span className="font-semibold text-[#1A1A1A]">Resultado mock: </span>
                      {result.status} · {result.outputUrl ?? result.error ?? "-"}
                    </p>
                  ) : null}

                  {scene.providerCapability === "CHARACTER_IMAGE" ? (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setCanaryOpenSceneId((current) => (current === scene.sceneId ? null : scene.sceneId))
                        }
                        className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-red-700"
                      >
                        <FlaskConical className="h-4 w-4" />
                        Gerar teste real (CANARY)
                      </button>

                      {canaryOpenSceneId === scene.sceneId ? (
                        <div className="mt-3 space-y-3">
                          <div className="rounded-lg bg-red-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-red-800">
                            Teste real - pode consumir creditos
                          </div>

                          <div className="grid gap-2 text-xs text-slate-600 md:grid-cols-2">
                            <span>
                              Provider aprovado: <b>{APPROVED_CANARY_PROVIDER}</b> (candidato do plano:{" "}
                              {scene.selectedProvider})
                            </span>
                            <span>Capability: {scene.providerCapability}</span>
                            <span>
                              Estimativa:{" "}
                              {scene.estimatedCost.estimatedCurrencyCostCents === null
                                ? "desconhecida (provider sem custo documentado)"
                                : formatBRL(scene.estimatedCost.estimatedCurrencyCostCents / 100)}
                            </span>
                            <span>
                              Identity: {scene.identityReferenceUrl ? "PRIMARY resolvida" : "ausente"} · Support:{" "}
                              {scene.supportReferenceUrl ? "resolvida" : "ausente"}
                            </span>
                          </div>

                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={canaryDryRun}
                              onChange={(e) => setCanaryDryRun(e.target.checked)}
                            />
                            Dry-run (forcar mock, nao chama o provider real)
                          </label>

                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <span>Limite maximo (R$):</span>
                            <input
                              type="text"
                              value={canaryMaxCostBRL}
                              onChange={(e) => setCanaryMaxCostBRL(e.target.value)}
                              className="w-20 rounded-md border border-slate-200 px-2 py-1"
                            />
                          </label>

                          {scene.estimatedCost.estimatedCurrencyCostCents === null ? (
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={canaryAcknowledgeUnknownCost}
                                onChange={(e) => setCanaryAcknowledgeUnknownCost(e.target.checked)}
                              />
                              Confirmo que o custo real e desconhecido e aceito prosseguir mesmo assim
                            </label>
                          ) : null}

                          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={canaryConfirmed}
                              onChange={(e) => setCanaryConfirmed(e.target.checked)}
                            />
                            Confirmo que quero executar este teste real (1 cena, 1 provider aprovado)
                          </label>

                          <button
                            type="button"
                            onClick={() => handleRunCanary(scene.sceneId)}
                            disabled={canaryRunning || !canaryConfirmed}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-xs font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {canaryRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Executar teste real
                          </button>

                          {canaryError ? <p className="text-xs text-red-700">{canaryError}</p> : null}

                          {canaryResults[scene.sceneId] ? (
                            <p className="text-xs text-slate-600">
                              <span className="font-semibold text-[#1A1A1A]">Resultado canary: </span>
                              {canaryResults[scene.sceneId].provider} · {canaryResults[scene.sceneId].status} ·{" "}
                              {canaryResults[scene.sceneId].outputUrl ?? canaryResults[scene.sceneId].error ?? "-"}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleGenerateMock}
              disabled={generatingMock}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#9E6A18] px-5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generatingMock ? <Loader2 className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />}
              Testar geracao (MOCK)
            </button>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Modo MOCK - nenhum credito sera consumido
            </span>
          </div>
        </section>
      ) : null}

      {campaign ? (
        <div ref={commercialFactoryRef}>
          <CommercialFactoryPanel campaignId={campaign.id} campaignName={campaign.name} />
        </div>
      ) : null}

      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-bold text-[#1A1A1A]">Campanhas recentes</h2>
        <div className="mt-4 space-y-2">
          {campaigns.length ? (
            campaigns.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid={`creative-campaign-${item.id}`}
                aria-pressed={campaign?.id === item.id}
                onClick={() => handleSelectExistingCampaign(item)}
                className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-xl border p-3 text-left transition hover:bg-slate-50 ${
                  campaign?.id === item.id ? "border-[#9E6A18] bg-[#9E6A18]/5" : "border-slate-100"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1A1A1A]">{item.name}</p>
                  <p className="text-xs text-slate-500">
                    {item.selected_framework ?? "framework nao definido"} &bull;{" "}
                    {item.selected_angle ?? "angulo nao definido"}
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {item.status}
                </span>
              </button>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              Nenhuma campanha criada ainda.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
