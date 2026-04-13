import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function generateAudio() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");

  const voiceId = "F7823wtD50WK1gnmgBk5"; // Mateus Moretti
  const text = "Gente, para tudo! Olha o que eu achei no Radar Smart! Esse limpa vidros magnético é incrível... você limpa por dentro e ele limpa por fora ao mesmo tempo! E o preço tá imbatível: de R$ 30,88 por só R$ 24,56! É 21% de desconto! Entra no Radar Smart pelo link na bio e garante o seu!";

  console.log("🎙️ Chamando ElevenLabs para o script de teste...");
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.8,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`ElevenLabs API Error: ${response.status} - ${errorData}`);
  }

  const audioBuffer = await response.arrayBuffer();
  
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
  
  const outputPath = path.join(tempDir, "audio_criativos_test.mp3");
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  console.log(`✅ Áudio gerado com sucesso em: ${outputPath}`);
}

generateAudio().catch(console.error);
