import { createHash } from "node:crypto";

import type { OverlayInstructions } from "@/lib/prompt-builder/types";
import type { RepairStrategy } from "@/lib/commercial-video/repair/types";

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function buildRepairFingerprint(input: {
  originalFingerprint: string | null;
  qualityFailureReasons: string[];
  repairStrategy: RepairStrategy;
  effectiveOverlays: OverlayInstructions;
  provider: string | null;
  model?: string | null;
  promptGuards?: string[];
}): string {
  return createHash("sha256")
    .update(stableStringify(input))
    .digest("hex");
}
