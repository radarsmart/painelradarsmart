import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  composeVideo,
  generateDefaultScenes,
  type VideoScene,
} from "@/lib/ugc/video-composer";
import { UGCOfferContext } from "@/lib/ugc/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutos (Vercel Pro)

export async function POST(req: NextRequest) {
  const adminGuard = await requireAdmin(req);
  if (!adminGuard.ok) {
    return NextResponse.json({ error: adminGuard.error }, { status: adminGuard.status });
  }

  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId é obrigatório." }, { status: 400 });
    }

    // 1. Carregar projeto e áudio
    const { data: project, error: projectError } = await supabaseAdmin
      .from("ugc_projects")
      .select("*, ugc_personas(*)")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      throw new Error(projectError?.message || "Projeto não encontrado.");
    }

    // Buscar o áudio mais recente do projeto
    const { data: audioAsset, error: audioError } = await supabaseAdmin
      .from("ugc_project_assets")
      .select("*")
      .eq("project_id", projectId)
      .eq("asset_type", "audio")
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (audioError) throw new Error(audioError.message);
    if (!audioAsset?.public_url) {
      throw new Error("Gere o áudio do projeto antes de gerar o vídeo.");
    }

    // 2. Preparar contexto da oferta
    const context: UGCOfferContext = {
      title: project.title,
      price: project.price,
      originalPrice: project.original_price,
      marketplace: project.marketplace || "Radar Smart",
      category: project.category,
      productUrl: project.product_url,
      campaignName: project.campaign_name,
      objective: project.objective,
      discountPct: project.original_price && project.price 
        ? Math.round(((project.original_price - project.price) / project.original_price) * 100) 
        : undefined
    };

    // 3. Definir cenas (usar padrão se não houver customizadas)
    const scenes: VideoScene[] = Array.isArray(project.current_briefing?.scenePlan)
      ? project.current_briefing.scenePlan.map((sceneText: string) => ({
          type: "pexels-stock",
          duration: 4,
          searchQuery: sceneText,
        }))
      : generateDefaultScenes(context, project.image_url);

    // 4. Download do áudio para arquivo temporário
    const tempDir = path.join(process.cwd(), "temp", "renderer");
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const audioLocalPath = path.join(tempDir, `${randomUUID()}.mp3`);
    const audioContent = await fetch(audioAsset.public_url).then(res => res.arrayBuffer());
    fs.writeFileSync(audioLocalPath, Buffer.from(audioContent));

    const videoOutputPath = path.join(tempDir, `${randomUUID()}.mp4`);

    // 5. Renderizar Vídeo
    console.log(`Renderizando vídeo para projeto ${projectId}...`);
    await composeVideo(context, scenes, audioLocalPath, videoOutputPath);

    // 6. Upload para Storage
    const videoBuffer = fs.readFileSync(videoOutputPath);
    const storagePath = `projects/${projectId}/video/${randomUUID()}.mp4`;
    const bucket = "ugc-assets";

    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucket)
      .upload(storagePath, videoBuffer, {
        contentType: "video/mp4",
        upsert: true
      });

    if (uploadError) throw new Error(`Falha no upload do vídeo: ${uploadError.message}`);

    const { data: publicUrlData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);

    // 7. Registrar Asset e atualizar projeto
    const { data: asset, error: assetError } = await supabaseAdmin
      .from("ugc_project_assets")
      .insert({
        project_id: projectId,
        asset_type: "video",
        provider: "local-composer",
        bucket_name: bucket,
        storage_path: storagePath,
        public_url: publicUrlData.publicUrl,
        mime_type: "video/mp4",
        size_bytes: videoBuffer.byteLength,
        status: "ready",
        metadata: {
          scenes_count: scenes.length,
          projectTitle: project.title,
          campaign: project.campaign_name
        },
        created_by_user_id: adminGuard.userId,
        created_by_email: adminGuard.email
      })
      .select()
      .single();

    if (assetError) throw new Error(assetError.message);

    // Limpar arquivos temporários
    try {
       fs.unlinkSync(audioLocalPath);
       fs.unlinkSync(videoOutputPath);
    } catch {}

    return NextResponse.json({ success: true, asset });
  } catch (error) {
    console.error("Video Generation Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno ao gerar vídeo." },
      { status: 500 }
    );
  }
}
