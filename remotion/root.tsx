import React from 'react';
import { Composition, registerRoot } from 'remotion';

import { TikTokVideoComposition } from './templates/tiktok-video';

const TikTokComposition = TikTokVideoComposition as unknown as React.FC<Record<string, unknown>>;

function calculateMetadata({ props }: { props: Record<string, unknown> }) {
  const fps = 30;
  const durationInFrames = Number(props.durationInFrames);
  const duration = Number(props.duration);

  return {
    fps,
    durationInFrames: Number.isFinite(durationInFrames)
      ? durationInFrames
      : Math.ceil((Number.isFinite(duration) ? duration : 20) * fps),
  };
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="tiktok-video"
        component={TikTokComposition}
        durationInFrames={30 * 40}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={calculateMetadata}
        defaultProps={{
          imageUrl: 'https://via.placeholder.com/1080x1920',
          hook: 'Conheca o melhor produto!',
          body: 'Uma descricao direta do seu produto',
          cta: 'Corre no Radar Smart pelo link na bio',
          productName: 'Produto Exemplo',
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
