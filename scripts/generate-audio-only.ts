import * as dotenv from "dotenv";
import path from "path";
import * as fs from "fs";

// Carrega variáveis de ambiente do .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { generateUGCScript } from "../lib/ugc/script-generator";
import { UGCOfferContext } from "../lib/ugc/types";
import { UGC_VOICES } from "../lib/ugc/voices";

async function main() {
  const offer: UGCOfferContext = {
    title: "Limpa Vidros Magnético com Super Ímã Rodo Mágico Dupla Face",
    price: 24.56,
    originalPrice: 30.88,
    discountPct: 21,
    marketplace: "Mercado Livre",
    productUrl: "https://www.mercadolivre.com.br/limpa-vidros-magnetico"
  };

  console.log(`✅ Produto Original: ${offer.title} - R$ ${offer.price}`);

  console.log(`📝 Gerando roteiro via GPT-4o...`);
  const script = await generateUGCScript(offer);
  
  console.log("-----------------------------------------");
  console.log("📄 Script:");
  console.log(script.full_text);
  console.log("-----------------------------------------");

  console.log(`🎙️ Gerando áudio via ElevenLabs (Mateus Moretti)...`);
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const targetVoiceId = UGC_VOICES.mateus.id;
  
  const tempDir = path.join(process.cwd(), "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  const audioPath = path.join(tempDir, `audio_final.mp3`);

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: script.full_text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8 },
    }),
  });

  if (!response.ok) throw new Error(`ElevenLabs error: ${response.statusText}`);
  
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(audioPath, Buffer.from(arrayBuffer));

  console.log(`\n🎉 Finalizado!`);
  console.log(`🎙️ Áudio salvo em: ${audioPath}`);
}

main().catch(console.error);
