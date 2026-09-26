const { chromium } = require("playwright");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/diagnose-local-video-playback.js <mp4-path>");
  process.exit(1);
}

const absoluteInputPath = path.resolve(inputPath);
const pageUrl = "http://localhost:3000/admin/creative-ai";
const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const skipUi = process.env.SKIP_UI === "1";

async function inspectVideo(page, selector, seekTimes) {
  return page.locator(selector).evaluate(async (video, times) => {
    const result = {
      currentSrc: video.currentSrc,
      src: video.getAttribute("src"),
      readyStateInitial: video.readyState,
      networkStateInitial: video.networkState,
      pausedInitial: video.paused,
      currentTimeInitial: video.currentTime,
      durationInitial: Number.isFinite(video.duration) ? video.duration : null,
      videoWidthInitial: video.videoWidth,
      videoHeightInitial: video.videoHeight,
      poster: video.poster || null,
      errorInitial: video.error ? { code: video.error.code, message: video.error.message } : null,
      canPlayMp4: video.canPlayType("video/mp4"),
      canPlayMpeg4: video.canPlayType('video/mp4; codecs="mp4v.20.8, mp4a.40.2"'),
      canPlayH264: video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
      events: [],
      seeks: [],
      playResult: null,
      errorAfter: null,
    };

    function once(name, timeoutMs = 8000) {
      return new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve({ name, status: "timeout" }), timeoutMs);
        video.addEventListener(
          name,
          () => {
            window.clearTimeout(timeout);
            result.events.push(name);
            resolve({ name, status: "ok" });
          },
          { once: true },
        );
      });
    }

    video.preload = "auto";
    video.muted = true;
    video.load();
    await Promise.race([once("loadedmetadata"), once("error")]);
    await Promise.race([once("canplay"), once("error"), new Promise((resolve) => setTimeout(resolve, 2000))]);

    result.readyStateAfterMetadata = video.readyState;
    result.networkStateAfterMetadata = video.networkState;
    result.durationAfterMetadata = Number.isFinite(video.duration) ? video.duration : null;
    result.videoWidthAfterMetadata = video.videoWidth;
    result.videoHeightAfterMetadata = video.videoHeight;
    result.errorAfterMetadata = video.error ? { code: video.error.code, message: video.error.message } : null;

    async function sampleAt(time) {
      if (!Number.isFinite(video.duration)) return { time, status: "no-duration" };
      video.currentTime = Math.min(time, Math.max(0, video.duration - 0.05));
      await Promise.race([once("seeked", 5000), once("error", 5000)]);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, video.videoWidth || 1);
      canvas.height = Math.max(1, video.videoHeight || 1);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let sum = 0;
      let nonBlack = 0;
      const step = Math.max(4, Math.floor(pixels.length / 4000 / 4) * 4);
      for (let i = 0; i < pixels.length; i += step) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        sum += r + g + b;
        if (r > 8 || g > 8 || b > 8) nonBlack += 1;
      }
      return {
        time,
        currentTime: video.currentTime,
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        nonBlackSamples: nonBlack,
        averageRgbSum: sum / Math.max(1, pixels.length / step),
        error: video.error ? { code: video.error.code, message: video.error.message } : null,
      };
    }

    for (const time of times) {
      result.seeks.push(await sampleAt(time));
    }

    try {
      await video.play();
      result.playResult = "ok";
    } catch (error) {
      result.playResult = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 750));
    result.readyStateAfterPlay = video.readyState;
    result.currentTimeAfterPlay = video.currentTime;
    result.pausedAfterPlay = video.paused;
    result.errorAfter = video.error ? { code: video.error.code, message: video.error.message } : null;
    return result;
  }, seekTimes);
}

async function main() {
  const server = http.createServer((req, res) => {
    if (req.url !== "/video.mp4") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const stat = fs.statSync(absoluteInputPath);
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(absoluteInputPath).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const videoUrl = `http://127.0.0.1:${address.port}/video.mp4`;

  const browser = await chromium.launch({ headless: true });
  const direct = await browser.newPage();
  await direct.setContent(`<video id="v" controls crossorigin="anonymous" src="${videoUrl}"></video>`, { waitUntil: "load" });
  const directResult = await inspectVideo(direct, "#v", [0.5, 1.0, 3.5, 7.5]);

  let uiResult = null;
  if (!skipUi) {
    try {
      const ui = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
      await ui.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 });
      await ui.getByTestId(`creative-campaign-${campaignId}`).click();
      await ui.getByText("Revisar Comercial", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
      await ui.locator("video").evaluate((video, src) => {
        video.crossOrigin = "anonymous";
        video.src = src;
        video.load();
      }, videoUrl);
      uiResult = await inspectVideo(ui, "video", [0.5, 1.0, 3.5, 7.5]);
      await ui.screenshot({ path: "temp/review-video-playback-websafe-diagnostic.png", fullPage: false });
    } catch (error) {
      uiResult = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log(JSON.stringify({ videoUrl, directResult, uiResult }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
