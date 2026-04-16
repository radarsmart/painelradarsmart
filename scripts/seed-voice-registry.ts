import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type ElevenLabsVoice = {
  voice_id: string;
  name?: string;
};

type VoiceRegistryEntry = {
  voice_id: string;
  name?: string;
  active: boolean;
};

const PREFERRED_DEFAULT_VOICE_ID = "QVAas5gGwu8nTdZ3MUpQ";
const PREFERRED_DEFAULT_VOICE_NAME = "Matheus Moretti - Relaxed and Bright";

async function run() {
  const { supabaseAdmin } = await import("@/lib/supabase");

  const elevenLabsApiKey = String(process.env.ELEVENLABS_API_KEY ?? "").trim();
  if (!elevenLabsApiKey) {
    throw new Error("ELEVENLABS_API_KEY não configurada.");
  }

  const elevenLabsResponse = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: {
      "xi-api-key": elevenLabsApiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!elevenLabsResponse.ok) {
    throw new Error(`Falha ao listar vozes da ElevenLabs: HTTP ${elevenLabsResponse.status}`);
  }

  const elevenLabsData = (await elevenLabsResponse.json()) as { voices?: ElevenLabsVoice[] };
  const voicesFromApi = Array.isArray(elevenLabsData.voices)
    ? elevenLabsData.voices
        .map((voice) => ({
          voice_id: String(voice.voice_id ?? "").trim(),
          name: String(voice.name ?? "").trim() || undefined,
          active: true,
        }))
        .filter((voice) => voice.voice_id.length > 0)
    : [];

  const registryById = new Map<string, VoiceRegistryEntry>();
  for (const voice of voicesFromApi) {
    registryById.set(voice.voice_id, voice);
  }

  registryById.set(PREFERRED_DEFAULT_VOICE_ID, {
    voice_id: PREFERRED_DEFAULT_VOICE_ID,
    name: PREFERRED_DEFAULT_VOICE_NAME,
    active: true,
  });

  const registryVoices = Array.from(registryById.values()).sort((a, b) =>
    a.voice_id.localeCompare(b.voice_id),
  );

  const configValue = {
    default_voice_id: PREFERRED_DEFAULT_VOICE_ID,
    voices: registryVoices,
  };

  const upsert = await supabaseAdmin.from("tiktok_engine_config").upsert(
    {
      config_key: "voice_registry",
      config_value: configValue,
      is_active: true,
    },
    { onConflict: "config_key" },
  );

  if (upsert.error) {
    throw new Error(`Falha ao salvar voice_registry: ${upsert.error.message}`);
  }

  const check = await supabaseAdmin
    .from("tiktok_engine_config")
    .select("config_key, is_active, config_value")
    .eq("config_key", "voice_registry")
    .maybeSingle();

  if (check.error) {
    throw new Error(`Falha ao validar voice_registry salvo: ${check.error.message}`);
  }

  const saved = check.data?.config_value as
    | { default_voice_id?: string; voices?: Array<{ voice_id?: string }> }
    | undefined;
  const savedCount = Array.isArray(saved?.voices) ? saved!.voices!.length : 0;
  const savedDefault = String(saved?.default_voice_id ?? "").trim();

  console.log(
    JSON.stringify(
      {
        ok: true,
        config_key: "voice_registry",
        default_voice_id: savedDefault,
        voices_count: savedCount,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      },
      null,
      2,
    ),
  );
  process.exit(1);
});

