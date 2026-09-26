const { execFileSync, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const ffmpegPath = process.env.FFMPEG_PATH || "C:\\Users\\User\\AppData\\Local\\CapCut\\Apps\\9.1.0.3879\\ffmpeg.exe";

const finalDir = path.join(root, "temp", "final-reassembly-prepublish-qa");
const finalMp4 = path.join(finalDir, "5a0b6e06-d467-442e-bfdb-ba98a823eb80-final-reassembled.mp4");
const visualMp4 = path.join(finalDir, "5a0b6e06-d467-442e-bfdb-ba98a823eb80-visual-reassembled.mp4");
const wav = path.join(finalDir, "5a0b6e06-d467-442e-bfdb-ba98a823eb80-audio-reassembled.wav");
const narrations = [
  {
    sceneId: "scene-1",
    sceneStart: 0,
    sceneEnd: 3,
    file: path.join(root, "temp", "first-full-execute", "narration", "narration-elevenlabs-scene-1.mp3"),
  },
  {
    sceneId: "scene-2",
    sceneStart: 3,
    sceneEnd: 7,
    file: path.join(root, "temp", "first-full-execute", "narration", "narration-elevenlabs-scene-2.mp3"),
  },
  {
    sceneId: "scene-3",
    sceneStart: 7,
    sceneEnd: 9,
    file: path.join(root, "temp", "first-full-execute", "narration", "narration-elevenlabs-scene-3.mp3"),
  },
];

function probe(file) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", file, "-f", "null", "-"], { encoding: "utf8" });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  const durationMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSeconds = durationMatch
    ? Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])
    : null;
  const streamLines = text
    .split(/\r?\n/)
    .filter((line) => /Stream #\d+:\d+/.test(line))
    .map((line) => line.trim());
  return { format: { duration: durationSeconds }, streams: streamLines };
}

function duration(file) {
  return Number(probe(file).format.duration);
}

function tailStats(file, seconds = 0.5) {
  const result = spawnSync(
    ffmpegPath,
    ["-hide_banner", "-sseof", `-${seconds}`, "-i", file, "-af", "astats=metadata=0:reset=0", "-f", "null", "-"],
    { encoding: "utf8" },
  );
  const stderr = result.stderr || "";
  const rms = [...stderr.matchAll(/RMS level dB:\s*([-\w.]+)/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite)
    .pop();
  const peak = [...stderr.matchAll(/Peak level dB:\s*([-\w.]+)/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite)
    .pop();
  return { rmsLevelDb: rms ?? null, peakLevelDb: peak ?? null };
}

function fileInfo(label, file) {
  if (!fs.existsSync(file)) return { label, exists: false };
  const info = probe(file);
  return {
    label,
    exists: true,
    path: file,
    duration: Number(info.format.duration),
    streams: info.streams,
    tail500ms: tailStats(file),
  };
}

const finalDuration = duration(finalMp4);
const wavDuration = duration(wav);
const table = narrations.map((n) => {
  const narrationFileDuration = duration(n.file);
  const narrationStart = n.sceneStart;
  const narrationEnd = n.sceneStart + narrationFileDuration;
  return {
    sceneId: n.sceneId,
    sceneStart: n.sceneStart,
    sceneEnd: n.sceneEnd,
    sceneDuration: n.sceneEnd - n.sceneStart,
    narrationFileDuration,
    narrationStart,
    narrationEnd,
    intendedTailMargin: n.sceneEnd - narrationEnd,
    finalMp4TailMargin: finalDuration - narrationEnd,
    tail500ms: tailStats(n.file),
  };
});

const output = {
  files: [
    fileInfo("finalMp4", finalMp4),
    fileInfo("visualMp4", visualMp4),
    fileInfo("mixedWav", wav),
    ...narrations.map((n) => fileInfo(n.sceneId, n.file)),
  ],
  timingTable: table,
  conclusions: {
    finalVideoShorterThanWav: finalDuration < wavDuration,
    finalVideoMissingSecondsVsWav: Number((wavDuration - finalDuration).toFixed(6)),
    likelyMuxCutByShortest: finalDuration < wavDuration,
    affectedScene:
      table.find((row) => row.narrationEnd > finalDuration)?.sceneId ??
      (table[table.length - 1].finalMp4TailMargin < 0.1 ? table[table.length - 1].sceneId : null),
  },
};

console.log(JSON.stringify(output, null, 2));
