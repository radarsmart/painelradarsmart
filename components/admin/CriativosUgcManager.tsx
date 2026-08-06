"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  AlertTriangle,
  Bot,
  Clapperboard,
  Copy,
  FolderKanban,
  Loader2,
  Mic2,
  Save,
  Sparkles,
  UserRound,
  Wand2,
  Video,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";

import type {
  UGCMarketingAngle,
  UGCBehaviorDirection,
  UGCPersonaProfile,
  UGCProjectAssetType,
  UGCProjectStatus,
  UGCScript,
  UGCTemplateProfile,
  UGCType,
  UGCVoiceDirection,
} from "@/lib/ugc/types";
import { UGC_VOICES, type VoiceKey } from "@/lib/ugc/voices";
import { supabase } from "@/lib/supabase";

type OfferRow = {
  id: string;
  title: string | null;
  marketplace: string | null;
  category: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  price: number | null;
  old_price: number | null;
  original_price: number | null;
  discount_pct?: number | null;
  coupon_code?: string | null;
  coupon_discount?: number | null;
  rating?: number | null;
  reviews_count?: number | null;
};

type LandingPageRow = {
  id: string;
  title: string | null;
  headline: string | null;
  product_title: string | null;
  marketplace: string | null;
  affiliate_url: string | null;
  hero_image_url: string | null;
  product_price: number | null;
  product_old_price: number | null;
  utm_campaign: string | null;
  offer_id: string | null;
  source_product_url: string | null;
  source_category: string | null;
};

type ProjectRow = {
  id: string;
  campaign_name: string;
  title: string;
  marketplace: string | null;
  category: string | null;
  product_url: string;
  affiliate_url: string | null;
  image_url: string | null;
  price: number | null;
  original_price: number | null;
  ugc_type: UGCType;
  voice_key: VoiceKey;
  objective: string | null;
  status: UGCProjectStatus;
  persona_id: string | null;
  template_id: string | null;
  angle_id: string | null;
  voice_direction?: UGCVoiceDirection | null;
  behavior_direction?: UGCBehaviorDirection | null;
  offer_id: string | null;
  landing_page_id: string | null;
  current_script: UGCScript | null;
  current_briefing: CreativeBriefing | null;
  updated_at: string;
  ugc_personas?: {
    id: string;
    name: string;
    slug: string;
    archetype: string;
    visual_style: string | null;
    tone: string | null;
    energy: string | null;
  } | null;
};

type HistoryRow = {
  id: string;
  campaign_name: string;
  ugc_type: UGCType;
  voice_key: VoiceKey;
  title: string;
  created_at: string;
  project_id: string | null;
  persona_id: string | null;
  template_id?: string | null;
  angle_id?: string | null;
  voice_direction?: UGCVoiceDirection | null;
  behavior_direction?: UGCBehaviorDirection | null;
  generated_script: UGCScript | null;
  whatsapp_copy?: {
    hook?: string;
    short?: string;
    medium?: string;
    long?: string;
    imageUrl?: string;
    image_url?: string;
  } | null;
};

type AssetRow = {
  id: string;
  project_id: string;
  asset_type: UGCProjectAssetType;
  provider: string | null;
  public_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  status: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
};

type CreativeBriefing = {
  angle?: string;
  recommendedFormat?: string;
  idealDuration?: string;
  hookStyle?: string;
  scenePlan?: string[];
  checklist?: string[];
};

type GenerateResponse = {
  script: UGCScript;
  briefing: CreativeBriefing;
  voice: { key: VoiceKey; name: string; style: string };
  persona?: UGCPersonaProfile | null;
  template?: UGCTemplateProfile | null;
  angle?: UGCMarketingAngle | null;
};

type WhatsAppCopyVariants = {
  hook: string;
  short: string;
  medium: string;
  long: string;
};

type ProductClassification = {
  angleType: string | null;
  audienceDescriptor: string;
  recommendedPersonaSlug: string | null;
  recommendedTemplateSlug: string | null;
  recommendedAngleSlug: string | null;
  reasoning: string;
  confidence: "low" | "medium" | "high";
};

type VideoJobSceneRow = {
  id: string;
  scene_index: number;
  scene_type: string;
  status: string;
  attempts: number;
  fallback_reason: string | null;
  result_url: string | null;
};

type VideoJobRow = {
  id: string;
  status: string;
  error: string | null;
  output_url: string | null;
};

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asPrice(value: string): string {
  return value.replace(/[^\d,.-]/g, "");
}

function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

const VIDEO_JOB_STATUS_LABELS: Record<string, string> = {
  queued: "Na fila",
  running: "Gerando cenas",
  composing: "Montando vídeo final",
  completed: "Concluído",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const VIDEO_SCENE_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando",
  submitted: "Enviada",
  polling: "Gerando",
  ready: "Pronta",
  failed: "Falhou",
};

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) {
    throw new Error("Sessão expirada. Faça login novamente.");
  }
  return token;
}

async function adminFetch(input: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    cache: init.cache ?? "no-store",
    ...init,
    headers,
  });
}

function normalizeVoiceDirection(value: unknown): UGCVoiceDirection {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    pace: ["calm", "balanced", "fast"].includes(asText(raw.pace))
      ? (asText(raw.pace) as UGCVoiceDirection["pace"])
      : "balanced",
    pauseStyle: ["clean", "natural", "fragmented"].includes(asText(raw.pauseStyle))
      ? (asText(raw.pauseStyle) as UGCVoiceDirection["pauseStyle"])
      : "natural",
    emotionalIntensity: THREE_LEVEL_OPTIONS.includes(
      asText(raw.emotionalIntensity) as (typeof THREE_LEVEL_OPTIONS)[number],
    )
      ? (asText(raw.emotionalIntensity) as UGCVoiceDirection["emotionalIntensity"])
      : "medium",
    urgency: THREE_LEVEL_OPTIONS.includes(asText(raw.urgency) as (typeof THREE_LEVEL_OPTIONS)[number])
      ? (asText(raw.urgency) as UGCVoiceDirection["urgency"])
      : "medium",
    credibility: THREE_LEVEL_OPTIONS.includes(
      asText(raw.credibility) as (typeof THREE_LEVEL_OPTIONS)[number],
    )
      ? (asText(raw.credibility) as UGCVoiceDirection["credibility"])
      : "high",
    ctaPressure: ["soft", "balanced", "strong"].includes(asText(raw.ctaPressure))
      ? (asText(raw.ctaPressure) as UGCVoiceDirection["ctaPressure"])
      : "balanced",
  };
}

function normalizeBehaviorDirection(value: unknown): UGCBehaviorDirection {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    eyeContact: ["soft", "balanced", "strong"].includes(asText(raw.eyeContact))
      ? (asText(raw.eyeContact) as UGCBehaviorDirection["eyeContact"])
      : "balanced",
    gestureIntensity: THREE_LEVEL_OPTIONS.includes(
      asText(raw.gestureIntensity) as (typeof THREE_LEVEL_OPTIONS)[number],
    )
      ? (asText(raw.gestureIntensity) as UGCBehaviorDirection["gestureIntensity"])
      : "medium",
    smileLevel: THREE_LEVEL_OPTIONS.includes(
      asText(raw.smileLevel) as (typeof THREE_LEVEL_OPTIONS)[number],
    )
      ? (asText(raw.smileLevel) as UGCBehaviorDirection["smileLevel"])
      : "low",
    imperfectionLevel: THREE_LEVEL_OPTIONS.includes(
      asText(raw.imperfectionLevel) as (typeof THREE_LEVEL_OPTIONS)[number],
    )
      ? (asText(raw.imperfectionLevel) as UGCBehaviorDirection["imperfectionLevel"])
      : "medium",
    cameraEnergy: ["calm", "balanced", "dynamic"].includes(asText(raw.cameraEnergy))
      ? (asText(raw.cameraEnergy) as UGCBehaviorDirection["cameraEnergy"])
      : "balanced",
  };
}

