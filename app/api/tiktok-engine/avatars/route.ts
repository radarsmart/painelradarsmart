import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HeyGenAvatar = {
  avatar_id: string;
  avatar_name: string;
  gender?: string;
  preview_image_url?: string;
  preview_video_url?: string;
};

type HeyGenAvatarsResponse = {
  data?: {
    avatars?: HeyGenAvatar[];
  };
};

type AvatarRegistryEntry = {
  avatar_id: string;
  avatar_name?: string;
  gender?: string;
  preview_image?: string;
  preview_video?: string;
  active?: boolean;
};

type AvatarRegistryConfig = {
  default_avatar_id?: string;
  avatars?: AvatarRegistryEntry[];
};

function normalizeAvatarId(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeAvatarEntry(input: unknown): AvatarRegistryEntry | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const avatarId = normalizeAvatarId(record.avatar_id);
  if (!avatarId) return null;

  return {
    avatar_id: avatarId,
    avatar_name: String(record.avatar_name ?? "").trim() || undefined,
    gender: String(record.gender ?? "").trim() || undefined,
    preview_image: String(record.preview_image ?? "").trim() || undefined,
    preview_video: String(record.preview_video ?? "").trim() || undefined,
    active: record.active === undefined ? true : Boolean(record.active),
  };
}

function normalizeApiAvatar(avatar: HeyGenAvatar): AvatarRegistryEntry {
  return {
    avatar_id: avatar.avatar_id,
    avatar_name: avatar.avatar_name,
    gender: avatar.gender ?? "",
    preview_image: avatar.preview_image_url ?? "",
    preview_video: avatar.preview_video_url ?? "",
    active: true,
  };
}

function mergeRegistryAvatars(
  current: AvatarRegistryEntry[],
  updates: AvatarRegistryEntry[],
): AvatarRegistryEntry[] {
  const merged = new Map<string, AvatarRegistryEntry>();

  for (const avatar of current) {
    merged.set(avatar.avatar_id, avatar);
  }

  for (const avatar of updates) {
    const existing = merged.get(avatar.avatar_id);
    merged.set(avatar.avatar_id, {
      avatar_id: avatar.avatar_id,
      avatar_name: avatar.avatar_name ?? existing?.avatar_name,
      gender: avatar.gender ?? existing?.gender,
      preview_image: avatar.preview_image ?? existing?.preview_image,
      preview_video: avatar.preview_video ?? existing?.preview_video,
      active: avatar.active ?? existing?.active ?? true,
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.avatar_id.localeCompare(b.avatar_id),
  );
}

async function getAvatarRegistryConfig(): Promise<AvatarRegistryConfig> {
  const query = await supabaseAdmin
    .from("tiktok_engine_config")
    .select("config_value")
    .eq("config_key", "avatar_registry")
    .eq("is_active", true)
    .maybeSingle();

  if (query.error) {
    throw new Error(`Falha ao carregar avatar_registry: ${query.error.message}`);
  }

  if (!query.data?.config_value || typeof query.data.config_value !== "object") {
    return {};
  }

  const raw = query.data.config_value as Record<string, unknown>;
  const avatars = Array.isArray(raw.avatars)
    ? raw.avatars
        .map(normalizeAvatarEntry)
        .filter((item): item is AvatarRegistryEntry => Boolean(item))
    : [];

  const defaultAvatarId = normalizeAvatarId(raw.default_avatar_id);

  return {
    default_avatar_id: defaultAvatarId || undefined,
    avatars,
  };
}

async function upsertAvatarRegistryConfig(config: AvatarRegistryConfig) {
  const { error } = await supabaseAdmin.from("tiktok_engine_config").upsert(
    {
      config_key: "avatar_registry",
      config_value: config,
      is_active: true,
    },
    { onConflict: "config_key" },
  );

  if (error) {
    throw new Error(`Falha ao salvar avatar_registry: ${error.message}`);
  }
}

async function fetchHeyGenAvatars(): Promise<AvatarRegistryEntry[]> {
  const apiKey = (process.env.HEYGEN_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("HEYGEN_API_KEY não configurada.");
  }

  const res = await fetch("https://api.heygen.com/v2/avatars", {
    headers: { "X-Api-Key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`HeyGen ${res.status}`);
  }

  const data = (await res.json()) as HeyGenAvatarsResponse;
  return (data.data?.avatars ?? []).map(normalizeApiAvatar);
}

export async function GET(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const url = new URL(request.url);
    const refresh = url.searchParams.get("refresh") === "1";

    const registry = await getAvatarRegistryConfig();
    const cachedAvatars = registry.avatars ?? [];

    if (!refresh && cachedAvatars.length > 0) {
      const defaultAvatarId =
        normalizeAvatarId(registry.default_avatar_id) ||
        normalizeAvatarId(cachedAvatars[0]?.avatar_id);
      return NextResponse.json({
        avatars: cachedAvatars,
        total: cachedAvatars.length,
        default_avatar_id: defaultAvatarId || null,
        source: "registry",
      });
    }

    const apiAvatars = await fetchHeyGenAvatars();
    const mergedAvatars = mergeRegistryAvatars(cachedAvatars, apiAvatars);
    const defaultAvatarId =
      normalizeAvatarId(registry.default_avatar_id) ||
      normalizeAvatarId(mergedAvatars[0]?.avatar_id);

    const nextConfig: AvatarRegistryConfig = {
      default_avatar_id: defaultAvatarId || undefined,
      avatars: mergedAvatars,
    };

    await upsertAvatarRegistryConfig(nextConfig);

    return NextResponse.json({
      avatars: mergedAvatars,
      total: mergedAvatars.length,
      default_avatar_id: defaultAvatarId || null,
      source: "heygen",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao listar avatares.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const current = await getAvatarRegistryConfig();
    const currentAvatars = current.avatars ?? [];

    const incomingDefault = normalizeAvatarId(body.default_avatar_id);
    const incomingAvatars = Array.isArray(body.register_avatars)
      ? body.register_avatars
          .map(normalizeAvatarEntry)
          .filter((item): item is AvatarRegistryEntry => Boolean(item))
      : [];

    let mergedAvatars = mergeRegistryAvatars(currentAvatars, incomingAvatars);

    const finalDefault =
      incomingDefault ||
      normalizeAvatarId(current.default_avatar_id) ||
      normalizeAvatarId(mergedAvatars[0]?.avatar_id);

    if (finalDefault && !mergedAvatars.some((avatar) => avatar.avatar_id === finalDefault)) {
      mergedAvatars = mergeRegistryAvatars(mergedAvatars, [{ avatar_id: finalDefault, active: true }]);
    }

    const nextConfig: AvatarRegistryConfig = {
      default_avatar_id: finalDefault || undefined,
      avatars: mergedAvatars,
    };

    await upsertAvatarRegistryConfig(nextConfig);

    return NextResponse.json({
      success: true,
      registry: {
        default_avatar_id: nextConfig.default_avatar_id ?? null,
        avatars: nextConfig.avatars ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao atualizar avatar registry.",
      },
      { status: 500 },
    );
  }
}
