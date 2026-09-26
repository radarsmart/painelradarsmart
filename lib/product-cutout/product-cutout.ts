// Radar Creative AI - Product Cutout / Alpha - Orquestracao
//
// UNICA parte impura desta camada: decodifica a imagem de entrada em
// pixels RGBA crus via FFmpeg (ja dependencia do projeto - nenhuma lib
// nova instalada), aplica o algoritmo PURO de flood-fill
// (flood-fill-cutout.ts), avalia a qualidade (quality-gate.ts) e
// reescreve como PNG RGBA via FFmpeg. Nunca chama nenhuma API de IA/
// geracao - sem fetch, sem chave de provider, sem rede nenhuma.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseImageDimensions } from "@/lib/generation-orchestrator/image-dimensions";
import {
  applyBorderConnectedColorFloodFill,
  DEFAULT_SOFT_COLOR_DISTANCE,
  DEFAULT_STRICT_COLOR_DISTANCE,
} from "@/lib/product-cutout/flood-fill-cutout";
import { assessCutoutQuality } from "@/lib/product-cutout/quality-gate";
import type { ProductCutoutRequest, ProductCutoutResult } from "@/lib/product-cutout/types";

function findFfmpegPath(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  try {
    const command = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    const result = execFileSync(command.split(" ")[0], command.split(" ").slice(1)).toString().split("\n")[0].trim();
    if (result && fs.existsSync(result)) return result;
  } catch {
    // ignora - tenta o fallback generico
  }
  return "ffmpeg";
}

/**
 * Decodifica QUALQUER formato suportado pelo FFmpeg (webp/jpeg/png, os 3
 * formatos reais vistos em offers.image_url neste projeto) para pixels
 * RGBA crus, sem nenhum filtro/transformacao alem do proprio decode.
 */
function decodeToRawRgba(ffmpegPath: string, inputPath: string, rawPath: string): void {
  execFileSync(ffmpegPath, ["-y", "-i", inputPath, "-pix_fmt", "rgba", "-f", "rawvideo", rawPath]);
}

/**
 * Reescreve pixels RGBA crus como PNG - sem nenhuma reamostragem/
 * compressao com perda (PNG e lossless), sem nenhum filtro de cor.
 */
function encodeRawRgbaToPng(ffmpegPath: string, rawPath: string, width: number, height: number, outputPath: string): void {
  execFileSync(ffmpegPath, [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${width}x${height}`,
    "-i",
    rawPath,
    outputPath,
  ]);
}

/**
 * Executa o Product Cutout / Alpha completo - decode -> flood fill puro
 * -> quality gate -> encode PNG RGBA. Nunca sobrescreve o arquivo de
 * entrada. Nunca chama nenhuma API externa.
 */
export function runProductCutout(request: ProductCutoutRequest): ProductCutoutResult {
  const strictColorDistance = request.strictColorDistance ?? DEFAULT_STRICT_COLOR_DISTANCE;
  const softColorDistance = request.softColorDistance ?? DEFAULT_SOFT_COLOR_DISTANCE;

  if (!fs.existsSync(request.inputImagePath)) {
    return {
      status: "FAILED",
      method: "BORDER_CONNECTED_COLOR_FLOOD_FILL",
      outputImagePath: null,
      width: null,
      height: null,
      backgroundReferenceColor: null,
      backgroundPixelsRemoved: null,
      edgePixelsSoftened: null,
      rgbModifiedPixelCount: null,
      qualityReport: null,
      error: `inputImagePath nao encontrado: ${request.inputImagePath}`,
    };
  }

  const inputBytes = fs.readFileSync(request.inputImagePath);
  const dimensions = parseImageDimensions(inputBytes);
  if (!dimensions) {
    return {
      status: "FAILED",
      method: "BORDER_CONNECTED_COLOR_FLOOD_FILL",
      outputImagePath: null,
      width: null,
      height: null,
      backgroundReferenceColor: null,
      backgroundPixelsRemoved: null,
      edgePixelsSoftened: null,
      rgbModifiedPixelCount: null,
      qualityReport: null,
      error: "Nao foi possivel ler as dimensoes da imagem de entrada (formato nao reconhecido).",
    };
  }

  const { width, height } = dimensions;
  const ffmpegPath = findFfmpegPath();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "product-cutout-"));
  const rawInputPath = path.join(tempDir, "input.raw");
  const rawOutputPath = path.join(tempDir, "output.raw");

  try {
    decodeToRawRgba(ffmpegPath, request.inputImagePath, rawInputPath);
    const rawRgba = fs.readFileSync(rawInputPath);

    const expectedBytes = width * height * 4;
    if (rawRgba.length !== expectedBytes) {
      return {
        status: "FAILED",
        method: "BORDER_CONNECTED_COLOR_FLOOD_FILL",
        outputImagePath: null,
        width,
        height,
        backgroundReferenceColor: null,
        backgroundPixelsRemoved: null,
        edgePixelsSoftened: null,
        rgbModifiedPixelCount: null,
        qualityReport: null,
        error: `Buffer decodificado com tamanho inesperado (${rawRgba.length} bytes, esperado ${expectedBytes}).`,
      };
    }

    const { output, stats } = applyBorderConnectedColorFloodFill(rawRgba, width, height, {
      strictColorDistance,
      softColorDistance,
    });

    const qualityReport = assessCutoutQuality(output, width, height);

    fs.writeFileSync(rawOutputPath, output);
    encodeRawRgbaToPng(ffmpegPath, rawOutputPath, width, height, request.outputImagePath);

    return {
      status: "COMPLETED",
      method: "BORDER_CONNECTED_COLOR_FLOOD_FILL",
      outputImagePath: request.outputImagePath,
      width,
      height,
      backgroundReferenceColor: stats.backgroundReferenceColor,
      backgroundPixelsRemoved: stats.backgroundPixelsRemoved,
      edgePixelsSoftened: stats.edgePixelsSoftened,
      rgbModifiedPixelCount: stats.rgbModifiedPixelCount,
      qualityReport,
      error: null,
    };
  } catch (error) {
    return {
      status: "FAILED",
      method: "BORDER_CONNECTED_COLOR_FLOOD_FILL",
      outputImagePath: null,
      width,
      height,
      backgroundReferenceColor: null,
      backgroundPixelsRemoved: null,
      edgePixelsSoftened: null,
      rgbModifiedPixelCount: null,
      qualityReport: null,
      error: error instanceof Error ? error.message : "Erro desconhecido no Product Cutout.",
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
