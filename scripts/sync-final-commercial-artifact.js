const fs = require("node:fs");
const crypto = require("node:crypto");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const jobId = "79978fc2-2011-45e9-8130-ae32f9665c67";
const bucket = "ugc-videos";
const mp4Path = "temp/final-reassembly-prepublish-qa/5a0b6e06-d467-442e-bfdb-ba98a823eb80-final-reassembled.mp4";
const reportPath = "temp/final-reassembly-prepublish-qa/final-reassembly-prepublish-qa-report.json";

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function patchScene(scene, report) {
  const assets = report.finalAssetsUsed;
  if (scene.sceneId === "scene-1") {
    return {
      ...scene,
      selectedProvider: "wan-2-5-t2v",
      providerCapability: "TEXT_TO_VIDEO",
      requiresHybridPipeline: false,
      productGenerationStrategy: null,
      existingAsset: {
        ...(scene.existingAsset ?? {}),
        source: "GENERATION_RESULT",
        status: "READY",
        inputVideoPath: assets["scene-1"].path,
        rejectionReason: null,
      },
    };
  }

  if (scene.sceneId === "scene-2") {
    return {
      ...scene,
      selectedProvider: "wan-2-5t2v-hybrid-local",
      providerCapability: "TEXT_TO_VIDEO",
      requiresHybridPipeline: true,
      productGenerationStrategy: "HYBRID_PRODUCT_COMPOSITE",
      existingAsset: {
        ...(scene.existingAsset ?? {}),
        source: "GENERATION_RESULT",
        status: "READY",
        inputVideoPath: assets["scene-2"].path,
        rejectionReason: null,
      },
    };
  }

  if (scene.sceneId === "scene-3") {
    return {
      ...scene,
      selectedProvider: "heygen-image-avatar",
      providerCapability: "CHARACTER_VIDEO",
      requiresHybridPipeline: false,
      productGenerationStrategy: null,
      existingAsset: {
        ...(scene.existingAsset ?? {}),
        source: "GENERATION_RESULT",
        status: "READY",
        inputVideoPath: assets["scene-3"].path,
        rejectionReason: null,
      },
    };
  }

  return scene;
}

