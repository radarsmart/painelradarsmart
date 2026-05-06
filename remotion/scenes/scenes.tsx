import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';

interface HookSceneProps {
  text: string;
  duration: number;
}

/**
 * Hook Scene (0-5s): Strong opening
 */
export const HookScene: React.FC<HookSceneProps> = ({ text, duration }) => {
  const { fps } = useVideoConfig();
  const durationInFrames = Math.ceil(duration * fps);

  return (
    <Sequence durationInFrames={durationInFrames}>
      <AbsoluteFill
        style={{
          background: 'linear-gradient(135deg, #0A0F1E 0%, #1a1f2e 100%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontSize: '56px',
          fontWeight: 'bold',
          color: '#C9973A',
          padding: '60px 40px',
          textAlign: 'center',
          textShadow: '0 4px 12px rgba(0, 0, 0, 0.8)',
          lineHeight: '1.2',
        }}
      >
        {text}
      </AbsoluteFill>
    </Sequence>
  );
};

interface BodySceneProps {
  text: string;
  imageUrl: string;
  duration: number;
}

/**
 * Body Scene (5-35s): Main content with image
 */
export const BodyScene: React.FC<BodySceneProps> = ({
  text,
  imageUrl,
  duration,
}) => {
  const { fps } = useVideoConfig();
  const durationInFrames = Math.ceil(duration * fps);

  return (
    <Sequence durationInFrames={durationInFrames}>
      <AbsoluteFill>
        {/* Background Image */}
        <img
          src={imageUrl}
          alt="Product"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />

        {/* Overlay */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            background: 'rgba(10, 15, 30, 0.5)',
          }}
        />

        {/* Text */}
        <div
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            fontSize: '40px',
            fontWeight: '600',
            color: '#fff',
            padding: '60px 40px',
            textAlign: 'center',
            textShadow: '0 4px 12px rgba(0, 0, 0, 0.8)',
            lineHeight: '1.4',
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    </Sequence>
  );
};

interface CTASceneProps {
  text: string;
  duration: number;
}

/**
 * CTA Scene (35-40s): Call to action
 */
export const CTAScene: React.FC<CTASceneProps> = ({ text, duration }) => {
  const { fps } = useVideoConfig();
  const durationInFrames = Math.ceil(duration * fps);

  return (
    <Sequence durationInFrames={durationInFrames}>
      <AbsoluteFill
        style={{
          background: 'linear-gradient(135deg, #C9973A 0%, #a07a2a 100%)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          padding: '60px 40px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '56px',
            fontWeight: 'bold',
            color: '#0A0F1E',
            marginBottom: '20px',
            lineHeight: '1.2',
          }}
        >
          {text}
        </div>
        <div
          style={{
            fontSize: '32px',
            color: '#0A0F1E',
            fontWeight: '600',
          }}
        >
          🔗 Radar Smart
        </div>
      </AbsoluteFill>
    </Sequence>
  );
};
