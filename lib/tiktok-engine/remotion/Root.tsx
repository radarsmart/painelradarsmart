import React from "react";
import { Composition, registerRoot } from "remotion";

import { HookChoqueTemplate } from "./templates/HookChoque";
import { ComparacaoPrecoTemplate } from "./templates/ComparacaoPreco";
import { StorytellingBeneficioTemplate } from "./templates/StorytellingBeneficio";
import type { TikTokRemotionInput } from "./types";

const BASE_PROPS: Omit<TikTokRemotionInput, "template"> = {
  durationInFrames: 600,
  fps: 30,
  modelId: 1,
  productName: "Produto Exemplo",
  productPrice: "39,90",
  productDiscount: "60% OFF",
  productCategory: "Tecnologia",
  competitorName: "Concorrente",
  competitorPrice: "R$249,00",
  benefits: ["Beneficio 1", "Beneficio 2", "Beneficio 3"],
  onScreenText: ["Preco baixo", "Entrega rapida", "Clique no link"],
  hook: "Nao acredito no que acabei de ver...",
  body: ["Essa oferta e real", "Preco por tempo limitado", "Corra enquanto tem"],
  cta: "Entra no Radar Smart pelo link na bio!",
  caption: "Oferta imperdivel no Radar Smart",
  imageUrls: [],
  audioUrl: "",
  shopUrl: "",
  hookVariationIndex: 0,
};

function calculateMeta({ props }: { props: TikTokRemotionInput }) {
  return {
    durationInFrames: Number(props?.durationInFrames) || 600,
    fps: Number(props?.fps) || 30,
  };
}

const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* Template 1: Hook Choque — Modelos 1, 7, 9 */}
      <Composition
        id="TikTokHookChoque"
        component={HookChoqueTemplate}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={600}
        defaultProps={{ ...BASE_PROPS, template: "hook_choque" }}
        calculateMetadata={calculateMeta}
      />

      {/* Template 2: Comparação de Preço — Modelos 5, 10 */}
      <Composition
        id="TikTokComparacaoPreco"
        component={ComparacaoPrecoTemplate}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={600}
        defaultProps={{ ...BASE_PROPS, template: "comparacao_preco" }}
        calculateMetadata={calculateMeta}
      />

      {/* Template 3: Storytelling Benefício — Modelos 2, 3, 4, 6, 8 */}
      <Composition
        id="TikTokStorytellingBeneficio"
        component={StorytellingBeneficioTemplate}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={600}
        defaultProps={{ ...BASE_PROPS, template: "storytelling_beneficio" }}
        calculateMetadata={calculateMeta}
      />
    </>
  );
};

registerRoot(RemotionRoot);
