// Radar Creative AI - Audio Pipeline / ElevenLabs Narration Provider
//
// Adapter REAL que implementa a interface NarrationProvider (ver
// narration-track.ts) usando a integracao ElevenLabs ja existente
// (lib/ugc/audio.ts#generateElevenLabsAudio, usada hoje pela Fabrica UGC).
// Validado pelo CANARY de voz (uma chamada real, ver relatorio) - mas
// NAO esta ligado ao Commercial Video Composer nesta fase. Trocar
// MockNarrationProvider por este adapter no comercial real e uma decisao
// explicita futura, fora do escopo desta tarefa.

import fs from "node:fs";
import path from "node:path";

import type { NarrationProvider, NarrationProviderRequest, NarrationProviderResult } from "@/lib/commercial-video/audio/narration-track";
import { probeAudioDurationSeconds } from "@/lib/commercial-video/audio/narration-track";
import { generateElevenLabsAudio } from "@/lib/ugc/audio";

export class ElevenLabsNarrationProvider implements NarrationProvider {
  readonly name = "elevenlabs" as const;

  constructor(
    private readonly voiceId: string,
    private readonly outputDir: string,
  ) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  async synthesize(request: NarrationProviderRequest): Promise<NarrationProviderResult> {
    try {
      const audio = await generateElevenLabsAudio({ text: request.text, voiceId: this.voiceId });

      if (audio.buffer.byteLength === 0) {
        return {
          status: "FAILED",
          source: "TTS_RESULT",
          audioPath: null,
          actualDurationSeconds: null,
          error: "ElevenLabs retornou audio vazio (0 bytes).",
        };
      }

      const outputPath = path.join(this.outputDir, `narration-elevenlabs-${request.sceneId}.mp3`);
      fs.writeFileSync(outputPath, audio.buffer);
      const actualDurationSeconds = await probeAudioDurationSeconds(outputPath);

      return { status: "COMPLETED", source: "TTS_RESULT", audioPath: outputPath, actualDurationSeconds, error: null };
    } catch (error) {
      return {
        status: "FAILED",
        source: "TTS_RESULT",
        audioPath: null,
        actualDurationSeconds: null,
        error: error instanceof Error ? error.message : "Erro desconhecido no ElevenLabsNarrationProvider.",
      };
    }
  }
}
