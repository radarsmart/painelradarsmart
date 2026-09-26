import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WhatsAppGroupPayload = {
  id?: string;
  name?: string;
  member_count?: number;
  is_admin?: boolean;
  invite_url?: string | null;
  raw?: Record<string, unknown>;
};

type ScanMode = "basic" | "complete" | "international";

type StoredWhatsAppGroup = {
  id: string;
  name: string;
  member_count: number;
  metadata: unknown;
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function slugify(value: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const suffix = createHash("sha1").update(`${value}:${Date.now()}`).digest("hex").slice(0, 6);
  return `${base || "campanha"}-${suffix}`;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

function normalizePhone(value: unknown): string {
  const raw = cleanText(value);
  if (!raw || raw.includes("@g.us")) return "";
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : "";
}

function isPhoneContext(key: string, parentContext: boolean): boolean {
  const normalized = key.toLowerCase();
  return (
    parentContext ||
    normalized.includes("participant") ||
    normalized.includes("member") ||
    normalized.includes("contact") ||
    normalized.includes("phone") ||
    normalized.includes("number") ||
    normalized.includes("author") ||
    normalized.includes("sender")
  );
}

function collectPhoneCandidates(value: unknown, depth = 0, phoneContext = false): string[] {
  if (depth > 6 || value == null) return [];

  if (typeof value === "string" || typeof value === "number") {
    if (!phoneContext && !String(value).includes("@c.us") && !String(value).includes("@s.whatsapp.net")) {
      return [];
    }
    const phone = normalizePhone(value);
    return phone ? [phone] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectPhoneCandidates(item, depth + 1, phoneContext));
  }

  if (typeof value !== "object") return [];

  const phones: string[] = [];
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const nextContext = isPhoneContext(key, phoneContext);
    const canReadPrimitive =
      nextContext ||
      ["user", "phone", "number", "participant", "contact", "author", "sender"].includes(key.toLowerCase());

    if (typeof item === "string" || typeof item === "number") {
      const phone = canReadPrimitive ? normalizePhone(item) : "";
      if (phone) phones.push(phone);
      continue;
    }

    phones.push(...collectPhoneCandidates(item, depth + 1, nextContext));
  }

  return phones;
}

function isBlockedPhone(phone: string, blocklist: Set<string>): boolean {
  for (const blocked of blocklist) {
    if (phone === blocked || phone.endsWith(blocked) || blocked.endsWith(phone)) return true;
  }
  return false;
}

function normalizeScanMode(value: unknown): ScanMode {
  const mode = cleanText(value).toLowerCase();
  if (mode === "basic" || mode === "complete" || mode === "international") return mode;
  return "complete";
}

