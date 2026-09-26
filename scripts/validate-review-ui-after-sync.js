const { chromium } = require("playwright");

const targetUrl = "http://localhost:3000/admin/creative-ai";
const campaignName = "TESTE UI - Commercial Factory (Invictus)";
const campaignId = "5a0b6e06-d467-442e-bfdb-ba98a823eb80";
const jobId = "79978fc2-2011-45e9-8130-ae32f9665c67";
const expectedVideoUrl =
  process.env.EXPECTED_VIDEO_URL ||
  "https://vhsfuoskndjebaheyobe.supabase.co/storage/v1/object/public/ugc-videos/2026-08-10/final-reassembled-websafe-audiofix/5a0b6e06-d467-442e-bfdb-ba98a823eb80-final-reassembled-websafe-audiofix-f78dda503176.mp4";

async function inspectVideo(video) {
  return video.evaluate(async (element) => {
    const result = {
      currentSrc: element.currentSrc,
      readyStateInitial: element.readyState,
      networkStateInitial: element.networkState,
      durationInitial: Number.isFinite(element.duration) ? element.duration : null,
      videoWidthInitial: element.videoWidth,
      videoHeightInitial: element.videoHeight,
      errorInitial: element.error ? { code: element.error.code, message: element.error.message } : null,
      canPlayMpeg4: element.canPlayType('video/mp4; codecs="mp4v.20.8, mp4a.40.2"'),
      canPlayH264: element.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
      events: [],
      seeks: [],
      playResult: null,
    };

    function once(name, timeoutMs = 8000) {
      return new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve({ name, status: "timeout" }), timeoutMs);
        element.addEventListener(
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

    element.crossOrigin = "anonymous";
    element.preload = "auto";
    element.muted = true;
    element.load();
    await Promise.race([once("loadedmetadata"), once("error")]);
    await Promise.race([once("canplay"), once("error"), new Promise((resolve) => setTimeout(resolve, 2000))]);

    async function sampleAt(time) {
      if (!Number.isFinite(element.duration)) return { time, status: "no-duration" };
      element.currentTime = Math.min(time, Math.max(0, element.duration - 0.05));
      await Promise.race([once("seeked", 5000), once("error", 5000)]);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, element.videoWidth || 1);
      canvas.height = Math.max(1, element.videoHeight || 1);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonBlack = 0;
      const step = Math.max(4, Math.floor(pixels.length / 4000 / 4) * 4);
      for (let i = 0; i < pixels.length; i += step) {
        if (pixels[i] > 8 || pixels[i + 1] > 8 || pixels[i + 2] > 8) nonBlack += 1;
      }
      return {
        time,
        currentTime: element.currentTime,
        readyState: element.readyState,
        videoWidth: element.videoWidth,
        videoHeight: element.videoHeight,
        nonBlackSamples: nonBlack,
        error: element.error ? { code: element.error.code, message: element.error.message } : null,
      };
    }

    for (const time of [0.5, 1.0, 3.5, 7.5]) {
      result.seeks.push(await sampleAt(time));
    }

    try {
      await element.play();
      result.playResult = "ok";
    } catch (error) {
      result.playResult = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => window.setTimeout(resolve, 750));
    return {
      ...result,
      currentSrc: element.currentSrc,
      readyStateAfterPlay: element.readyState,
      networkStateAfterPlay: element.networkState,
      durationAfterPlay: Number.isFinite(element.duration) ? element.duration : null,
      currentTimeAfterPlay: element.currentTime,
      pausedAfterPlay: element.paused,
      videoWidthAfterPlay: element.videoWidth,
      videoHeightAfterPlay: element.videoHeight,
      errorAfterPlay: element.error ? { code: element.error.code, message: element.error.message } : null,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  const requests = [];
  const consoleMessages = [];
  const pageErrors = [];
  page.on("request", (request) => requests.push({ method: request.method(), url: request.url() }));
  page.on("console", (message) => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(targetUrl, { waitUntil: "networkidle", timeout: 30000 });

  try {
    await page.getByText("Campanhas recentes", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  } catch (error) {
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    throw new Error(
      `Campaign list did not render. Visible text: ${bodyText.slice(0, 1000)} Console: ${consoleMessages
        .slice(-10)
        .join(" | ")} PageErrors: ${pageErrors.join(" | ")}`,
    );
  }
  const campaignEntry = page.getByTestId(`creative-campaign-${campaignId}`);
  if ((await campaignEntry.count()) !== 1) {
    throw new Error(`Campaign entry not found: ${campaignName}`);
  }
  await campaignEntry.click();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  await page.getByText("Revisar Comercial", { exact: true }).waitFor({ state: "visible", timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});

  if ((await page.getByText(jobId, { exact: false }).count()) < 1) {
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    throw new Error(`Job details did not render. Visible text: ${bodyText.slice(0, 1000)}`);
  }

  const approveButton = page.getByRole("button", { name: "Aprovar Comercial" });
  const publishButton = page.getByRole("button", { name: "Publicar" });
  const checkbox = page.getByLabel("Revisei as observacoes e aprovo este comercial.", { exact: true });
  const video = page.locator(`video[src="${expectedVideoUrl}"]`);
  const videoMetrics = (await video.count()) === 1 ? await inspectVideo(video) : null;

  const beforeEnabled = (await approveButton.count()) === 1 ? await approveButton.isEnabled() : null;
  const checkboxVisible = (await checkbox.count()) === 1 && (await checkbox.isVisible());
  if (checkboxVisible) {
    await checkbox.check();
  }
  const afterEnabled = (await approveButton.count()) === 1 ? await approveButton.isEnabled() : null;
  const screenshotPath = "temp/review-ui-after-campaign-click.png";
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const result = {
    url: page.url(),
    screenshotPath,
    jobVisible: (await page.getByText(jobId, { exact: false }).count()) > 0,
    videoWithNewUrl: (await video.count()) === 1,
    videoPlaybackPass:
      videoMetrics !== null &&
      videoMetrics.playResult === "ok" &&
      videoMetrics.durationAfterPlay === 9 &&
      videoMetrics.videoWidthAfterPlay === 1080 &&
      videoMetrics.videoHeightAfterPlay === 1920 &&
      videoMetrics.seeks.every((seek) => seek.nonBlackSamples > 0),
    videoMetrics,
    passWithObservationsVisible: (await page.getByText("PASS_WITH_OBSERVATIONS", { exact: false }).count()) > 0,
    publishReadyVisible: (await page.getByText("Pronto para publicacao:", { exact: false }).count()) > 0,
    publishReadyYesVisible: (await page.getByText("SIM", { exact: true }).count()) > 0,
    nonBlockingVisible: (await page.getByText("NON_BLOCKING", { exact: false }).count()) > 0,
    acknowledgementCheckboxVisible: checkboxVisible,
    approveDisabledBeforeAck: beforeEnabled === false,
    approveEnabledAfterAck: afterEnabled === true,
    publishButtonDisabled: (await publishButton.count()) === 1 ? !(await publishButton.isEnabled()) : null,
    mutationRequests: requests.filter(
      (request) =>
        request.method !== "GET" &&
        request.method !== "HEAD" &&
        request.method !== "OPTIONS",
    ),
  };

  await browser.close();
  console.log(JSON.stringify(result, null, 2));

  const failed = Object.entries(result)
    .filter(([key]) => !["url", "screenshotPath", "mutationRequests", "videoMetrics"].includes(key))
    .filter(([, value]) => value !== true);
  if (failed.length > 0 || result.mutationRequests.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
