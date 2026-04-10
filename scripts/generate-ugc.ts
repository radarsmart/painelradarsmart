import * as dotenv from "dotenv";
import path from "path";
import { UGC_VOICES, VoiceKey } from "../lib/ugc/voices";

// Carrega variáveis de ambiente do .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { generateModelCVideo, extractProductData } from "../lib/ugc/model-c-screen";
import { UGCOfferContext } from "../lib/ugc/types";

async function main() {
  // Parsing simples de argumentos: --voice=nome
  const args = process.argv.slice(2);
  const voiceArg = args.find(a => a.startsWith("--voice="))?.split("=")[1] as VoiceKey;
  
  const selectedVoiceKey: VoiceKey = voiceArg && UGC_VOICES[voiceArg] ? voiceArg : "mateus";
  const selectedVoice = UGC_VOICES[selectedVoiceKey];

  const productUrl = "https://www.mercadolivre.com.br/social/re20251205180122";
  
  console.log(`🔍 Identificando produto via Firecrawl...`);
  const productData = await extractProductData(productUrl);

  const sampleOffer: UGCOfferContext = {
    title: productData.title,
    price: productData.price,
    discountPct: 15,
    marketplace: "Mercado Livre",
    productUrl: productUrl
  };

  console.log(`✅ Produto: ${sampleOffer.title} - R$ ${sampleOffer.price}`);
  console.log(`🚀 Iniciando geração de UGC Modelo C...`);
  console.log(`🎙️ Voz selecionada: ${selectedVoice.name} (${selectedVoice.style})`);
  
  try {
    const result = await generateModelCVideo(sampleOffer, { voiceId: selectedVoice.id });
    console.log("\n✅ UGC Gerado com sucesso!");
    console.log("-----------------------------------------");
    console.log("📄 Roteiro Gerado:");
    console.log(`HOOOK: ${result.script.hook}`);
    console.log(`BODY: ${result.script.body}`);
    console.log(`CTA: ${result.script.cta}`);
    console.log("-----------------------------------------");
    console.log(`🎬 Vídeo final em: ${result.videoUrl}`);
  } catch (error) {
    console.error("\n❌ Erro na geração:", error);
  }
}

main();
