import * as dotenv from "dotenv";
import path from "path";
import { animateAvatar, textToVideo } from "../lib/ugc/freepik";

// Carrega .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function testModelB() {
  console.log("🎬 Iniciando teste do Modelo B (Avatar Falando)...");

  // Persona: Jovem brasileiro casual (Unsplash)
  const imageUrl = "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?q=80&w=1000&auto=format&fit=crop";
  
  // Áudio de exemplo (Speech público)
  const audioUrl = "https://www.voiptroubleshooter.com/open_speech_repository/american/OSR_us_000_0010_8k.mp3";

  try {
    console.log("--- TENTATIVA 1: OmniHuman 1.5 (Freepik) ---");
    const videoUrl = await animateAvatar(
      imageUrl,
      audioUrl,
      "A young person speaking naturally to the camera, casual style, warm lighting"
    );
    console.log("✅ RESULTADO OMNIHUMAN:", videoUrl);
  } catch (error: any) {
    console.warn("⚠️ OMNIHUMAN FALHOU ou INDISPONÍVEL:", error.message);
    
    console.log("\n--- TENTATIVA 2: Fallback Kling (Freepik) ---");
    try {
      const videoUrl = await textToVideo(
        "Young Brazilian person talking to camera, casual style, holding product, UGC content creator, 9:16 vertical, natural lighting, high quality"
      );
      console.log("✅ RESULTADO KLING (FALLBACK):", videoUrl);
    } catch (klingError: any) {
      console.error("❌ AMBAS AS TENTATIVAS FALHARAM:", klingError.message);
    }
  }
}

testModelB();
