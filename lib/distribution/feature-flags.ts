import { supabaseAdmin } from "@/lib/supabase";

export type DistributionChannelName = "whatsapp" | "telegram" | "instagram";

export interface DistributionFlags {
  distribution_enabled: boolean;
  auto_distribute_on_complete: boolean;
  channels: {
    whatsapp: {
      enabled: boolean;
      groups: string[];
    };
    telegram: {
      enabled: boolean;
      chats: string[];
    };
    instagram: {
      enabled: boolean;
      post_as_reel: boolean;
    };
  };
  scheduling: {
    delay_between_posts_minutes: number;
    max_posts_per_day: number;
    send_window_start: string;
    send_window_end: string;
    timezone: string;
  };
}

const DEFAULT_FLAGS: DistributionFlags = {
  distribution_enabled: false,
  auto_distribute_on_complete: false,
  channels: {
    whatsapp: { enabled: false, groups: [] },
    telegram: { enabled: false, chats: [] },
    instagram: { enabled: false, post_as_reel: true },
  },
  scheduling: {
    delay_between_posts_minutes: 15,
    max_posts_per_day: 60,
    send_window_start: "07:30",
    send_window_end: "22:30",
    timezone: "America/Sao_Paulo",
  },
};

let cachedFlags: DistributionFlags | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000;

function nowMs(): number {
  return Date.now();
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.length > 0);
}

function sanitizeTimeString(value: unknown, fallback: string): string {
  const text = String(value ?? "").trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(text) ? text : fallback;
}

function sanitizeFlags(input: Partial<DistributionFlags>): DistributionFlags {
  const merged = deepMerge(DEFAULT_FLAGS, input);
  const delay = Number(merged.scheduling.delay_between_posts_minutes);
  const maxPosts = Number(merged.scheduling.max_posts_per_day);

  return {
    distribution_enabled: Boolean(merged.distribution_enabled),
    auto_distribute_on_complete: Boolean(merged.auto_distribute_on_complete),
    channels: {
      whatsapp: {
        enabled: Boolean(merged.channels.whatsapp.enabled),
        groups: toStringList(merged.channels.whatsapp.groups),
      },
      telegram: {
        enabled: Boolean(merged.channels.telegram.enabled),
        chats: toStringList(merged.channels.telegram.chats),
      },
      instagram: {
        enabled: Boolean(merged.channels.instagram.enabled),
        post_as_reel: Boolean(merged.channels.instagram.post_as_reel),
      },
    },
    scheduling: {
      delay_between_posts_minutes:
        Number.isFinite(delay) && delay >= 1 ? Math.round(delay) : 15,
      max_posts_per_day:
        Number.isFinite(maxPosts) && maxPosts >= 1 ? Math.round(maxPosts) : 60,
      send_window_start: sanitizeTimeString(
        merged.scheduling.send_window_start,
        DEFAULT_FLAGS.scheduling.send_window_start,
      ),
      send_window_end: sanitizeTimeString(
        merged.scheduling.send_window_end,
        DEFAULT_FLAGS.scheduling.send_window_end,
      ),
      timezone:
        String(merged.scheduling.timezone ?? "").trim() ||
        DEFAULT_FLAGS.scheduling.timezone,
    },
  };
}

export function clearDistributionFlagsCache() {
  cachedFlags = null;
  cacheTimestamp = 0;
}

async function ensureDefaultFeatureFlagsRow() {
  const { error } = await supabaseAdmin.from("tiktok_engine_config").upsert(
    {
      config_key: "feature_flags",
      config_value: DEFAULT_FLAGS,
      is_active: true,
    },
    {
      onConflict: "config_key",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`Falha ao garantir feature_flags default: ${error.message}`);
  }
}

export async function getDistributionFlags(): Promise<DistributionFlags> {
  if (cachedFlags && nowMs() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFlags;
  }

  try {
    const query = await supabaseAdmin
      .from("tiktok_engine_config")
      .select("config_value")
      .eq("config_key", "feature_flags")
      .eq("is_active", true)
      .maybeSingle();

    if (query.error) {
      throw new Error(query.error.message);
    }

    if (!query.data?.config_value) {
      await ensureDefaultFeatureFlagsRow();
      cachedFlags = DEFAULT_FLAGS;
      cacheTimestamp = nowMs();
      return DEFAULT_FLAGS;
    }

    const parsed = sanitizeFlags(
      query.data.config_value as Partial<DistributionFlags>,
    );
    cachedFlags = parsed;
    cacheTimestamp = nowMs();
    return parsed;
  } catch (error) {
    console.error("[DistributionFlags] Falha ao ler config:", error);
    return DEFAULT_FLAGS;
  }
}

export async function updateDistributionFlags(
  updates: Partial<DistributionFlags>,
): Promise<DistributionFlags> {
  const current = await getDistributionFlags();
  const merged = sanitizeFlags(deepMerge(current, updates));

  const upsert = await supabaseAdmin.from("tiktok_engine_config").upsert(
    {
      config_key: "feature_flags",
      config_value: merged,
      is_active: true,
    },
    { onConflict: "config_key" },
  );

  if (upsert.error) {
    throw new Error(`Falha ao atualizar feature_flags: ${upsert.error.message}`);
  }

  cachedFlags = merged;
  cacheTimestamp = nowMs();
  return merged;
}

export async function isChannelEnabled(
  channel: DistributionChannelName,
): Promise<boolean> {
  const flags = await getDistributionFlags();
  return flags.distribution_enabled && flags.channels[channel].enabled;
}

export async function getEnabledChannels(): Promise<DistributionChannelName[]> {
  const flags = await getDistributionFlags();
  if (!flags.distribution_enabled) return [];
  return (Object.keys(flags.channels) as DistributionChannelName[]).filter(
    (channel) => flags.channels[channel].enabled,
  );
}

export function deepMerge<T extends object>(
  target: T,
  source: Partial<T>,
): T {
  const output: Record<string, unknown> = {
    ...(target as Record<string, unknown>),
  };
  for (const key of Object.keys(source as object)) {
    const sourceValue = (source as Record<string, unknown>)[key];
    if (sourceValue === undefined) continue;

    if (
      sourceValue &&
      typeof sourceValue === "object" &&
      !Array.isArray(sourceValue)
    ) {
      const targetValue = output[key];
      output[key] = deepMerge(
        (targetValue && typeof targetValue === "object"
          ? (targetValue as Record<string, unknown>)
          : {}) as Record<string, unknown>,
        sourceValue as Record<string, unknown>,
      );
      continue;
    }

    output[key] = sourceValue;
  }
  return output as T;
}
