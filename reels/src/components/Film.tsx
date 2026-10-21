import React from 'react';
import { AbsoluteFill, random, useCurrentFrame } from 'remotion';

/** Animated film grain. A fresh noise seed every 2 frames keeps it alive without flicker. */
export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.08 }) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2);
  return (
    <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
      <svg width="100%" height="100%">
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.65 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse 75% 60% at 50% 48%, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);

/** Slow-floating out-of-focus dust, lit warm. Deterministic so every render is identical. */
export const Dust: React.FC<{ count?: number; color?: string; seed?: string }> = ({
  count = 38,
  color = '255,226,170',
  seed = 'dust',
}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {new Array(count).fill(0).map((_, i) => {
        const x = random(`${seed}x${i}`) * 1080;
        const y0 = random(`${seed}y${i}`) * 1920;
        const size = 3 + random(`${seed}s${i}`) ** 3 * 22;
        const speed = 0.25 + random(`${seed}v${i}`) * 0.8;
        const y = (((y0 - frame * speed) % 1920) + 1920) % 1920;
        const drift = Math.sin(frame / 40 + i) * 14;
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame / (25 + i) + i));
        const blur = size > 12 ? size / 3 : 0.5;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x + drift,
              top: y,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `rgba(${color},${0.55 * tw})`,
              filter: `blur(${blur}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** A warm light-leak bloom used to hide cuts. `t` is 0→1→0 across the transition. */
export const LightLeak: React.FC<{ t: number; color?: string }> = ({ t, color = '255,214,150' }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity: t,
      mixBlendMode: 'screen',
      background: `radial-gradient(circle at ${30 + t * 40}% ${40 - t * 10}%, rgba(${color},1) 0%, rgba(${color},0.55) 30%, rgba(${color},0) 70%)`,
    }}
  />
);
