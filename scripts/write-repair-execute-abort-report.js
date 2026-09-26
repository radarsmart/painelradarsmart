const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const readinessPath = path.join(root, "temp", "first-full-execute-resume", "human-review-repair-readiness.json");
const readiness = JSON.parse(fs.readFileSync(readinessPath, "utf8"));

const authorization = {
  maxWanCredits: 2100,
  sceneLimits: {
    "scene-1": { maxCredits: 900 },
    "scene-2": { maxCredits: 1200 },
  },
  maxNewWanCalls: 2,
  maxNewKlingCalls: 0,
  maxNewHeyGenCalls: 0,
  maxNewElevenLabsCalls: 0,
  retry: 0,
  fallback: 0,
};

const sceneCostViolations = readiness.repairPlan.scenes
  .filter((scene) => scene.action === "REGENERATE" && scene.provider === "wan-2-5-t2v")
  .flatMap((scene) => {
    const limit = authorization.sceneLimits[scene.sceneId]?.maxCredits ?? null;
    const estimatedCredits = scene.estimatedCost?.estimatedCredits ?? null;
    return limit !== null && estimatedCredits !== null && estimatedCredits > limit
      ? [`${scene.sceneId}: estimatedCredits=${estimatedCredits} > maxCredits=${limit}`]
      : [];
  });

const totalWanCredits = readiness.repairPlan.estimatedNewCosts.wanCredits;
const blockingReasons = [
  ...sceneCostViolations,
  ...(totalWanCredits > authorization.maxWanCredits
    ? [`total WAN: estimatedCredits=${totalWanCredits} > maxWanCredits=${authorization.maxWanCredits}`]
    : []),
];

const report = {
  generatedAt: new Date().toISOString(),
  sourceReadiness: readinessPath,
  repairExecuteResult: "BLOCKED",
  paidCallsExecuted: {
    wan: 0,
    kling: 0,
    heygen: 0,
    elevenLabs: 0,
  },
  authorization,
  correctedEstimatedNewCosts: readiness.repairPlan.estimatedNewCosts,
  blockingReasons,
  note:
    "Pre-execution aborted before any provider call because WAN only supports billable durations 5/10s; " +
    "both repair scenes are billed at the 5s minimum.",
};

const outputPath = path.join(root, "temp", "first-full-execute-resume", "repair-execute-abort-report.json");
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ outputPath, report }, null, 2));
