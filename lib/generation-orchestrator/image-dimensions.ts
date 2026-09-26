// Radar Creative AI - Generation Orchestrator / Image Dimensions
//
// Le as dimensoes reais (width/height) de uma imagem remota a partir dos
// bytes do arquivo - sem nenhuma dependencia nova (sem sharp/image-size),
// so parsing manual dos headers JPEG/PNG/WEBP (os 3 formatos que
// realmente aparecem em offers.image_url hoje). Nunca adivinha dimensoes:
// se o formato nao for reconhecido ou o buffer for curto demais, retorna
// null - quem chama trata null como "dimensoes desconhecidas".

export type ImageDimensions = { width: number; height: number };

function parseJpegDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buf[offset + 1];
    // bytes de preenchimento 0xFF antes do marcador real
    while (marker === 0xff && offset + 1 < buf.length) {
      offset += 1;
      marker = buf[offset + 1];
    }

    // marcadores sem payload (nao tem length depois)
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      if (marker === 0xd9) break; // EOI
      offset += 2;
      continue;
    }

    if (offset + 3 >= buf.length) break;
    const length = buf.readUInt16BE(offset + 2);

    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isStartOfFrame) {
      if (offset + 9 > buf.length) return null;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }

    offset += 2 + length;
  }

  return null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function parsePngDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString("ascii", 12, 16) !== "IHDR") return null;

  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function parseWebpDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length < 30) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") return null;

  const chunkFourCc = buf.toString("ascii", 12, 16);

  // VP8 (lossy): frame tag (3 bytes) + start code 0x9d 0x01 0x2a (3 bytes),
  // depois width/height em 14 bits cada (little-endian uint16).
  if (chunkFourCc === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }

  // VP8L (lossless): 1 byte de assinatura (0x2F) + 4 bytes little-endian
  // com 14 bits de (width-1) e 14 bits de (height-1).
  if (chunkFourCc === "VP8L") {
    if (buf.length < 25) return null;
    const packed = buf.readUInt32LE(21);
    const width = (packed & 0x3fff) + 1;
    const height = ((packed >> 14) & 0x3fff) + 1;
    return { width, height };
  }

  // VP8X (extended): canvas width/height menos um, 24 bits little-endian cada.
  if (chunkFourCc === "VP8X") {
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { width, height };
  }

  return null;
}

/**
 * Parsing PURO - recebe os bytes ja baixados, nunca faz rede. Detecta o
 * formato pelos magic bytes (nao confia em extensao/content-type).
 */
export function parseImageDimensions(buf: Buffer): ImageDimensions | null {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) return parseJpegDimensions(buf);
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIGNATURE)) return parsePngDimensions(buf);
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return parseWebpDimensions(buf);
  }
  return null;
}

/**
 * Unica funcao impura deste modulo - busca os bytes reais da imagem via
 * fetch. Nunca lanca: qualquer falha de rede/parsing vira null (dimensoes
 * desconhecidas), tratado de forma conservadora por quem chama
 * (ver product-reference-quality.ts).
 */
export async function fetchRemoteImageDimensions(url: string): Promise<ImageDimensions | null> {
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store" });
    if (!response.ok) return null;
    const buf = Buffer.from(await response.arrayBuffer());
    return parseImageDimensions(buf);
  } catch {
    return null;
  }
}