const PROJECT_STATUSES: UGCProjectStatus[] = [
  "draft",
  "brief_ready",
  "script_ready",
  "approved",
  "archived",
];

const PACE_OPTIONS: NonNullable<UGCVoiceDirection["pace"]>[] = ["calm", "balanced", "fast"];
const PAUSE_OPTIONS: NonNullable<UGCVoiceDirection["pauseStyle"]>[] = [
  "clean",
  "natural",
  "fragmented",
];
const THREE_LEVEL_OPTIONS = ["low", "medium", "high"] as const;
const CTA_PRESSURE_OPTIONS: NonNullable<UGCVoiceDirection["ctaPressure"]>[] = [
  "soft",
  "balanced",
  "strong",
];
const EYE_CONTACT_OPTIONS: NonNullable<UGCBehaviorDirection["eyeContact"]>[] = [
  "soft",
  "balanced",
  "strong",
];
const CAMERA_ENERGY_OPTIONS: NonNullable<UGCBehaviorDirection["cameraEnergy"]>[] = [
  "calm",
  "balanced",
  "dynamic",
];

export default function CriativosUgcManager() {
  const [campaignName, setCampaignName] = useState("");
  const [title, setTitle] = useState("");
  const [marketplace, setMarketplace] = useState("");
  const [category, setCategory] = useState("");
  const [productUrl, setProductUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [objective, setObjective] = useState("conversion");
  const [price, setPrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [ugcType, setUgcType] = useState<UGCType>("model-a");
  const [voiceKey, setVoiceKey] = useState<VoiceKey>("mateus");
  const [projectStatus, setProjectStatus] = useState<UGCProjectStatus>("draft");
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [selectedLandingPageId, setSelectedLandingPageId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPersonaId, setSelectedPersonaId] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedAngleId, setSelectedAngleId] = useState("");
  const [voicePace, setVoicePace] = useState<UGCVoiceDirection["pace"]>("balanced");
  const [pauseStyle, setPauseStyle] = useState<UGCVoiceDirection["pauseStyle"]>("natural");
  const [emotionalIntensity, setEmotionalIntensity] =
    useState<UGCVoiceDirection["emotionalIntensity"]>("medium");
  const [urgencyLevel, setUrgencyLevel] = useState<UGCVoiceDirection["urgency"]>("medium");
  const [credibilityLevel, setCredibilityLevel] =
    useState<UGCVoiceDirection["credibility"]>("high");
  const [ctaPressure, setCtaPressure] =
    useState<UGCVoiceDirection["ctaPressure"]>("balanced");
  const [eyeContact, setEyeContact] =
    useState<UGCBehaviorDirection["eyeContact"]>("balanced");
  const [gestureIntensity, setGestureIntensity] =
    useState<UGCBehaviorDirection["gestureIntensity"]>("medium");
  const [smileLevel, setSmileLevel] =
    useState<UGCBehaviorDirection["smileLevel"]>("low");
  const [imperfectionLevel, setImperfectionLevel] =
    useState<UGCBehaviorDirection["imperfectionLevel"]>("medium");
  const [cameraEnergy, setCameraEnergy] =
    useState<UGCBehaviorDirection["cameraEnergy"]>("balanced");
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [landingPages, setLandingPages] = useState<LandingPageRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [personas, setPersonas] = useState<UGCPersonaProfile[]>([]);
  const [templates, setTemplates] = useState<UGCTemplateProfile[]>([]);
  const [angles, setAngles] = useState<UGCMarketingAngle[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [generatedScript, setGeneratedScript] = useState<UGCScript | null>(null);
  const [generatedBriefing, setGeneratedBriefing] = useState<CreativeBriefing | null>(null);
  const [whatsappCopy, setWhatsAppCopy] = useState<WhatsAppCopyVariants | null>(null);
  const [whatsappCopyTab, setWhatsAppCopyTab] = useState<keyof WhatsAppCopyVariants>("medium");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingWhatsAppCopy, setGeneratingWhatsAppCopy] = useState(false);
  const [savingWhatsAppCopy, setSavingWhatsAppCopy] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [savingHistory, setSavingHistory] = useState(false);
  const [generatingAudio, setGeneratingAudio] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [copyBadge, setCopyBadge] = useState<string | null>(null);
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState<ProductClassification | null>(null);
  const [videoJob, setVideoJob] = useState<VideoJobRow | null>(null);
  const [videoJobScenes, setVideoJobScenes] = useState<VideoJobSceneRow[]>([]);
  const videoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedPersona = useMemo(
    () => personas.find((persona) => persona.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  );

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId],
  );

  const selectedAngle = useMemo(
    () => angles.find((angle) => angle.id === selectedAngleId) ?? null,
    [angles, selectedAngleId],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedOffer = useMemo(
    () => offers.find((offer) => offer.id === selectedOfferId) ?? null,
    [offers, selectedOfferId],
  );

  const currentVoiceDirection: UGCVoiceDirection = {
    pace: voicePace,
    pauseStyle,
    emotionalIntensity,
    urgency: urgencyLevel,
    credibility: credibilityLevel,
    ctaPressure,
  };

  const currentBehaviorDirection: UGCBehaviorDirection = {
    eyeContact,
    gestureIntensity,
    smileLevel,
    imperfectionLevel,
    cameraEnergy,
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    return () => {
      if (copyBadgeTimerRef.current) {
        clearTimeout(copyBadgeTimerRef.current);
      }
      if (videoPollRef.current) {
        clearInterval(videoPollRef.current);
      }
    };
  }, []);

  useEffect(() => {
    stopVideoPolling();
    setVideoJob(null);
    setVideoJobScenes([]);
    setGeneratingVideo(false);
    if (!selectedProjectId) {
      setAssets([]);
      return;
    }
    void loadAssets(selectedProjectId);
  }, [selectedProjectId]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [offersRes, landingRes, personasRes, templatesRes, anglesRes, projectsRes, historyRes] = await Promise.all([
        adminFetch("/api/admin/criativos/offers"),
        adminFetch("/api/admin/criativos/landing-pages"),
        adminFetch("/api/admin/criativos/personas"),
        adminFetch("/api/admin/criativos/templates"),
        adminFetch("/api/admin/criativos/angles"),
        adminFetch("/api/admin/criativos/projects"),
        adminFetch("/api/admin/criativos/history"),
      ]);

      const [offersJson, landingJson, personasJson, templatesJson, anglesJson, projectsJson, historyJson] = await Promise.all([
        offersRes.json(),
        landingRes.json(),
        personasRes.json(),
        templatesRes.json(),
        anglesRes.json(),
        projectsRes.json(),
        historyRes.json(),
      ]);

      if (!offersRes.ok) throw new Error(asText(offersJson.error) || "Erro ao carregar ofertas.");
      if (!landingRes.ok) throw new Error(asText(landingJson.error) || "Erro ao carregar landings.");
      if (!personasRes.ok) throw new Error(asText(personasJson.error) || "Erro ao carregar personas.");
      if (!templatesRes.ok) throw new Error(asText(templatesJson.error) || "Erro ao carregar templates.");
      if (!anglesRes.ok) throw new Error(asText(anglesJson.error) || "Erro ao carregar ângulos.");
      if (!projectsRes.ok) throw new Error(asText(projectsJson.error) || "Erro ao carregar projetos.");
      if (!historyRes.ok) throw new Error(asText(historyJson.error) || "Erro ao carregar histórico.");

      setOffers(Array.isArray(offersJson.offers) ? offersJson.offers : []);
      setLandingPages(Array.isArray(landingJson.landingPages) ? landingJson.landingPages : []);
      setPersonas(
        Array.isArray(personasJson.personas)
          ? personasJson.personas.map((persona: Record<string, unknown>) => ({
              id: asText(persona.id),
              slug: asText(persona.slug),
              name: asText(persona.name),
              archetype: asText(persona.archetype),
              genderPresentation: asText(persona.gender_presentation) || null,
              ageRange: asText(persona.age_range) || null,
              visualStyle: asText(persona.visual_style) || null,
              tone: asText(persona.tone) || null,
              energy: asText(persona.energy) || null,
              accent: asText(persona.accent) || null,
              primaryUseCases: Array.isArray(persona.primary_use_cases)
                ? persona.primary_use_cases.map((item) => asText(item)).filter(Boolean)
                : [],
              provider: asText(persona.provider) || null,
              providerAvatarId: asText(persona.provider_avatar_id) || null,
              providerVoiceId: asText(persona.provider_voice_id) || null,
              behaviorProfile:
                persona.behavior_profile && typeof persona.behavior_profile === "object"
                  ? (persona.behavior_profile as Record<string, unknown>)
                  : {},
              cameraProfile:
                persona.camera_profile && typeof persona.camera_profile === "object"
                  ? (persona.camera_profile as Record<string, unknown>)
                  : {},
              isDefault: Boolean(persona.is_default),
            }))
          : [],
      );
      setTemplates(
        Array.isArray(templatesJson.templates)
          ? templatesJson.templates.map((template: Record<string, unknown>) => ({
              id: asText(template.id),
              slug: asText(template.slug),
              name: asText(template.name),
              objective: asText(template.objective) || null,
              description: asText(template.description) || null,
              hookFramework: asText(template.hook_framework) || null,
              structureSteps: Array.isArray(template.structure_steps)
                ? template.structure_steps.map((item) => asText(item)).filter(Boolean)
                : [],
              recommendedDuration: asText(template.recommended_duration) || null,
              ctaStyle: asText(template.cta_style) || null,
              editingNotes:
                template.editing_notes && typeof template.editing_notes === "object"
                  ? (template.editing_notes as Record<string, unknown>)
                  : {},
            }))
          : [],
      );
      setAngles(
        Array.isArray(anglesJson.angles)
          ? anglesJson.angles.map((angle: Record<string, unknown>) => ({
              id: asText(angle.id),
              slug: asText(angle.slug),
              name: asText(angle.name),
              angleType: asText(angle.angle_type) || null,
              description: asText(angle.description) || null,
              painPoints: Array.isArray(angle.pain_points)
                ? angle.pain_points.map((item) => asText(item)).filter(Boolean)
                : [],
              desirePoints: Array.isArray(angle.desire_points)
                ? angle.desire_points.map((item) => asText(item)).filter(Boolean)
                : [],
              proofPoints: Array.isArray(angle.proof_points)
                ? angle.proof_points.map((item) => asText(item)).filter(Boolean)
                : [],
              hookStarters: Array.isArray(angle.hook_starters)
                ? angle.hook_starters.map((item) => asText(item)).filter(Boolean)
                : [],
              ctaOptions: Array.isArray(angle.cta_options)
                ? angle.cta_options.map((item) => asText(item)).filter(Boolean)
                : [],
            }))
          : [],
      );
      setProjects(
        Array.isArray(projectsJson.projects)
          ? projectsJson.projects.map((project: Record<string, unknown>) => ({
              ...project,
              voice_direction: normalizeVoiceDirection(project.voice_direction),
              behavior_direction: normalizeBehaviorDirection(project.behavior_direction),
            }))
          : [],
      );
      setHistory(Array.isArray(historyJson.creatives) ? historyJson.creatives : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar modulo.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAssets(projectId: string) {
    try {
      const res = await adminFetch(
        `/api/admin/criativos/assets?projectId=${projectId}`,
      );
      const json = await res.json();
      if (!res.ok) {
        throw new Error(asText(json.error) || "Erro ao carregar assets.");
      }
      setAssets(Array.isArray(json.assets) ? json.assets : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar assets.");
    }
  }

  function applyOffer(offerId: string) {
    const offer = offers.find((item) => item.id === offerId);
    if (!offer) return;
    setSelectedOfferId(offer.id);
    setSelectedLandingPageId("");
    setCampaignName(offer.title || "Campanha Radar Smart");
    setTitle(offer.title || "");
    setMarketplace(offer.marketplace || "");
    setCategory(offer.category || "");
    setProductUrl(offer.product_url || "");
    setAffiliateUrl(offer.affiliate_url || "");
    setImageUrl(offer.image_url || "");
    setPrice(offer.price ? String(offer.price) : "");
    setOriginalPrice(String(offer.original_price || offer.old_price || ""));
    setMessage("Oferta aplicada ao briefing.");
  }

  function applyLandingPage(landingId: string) {
    const landing = landingPages.find((item) => item.id === landingId);
    if (!landing) return;
    setSelectedLandingPageId(landing.id);
    setSelectedOfferId(landing.offer_id || "");
    setCampaignName(landing.utm_campaign || landing.title || landing.product_title || "Campanha Radar Smart");
    setTitle(landing.product_title || landing.headline || landing.title || "");
    setMarketplace(landing.marketplace || "");
    setCategory(landing.source_category || "");
    setProductUrl(landing.source_product_url || "");
    setAffiliateUrl(landing.affiliate_url || "");
    setImageUrl(landing.hero_image_url || "");
    setPrice(landing.product_price ? String(landing.product_price) : "");
    setOriginalPrice(landing.product_old_price ? String(landing.product_old_price) : "");
    setMessage("Landing aplicada ao briefing.");
  }

  function applyProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    setSelectedProjectId(project.id);
    setSelectedOfferId(project.offer_id || "");
    setSelectedLandingPageId(project.landing_page_id || "");
    setSelectedPersonaId(project.persona_id || "");
    setSelectedTemplateId(project.template_id || "");
    setSelectedAngleId(project.angle_id || "");
    setCampaignName(project.campaign_name || "");
    setTitle(project.title || "");
    setMarketplace(project.marketplace || "");
    setCategory(project.category || "");
    setProductUrl(project.product_url || "");
    setAffiliateUrl(project.affiliate_url || "");
    setImageUrl(project.image_url || "");
    setPrice(project.price ? String(project.price) : "");
    setOriginalPrice(project.original_price ? String(project.original_price) : "");
    setUgcType(project.ugc_type || "model-a");
    setVoiceKey(project.voice_key || "mateus");
    setObjective(project.objective || "conversion");
    setProjectStatus(project.status || "draft");
    const voiceDirection = normalizeVoiceDirection(project.voice_direction);
    const behaviorDirection = normalizeBehaviorDirection(project.behavior_direction);
    setVoicePace(voiceDirection.pace || "balanced");
    setPauseStyle(voiceDirection.pauseStyle || "natural");
    setEmotionalIntensity(voiceDirection.emotionalIntensity || "medium");
    setUrgencyLevel(voiceDirection.urgency || "medium");
    setCredibilityLevel(voiceDirection.credibility || "high");
    setCtaPressure(voiceDirection.ctaPressure || "balanced");
    setEyeContact(behaviorDirection.eyeContact || "balanced");
    setGestureIntensity(behaviorDirection.gestureIntensity || "medium");
    setSmileLevel(behaviorDirection.smileLevel || "low");
    setImperfectionLevel(behaviorDirection.imperfectionLevel || "medium");
    setCameraEnergy(behaviorDirection.cameraEnergy || "balanced");
    setGeneratedScript(project.current_script || null);
    setGeneratedBriefing(project.current_briefing || null);
    setMessage("Projeto aplicado ao briefing.");
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/criativos/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId || undefined,
          personaId: selectedPersonaId || undefined,
          templateId: selectedTemplateId || undefined,
          angleId: selectedAngleId || undefined,
          campaignName,
          ugcType,
          voice: voiceKey,
          title,
          marketplace,
          category,
          productUrl,
          objective,
          voiceDirection: currentVoiceDirection,
          behaviorDirection: currentBehaviorDirection,
          price,
          originalPrice,
        }),
      });
      const json = (await res.json()) as GenerateResponse & { error?: string };
      if (!res.ok) throw new Error(asText(json.error) || "Erro ao gerar roteiro.");
      setGeneratedScript(json.script);
      setGeneratedBriefing(json.briefing);
      if (json.persona?.id) setSelectedPersonaId(json.persona.id);
      if (json.template?.id) setSelectedTemplateId(json.template.id);
      if (json.angle?.id) setSelectedAngleId(json.angle.id);
      setMessage("Roteiro gerado com sucesso.");
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Erro ao gerar roteiro.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveProject() {
    setSavingProject(true);
    setError(null);
    setMessage(null);
    try {
      const method = selectedProjectId ? "PATCH" : "POST";
      const res = await adminFetch("/api/admin/criativos/projects", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedProjectId || undefined,
          offerId: selectedOfferId || undefined,
          landingPageId: selectedLandingPageId || undefined,
          personaId: selectedPersonaId || undefined,
          templateId: selectedTemplateId || undefined,
          angleId: selectedAngleId || undefined,
          campaignName,
          title,
          marketplace,
          category,
          productUrl,
          affiliateUrl,
          imageUrl,
          price,
          originalPrice,
          ugcType,
          voiceKey,
          objective,
          status: projectStatus,
          voiceDirection: currentVoiceDirection,
          behaviorDirection: currentBehaviorDirection,
          currentScript: generatedScript || undefined,
          currentBriefing: generatedBriefing || undefined,
          metadata: {},
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(asText(json.error) || "Erro ao salvar projeto.");
      setMessage(selectedProjectId ? "Projeto atualizado." : "Projeto criado.");
      await loadAll();
      if (json.project?.id) setSelectedProjectId(json.project.id);
    } catch (projectError) {
      setError(projectError instanceof Error ? projectError.message : "Erro ao salvar projeto.");
    } finally {
      setSavingProject(false);
    }
  }

  async function handleSaveToHistory() {
    if (!generatedScript?.full_text) {
      setError("Gere um roteiro antes de salvar no histórico.");
      return;
    }
    setSavingHistory(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/criativos/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: selectedOfferId || undefined,
          landingPageId: selectedLandingPageId || undefined,
          projectId: selectedProjectId || undefined,
          personaId: selectedPersonaId || undefined,
          templateId: selectedTemplateId || undefined,
          angleId: selectedAngleId || undefined,
          campaignName,
          ugcType,
          voiceKey,
          title,
          marketplace,
          category,
          productUrl,
          price,
          originalPrice,
          script: generatedScript,
          briefing: generatedBriefing,
          voiceDirection: currentVoiceDirection,
          behaviorDirection: currentBehaviorDirection,
          sourceContext: {
            affiliateUrl,
            imageUrl,
            objective,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(asText(json.error) || "Erro ao salvar no histórico.");
      setMessage("Criativo salvo no histórico.");
      await loadAll();
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : "Erro ao salvar no histórico.");
    } finally {
      setSavingHistory(false);
    }
  }

  async function handleGenerateAudio() {
    if (!selectedProjectId) {
      setError("Salve o projeto antes de gerar áudio.");
      return;
    }

    const scriptForAudio = generatedScript ?? selectedProject?.current_script ?? null;
    if (!scriptForAudio?.full_text) {
      setError("Gere ou carregue um roteiro antes de gerar áudio.");
      return;
    }

    setGeneratingAudio(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/criativos/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          voiceKey,
          script: scriptForAudio,
          voiceDirection: currentVoiceDirection,
          behaviorDirection: currentBehaviorDirection,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(asText(json.error) || "Erro ao gerar áudio.");
      }
      setMessage("Áudio gerado com sucesso.");
      await loadAssets(selectedProjectId);
      await loadAll();
    } catch (audioError) {
      setError(audioError instanceof Error ? audioError.message : "Erro ao gerar áudio.");
    } finally {
      setGeneratingAudio(false);
    }
  }

  function stopVideoPolling() {
    if (videoPollRef.current) {
      clearInterval(videoPollRef.current);
      videoPollRef.current = null;
    }
  }

  async function pollVideoJob(jobId: string) {
    try {
      const res = await adminFetch(`/api/admin/criativos/video/status?jobId=${jobId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(asText(json.error) || "Erro ao consultar status do vídeo.");

      const job = json.job as VideoJobRow;
      setVideoJob(job);
      setVideoJobScenes((json.scenes ?? []) as VideoJobSceneRow[]);

      if (["completed", "failed", "cancelled"].includes(job.status)) {
        stopVideoPolling();
        setGeneratingVideo(false);
        if (job.status === "completed") {
          setMessage("Vídeo gerado com sucesso.");
          await loadAssets(selectedProjectId);
        } else if (job.status === "failed") {
          setError(job.error || "Falha ao gerar vídeo.");
        }
      }
    } catch (pollError) {
      stopVideoPolling();
      setGeneratingVideo(false);
      setError(pollError instanceof Error ? pollError.message : "Erro ao consultar status do vídeo.");
    }
  }

  async function handleGenerateVideo() {
    if (!selectedProjectId) {
        setError("Salve o projeto antes de gerar vídeo.");
        return;
    }

    stopVideoPolling();
    setGeneratingVideo(true);
    setError(null);
    setMessage(null);
    setVideoJob(null);
    setVideoJobScenes([]);

    try {
        const res = await adminFetch("/api/admin/criativos/video", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: selectedProjectId })
        });
        const json = await res.json();

        if (!res.ok) {
            throw new Error(asText(json.error) || "Erro ao gerar vídeo.");
        }

        setMessage("Vídeo entrou na fila — acompanhe o progresso das cenas abaixo.");
        void pollVideoJob(json.jobId);
        videoPollRef.current = setInterval(() => void pollVideoJob(json.jobId), 5000);
    } catch (videoError) {
        setError(videoError instanceof Error ? videoError.message : "Erro ao gerar vídeo.");
        setGeneratingVideo(false);
    }
  }

  async function handleClassifyProduct() {
    if (!title || !price) {
      setError("Preencha título e preço antes de pedir a sugestão da IA.");
      return;
    }

    setClassifying(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/criativos/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          price: Number(String(price).replace(/[^\d,.-]/g, "").replace(",", ".")),
          category: category || undefined,
          marketplace: marketplace || undefined,
          discount_pct:
            price && originalPrice
              ? Math.round(
                  ((Number(String(originalPrice).replace(",", ".")) -
                    Number(String(price).replace(",", "."))) /
                    Number(String(originalPrice).replace(",", "."))) *
                    100,
                )
              : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(asText(json.error) || "Erro ao classificar produto.");

      const result = json.classification as ProductClassification;
      setClassification(result);

      const persona = personas.find((item) => item.slug === result.recommendedPersonaSlug);
      const template = templates.find((item) => item.slug === result.recommendedTemplateSlug);
      const angle = angles.find((item) => item.slug === result.recommendedAngleSlug);
      if (persona) setSelectedPersonaId(persona.id);
      if (template) setSelectedTemplateId(template.id);
      if (angle) setSelectedAngleId(angle.id);
    } catch (classifyError) {
      setError(classifyError instanceof Error ? classifyError.message : "Erro ao classificar produto.");
    } finally {
      setClassifying(false);
    }
  }

  function flashCopyBadge() {
    setCopyBadge("✅ Copiado!");
    if (copyBadgeTimerRef.current) {
      clearTimeout(copyBadgeTimerRef.current);
    }
    copyBadgeTimerRef.current = setTimeout(() => {
      setCopyBadge(null);
    }, 1800);
  }

  async function copyText(value: string, successMessage = "Conteúdo copiado.") {
    await navigator.clipboard.writeText(value);
    setMessage(successMessage);
    flashCopyBadge();
  }

  async function handleGenerateWhatsAppCopy() {
    const offer: OfferRow = selectedOffer ?? {
      id: "",
      title,
      marketplace,
      category,
      product_url: productUrl,
      affiliate_url: affiliateUrl,
      image_url: imageUrl,
      price: price ? Number(String(price).replace(/[^\d,.-]/g, "").replace(",", ".")) : null,
      old_price: originalPrice ? Number(String(originalPrice).replace(/[^\d,.-]/g, "").replace(",", ".")) : null,
      original_price: originalPrice ? Number(String(originalPrice).replace(/[^\d,.-]/g, "").replace(",", ".")) : null,
    } as OfferRow;

    if (!offer.title || !offer.marketplace || !offer.affiliate_url || !offer.price) {
      setError("Selecione uma oferta ou preencha título, marketplace, preço e link afiliado.");
      return;
    }

    setGeneratingWhatsAppCopy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await adminFetch("/api/admin/criativos/whatsapp-copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: offer.title,
          price: offer.price,
          original_price: offer.original_price ?? offer.old_price ?? undefined,
          discount_pct: offer.discount_pct ?? undefined,
          coupon_code: offer.coupon_code ?? undefined,
          coupon_discount: offer.coupon_discount ?? undefined,
          affiliate_url: offer.affiliate_url,
          image_url: offer.image_url ?? undefined,
          category: offer.category ?? undefined,
          marketplace: offer.marketplace,
          rating: offer.rating ?? undefined,
          reviews_count: offer.reviews_count ?? undefined,
        }),
      });

      const json = (await res.json()) as WhatsAppCopyVariants & { error?: string };
      if (!res.ok) {
        throw new Error(asText(json.error) || "Erro ao gerar copy do WhatsApp.");
      }

      setWhatsAppCopy({
        hook: asText(json.hook),
        short: asText(json.short),
        medium: asText(json.medium),
        long: asText(json.long),
      });
      setWhatsAppCopyTab("medium");
      setMessage("Copy WhatsApp/Telegram gerada com sucesso.");
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Erro ao gerar copy do WhatsApp.");
    } finally {
      setGeneratingWhatsAppCopy(false);
    }
  }

  async function handleSaveWhatsAppCopy() {
    if (!whatsappCopy) {
      setError("Gere a copy antes de salvar no histórico.");
      return;
    }

    const currentOffer = selectedOffer ?? null;
    if (!currentOffer?.title || !currentOffer.marketplace || !currentOffer.affiliate_url || !currentOffer.price) {
      setError("Selecione uma oferta válida antes de salvar a copy.");
      return;
    }

    setSavingWhatsAppCopy(true);
    setError(null);
    setMessage(null);
    try {
      const whatsappScript = {
        hook: whatsappCopy.hook,
        body: whatsappCopy.medium,
        cta: `Ver em Radar Smart: ${currentOffer.affiliate_url}`,
        full_text: whatsappCopy.long,
        tone: "whatsapp-telegram-copy",
        part1: whatsappCopy.short,
        part2: whatsappCopy.medium,
        part3: whatsappCopy.long,
      };

      const res = await adminFetch("/api/admin/criativos/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: selectedOfferId || undefined,
          landingPageId: selectedLandingPageId || undefined,
          projectId: selectedProjectId || undefined,
          personaId: selectedPersonaId || undefined,
          templateId: selectedTemplateId || undefined,
          angleId: selectedAngleId || undefined,
          campaignName: campaignName || currentOffer.title,
          ugcType,
          voiceKey,
          title: currentOffer.title,
          marketplace: currentOffer.marketplace,
          category: currentOffer.category || category || undefined,
          productUrl: currentOffer.product_url || productUrl || currentOffer.affiliate_url,
          price: currentOffer.price,
          originalPrice: currentOffer.original_price || currentOffer.old_price || undefined,
          script: whatsappScript,
          briefing: generatedBriefing,
          whatsappCopy: {
            hook: whatsappCopy.hook,
            short: whatsappCopy.short,
            medium: whatsappCopy.medium,
            long: whatsappCopy.long,
            imageUrl: currentOffer.image_url || imageUrl || undefined,
          },
          voiceDirection: currentVoiceDirection,
          behaviorDirection: currentBehaviorDirection,
          sourceContext: {
            affiliateUrl: currentOffer.affiliate_url,
            imageUrl: currentOffer.image_url || imageUrl || undefined,
            objective,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(asText(json.error) || "Erro ao salvar copy no histórico.");
      setMessage("Copy WhatsApp/Telegram salva no histórico.");
      await loadAll();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro ao salvar copy no histórico.");
    } finally {
      setSavingWhatsAppCopy(false);
    }
  }

  function clearBriefing() {
    setSelectedOfferId("");
    setSelectedLandingPageId("");
    setSelectedProjectId("");
    setSelectedPersonaId("");
    setSelectedTemplateId("");
    setSelectedAngleId("");
    setCampaignName("");
    setTitle("");
    setMarketplace("");
    setCategory("");
    setProductUrl("");
    setAffiliateUrl("");
    setImageUrl("");
    setObjective("conversion");
    setPrice("");
    setOriginalPrice("");
    setUgcType("model-a");
    setVoiceKey("mateus");
    setProjectStatus("draft");
    setVoicePace("balanced");
    setPauseStyle("natural");
    setEmotionalIntensity("medium");
    setUrgencyLevel("medium");
    setCredibilityLevel("high");
    setCtaPressure("balanced");
    setEyeContact("balanced");
    setGestureIntensity("medium");
    setSmileLevel("low");
    setImperfectionLevel("medium");
    setCameraEnergy("balanced");
    setGeneratedScript(null);
    setGeneratedBriefing(null);
    setWhatsAppCopy(null);
    setWhatsAppCopyTab("medium");
    setCopyBadge(null);
    setAssets([]);
    setMessage("Briefing limpo.");
    setError(null);
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Clapperboard className="text-orange-500 h-8 w-8" /> Criativos UGC
        </h1>
        <p className="text-sm text-slate-600">
          Monte projetos de criativos a partir de ofertas, landing pages e personas.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)}><CheckCircle2 className="h-4 w-4" /></button>
        </div>
      ) : null}
      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center justify-between">
          <span>{message}</span>
          <button onClick={() => setMessage(null)}><CheckCircle2 className="h-4 w-4" /></button>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <FolderKanban className="h-4 w-4 text-orange-500" />
              Projeto
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span>Projeto salvo</span>
                <select
                  value={selectedProjectId}
                  onChange={(e) => applyProject(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="">Novo projeto</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.campaign_name}  -  {project.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Status do projeto</span>
                <select
                  value={projectStatus}
                  onChange={(e) => setProjectStatus(e.target.value as UGCProjectStatus)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {PROJECT_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Sparkles className="h-4 w-4 text-orange-500" />
                Copy WhatsApp/Telegram
              </div>
              {copyBadge ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {copyBadge}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleGenerateWhatsAppCopy}
              disabled={generatingWhatsAppCopy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {generatingWhatsAppCopy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              🔥 Gerar Copy
            </button>

            {whatsappCopy ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-orange-700">
                    Hook
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-800">
                    {whatsappCopy.hook}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "short" as const, label: "Curta" },
                    { key: "medium" as const, label: "Média" },
                    { key: "long" as const, label: "Longa" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setWhatsAppCopyTab(tab.key)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        whatsappCopyTab === tab.key
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Texto da versão {whatsappCopyTab === "short" ? "curta" : whatsappCopyTab === "medium" ? "média" : "longa"}
                    </span>
                    <textarea
                      value={whatsappCopy[whatsappCopyTab]}
                      onChange={(event) =>
                        setWhatsAppCopy((current) =>
                          current
                            ? {
                                ...current,
                                [whatsappCopyTab]: event.target.value,
                              }
                            : current,
                        )
                      }
                      rows={12}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-orange-400"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void copyText(whatsappCopy[whatsappCopyTab], "Texto copiado para a área de transferência.")}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          selectedOffer?.image_url || imageUrl
                            ? `${whatsappCopy[whatsappCopyTab]}\n\n🖼️ Imagem: ${selectedOffer?.image_url || imageUrl}`
                            : whatsappCopy[whatsappCopyTab],
                          "Copy com imagem copiada.",
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                      >
                        <Copy className="h-4 w-4" />
                        Copiar com imagem
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveWhatsAppCopy}
                      disabled={savingWhatsAppCopy}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingWhatsAppCopy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar no histórico
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Gere a copy para visualizar as três variações aqui.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Clapperboard className="h-4 w-4 text-orange-500" />
              Origem do briefing
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span>Oferta salva</span>
                <select
                  value={selectedOfferId}
                  onChange={(e) => applyOffer(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="">Selecionar oferta</option>
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Landing page</span>
                <select
                  value={selectedLandingPageId}
                  onChange={(e) => applyLandingPage(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="">Selecionar landing</option>
                  {landingPages.map((landing) => (
                    <option key={landing.id} value={landing.id}>
                      {landing.title || landing.product_title || landing.headline || landing.id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <UserRound className="h-4 w-4 text-orange-500" />
                Persona e briefing
              </div>
              <button
                type="button"
                onClick={handleClassifyProduct}
                disabled={classifying || !title || !price}
                className="inline-flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition hover:bg-orange-100 disabled:opacity-60"
              >
                {classifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Sugerir com IA
              </button>
            </div>

            {classification ? (
              <div className="mb-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-4 text-xs text-slate-700">
                <div className="font-semibold text-orange-800">
                  Público-alvo sugerido: {classification.audienceDescriptor || "-"}
                </div>
                <p className="mt-1 text-slate-600">{classification.reasoning}</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-700">
                <span>Persona</span>
                <select
                  value={selectedPersonaId}
                  onChange={(e) => setSelectedPersonaId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="">Selecionar persona</option>
                  {personas.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}  -  {persona.archetype}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Template</span>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="">Selecionar template</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Ângulo</span>
                <select
                  value={selectedAngleId}
                  onChange={(e) => setSelectedAngleId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="">Selecionar ângulo</option>
                  {angles.map((angle) => (
                    <option key={angle.id} value={angle.id}>
                      {angle.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Objetivo</span>
                <input
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                  placeholder="conversion, awareness, retargeting..."
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Campanha</span>
                <input
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Título do produto</span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Marketplace</span>
                <input
                  value={marketplace}
                  onChange={(e) => setMarketplace(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Categoria</span>
                <input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>URL do produto</span>
                <input
                  value={productUrl}
                  onChange={(e) => setProductUrl(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>Link afiliado</span>
                <input
                  value={affiliateUrl}
                  onChange={(e) => setAffiliateUrl(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700 md:col-span-2">
                <span>Imagem</span>
                <input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Preço atual</span>
                <input
                  value={price}
                  onChange={(e) => setPrice(asPrice(e.target.value))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Preço antigo</span>
                <input
                  value={originalPrice}
                  onChange={(e) => setOriginalPrice(asPrice(e.target.value))}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Modelo UGC</span>
                <select
                  value={ugcType}
                  onChange={(e) => setUgcType(e.target.value as UGCType)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  <option value="model-a">Model A (Multi-cena)</option>
                  <option value="model-b">Model B (Pexels Stock)</option>
                  <option value="model-c">Model C (Screen Record)</option>
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Voz</span>
                <select
                  value={voiceKey}
                  onChange={(e) => setVoiceKey(e.target.value as VoiceKey)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {Object.entries(UGC_VOICES).map(([key, voice]) => (
                    <option key={key} value={key}>
                      {voice.name}  -  {voice.style}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-3">
              <div className="md:col-span-3 text-sm font-semibold text-slate-900">
                Direção de voz
              </div>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Ritmo</span>
                <select
                  value={voicePace}
                  onChange={(e) => setVoicePace(e.target.value as UGCVoiceDirection["pace"])}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {PACE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Pausas</span>
                <select
                  value={pauseStyle}
                  onChange={(e) => setPauseStyle(e.target.value as UGCVoiceDirection["pauseStyle"])}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {PAUSE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Emoção</span>
                <select
                  value={emotionalIntensity}
                  onChange={(e) =>
                    setEmotionalIntensity(
                      e.target.value as UGCVoiceDirection["emotionalIntensity"],
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {THREE_LEVEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Urgência</span>
                <select
                  value={urgencyLevel}
                  onChange={(e) => setUrgencyLevel(e.target.value as UGCVoiceDirection["urgency"])}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {THREE_LEVEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Credibilidade</span>
                <select
                  value={credibilityLevel}
                  onChange={(e) =>
                    setCredibilityLevel(
                      e.target.value as UGCVoiceDirection["credibility"],
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {THREE_LEVEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Força do CTA</span>
                <select
                  value={ctaPressure}
                  onChange={(e) =>
                    setCtaPressure(e.target.value as UGCVoiceDirection["ctaPressure"])
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {CTA_PRESSURE_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 grid gap-4 rounded-2xl border border-slate-200 p-4 md:grid-cols-3">
              <div className="md:col-span-3 text-sm font-semibold text-slate-900">
                Direção comportamental
              </div>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Contato visual</span>
                <select
                  value={eyeContact}
                  onChange={(e) =>
                    setEyeContact(e.target.value as UGCBehaviorDirection["eyeContact"])
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {EYE_CONTACT_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Gestos</span>
                <select
                  value={gestureIntensity}
                  onChange={(e) =>
                    setGestureIntensity(
                      e.target.value as UGCBehaviorDirection["gestureIntensity"],
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {THREE_LEVEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Sorriso</span>
                <select
                  value={smileLevel}
                  onChange={(e) =>
                    setSmileLevel(e.target.value as UGCBehaviorDirection["smileLevel"])
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {THREE_LEVEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Imperfeição</span>
                <select
                  value={imperfectionLevel}
                  onChange={(e) =>
                    setImperfectionLevel(
                      e.target.value as UGCBehaviorDirection["imperfectionLevel"],
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {THREE_LEVEL_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm text-slate-700">
                <span>Energia em câmera</span>
                <select
                  value={cameraEnergy}
                  onChange={(e) =>
                    setCameraEnergy(
                      e.target.value as UGCBehaviorDirection["cameraEnergy"],
                    )
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-orange-400"
                >
                  {CAMERA_ENERGY_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSaveProject}
                disabled={savingProject}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {savingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {selectedProjectId ? "Atualizar projeto" : "Salvar projeto"}
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
              >
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Gerar roteiro com IA
              </button>
              <button
                type="button"
                onClick={clearBriefing}
                className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Limpar briefing
              </button>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bot className="h-4 w-4 text-orange-500" />
              Persona ativa
            </div>
            {selectedPersona ? (
              <div className="space-y-3 text-sm text-slate-700">
                <div>
                  <div className="font-semibold text-slate-900">{selectedPersona.name}</div>
                  <div>{selectedPersona.archetype}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>Tom: {selectedPersona.tone || "-"}</div>
                  <div>Energia: {selectedPersona.energy || "-"}</div>
                  <div>Estilo: {selectedPersona.visualStyle || "-"}</div>
                  <div>Sotaque: {selectedPersona.accent || "-"}</div>
                </div>
                <div>
                  <div className="mb-1 font-medium text-slate-900">Casos de uso</div>
                  <div className="flex flex-wrap gap-2">
                    {selectedPersona.primaryUseCases.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Selecione uma persona para orientar o roteiro.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Template e ângulo
            </div>
            <div className="space-y-4 text-sm text-slate-700">
              <div>
                <div className="font-semibold text-slate-900">Template</div>
                {selectedTemplate ? (
                  <div className="mt-2 space-y-1">
                    <div>{selectedTemplate.name}</div>
                    <div className="text-slate-500">{selectedTemplate.description || "-"}</div>
                    <div className="text-slate-500">
                      Duração: {selectedTemplate.recommendedDuration || "-"}  -  CTA:{" "}
                      {selectedTemplate.ctaStyle || "-"}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 text-slate-500">Nenhum template selecionado.</div>
                )}
              </div>
              <div className="border-t border-slate-100 pt-4">
                <div className="font-semibold text-slate-900">Ângulo</div>
                {selectedAngle ? (
                  <div className="mt-2 space-y-2">
                    <div>{selectedAngle.name}</div>
                    <div className="text-slate-500">{selectedAngle.description || "-"}</div>
                    {selectedAngle.hookStarters.length ? (
                      <div className="text-slate-500">
                        Hook starters: {selectedAngle.hookStarters.slice(0, 3).join(" | ")}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-2 text-slate-500">Nenhum ângulo selecionado.</div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Sparkles className="h-4 w-4 text-orange-500" />
              Roteiro gerado
            </div>
            {generatedScript ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Hook</div>
                  <p className="mt-1">{generatedScript.hook}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">Corpo</div>
                  <p className="mt-1">{generatedScript.body}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900">CTA</div>
                  <p className="mt-1">{generatedScript.cta}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">Roteiro completo</div>
                    <button
                      type="button"
                      onClick={() => void copyText(generatedScript.full_text || "")}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-white"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </button>
                  </div>
                  <p className="whitespace-pre-line">{generatedScript.full_text}</p>
                </div>

                {generatedBriefing ? (
                  <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                    <div className="font-semibold text-slate-900">Briefing operacional</div>
                    <div className="mt-3 space-y-2">
                      <div>Ângulo: {generatedBriefing.angle || "-"}</div>
                      <div>Formato: {generatedBriefing.recommendedFormat || "-"}</div>
                      <div>Duração: {generatedBriefing.idealDuration || "-"}</div>
                      <div>Hook: {generatedBriefing.hookStyle || "-"}</div>
                    </div>
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleSaveToHistory}
                      disabled={savingHistory}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {savingHistory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Salvar Histórico
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateAudio}
                      disabled={generatingAudio || !selectedProjectId}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {generatingAudio ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mic2 className="h-4 w-4" />
                      )}
                      Gerar Áudio
                    </button>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateVideo}
                  disabled={generatingVideo || !selectedProjectId}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-rs-gold px-4 py-4 text-sm font-black text-white transition hover:brightness-110 disabled:opacity-60 uppercase tracking-widest shadow-lg shadow-rs-gold/20"
                >
                  {generatingVideo ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Video className="h-5 w-5" />
                  )}
                  Renderizar Vídeo Final UGC
                </button>

                {videoJob ? (
                  <div className="rounded-2xl border border-slate-200 p-4 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">
                        Status do vídeo: {VIDEO_JOB_STATUS_LABELS[videoJob.status] || videoJob.status}
                      </span>
                    </div>
                    {videoJob.error ? (
                      <p className="mt-2 text-xs text-red-600">{videoJob.error}</p>
                    ) : null}
                    {videoJobScenes.length > 0 ? (
                      <ul className="mt-3 space-y-2">
                        {videoJobScenes.map((scene) => (
                          <li
                            key={scene.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs"
                          >
                            <span className="text-slate-600">
                              Cena {scene.scene_index + 1} · {scene.scene_type}
                            </span>
                            <span className="flex items-center gap-2">
                              {scene.status === "stock_fallback" ? (
                                <span
                                  title={scene.fallback_reason || "Caiu para vídeo de banco de imagens"}
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800"
                                >
                                  <AlertTriangle className="h-3 w-3" />
                                  Fallback estoque
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-200 px-2 py-1 font-semibold text-slate-700">
                                  {VIDEO_SCENE_STATUS_LABELS[scene.status] || scene.status}
                                </span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Gere um roteiro para visualizar o resultado aqui.</p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Sparkles className="h-4 w-4 text-orange-500" />
                Copy WhatsApp/Telegram
              </div>
              {copyBadge ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {copyBadge}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleGenerateWhatsAppCopy}
              disabled={generatingWhatsAppCopy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {generatingWhatsAppCopy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              🔥 Gerar Copy
            </button>

            {whatsappCopy ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-orange-700">
                    Hook
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-slate-800">
                    {whatsappCopy.hook}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "short" as const, label: "Curta" },
                    { key: "medium" as const, label: "Média" },
                    { key: "long" as const, label: "Longa" },
                  ].map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setWhatsAppCopyTab(tab.key)}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        whatsappCopyTab === tab.key
                          ? "bg-slate-900 text-white"
                          : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="block space-y-2">
                    <span className="text-sm font-semibold text-slate-900">
                      Texto da versão {whatsappCopyTab === "short" ? "curta" : whatsappCopyTab === "medium" ? "média" : "longa"}
                    </span>
                    <textarea
                      value={whatsappCopy[whatsappCopyTab]}
                      onChange={(event) =>
                        setWhatsAppCopy((current) =>
                          current
                            ? {
                                ...current,
                                [whatsappCopyTab]: event.target.value,
                              }
                            : current,
                        )
                      }
                      rows={12}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-orange-400"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void copyText(whatsappCopy[whatsappCopyTab], "Texto copiado para a área de transferência.")}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void copyText(
                          selectedOffer?.image_url || imageUrl
                            ? `${whatsappCopy[whatsappCopyTab]}\n\n🖼️ Imagem: ${selectedOffer?.image_url || imageUrl}`
                            : whatsappCopy[whatsappCopyTab],
                          "Copy com imagem copiada.",
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                    >
                      <Copy className="h-4 w-4" />
                      Copiar com imagem
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Gere a copy para visualizar as três variações aqui.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <AudioLines className="h-4 w-4 text-orange-500" />
              Assets do Projeto (Vídeo/Áudio)
            </div>
            {!selectedProjectId ? (
              <p className="text-sm text-slate-500">Salve e selecione um projeto para gerar e listar assets.</p>
            ) : assets.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum asset gerado para este projeto.</p>
            ) : (
              <div className="space-y-4">
                {assets.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-slate-200 p-4 bg-slate-50/50">
                    <div className="mb-3 flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        {asset.asset_type === 'video' ? <Video className="h-4 w-4 text-orange-500" /> : <Mic2 className="h-4 w-4 text-indigo-500" />}
                        <div>
                            <div className="font-bold text-slate-900 uppercase text-[10px] tracking-wider">
                                {asset.asset_type === 'video' ? 'VÍDEO FINAL' : 'NARRAÇÃO IA'}
                            </div>
                            <div className="text-[10px] text-slate-500">
                                {asset.provider || "-"}  •  {formatDate(asset.created_at)}
                            </div>
                        </div>
                      </div>
                      <a 
                        href={asset.public_url || '#'} 
                        target="_blank" 
                        rel="noreferrer"
                        className="p-2 bg-white rounded-full border border-slate-200 text-slate-400 hover:text-orange-500 transition shadow-sm"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                    {asset.asset_type === 'video' && asset.public_url ? (
                      <video controls className="w-full rounded-xl shadow-md bg-black max-h-60">
                        <source src={asset.public_url} type={asset.mime_type || "video/mp4"} />
                      </video>
                    ) : asset.asset_type === 'audio' && asset.public_url ? (
                      <audio controls className="w-full">
                        <source src={asset.public_url} type={asset.mime_type || "audio/mpeg"} />
                      </audio>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FolderKanban className="h-4 w-4 text-orange-500" />
            Projetos recentes
          </div>
          <div className="space-y-3">
            {projects.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum projeto salvo ainda.</p>
            ) : (
              projects.slice(0, 8).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => applyProject(project.id)}
                  className="block w-full rounded-2xl border border-slate-200 p-4 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{project.campaign_name}</div>
                      <div className="text-sm text-slate-600">{project.title}</div>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {project.status}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {project.ugc_personas?.name || "Sem persona"}  -  {formatMoney(project.price)}  - {" "}
                    {formatDate(project.updated_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Mic2 className="h-4 w-4 text-orange-500" />
            Histórico recente
          </div>
          <div className="space-y-3">
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhum criativo salvo no histórico.</p>
            ) : (
              history.slice(0, 8).map((creative) => (
                <div key={creative.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-semibold text-slate-900">{creative.campaign_name}</div>
                      <div className="text-sm text-slate-600">{creative.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyText(creative.generated_script?.full_text || "")}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copiar
                    </button>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {creative.ugc_type}  -  {creative.voice_key}  -  {formatDate(creative.created_at)}
                  </div>
                  {creative.whatsapp_copy?.short || creative.whatsapp_copy?.medium || creative.whatsapp_copy?.long ? (
                    <div className="mt-4 rounded-2xl border border-orange-100 bg-orange-50/60 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-xs font-semibold uppercase tracking-widest text-orange-700">
                          Copy WhatsApp/Telegram salva
                        </div>
                        {creative.whatsapp_copy?.hook ? (
                          <button
                            type="button"
                            onClick={() => void copyText(creative.whatsapp_copy?.hook || "")}
                            className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar hook
                          </button>
                        ) : null}
                      </div>
                      {creative.whatsapp_copy?.hook ? (
                        <p className="mb-3 rounded-xl bg-white/80 px-3 py-2 text-sm text-slate-800">
                          {creative.whatsapp_copy.hook}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {[
                          {
                            key: "short" as const,
                            label: "Curta",
                            text: creative.whatsapp_copy?.short || "",
                          },
                          {
                            key: "medium" as const,
                            label: "Média",
                            text: creative.whatsapp_copy?.medium || "",
                          },
                          {
                            key: "long" as const,
                            label: "Longa",
                            text: creative.whatsapp_copy?.long || "",
                          },
                        ].map((variant) =>
                          variant.text ? (
                            <button
                              key={variant.key}
                              type="button"
                              onClick={() => void copyText(variant.text)}
                              className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copiar {variant.label}
                            </button>
                          ) : null,
                        )}
                        {creative.whatsapp_copy?.imageUrl || creative.whatsapp_copy?.image_url ? (
                          <button
                            type="button"
                            onClick={() =>
                              void copyText(
                                `${creative.whatsapp_copy?.long || creative.whatsapp_copy?.medium || creative.whatsapp_copy?.short || ""}\n\n🖼️ Imagem: ${creative.whatsapp_copy?.imageUrl || creative.whatsapp_copy?.image_url}`,
                              )
                            }
                            className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white px-3 py-1.5 text-xs font-medium text-orange-700 transition hover:bg-orange-100"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Copiar com imagem
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
