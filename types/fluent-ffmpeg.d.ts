declare module "fluent-ffmpeg" {
  interface FfmpegCommand {
    input(source: string): FfmpegCommand;
    inputOptions(options: string[]): FfmpegCommand;
    outputOptions(options: string[]): FfmpegCommand;
    complexFilter(filters: string[]): FfmpegCommand;
    on(event: "end", handler: () => void): FfmpegCommand;
    on(event: "error", handler: (error: Error) => void): FfmpegCommand;
    save(output: string): FfmpegCommand;
  }

  interface FfmpegFactory {
    (input?: string): FfmpegCommand;
    setFfmpegPath(path: string): void;
  }

  const ffmpeg: FfmpegFactory;
  export default ffmpeg;
}
