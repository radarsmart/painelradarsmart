import React from 'react';

import { VideoSchema } from './types';

export const TikTokVideoComposition: React.FC<VideoSchema> = ({
  imageUrl,
  hook,
  body,
  cta,
  productName,
}) => {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: 'linear-gradient(135deg, #0A0F1E 0%, #1a1f2e 100%)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        color: '#fff',
        fontFamily: 'Arial, sans-serif',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <img
        src={imageUrl}
        alt={productName}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.7,
        }}
      />

      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: 'rgba(10, 15, 30, 0.4)',
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 10,
          textAlign: 'center',
          padding: '60px 40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
        }}
      >
        <div
          style={{
            fontSize: '48px',
            fontWeight: 'bold',
            marginBottom: '40px',
            lineHeight: '1.2',
            textShadow: '0 4px 12px rgba(0, 0, 0, 0.8)',
            color: '#C9973A',
          }}
        >
          {hook}
        </div>

        <div
          style={{
            fontSize: '32px',
            marginBottom: '40px',
            lineHeight: '1.4',
            textShadow: '0 4px 12px rgba(0, 0, 0, 0.8)',
            maxWidth: '900px',
          }}
        >
          {body}
        </div>

        <div
          style={{
            fontSize: '40px',
            fontWeight: 'bold',
            marginTop: '40px',
            padding: '20px 40px',
            background: '#C9973A',
            borderRadius: '12px',
            color: '#0A0F1E',
            textShadow: 'none',
          }}
        >
          {cta}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          bottom: '40px',
          right: '40px',
          fontSize: '24px',
          fontWeight: 'bold',
          color: '#C9973A',
          zIndex: 15,
        }}
      >
        Radar Smart
      </div>
    </div>
  );
};
