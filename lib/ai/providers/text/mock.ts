import { ITextProvider, TextInput, TextOutput } from '../../contracts/text';

export class MockTextProvider implements ITextProvider {
  name = 'mock';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(input: TextInput): Promise<TextOutput> {
    await new Promise((resolve) => setTimeout(resolve, 300));

    const duration = input.durationSeconds ?? 20;
    const revealEnd = Math.max(4, Math.min(10, duration - 2));

    return {
      status: 'success',
      provider: this.name,
      hook: `Nao acredito no preco desse ${input.productName}...`,
      body: `${input.description}. Produto aparece logo no inicio, com beneficio principal em texto curto e preco em destaque${input.price ? `: ${input.price}` : ''}.`,
      cta: 'Corre no Radar Smart pelo link na bio antes que acabe o estoque!',
      duration,
      variations: [
        `Para tudo, olha esse ${input.productName}.`,
        'Isso aqui resolveu um problema que muita gente tem.',
        'Esse achado entrou no Radar Smart hoje.',
      ],
      scenes: [
        {
          index: 1,
          startSecond: 0,
          endSecond: 2,
          visual: 'Produto em primeiro plano com corte rapido.',
          overlayText: `Nao acredito nesse ${input.productName}`,
        },
        {
          index: 2,
          startSecond: 2,
          endSecond: revealEnd,
          visual: 'Close no produto e detalhe do beneficio principal.',
          overlayText: input.description.slice(0, 72),
        },
        {
          index: 3,
          startSecond: revealEnd,
          endSecond: duration,
          visual: 'Preco em destaque, fundo escuro Radar Smart e CTA final.',
          overlayText: 'Link na bio no Radar Smart',
        },
      ],
      metadata: {
        mocked: true,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
