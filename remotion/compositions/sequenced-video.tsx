import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HookScene, BodyScene, CTAScene } from '../scenes/scenes';
import { VideoSchema } from '../templates/types';

/**
 * Composition that sequences Hook -> Body -> CTA
 * Used for video composition
 */
export const SequencedVideoComposition: React.FC<VideoSchema> = ({
  imageUrl,
  hook,
  body,
  cta,
}) => {
  const hookDuration = 5; // seconds
  const bodyDuration = 30; // seconds
  const ctaDuration = 5; // seconds

  return (
    <AbsoluteFill>
      <HookScene text={hook} duration={hookDuration} />
      <BodyScene
        text={body}
        imageUrl={imageUrl}
        duration={bodyDuration}
      />
      <CTAScene text={cta} duration={ctaDuration} />
    </AbsoluteFill>
  );
};
