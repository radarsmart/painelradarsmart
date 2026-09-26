const { chromium } = require("playwright");

const currentUrl =
  "https://vhsfuoskndjebaheyobe.supabase.co/storage/v1/object/public/ugc-videos/2026-08-09/final-reassembled-v2/5a0b6e06-d467-442e-bfdb-ba98a823eb80-final-reassembled-53a50a501e58.mp4";
const pageUrl = "http://localhost:3000/admin/creative-ai";
const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";

async function inspectVideo(page, selector) {
  return page.locator(selector).evaluate(async (video) => {
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

    result.seeks.push(await sampleAt(0));
    result.seeks.push(await sampleAt(0.5));
    result.seeks.push(await sampleAt(1));

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
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const direct = await browser.newPage();
  await direct.setContent(`<video id="v" controls src="${currentUrl}"></video>`, { waitUntil: "load" });
  const directResult = await inspectVideo(direct, "#v");

  const ui = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await ui.goto(pageUrl, { waitUntil: "networkidle", timeout: 30000 });
  await ui.getByTestId(`creative-campaign-${campaignId}`).click();
  await ui.getByText("Revisar Comercial", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  const uiResult = await inspectVideo(ui, "video");
  await ui.screenshot({ path: "temp/review-video-playback-diagnostic.png", fullPage: false });

  await browser.close();
  console.log(JSON.stringify({ currentUrl, directResult, uiResult }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
