declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    complexFilter(filters: string[]): FfmpegCommand;
    complexFilter(filters: string, outputMap?: string): FfmpegCommand;
    on(event: "end", handler: () => void): FfmpegCommand;
    on(event: "error", handler: (error: Error) => void): FfmpegCommand;
    save(output: string): FfmpegCommand;
  }

  interface FfprobeStream {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
  }

  interface FfprobeFormat {
    duration?: number;
  }

  interface FfprobeData {
    streams: FfprobeStream[];
    format: FfprobeFormat;
  }

  interface FfmpegFactory {
    (input?: string): FfmpegCommand;
    setFfmpegPath(path: string): void;
    ffprobe(input: string, callback: (err: Error | null, data: FfprobeData) => void): void;
  }

  const ffmpeg: FfmpegFactory;
  export default ffmpeg;
}