function cleanEnv(value?: string): string {
  return String(value ?? "").trim().replace(/^['"]|['"]$/g, "").replace(/\\r|\\n/g, "");
}

async function callWhatsAppControl(body: Record<string, unknown>) {
  const supabaseUrl =
    cleanEnv(process.env.SUPABASE_URL) || cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRole = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRole) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/channel-whatsapp-control`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(cleanText(payload.error) || `Falha na Edge Function (${response.status}).`);
  }
  return payload;
}

async function loadDashboard() {
  const [groupsResult, campaignsResult, settingsResult, sentResult] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_groups")
      .select("*")
      .order("is_selected", { ascending: false })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("group_campaigns")
      .select("*, group_campaign_targets(*, whatsapp_groups(*))")
      .neq("status", "archived")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("group_protection_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle(),
    supabaseAdmin
      .from("post_queue")
      .select("id", { count: "exact", head: true })
      .eq("channel", "whatsapp")
      .eq("status", "sent"),
  ]);

  if (groupsResult.error) throw new Error(groupsResult.error.message);
  if (campaignsResult.error) throw new Error(campaignsResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (sentResult.error) throw new Error(sentResult.error.message);

  const groups = groupsResult.data ?? [];
  const selectedGroups = groups.filter((group) => group.is_selected && group.is_active);
  const metrics = {
    active_groups: selectedGroups.length,
    reached_members: selectedGroups.reduce(
      (sum, group) => sum + toPositiveInt(group.member_count, 0),
      0,
    ),
    sent_messages: sentResult.count ?? 0,
  };

  return {
    groups,
    campaigns: campaignsResult.data ?? [],
    settings:
      settingsResult.data ?? {
        id: "default",
        shield_enabled: false,
        ddi_filter_enabled: false,
        blocklist: [],
      },
    metrics,
  };
}

async function syncGroupsFromWhatsApp() {
  const payload = await callWhatsAppControl({ action: "groups" });
  const groups = Array.isArray(payload.groups) ? (payload.groups as WhatsAppGroupPayload[]) : [];
  const now = new Date().toISOString();
  const rows = groups
    .map((group) => {
      const id = cleanText(group.id);
      if (!id) return null;
      return {
        id,
        name: cleanText(group.name) || id,
        member_count: toPositiveInt(group.member_count, 0),
        is_admin: Boolean(group.is_admin),
        invite_url: cleanText(group.invite_url) || null,
        is_active: true,
        last_synced_at: now,
        metadata: group.raw ?? group,
        updated_at: now,
      };
    })
    .filter(Boolean);

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("whatsapp_groups")
      .upsert(rows, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }

  return { imported: rows.length, warnings: payload.warnings ?? [] };
}

async function runProtectionScan(mode: ScanMode) {
  const syncResult = await syncGroupsFromWhatsApp().catch((error) => ({
    imported: 0,
    warnings: [error instanceof Error ? error.message : "Nao foi possivel atualizar grupos antes do scan."],
  }));

  const [groupsResult, settingsResult] = await Promise.all([
    supabaseAdmin
      .from("whatsapp_groups")
      .select("id,name,member_count,metadata")
      .eq("is_selected", true)
      .eq("is_active", true),
    supabaseAdmin
      .from("group_protection_settings")
      .select("blocklist")
      .eq("id", "default")
      .maybeSingle(),
  ]);

  if (groupsResult.error) throw new Error(groupsResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const groups = (groupsResult.data ?? []) as StoredWhatsAppGroup[];
  const blocklist = Array.isArray(settingsResult.data?.blocklist)
    ? settingsResult.data.blocklist.map(normalizePhone).filter(Boolean)
    : [];
  const blockedSet = new Set(blocklist);
  const phones = new Set<string>();
  let groupsWithPhoneDetails = 0;

  for (const group of groups) {
    const groupPhones = collectPhoneCandidates(group.metadata);
    if (groupPhones.length > 0) groupsWithPhoneDetails += 1;
    for (const phone of groupPhones) phones.add(phone);
  }

  const phoneList = [...phones];
  const matches = mode === "international" ? 0 : phoneList.filter((phone) => isBlockedPhone(phone, blockedSet)).length;
  const internationalNumbers = phoneList.filter((phone) => !phone.startsWith("55")).length;
  const estimatedMembers = groups.reduce((sum, group) => sum + toPositiveInt(group.member_count, 0), 0);
  const notes: string[] = [];

  if (groups.length === 0) {
    notes.push("Selecione grupos no Monitor antes de iniciar o scan.");
  }
  if (phoneList.length === 0 && estimatedMembers > 0) {
    notes.push("A conexao atual do WhatsApp retornou a quantidade de membros, mas nao expôs a lista de numeros para cruzamento detalhado.");
  }
  if (mode === "complete") {
    notes.push("A blacklist global ainda usa a blocklist configurada neste painel enquanto nao houver fonte compartilhada externa.");
  }
  const syncWarnings = Array.isArray(syncResult.warnings) ? syncResult.warnings.map(cleanText).filter(Boolean) : [];
  notes.push(...syncWarnings.slice(0, 2));

  return {
    imported: syncResult.imported,
    scan_result: {
      mode,
      checked_groups: groups.length,
      checked_members: phoneList.length || estimatedMembers,
      matches,
      international_numbers: internationalNumbers,
      scanned_at: new Date().toISOString(),
      notes,
      groups_with_phone_details: groupsWithPhoneDetails,
    },
  };
}

export async function GET(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    return NextResponse.json(await loadDashboard());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar grupos." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = cleanText(body.action).toLowerCase();

  try {
    if (action === "sync") {
      const result = await syncGroupsFromWhatsApp();
      return NextResponse.json({ success: true, ...result, ...(await loadDashboard()) });
    }

    if (action === "scan-protection") {
      const result = await runProtectionScan(normalizeScanMode(body.mode));
      return NextResponse.json({ success: true, ...result, ...(await loadDashboard()) });
    }

    if (action === "select-groups") {
      const ids = Array.isArray(body.group_ids) ? body.group_ids.map(cleanText).filter(Boolean) : [];
      const now = new Date().toISOString();
      await supabaseAdmin.from("whatsapp_groups").update({ is_selected: false, updated_at: now }).neq("id", "");
      if (ids.length > 0) {
        const { error } = await supabaseAdmin
          .from("whatsapp_groups")
          .update({ is_selected: true, is_active: true, updated_at: now })
          .in("id", ids);
        if (error) throw new Error(error.message);
      }
      return NextResponse.json({ success: true, ...(await loadDashboard()) });
    }

    if (action === "update-group") {
      const id = cleanText(body.id);
      if (!id) return NextResponse.json({ error: "Grupo invalido." }, { status: 400 });
      const { error } = await supabaseAdmin
        .from("whatsapp_groups")
        .update({
          invite_url: cleanText(body.invite_url) || null,
          niche: cleanText(body.niche) || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, ...(await loadDashboard()) });
    }

    if (action === "save-settings") {
      const { error } = await supabaseAdmin
        .from("group_protection_settings")
        .upsert({
          id: "default",
          shield_enabled: Boolean(body.shield_enabled),
          ddi_filter_enabled: Boolean(body.ddi_filter_enabled),
          blocklist: Array.isArray(body.blocklist) ? body.blocklist.map(cleanText).filter(Boolean) : [],
          updated_at: new Date().toISOString(),
        });
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, ...(await loadDashboard()) });
    }

    if (action === "create-campaign") {
      const name = cleanText(body.name);
      const groupIds = Array.isArray(body.group_ids) ? body.group_ids.map(cleanText).filter(Boolean) : [];
      const memberLimit = toPositiveInt(body.member_limit, 1024);
      if (!name) return NextResponse.json({ error: "Informe o nome da campanha." }, { status: 400 });
      if (!groupIds.length) return NextResponse.json({ error: "Selecione ao menos um grupo." }, { status: 400 });

      const { data: campaign, error } = await supabaseAdmin
        .from("group_campaigns")
        .insert({ name, slug: slugify(name), mode: "existing_groups", status: "active" })
        .select("id")
        .single();
      if (error || !campaign) throw new Error(error?.message ?? "Falha ao criar campanha.");

      const targets = groupIds.map((groupId, index) => ({
        campaign_id: campaign.id,
        group_id: groupId,
        position: index,
        member_limit: memberLimit,
      }));
      const { error: targetsError } = await supabaseAdmin.from("group_campaign_targets").insert(targets);
      if (targetsError) throw new Error(targetsError.message);

      return NextResponse.json({ success: true, ...(await loadDashboard()) });
    }

    if (action === "toggle-campaign") {
      const id = cleanText(body.id);
      const status = cleanText(body.status) === "paused" ? "paused" : "active";
      const { error } = await supabaseAdmin
        .from("group_campaigns")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, ...(await loadDashboard()) });
    }

    if (action === "archive-campaign") {
      const id = cleanText(body.id);
      const { error } = await supabaseAdmin
        .from("group_campaigns")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw new Error(error.message);
      return NextResponse.json({ success: true, ...(await loadDashboard()) });
    }

    return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao processar grupos." },
      { status: 500 },
    );
  }
}
