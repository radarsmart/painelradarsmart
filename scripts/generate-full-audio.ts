import * as dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

async function generateAudio() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY missing");

  const voiceId = "F7823wtD50WK1gnmgBk5"; // Mateus Moretti
  const text = "Gente, c-c-para tudo... Olha só o que eu acabei de achar aqui no Radar Smart! Sério, eu tô em choque com isso. Sabe aquele sofrimento pra limpar janela por fora? Tipo... ter que se pendurar ou se arriscar pra alcançar o outro lado? É um pesadelo, né? Pois é, hã... esse rodo magnético resolve tudo. Ele tem um super ímã que você coloca de um lado e o outro gruda por fora. Você limpa por dentro e ele limpa sozinho por fora ao mesmo tempo! E o p-preço... de R$ 30,88 por só R$ 24,56! É 21% de desconto real, gente. Cara, já tem muita gente garantindo o seu e o estoque tá voando. Então corre! Entra no Radar Smart pelo link na bio e garante antes de esgotar!";

  console.log("🎙️ Chamando ElevenLabs para o SCRIPT COMPLETO...");
  
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
        stability: 0.4,
        similarity_boost: 0.8,
        style: 0.5,
        use_speaker_boost: true
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
  
  const outputPath = path.join(tempDir, "audio_final_completo.mp3");
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  console.log(`✅ Áudio COMPLETO gerado com sucesso em: ${outputPath}`);
}

generateAudio().catch(console.error);
