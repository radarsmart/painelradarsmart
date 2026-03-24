export type HeaderProfile = {
  name: string;
  userAgent: string;
  acceptLanguage: string;
  secChUaPlatform: string;
  secChUa: string;
  secChUaMobile: "?0" | "?1";
  referer: string;
};

export const HEADER_PROFILES: HeaderProfile[] = [
  {
    name: "chrome_win_124",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    acceptLanguage: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    secChUaPlatform: '"Windows"',
    secChUa:
      '"Chromium";v="124", "Google Chrome";v="124", "Not(A:Brand";v="24"',
    secChUaMobile: "?0",
    referer: "https://www.google.com/",
  },
  {
    name: "iphone_safari_17",
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    acceptLanguage: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,en;q=0.6",
    secChUaPlatform: '"iOS"',
    secChUa:
      '"Not/A)Brand";v="8", "Chromium";v="124", "Mobile Safari";v="17"',
    secChUaMobile: "?1",
    referer: "https://www.google.com/",
  },
  {
    name: "chrome_mac_124",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    acceptLanguage: "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    secChUaPlatform: '"macOS"',
    secChUa:
      '"Chromium";v="124", "Google Chrome";v="124", "Not(A:Brand";v="24"',
    secChUaMobile: "?0",
    referer: "https://www.google.com/",
  },
];

export function buildBrowserHeaders(
  profile: HeaderProfile,
  targetUrl?: string,
): HeadersInit {
  let referer = profile.referer;
  if (targetUrl) {
    try {
      const parsed = new URL(targetUrl);
      referer = `${parsed.protocol}//${parsed.host}/`;
    } catch {
      // keep profile referer
    }
  }

  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": profile.acceptLanguage,
    "cache-control": "no-cache",
    pragma: "no-cache",
    dnt: "1",
    "upgrade-insecure-requests": "1",
    "sec-ch-ua": profile.secChUa,
    "sec-ch-ua-mobile": profile.secChUaMobile,
    "sec-ch-ua-platform": profile.secChUaPlatform,
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "cross-site",
    referer,
    origin: referer.replace(/\/$/, ""),
    "user-agent": profile.userAgent,
  };
}
