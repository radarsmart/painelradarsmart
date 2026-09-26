// Radar Creative AI - Commercial Video Pipeline / Audio Pipeline - Types
//
// Camada isolada de audio: narracao, musica, SFX e mixagem. Nesta V1,
// NENHUM provider pago de voz/musica e chamado - narracao usa um
// NarrationProvider local/mock (ver narration-track.ts), musica/SFX sao
// sempre fixtures locais. O contrato NarrationProvider ja existe pensando
// num futuro adapter real (ex: envolvendo lib/ugc/audio.ts#generateElevenLabsAudio),
// mas essa implementacao NAO faz parte desta tarefa.

// LOCAL_ASSET - arquivo de audio local ja conhecido (narracao pre-gravada,
// musica/SFX de fixture). MOCK - gerado sinteticamente pra teste (tom
// puro via ffmpeg lavfi, nunca uma voz de verdade). TTS_RESULT - saida de
// um provider de voz real (preparado no tipo, nao implementado nesta fase).
export type AudioAssetSource = "LOCAL_ASSET" | "MOCK" | "TTS_RESULT";

export type AudioTrackType = "NARRATION" | "MUSIC" | "SFX";

export type NarrationSegmentStatus = "READY" | "SILENT" | "NARRATION_TOO_LONG" | "MISSING_ASSET";

export type NarrationSegment = {
  sceneId: string;
  // null = cena deliberadamente sem narracao (ver item 7 - silencio e
  // valido, nunca tratado como erro).
  text: string | null;
  // Posicao absoluta na timeline do comercial (segundos desde o inicio).
  startTime: number;
  // Janela disponivel pra essa fala - normalmente a duracao da propria
  // cena. A fala NUNCA pode ultrapassar isso (ver NARRATION_TOO_LONG).
  maxDurationSeconds: number;
  source: AudioAssetSource | null;
  audioPath: string | null;
  // Sempre MEDIDO de verdade (ffprobe) quando audioPath existe - nunca
  // estimado por heuristica de texto nesse campo (a estimativa so existe
  // dentro do MockNarrationProvider, documentada la como sintetica).
  actualDurationSeconds: number | null;
  status: NarrationSegmentStatus;
  error: string | null;
};

export type MusicTrack = {
  inputPath: string;
  // Nesta V1 sempre 0..durationSeconds do comercial inteiro (uma musica
  // pro comercial todo, ver item 8) - campos mantidos explicitos pro
  // contrato jah aceitar trechos parciais no futuro sem mudar o tipo.
  startTime: number;
  endTime: number;
  // Volume "normal" (fora de qualquer janela de ducking), 0..1.
  volume: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
};

export type SfxType = "WHOOSH" | "IMPACT" | "CLICK" | "SUCCESS";

export type SfxEvent = {
  sceneId: string;
  type: SfxType;
  inputPath: string;
  // Posicao absoluta na timeline do comercial.
  startTime: number;
  volume: number;
};

export type DuckingConfig = {
  enabled: boolean;
  // Defaults sensatos (ver audio-timeline-builder.ts#DEFAULT_DUCKING) -
  // nunca hardcoded sem passar por este tipo configuravel.
  normalVolume: number;
  duckedVolume: number;
  // Duracao da rampa linear entre os dois niveis - evita corte abrupto
  // (clique audivel) na entrada/saida de cada narracao.
  transitionSeconds: number;
};

export type CommercialAudioTimeline = {
  durationSeconds: number;
  narrationSegments: NarrationSegment[];
  musicTrack: MusicTrack | null;
  sfxEvents: SfxEvent[];
  ducking: DuckingConfig;
};

export type AudioQualityStatus = "PASS" | "FAIL";

// So contem metricas REALMENTE medidas - nenhum campo aqui e inferido sem
// uma medicao de verdade (ffprobe/astats/loudnorm). masterLoudnessLUFS e
// clippingDetected ficam null quando a medicao correspondente nao rodou.
export type AudioQualityResult = {
  status: AudioQualityStatus;
  durationMatchesVideo: boolean;
  narrationTimingValid: boolean;
  clippingDetected: boolean | null;
  audioStreamPresent: boolean;
  masterLoudnessLUFS: number | null;
  notes: string[];
};

export type AudioTraceEntry = {
  trackType: AudioTrackType;
  sceneId: string | null;
  source: AudioAssetSource;
  inputPath: string | null;
};
