import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";

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

export async function GET(request: NextRequest) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const apiKey = (process.env.HEYGEN_API_KEY ?? "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "HEYGEN_API_KEY não configurada." }, { status: 500 });
    }

    const res = await fetch("https://api.heygen.com/v2/avatars", {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) throw new Error(`HeyGen ${res.status}`);
    const data = (await res.json()) as HeyGenAvatarsResponse;

    const avatars =
      data.data?.avatars?.map((avatar) => ({
        avatar_id: avatar.avatar_id,
        avatar_name: avatar.avatar_name,
        gender: avatar.gender ?? "",
        preview_image: avatar.preview_image_url ?? "",
        preview_video: avatar.preview_video_url ?? "",
      })) ?? [];

    return NextResponse.json({ avatars, total: avatars.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar avatares." },
      { status: 500 },
    );
  }
}
