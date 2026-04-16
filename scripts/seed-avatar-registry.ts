import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

type HeyGenAvatar = {
  avatar_id: string;
  avatar_name?: string;
  gender?: string;
  preview_image_url?: string;
  preview_video_url?: string;
};

type AvatarRegistryEntry = {
  avatar_id: string;
  avatar_name?: string;
  gender?: string;
  preview_image?: string;
  preview_video?: string;
  active: boolean;
};

type AvatarRegistryConfig = {
  default_avatar_id: string;
  avatars: AvatarRegistryEntry[];
};

const PREFERRED_DEFAULT_AVATAR_ID = "Adrian_public_20240312";

async function run() {
  const { supabaseAdmin } = await import("@/lib/supabase");

  const heygenApiKey = String(process.env.HEYGEN_API_KEY ?? "").trim();
  if (!heygenApiKey) {
    throw new Error("HEYGEN_API_KEY não configurada.");
  }

  const response = await fetch("https://api.heygen.com/v2/avatars", {
    headers: {
      "X-Api-Key": heygenApiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Falha ao listar avatares da HeyGen: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { data?: { avatars?: HeyGenAvatar[] } };
  const avatars = Array.isArray(payload.data?.avatars)
    ? payload.data!.avatars!
        .map((avatar) => ({
          avatar_id: String(avatar.avatar_id ?? "").trim(),
          avatar_name: String(avatar.avatar_name ?? "").trim() || undefined,
          gender: String(avatar.gender ?? "").trim() || undefined,
          preview_image: String(avatar.preview_image_url ?? "").trim() || undefined,
          preview_video: String(avatar.preview_video_url ?? "").trim() || undefined,
          active: true,
        }))
        .filter((avatar) => avatar.avatar_id.length > 0)
    : [];

  if (avatars.length === 0) {
    throw new Error("Nenhum avatar retornado pela API da HeyGen.");
  }

  const hasPreferredDefault = avatars.some(
    (avatar) => avatar.avatar_id === PREFERRED_DEFAULT_AVATAR_ID,
  );

  const defaultAvatarId = hasPreferredDefault
    ? PREFERRED_DEFAULT_AVATAR_ID
    : avatars[0].avatar_id;

  const configValue: AvatarRegistryConfig = {
    default_avatar_id: defaultAvatarId,
    avatars,
  };

  const upsert = await supabaseAdmin.from("tiktok_engine_config").upsert(
    {
      config_key: "avatar_registry",
      config_value: configValue,
      is_active: true,
    },
    { onConflict: "config_key" },
  );

  if (upsert.error) {
    throw new Error(`Falha ao salvar avatar_registry: ${upsert.error.message}`);
  }

  const check = await supabaseAdmin
    .from("tiktok_engine_config")
    .select("config_key, is_active, config_value")
    .eq("config_key", "avatar_registry")
    .maybeSingle();

  if (check.error) {
    throw new Error(`Falha ao validar avatar_registry salvo: ${check.error.message}`);
  }

  const saved = check.data?.config_value as
    | { default_avatar_id?: string; avatars?: Array<{ avatar_id?: string }> }
    | undefined;

  const savedCount = Array.isArray(saved?.avatars) ? saved!.avatars!.length : 0;
  const savedDefault = String(saved?.default_avatar_id ?? "").trim();

  console.log(
    JSON.stringify(
      {
        ok: true,
        config_key: "avatar_registry",
        default_avatar_id: savedDefault,
        avatars_count: savedCount,
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
