import React from 'react';
import { Img } from 'remotion';

/**
 * A product cut-out with a specular light band sweeping across it.
 * The band is masked by the cut-out's own alpha, so the shine follows the product's silhouette
 * instead of washing over the background.
 */
export const ShinyProduct: React.FC<{
  src: string;
  width: number;
  height: number;
  /** -1 (band off the left edge) → 1 (off the right edge) */
  sweep: number;
  sweepOpacity?: number;
  angle?: number;
  style?: React.CSSProperties;
}> = ({ src, width, height, sweep, sweepOpacity = 0.85, angle = 22, style }) => {
  const mask: React.CSSProperties = {
    WebkitMaskImage: `url(${src})`,
    maskImage: `url(${src})`,
    WebkitMaskSize: '100% 100%',
    maskSize: '100% 100%',
  };
  const pos = 50 + sweep * 80;
  return (
    <div style={{ position: 'relative', width, height, ...style }}>
      <Img src={src} style={{ width: '100%', height: '100%', display: 'block' }} />
      <div
        style={{
          ...mask,
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'screen',
          opacity: sweepOpacity,
          background: `linear-gradient(${90 + angle}deg, rgba(255,255,255,0) ${pos - 14}%, rgba(255,244,220,0.25) ${pos - 6}%, rgba(255,255,255,0.95) ${pos}%, rgba(255,244,220,0.25) ${pos + 6}%, rgba(255,255,255,0) ${pos + 14}%)`,
        }}
      />
      {/* soft contrast lift so the product reads as lit, not pasted */}
      <div
        style={{
          ...mask,
          position: 'absolute',
          inset: 0,
          mixBlendMode: 'soft-light',
          background: 'linear-gradient(160deg, rgba(255,240,210,0.55) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.35) 100%)',
        }}
      />
    </div>
  );
};

/** Mirror reflection on a glossy floor, fading out with distance. */
export const Reflection: React.FC<{ src: string; width: number; height: number; opacity?: number }> = ({
  src,
  width,
  height,
  opacity = 0.28,
}) => (
  <div
    style={{
      width,
      height,
      transform: 'scaleY(-1)',
      opacity,
      WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 38%)',
      maskImage: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 38%)',
      filter: 'blur(1.5px)',
    }}
  >
    <Img src={src} style={{ width: '100%', height: '100%' }} />
  </div>
);

/** Four-point star glint for metal and glass highlights. `t` is 0→1→0. */
export const Glint: React.FC<{ x: number; y: number; t: number; size?: number; rotate?: number }> = ({
  x,
  y,
  t,
  size = 120,
  rotate = 0,
}) => {
  if (t <= 0.001) return null;
  const s = size * (0.4 + 0.6 * t);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - s / 2,
        top: y - s / 2,
        width: s,
        height: s,
        opacity: t,
        transform: `rotate(${rotate + t * 45}deg)`,
        mixBlendMode: 'screen',
        pointerEvents: 'none',
      }}
    >
      <svg viewBox="-50 -50 100 100" width="100%" height="100%">
        <defs>
          <radialGradient id="g-core">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset="0.25" stopColor="#fff3d6" stopOpacity="0.8" />
            <stop offset="1" stopColor="#ffd890" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r="18" fill="url(#g-core)" />
        <path d="M0,-50 L3,-3 L50,0 L3,3 L0,50 L-3,3 L-50,0 L-3,-3 Z" fill="#fff" opacity="0.9" />
      </svg>
    </div>
  );
};
