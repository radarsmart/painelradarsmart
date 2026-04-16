import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ElevenLabsVoice = {
  voice_id: string;
  name: string;
  category?: string;
  preview_url?: string;
  labels?: {
    description?: string;
    language?: string;
    gender?: string;
  };
};

type ElevenLabsResponse = {
  voices?: ElevenLabsVoice[];
};

type VoiceRegistryEntry = {
  voice_id: string;
  name?: string;
  active?: boolean;
};

type VoiceRegistryConfig = {
  default_voice_id?: string;
  voices?: VoiceRegistryEntry[];
};

function normalizeVoiceId(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeRegistryEntry(input: unknown): VoiceRegistryEntry | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const voiceId = normalizeVoiceId(record.voice_id);
  if (!voiceId) return null;
  const name = String(record.name ?? "").trim();
  return {
    voice_id: voiceId,
    name: name || undefined,
    active: record.active === undefined ? true : Boolean(record.active),
  };
}

async function getVoiceRegistryConfig(): Promise<VoiceRegistryConfig> {
  const query = await supabaseAdmin
    .from("tiktok_engine_config")
    .select("config_value")
    .eq("config_key", "voice_registry")
    .eq("is_active", true)
    .maybeSingle();

  if (query.error) {
    throw new Error(`Falha ao carregar voice_registry: ${query.error.message}`);
  }

  if (!query.data?.config_value || typeof query.data.config_value !== "object") {
    return {};
  }

  const raw = query.data.config_value as Record<string, unknown>;
  const voices = Array.isArray(raw.voices)
    ? raw.voices
        .map(normalizeRegistryEntry)
        .filter((item): item is VoiceRegistryEntry => Boolean(item))
    : [];

  const defaultVoiceId = normalizeVoiceId(raw.default_voice_id);

  return {
    default_voice_id: defaultVoiceId || undefined,
    voices,
  };
}

async function upsertVoiceRegistryConfig(config: VoiceRegistryConfig) {
  const { error } = await supabaseAdmin.from("tiktok_engine_config").upsert(
    {
      config_key: "voice_registry",
      config_value: config,
      is_active: true,
    },
    { onConflict: "config_key" },
  );

  if (error) {
    throw new Error(`Falha ao salvar voice_registry: ${error.message}`);
  }
}

function mergeRegistryVoices(
  current: VoiceRegistryEntry[],
  updates: VoiceRegistryEntry[],
): VoiceRegistryEntry[] {
  const merged = new Map<string, VoiceRegistryEntry>();

  for (const voice of current) {
    merged.set(voice.voice_id, voice);
  }

  for (const voice of updates) {
    const existing = merged.get(voice.voice_id);
    merged.set(voice.voice_id, {
      voice_id: voice.voice_id,
      name: voice.name ?? existing?.name,
      active: voice.active ?? existing?.active ?? true,
    });
  }

  return Array.from(merged.values()).sort((a, b) =>
    a.voice_id.localeCompare(b.voice_id),
  );
}

export async function GET(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const apiKey = (process.env.ELEVENLABS_API_KEY ?? "").trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "ELEVENLABS_API_KEY não configurada." },
        { status: 500 },
      );
    }

    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
    const data = (await res.json()) as ElevenLabsResponse;

    const voices =
      data.voices?.map((v) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category ?? "",
        description: v.labels?.description ?? "",
        language: v.labels?.language ?? "",
        gender: v.labels?.gender ?? "",
        preview_url: v.preview_url ?? "",
      })) ?? [];

    const registry = await getVoiceRegistryConfig();
    const envDefault =
      normalizeVoiceId(process.env.ELEVENLABS_DEFAULT_VOICE_ID) ||
      normalizeVoiceId(process.env.ELEVENLABS_VOICE_ID);
    const defaultVoiceId =
      normalizeVoiceId(registry.default_voice_id) ||
      envDefault ||
      normalizeVoiceId(voices[0]?.voice_id);

    return NextResponse.json({
      voices,
      total: voices.length,
      default_voice_id: defaultVoiceId || null,
      registry: {
        default_voice_id: defaultVoiceId || null,
        voices: registry.voices ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao listar vozes.",
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
    const current = await getVoiceRegistryConfig();
    const currentVoices = current.voices ?? [];

    const incomingDefault = normalizeVoiceId(body.default_voice_id);
    const incomingVoices = Array.isArray(body.register_voices)
      ? body.register_voices
          .map(normalizeRegistryEntry)
          .filter((item): item is VoiceRegistryEntry => Boolean(item))
      : [];

    let mergedVoices = mergeRegistryVoices(currentVoices, incomingVoices);

    const finalDefault =
      incomingDefault ||
      normalizeVoiceId(current.default_voice_id) ||
      normalizeVoiceId(process.env.ELEVENLABS_DEFAULT_VOICE_ID) ||
      normalizeVoiceId(process.env.ELEVENLABS_VOICE_ID);

    if (finalDefault && !mergedVoices.some((voice) => voice.voice_id === finalDefault)) {
      mergedVoices = mergeRegistryVoices(mergedVoices, [{ voice_id: finalDefault, active: true }]);
    }

    const nextConfig: VoiceRegistryConfig = {
      default_voice_id: finalDefault || undefined,
      voices: mergedVoices,
    };

    await upsertVoiceRegistryConfig(nextConfig);

    return NextResponse.json({
      success: true,
      registry: {
        default_voice_id: nextConfig.default_voice_id ?? null,
        voices: nextConfig.voices ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao atualizar voice registry.",
      },
      { status: 500 },
    );
  }
}
