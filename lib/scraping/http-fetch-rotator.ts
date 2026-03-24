import { HEADER_PROFILES, buildBrowserHeaders } from "@/lib/scraping/user-agents";
import { fetch as undiciFetch } from "undici";

export type RotatingHtmlResult = {
  html: string;
  finalUrl: string;
  profile: string;
  status: number;
};

type FetchRotationInput = {
  url: string;
  timeoutMs?: number;
  maxAttempts?: number;
  minHtmlLength?: number;
  blockedPatterns?: RegExp[];
  extraHeaders?: HeadersInit;
};

function pickProfile(attempt: number) {
  const index = attempt % HEADER_PROFILES.length;
  return HEADER_PROFILES[index];
}

function defaultBlockedPatterns(): RegExp[] {
  return [
    /captcha/i,
    /robot check/i,
    /sorry, we just need to make sure/i,
    /digite os caracteres/i,
    /acesso negado/i,
  ];
}

export async function fetchHtmlWithRotation(
  input: FetchRotationInput,
): Promise<RotatingHtmlResult> {
  const url = input.url.trim();
  if (!url) throw new Error("URL vazia para fetch rotativo.");

  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  const timeoutMs = Math.max(3000, input.timeoutMs ?? 12000);
  const minHtmlLength = Math.max(300, input.minHtmlLength ?? 1000);
  const blocked = input.blockedPatterns ?? defaultBlockedPatterns();
  const extraHeaders = input.extraHeaders ?? {};

  let lastError = "Falha desconhecida no fetch rotativo.";
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const profile = pickProfile(attempt);
    try {
      const response = await undiciFetch(url, {
        method: "GET",
        headers: {
          ...buildBrowserHeaders(profile, url),
          ...extraHeaders,
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });

      lastStatus = response.status;
      if (!response.ok && ![403, 429, 503].includes(response.status)) {
        lastError = `HTTP ${response.status}`;
        continue;
      }

      const html = await response.text();
      const lower = html.toLowerCase();
      if (!html || html.length < minHtmlLength) {
        lastError = `HTML muito curto (tentativa ${attempt + 1})`;
        continue;
      }
      if (blocked.some((pattern) => pattern.test(lower))) {
        lastError = `Bloqueio detectado (${profile.name})`;
        continue;
      }

      return {
        html,
        finalUrl: response.url || url,
        profile: profile.name,
        status: response.status,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : "Falha de rede no fetch rotativo.";
    }
  }

  throw new Error(
    `Falha no deep scraping apos ${maxAttempts} tentativas (${lastError}${
      lastStatus ? `, status final ${lastStatus}` : ""
    }).`,
  );
}
