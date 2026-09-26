const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

require("dotenv").config({ path: ".env.local" });

const { createClient } = require("@supabase/supabase-js");

const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const jobId = "79978fc2-2011-45e9-8130-ae32f9665c67";
const bucket = "ugc-videos";
const mp4Path =
  "temp/final-reassembly-prepublish-qa/5a0b6e06-d467-442e-bfdb-ba98a823eb80-final-reassembled-websafe-audiofix.mp4";
const expectedSha256 = "F78DDA50317662CA6047BF493861F114DEAF0CAA04D30DAA7C9C6684149C7682".toLowerCase();

function findFfmpegPath() {
  const candidates = [
    process.env.FFMPEG_PATH,
    "C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\9.1.0.3879\\ffmpeg.exe",
    "C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\8.7.0.3685\\ffmpeg.exe",
    "ffmpeg",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate === "ffmpeg" || fs.existsSync(candidate)) return candidate;
  }
  return "ffmpeg";
}

const ffmpegPath = findFfmpegPath();

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function parseDuration(line) {
  const match = line.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function probeWithFfmpeg(filePath) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", filePath, "-f", "null", "-"], { encoding: "utf8" });
  if (result.error) throw result.error;
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  const videoLine = text.split(/\r?\n/).find((line) => line.includes("Video:")) ?? "";
  const audioLine = text.split(/\r?\n/).find((line) => line.includes("Audio:")) ?? "";
  const dimensionMatch = videoLine.match(/,\s*(\d+)x(\d+)[,\s]/);
  const fpsMatch = videoLine.match(/,\s*([\d.]+)\s*fps[, ]/);
  return {
    durationSeconds: parseDuration(text) ?? null,
    videoLine: videoLine.trim(),
    audioLine: audioLine.trim(),
    width: dimensionMatch ? Number(dimensionMatch[1]) : null,
    height: dimensionMatch ? Number(dimensionMatch[2]) : null,
    fps: fpsMatch ? Number(fpsMatch[1]) : null,
    videoCodecOk: /Video:\s*h264\b/.test(videoLine) && /\(avc1\s*\//.test(videoLine),
    audioCodecOk: /Audio:\s*aac\b/i.test(audioLine),
  };
}

function measurePeakDb(filePath) {
  const result = spawnSync(
    ffmpegPath,
    ["-hide_banner", "-i", filePath, "-af", "astats=metadata=0:reset=0", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  const peaks = [...text.matchAll(/Peak level dB:\s*([-\d.]+)/g)].map((match) => Number(match[1])).filter(Number.isFinite);
  return peaks.length ? Math.max(...peaks) : null;
}

function assertLocalVideo(filePath, expectedHash) {
  if (!fs.existsSync(filePath)) throw new Error(`Arquivo nao encontrado: ${filePath}`);
  const buffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  if (sha256 !== expectedHash) throw new Error(`SHA256 local divergente: ${sha256}`);
  const probe = probeWithFfmpeg(filePath);
  const peakDb = measurePeakDb(filePath);
  const checks = {
    hash: sha256,
    sizeBytes: buffer.length,
    durationOk: probe.durationSeconds === 9,
    dimensionsOk: probe.width === 1080 && probe.height === 1920,
    fpsOk: Math.abs((probe.fps ?? 0) - 24) < 0.01,
    h264Avc1Ok: probe.videoCodecOk,
    aacOk: probe.audioCodecOk,
    clipping: peakDb !== null ? peakDb >= 0 : null,
    peakDb,
    probe,
  };
  const failed = Object.entries(checks)
    .filter(([key]) => ["durationOk", "dimensionsOk", "fpsOk", "h264Avc1Ok", "aacOk"].includes(key))
    .filter(([, value]) => value !== true);
  if (failed.length || checks.clipping !== false) {
    throw new Error(`Validacao local falhou: ${JSON.stringify(checks, null, 2)}`);
  }
  return { buffer, checks };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { buffer, checks } = assertLocalVideo(mp4Path, expectedSha256);
  const storagePath = `2026-08-10/final-reassembled-websafe-audiofix/${campaignId}-final-reassembled-websafe-audiofix-${checks.hash.slice(0, 12)}.mp4`;
  const newUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;

  const { data: current, error: currentError } = await supabase
    .from("commercial_generation_jobs")
    .select(
      "id,campaign_id,status,quality_status,review_status,reviewed_at,reviewed_by_user_id,reviewed_by_email,review_notes,human_acknowledged_observations,runner_result,updated_at",
    )
    .eq("id", jobId)
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) throw new Error("Job remoto nao encontrado.");
  if (current.campaign_id !== campaignId) throw new Error(`campaign_id divergente: ${current.campaign_id}`);

  const oldRunner = current.runner_result ?? {};
  const oldUrl = oldRunner.finalVideoUrl ?? null;
  const quality = oldRunner.commercialQualityResult ?? oldRunner.commercialQuality ?? null;
  const patchedRunner = { ...oldRunner, finalVideoUrl: newUrl };

  const plan = {
    mode: apply ? "APPLY" : "DRY_RUN",
    campaignId,
    jobId,
    localValidation: checks,
    storage: {
      bucket,
      storagePath,
      publicUrl: newUrl,
      overwrite: false,
    },
    before: {
      finalVideoUrl: oldUrl,
      status: current.status,
      quality_status: current.quality_status,
      review_status: current.review_status,
      reviewed_at: current.reviewed_at,
      reviewed_by_user_id: current.reviewed_by_user_id,
      reviewed_by_email: current.reviewed_by_email,
      review_notes: current.review_notes,
      human_acknowledged_observations: current.human_acknowledged_observations,
      quality: quality
        ? {
            status: quality.status,
            publishReady: quality.publishReady,
            requiresHumanAcknowledgement: quality.requiresHumanAcknowledgement,
          }
        : null,
    },
    afterExpected: {
      finalVideoUrl: newUrl,
      status: current.status,
      quality_status: current.quality_status,
      review_status: current.review_status,
      reviewed_at: current.reviewed_at,
      reviewed_by_user_id: current.reviewed_by_user_id,
      reviewed_by_email: current.reviewed_by_email,
      review_notes: current.review_notes,
      human_acknowledged_observations: current.human_acknowledged_observations,
      quality: quality
        ? {
            status: quality.status,
            publishReady: quality.publishReady,
            requiresHumanAcknowledgement: quality.requiresHumanAcknowledgement,
          }
        : null,
    },
  };

  if (!apply) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  const upload = await supabase.storage.from(bucket).upload(storagePath, buffer, {
    contentType: "video/mp4",
    upsert: false,
  });
  if (upload.error) throw upload.error;

  const head = await fetch(newUrl, { method: "HEAD" });
  const contentType = head.headers.get("content-type");
  const sizeBytes = Number(head.headers.get("content-length") ?? "0");
  if (!head.ok) throw new Error(`HEAD remoto falhou: ${head.status}`);
  if (contentType !== "video/mp4") throw new Error(`Content-Type remoto inesperado: ${contentType}`);
  if (sizeBytes !== buffer.length) throw new Error(`Tamanho remoto divergente: ${sizeBytes} != ${buffer.length}`);

  const downloaded = Buffer.from(await (await fetch(newUrl)).arrayBuffer());
  const remoteSha256 = crypto.createHash("sha256").update(downloaded).digest("hex");
  if (remoteSha256 !== checks.hash) throw new Error(`SHA256 remoto divergente: ${remoteSha256}`);

  const { data: updated, error: updateError } = await supabase
    .from("commercial_generation_jobs")
    .update({ runner_result: patchedRunner })
    .eq("id", jobId)
    .select(
      "id,campaign_id,status,quality_status,review_status,reviewed_at,reviewed_by_user_id,reviewed_by_email,review_notes,human_acknowledged_observations,runner_result,updated_at",
    )
    .single();
  if (updateError) throw updateError;

  const updatedQuality = updated.runner_result?.commercialQualityResult ?? updated.runner_result?.commercialQuality ?? null;
  console.log(
    JSON.stringify(
      {
        ...plan,
        remoteValidation: {
          httpStatus: head.status,
          contentType,
          sizeBytes,
          remoteSha256,
          hashMatchesLocal: remoteSha256 === checks.hash,
        },
        updated: {
          finalVideoUrl: updated.runner_result?.finalVideoUrl ?? null,
          status: updated.status,
          quality_status: updated.quality_status,
          review_status: updated.review_status,
          reviewed_at: updated.reviewed_at,
          reviewed_by_user_id: updated.reviewed_by_user_id,
          reviewed_by_email: updated.reviewed_by_email,
          review_notes: updated.review_notes,
          human_acknowledged_observations: updated.human_acknowledged_observations,
          quality: updatedQuality
            ? {
                status: updatedQuality.status,
                publishReady: updatedQuality.publishReady,
                requiresHumanAcknowledgement: updatedQuality.requiresHumanAcknowledgement,
              }
            : null,
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
