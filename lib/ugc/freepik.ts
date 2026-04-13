import * as dotenv from "dotenv";
import path from "path";

// Garante o carregamento do .env.local mesmo quando rodado via scripts avulsos
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

/**
 * Utilitário Interno: Obtém e valida a chave da API
 */
function getApiKey(): string {
  const apiKey = process.env.FREEPIK_API_KEY;
  if (!apiKey) {
    throw new Error("❌ Erro: FREEPIK_API_KEY não está configurada no arquivo .env.local");
  }
  return apiKey;
}

/**
 * 1. Remove o fundo de uma imagem
 * Endpoint: POST /v1/ai/beta/remove-background
 */
export async function removeBackground(imageUrl: string): Promise<string> {
  console.log(`🧹 Removendo fundo da imagem... [URL: ${imageUrl}]`);
  const apiKey = getApiKey();

  try {
    // 1. Baixar a imagem primeiro para evitar bloqueios de download na ponta da Freepik
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Falha ao baixar imagem de origem: ${imgRes.status}`);
    const blob = await imgRes.blob();

    // 2. Enviar via multipart/form-data (Padrão para endpoints de arquivos na Freepik)
    const formData = new FormData();
    formData.append("image_file", blob, "image.jpg");
    formData.append("format", "png");

    const response = await fetch("https://api.freepik.com/v1/ai/beta/remove-background", {
      method: "POST",
      headers: {
        "x-freepik-api-key": apiKey
      },
      body: formData
    });

    if (!response.ok) {
      const errData = await response.text();
      throw new Error(`Freepik API Error (${response.status}): ${errData}`);
    }

    const data = await response.json();
    
    // A API do remove-background beta costuma retornar um campo data com a base64 ou url 
    // Dependendo do retorno oficial da Freepik para beta
    const resultUrl = data?.data?.url || data?.image?.url || data?.url;
    
    if (!resultUrl) {
      throw new Error("URL ou arquivo de imagem não retornado pela API de remoção de fundo");
    }

    console.log(`✅ Fundo removido! [Nova Imagem: ${resultUrl}]`);
    return resultUrl;
    
  } catch (error) {
    console.error("❌ Falha na remoção de fundo Freepik:", error);
    throw error;
  }
}

/**
 * 2. Gera uma imagem a partir de um prompt via IA
 * Model: mystic (assíncrono)
 * Endpoint: POST /v1/ai/mystic
 */
export async function generateImage(prompt: string): Promise<string> {
  console.log(`🎨 Gerando imagem com modelo 'mystic'...`);
  console.log(`📝 Prompt: "${prompt}"`);
  
  const apiKey = getApiKey();

  // 1. Submete a tarefa
  const response = await fetch("https://api.freepik.com/v1/ai/mystic", {
    method: "POST",
    headers: {
      "x-freepik-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: "social_story_9_16",  // Vertical exato 9:16
      output_format: "jpg"
    })
  });
  
  const data = await response.json();
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`task_id não retornado pelo Mystic (Dados: ${JSON.stringify(data)})`);
  
  // 2. Polling até completar (máx 60s)
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000)); // aguarda 5s
    
    const poll = await fetch(
      `https://api.freepik.com/v1/ai/mystic/${taskId}`,
      { headers: { "x-freepik-api-key": apiKey } }
    );
    const pollData = await poll.json();
    const status = pollData?.data?.status;
    
    console.log(`⏳ Mystic status: ${status} (tentativa ${i+1}/12)`);
    
    if (status === "DONE" || status === "COMPLETED") {
      // Diferentes modelos de retorno baseados na documentacão / logs da API da freepik
      let imageUrl = null;
      const gen = pollData?.data?.generated?.[0];
      if (typeof gen === 'string') imageUrl = gen;
      else if (gen?.url) imageUrl = gen.url;
      else if (pollData?.data?.url) imageUrl = pollData.data.url;
      else if (pollData?.image?.url) imageUrl = pollData.image.url;

      if (!imageUrl) throw new Error(`URL não encontrada no resultado do Mystic (Payload Completo: ${JSON.stringify(pollData)})`);
      console.log(`✅ Imagem gerada: ${imageUrl}`);
      return imageUrl;
    }
    
    if (status === "FAILED") throw new Error(`Geração falhou no Mystic (Payload Completo: ${JSON.stringify(pollData)})`);
  }
  
  throw new Error("Timeout: Mystic não completou em 60s");
}

/**
 * 3. Anima uma imagem estática transformando em vídeo
 * Endpoint: POST /v1/ai/image-to-video/kling-v2-std
 * Duração: 5s, Ratio: 9:16 (assíncrono)
 */
