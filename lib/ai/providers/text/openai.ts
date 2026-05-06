import { ITextProvider, TextInput, TextOutput, TextScene } from '../../contracts/text';

type OpenAITextPayload = {
  hook?: unknown;
  body?: unknown;
  cta?: unknown;
  duration?: unknown;
  variations?: unknown;
  scenes?: unknown;
};

function toStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, limit);
}

function normalizeScenes(value: unknown, duration: number): TextScene[] {
  if (!Array.isArray(value)) return [];

  return value.map((scene, index) => {
    const raw = scene && typeof scene === 'object' ? scene as Record<string, unknown> : {};
    return {
      index: Number(raw.index || index + 1),
      startSecond: Number(raw.startSecond || 0),
      endSecond: Number(raw.endSecond || duration),
      visual: String(raw.visual || ''),
      overlayText: String(raw.overlayText || ''),
    };
  }).filter((scene) => scene.visual || scene.overlayText);
}

export class OpenAITextProvider implements ITextProvider {
  name = 'openai';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || '';
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(input: TextInput): Promise<TextOutput> {
    if (!this.apiKey) {
      return {
        status: 'error',
        provider: this.name,
        hook: '',
        body: '',
        cta: '',
        duration: 0,
        variations: [],
        scenes: [],
        error: 'OpenAI API key not configured',
      };
    }

    try {
      const duration = input.durationSeconds ?? 20;
      const platformContext = {
        tiktok: 'TikTok',
        reels: 'Instagram Reels',
        shorts: 'YouTube Shorts',
        generic: 'short-form vertical video',
      }[input.platform || 'generic'];

      const prompt = `Generate a Brazilian Portuguese short-form creative script for ${platformContext}.

Product: ${input.productName}
Description: ${input.description}
Price: ${input.price || 'not specified'}
Target audience: ${input.targetAudience || 'general Brazilian shoppers'}
Target duration: ${duration} seconds

Return only valid JSON:
{
  "hook": "max 90 characters, strong first 2 seconds",
  "body": "short creator-style script, no corporate tone",
  "cta": "must direct to Radar Smart",
  "duration": ${duration},
  "variations": ["3 alternative hooks"],
  "scenes": [
    {
      "index": 1,
      "startSecond": 0,
      "endSecond": 2,
      "visual": "visual direction for Remotion preview",
      "overlayText": "short readable text"
    }
  ]
}

Rules:
- Keep the product visible early.
- Use short on-screen text.
- CTA must mention Radar Smart.
- Do not mention any marketplace name or marketplace brand.
- Do not promise guaranteed savings.
- Do not invent fake stock numbers.
- Keep everything suitable for vertical 9:16 video.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const error = await response.json() as { error?: { message?: string } };
        throw new Error(`OpenAI API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in response');
      }

      const script = JSON.parse(content.trim()) as OpenAITextPayload;
      const parsedDuration = Number(script.duration || duration);
      const normalizedDuration = Number.isFinite(parsedDuration) ? parsedDuration : duration;

      return {
        status: 'success',
        provider: this.name,
        hook: String(script.hook || ''),
        body: String(script.body || ''),
        cta: String(script.cta || 'Corre no Radar Smart pelo link na bio antes que acabe o estoque!'),
        duration: normalizedDuration,
        variations: toStringArray(script.variations, 5),
        scenes: normalizeScenes(script.scenes, normalizedDuration),
        metadata: {
          model: process.env.OPENAI_TEXT_MODEL || 'gpt-4o-mini',
          platform: input.platform,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[${this.name}] Text generation failed:`, message);

      return {
        status: 'error',
        provider: this.name,
        hook: '',
        body: '',
        cta: '',
        duration: 0,
        variations: [],
        scenes: [],
        error: message,
      };
    }
  }
}
