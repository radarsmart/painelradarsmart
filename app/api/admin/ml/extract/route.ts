import type { NextRequest } from "next/server";
import { POST as unifiedExtractPOST } from "@/app/api/admin/extract/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Deprecated route kept for backward compatibility.
export async function POST(req: NextRequest) {
  const response = await unifiedExtractPOST(req);
  response.headers.set("X-Radar-Deprecated-Route", "use-/api/admin/extract");
  return response;
}
