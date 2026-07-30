export const ALLOWED_IMAGE_HOSTS = new Set([
  "m.media-amazon.com",
  "images-na.ssl-images-amazon.com",
  "images-na.ssl-images-amazon.com.br",
  "http2.mlstatic.com",
  "http.mlstatic.com",
  "cf.shopeemobile.com",
  "deo.shopeemobile.com",
]);

export function isValidRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && ALLOWED_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