function buildFinalTraceability(report, oldTraceability) {
  const byScene = new Map((oldTraceability ?? []).map((entry) => [entry.sceneId, entry]));
  const narrationReuse = new Map((report.narrationReuse ?? []).map((entry) => [entry.sceneId, entry]));

  return [
    {
      ...(byScene.get("scene-1") ?? {}),
      sceneId: "scene-1",
      purpose: "HOOK",
      selectedProvider: "wan-2-5-t2v",
      providerStatus: "ACTIVE",
      existingAssetSource: "GENERATION_RESULT",
      productGenerationStrategy: "STRICT_BACKGROUND_REGENERATION",
      repairStrategy: "STRICT_BACKGROUND_REGENERATION",
      repairTaskId: "77fa8abc-4947-47f7-913c-ed7e1617d4c4",
      finalAssetPath: report.finalAssetsUsed["scene-1"].path,
      narrationStatus: "REUSED",
      narrationAudioPath: narrationReuse.get("scene-1")?.audioPath ?? null,
    },
    {
      ...(byScene.get("scene-2") ?? {}),
      sceneId: "scene-2",
      purpose: "OFFER",
      selectedProvider: "wan-2-5t2v-hybrid-local",
      providerStatus: "ACTIVE",
      existingAssetSource: "GENERATION_RESULT",
      productGenerationStrategy: "HYBRID_PRODUCT_COMPOSITE",
      repairStrategy: "HYBRID_PRODUCT_COMPOSITE",
      backgroundProvider: "wan-2-5-t2v",
      backgroundTaskId: "4bedc3aa-dc3d-4464-b35a-fb13c09b722f",
      finalAssetPath: report.finalAssetsUsed["scene-2"].path,
      narrationStatus: "REUSED",
      narrationAudioPath: narrationReuse.get("scene-2")?.audioPath ?? null,
    },
    {
      ...(byScene.get("scene-3") ?? {}),
      sceneId: "scene-3",
      purpose: "CTA",
      selectedProvider: "heygen-image-avatar",
      providerStatus: "ACTIVE",
      existingAssetSource: "GENERATION_RESULT",
      productGenerationStrategy: null,
      reusedVideoId: "5e904e014acc4dfa85ab09dba2745a07",
      finalAssetPath: report.finalAssetsUsed["scene-3"].path,
      narrationStatus: "REUSED",
      narrationAudioPath: narrationReuse.get("scene-3")?.audioPath ?? null,
    },
  ];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (report.campaignId !== campaignId) throw new Error("QA report campaignId mismatch.");
  if (report.quality?.status !== "PASS_WITH_OBSERVATIONS") throw new Error("QA report is not PASS_WITH_OBSERVATIONS.");
  if (report.quality?.publishReady !== true) throw new Error("QA report publishReady is not true.");
  if (report.quality?.requiresHumanAcknowledgement !== true) {
    throw new Error("QA report does not require human acknowledgement.");
  }

  const mp4 = fs.readFileSync(mp4Path);
  const sha256 = crypto.createHash("sha256").update(mp4).digest("hex");
  const storagePath = `2026-08-09/final-reassembled-v2/${campaignId}-final-reassembled-${sha256.slice(0, 12)}.mp4`;
  const newUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;

  const { data: current, error: currentError } = await supabase
    .from("commercial_generation_jobs")
    .select(
      "id,campaign_id,status,quality_status,review_status,reviewed_at,reviewed_by_user_id,reviewed_by_email,review_notes,human_acknowledged_observations,runner_result,traceability,updated_at",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Job not found.");
  if (current.campaign_id !== campaignId) throw new Error("Remote job campaignId mismatch.");
  if (current.status !== "COMPLETED") throw new Error("Remote job is not COMPLETED.");

  const oldRunner = current.runner_result ?? {};
  const patchedRunner = {
    ...clone(oldRunner),
    finalVideoUrl: newUrl,
    finalVideoPath: report.finalVideoPath,
    commercialQualityResult: report.quality,
    quality: {
      ...(oldRunner.quality ?? {}),
      finalStatus: report.quality.status,
      finalVideoQuality: report.quality.finalVideoTechnicalQuality?.status ?? oldRunner.quality?.finalVideoQuality,
      narrationQuality: report.quality.narrationConsistency?.status ?? oldRunner.quality?.narrationQuality,
    },
    scenes: (oldRunner.scenes ?? []).map((scene) => patchScene(scene, report)),
    traceability: buildFinalTraceability(report, current.traceability),
    finalArtifactSync: {
      syncedAt: new Date().toISOString(),
      sourceReportPath: reportPath,
      sourceLocalVideoPath: mp4Path,
      previousFinalVideoUrl: oldRunner.finalVideoUrl ?? null,
      finalVideoUrl: newUrl,
      localSha256: sha256,
      localSizeBytes: mp4.length,
      storageBucket: bucket,
      storagePath,
      providerCalls: 0,
      published: false,
    },
  };
  const finalTraceability = buildFinalTraceability(report, current.traceability);

  const dryRun = {
    mode: apply ? "APPLY" : "DRY_RUN",
    jobId,
    storage: {
      bucket,
      storagePath,
      publicUrl: newUrl,
      overwrite: false,
      localSha256: sha256,
      localSizeBytes: mp4.length,
    },
    before: {
      status: current.status,
      quality_status: current.quality_status,
      review_status: current.review_status,
      reviewed_at: current.reviewed_at,
      reviewed_by_user_id: current.reviewed_by_user_id,
      reviewed_by_email: current.reviewed_by_email,
      review_notes: current.review_notes,
      human_acknowledged_observations: current.human_acknowledged_observations,
      finalVideoUrl: oldRunner.finalVideoUrl ?? null,
      commercialQualityResultPresent: Boolean(oldRunner.commercialQualityResult ?? oldRunner.commercialQuality),
      scenes: (oldRunner.scenes ?? []).map((scene) => ({
        sceneId: scene.sceneId,
        provider: scene.selectedProvider,
        inputVideoPath: scene.existingAsset?.inputVideoPath ?? null,
      })),
    },
    after: {
      status: current.status,
      quality_status: report.quality.status,
      review_status: current.review_status,
      reviewed_at: current.reviewed_at,
      reviewed_by_user_id: current.reviewed_by_user_id,
      reviewed_by_email: current.reviewed_by_email,
      review_notes: current.review_notes,
      human_acknowledged_observations: current.human_acknowledged_observations,
      finalVideoUrl: newUrl,
      commercialQualityResult: {
        status: report.quality.status,
        publishReady: report.quality.publishReady,
        requiresHumanAcknowledgement: report.quality.requiresHumanAcknowledgement,
        publishObservations: report.quality.publishObservations,
      },
      traceability: finalTraceability.map((entry) => ({
        sceneId: entry.sceneId,
        selectedProvider: entry.selectedProvider,
        repairStrategy: entry.repairStrategy ?? null,
        repairTaskId: entry.repairTaskId ?? null,
        backgroundTaskId: entry.backgroundTaskId ?? null,
        reusedVideoId: entry.reusedVideoId ?? null,
        narrationStatus: entry.narrationStatus,
      })),
    },
  };

  if (!apply) {
    console.log(JSON.stringify(dryRun, null, 2));
    return;
  }

  const upload = await supabase.storage.from(bucket).upload(storagePath, mp4, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const head = await fetch(newUrl, { method: "HEAD" });
  const sizeHeader = Number(head.headers.get("content-length") ?? "0");
  const contentType = head.headers.get("content-type");
  if (!head.ok) throw new Error(`Uploaded MP4 HEAD failed: ${head.status}`);
  if (contentType !== "video/mp4") throw new Error(`Unexpected content-type: ${contentType}`);
  if (sizeHeader !== mp4.length) throw new Error(`Uploaded MP4 size mismatch: ${sizeHeader} != ${mp4.length}`);

  const downloaded = Buffer.from(await (await fetch(newUrl)).arrayBuffer());
  const remoteSha256 = crypto.createHash("sha256").update(downloaded).digest("hex");
  if (remoteSha256 !== sha256) throw new Error("Uploaded MP4 hash mismatch.");

  const { data: updated, error: updateError } = await supabase
    .from("commercial_generation_jobs")
    .update({
      quality_status: report.quality.status,
      runner_result: patchedRunner,
      traceability: finalTraceability,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .select(
      "id,status,quality_status,review_status,reviewed_at,reviewed_by_user_id,reviewed_by_email,review_notes,human_acknowledged_observations,runner_result,traceability,updated_at",
    )
    .single();
  if (updateError) throw updateError;

  console.log(
    JSON.stringify(
      {
        ...dryRun,
        uploadConfirmed: {
          httpStatus: head.status,
          contentType,
          sizeBytes: sizeHeader,
          remoteSha256,
        },
        updated: {
          id: updated.id,
          status: updated.status,
          quality_status: updated.quality_status,
          review_status: updated.review_status,
          reviewed_at: updated.reviewed_at,
          reviewed_by_user_id: updated.reviewed_by_user_id,
          reviewed_by_email: updated.reviewed_by_email,
          human_acknowledged_observations: updated.human_acknowledged_observations,
          finalVideoUrl: updated.runner_result?.finalVideoUrl ?? null,
          commercialQualityResult: {
            status: updated.runner_result?.commercialQualityResult?.status ?? null,
            publishReady: updated.runner_result?.commercialQualityResult?.publishReady ?? null,
            requiresHumanAcknowledgement:
              updated.runner_result?.commercialQualityResult?.requiresHumanAcknowledgement ?? null,
          },
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