export async function animateImage(imageUrl: string, prompt: string): Promise<string> {
  const apiKey = getApiKey();
  console.log("🎞️ Animando imagem com Kling 2.5 Pro...");
  
  // 1. Submete tarefa
  const response = await fetch(
    "https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro",
    {
      method: "POST",
      headers: {
        "x-freepik-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url: imageUrl,
        prompt: prompt,
        duration: "5",
        aspect_ratio: "social_story_9_16"
      })
    }
  );
  
  const data = await response.json();
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`task_id não retornou: ${JSON.stringify(data)}`);
  
  // 2. Polling até completar (máx 300s)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    
    const poll = await fetch(
      `https://api.freepik.com/v1/ai/image-to-video/kling-v2-5-pro/${taskId}`,
      { headers: { "x-freepik-api-key": apiKey } }
    );
    const pollData = await poll.json();
    const status = pollData?.data?.status;
    console.log(`⏳ Kling status: ${status} (tentativa ${i+1}/60)`);
    
    if (status === "DONE" || status === "COMPLETED") {
      let videoUrl = pollData?.data?.url || pollData?.data?.video_url;
      // Trata array caso o Kling retorne igual o Mystic
      if (!videoUrl && Array.isArray(pollData?.data?.generated)) {
          const gen = pollData.data.generated[0];
          if (typeof gen === 'string') videoUrl = gen;
          else if (gen?.url) videoUrl = gen.url;
      }
      if (!videoUrl) throw new Error(`URL do vídeo não encontrada no resultado do Kling: ${JSON.stringify(pollData)}`);
      
      console.log(`✅ Vídeo animado com sucesso! [Vídeo: ${videoUrl}]`);
      return videoUrl;
    }
    
    if (status === "FAILED") throw new Error(`Animação falhou no Kling: ${JSON.stringify(pollData)}`);
  }
  
  throw new Error("Timeout: Kling não completou em 300s");
}

export async function textToVideo(prompt: string): Promise<string> {
  const apiKey = getApiKey();
  console.log("🎬 Gerando vídeo text-to-video com Kling (Omni v3)...");
  
  const response = await fetch(
    "https://api.freepik.com/v1/ai/video/kling-v3-omni-std",
    {
      method: "POST",
      headers: {
        "x-freepik-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt,
        duration: "5",
        aspect_ratio: "9:16"
      })
    }
  );
  
  const data = await response.json();
  const taskId = data?.data?.task_id || data?.task_id;
  if (!taskId) throw new Error(`task_id não retornou: ${JSON.stringify(data)}`);
  
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const poll = await fetch(
      `https://api.freepik.com/v1/ai/video/kling-v3-omni-std/${taskId}`,
      { headers: { "x-freepik-api-key": apiKey } }
    );
    const pollData = await poll.json();
    const status = pollData?.status || pollData?.data?.status;
    if (!status) {
      console.log(`⚠️ Status indefinido. Response: ${JSON.stringify(pollData)}`);
    }
    console.log(`⏳ Text2Video status: ${status} (${i+1}/60)`);
    
    if (status === "COMPLETED" || status === "DONE" || status === "SUCCEEDED" || status === "success") {
      const url = pollData?.data?.generated?.[0]?.url || pollData?.data?.generated?.[0] || pollData?.generated?.[0]?.url || pollData?.generated?.[0] || pollData?.data?.video_url || pollData?.video_url;
      if (!url) throw new Error(`URL não encontrada: ${JSON.stringify(pollData)}`);
      return typeof url === 'string' ? url : url.url;
    }
    
    if (status === "FAILED" || status === "failed" || status === "error") throw new Error(`Text2Video falhou: ${JSON.stringify(pollData)}`);
  }
  
  throw new Error("Timeout text2video");
}

/**
 * 5. Anima uma foto de pessoa sincronizando com áudio (Avatar Falando)
 * Endpoint: POST /v1/ai/video/omni-human-1-5
 * Assíncrono
 */
export async function animateAvatar(
  imageUrl: string,
  audioUrl: string,
  prompt: string = "A person speaking naturally with subtle head movements"
): Promise<string> {
  const apiKey = getApiKey();
  console.log("🗣️ Animando avatar com OmniHuman 1.5...");
  console.log(`🖼️ Imagem: ${imageUrl}`);
  console.log(`🎵 Áudio: ${audioUrl}`);

  const response = await fetch(
    "https://api.freepik.com/v1/ai/video/omni-human-1-5",
    {
      method: "POST",
      headers: {
        "x-freepik-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        image_url: imageUrl,
        audio_url: audioUrl,
        prompt: prompt,
        resolution: "1080p"
      })
    }
  );

  const data = await response.json();
  const taskId = data?.data?.task_id || data?.task_id;
  if (!taskId) throw new Error(`task_id não retornou: ${JSON.stringify(data)}`);

  // Polling (máx 300s)
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 7000)); // 7s entre polls
    const poll = await fetch(
      `https://api.freepik.com/v1/ai/video/omni-human-1-5/${taskId}`,
      { headers: { "x-freepik-api-key": apiKey } }
    );
    const pollData = await poll.json();
    const status = pollData?.status || pollData?.data?.status;

    console.log(`⏳ OmniHuman status: ${status} (${i+1}/60)`);

    if (status === "COMPLETED" || status === "DONE" || status === "SUCCESS") {
      const url = pollData?.data?.generated?.[0]?.url || 
                  pollData?.data?.generated?.[0] || 
                  pollData?.generated?.[0]?.url || 
                  pollData?.generated?.[0];
      
      if (!url) throw new Error(`URL não encontrada: ${JSON.stringify(pollData)}`);
      return typeof url === 'string' ? url : url.url;
    }

    if (status === "FAILED" || status === "ERROR") {
      throw new Error(`OmniHuman falhou: ${JSON.stringify(pollData)}`);
    }
  }

  throw new Error("Timeout OmniHuman 1.5");
}
