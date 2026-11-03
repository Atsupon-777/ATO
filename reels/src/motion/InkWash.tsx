// "Ink wash" scene: washi paper, layered sumi mountains bleeding into mist that drifts at different
// speeds, a vermilion sun rising, a vertical line of mincho text brushed in, and a red seal pressed last.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { useLook } from './theme';
import { E, k, lin, mix, rand } from './kit';

export type InkWashProps = {
  /** Vertical line, read top to bottom (8–14 characters reads best). */
  title: string;
  /** A second, smaller vertical line to its left. */
  sub?: string;
  /** One to four characters in the red seal. */
  seal?: string;
  sun?: string;
};

/** A mountain ridge as a filled path, seeded so every render is the same. */
const ridge = (seed: number, base: number, amp: number, peaks: number) => {
  const pts: string[] = [`M -40 1920`, `L -40 ${base}`];
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const x = -40 + (1160 / n) * i;
    let y = base;
    for (let p = 1; p <= peaks; p++) y -= Math.max(0, Math.sin((i / n) * Math.PI * p + rand(seed + p) * 6)) * amp * (0.5 + rand(seed * 3 + p) * 0.6) / p;
    y += (rand(seed * 11 + i) - 0.5) * amp * 0.06;
    pts.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  pts.push('L 1120 1920 Z');
  return pts.join(' ');
};

const LAYERS = [
  { d: ridge(3, 1120, 520, 3), ink: 0.18, blur: 10, speed: 8 },
  { d: ridge(7, 1300, 430, 2), ink: 0.32, blur: 6, speed: 16 },
  { d: ridge(13, 1500, 360, 3), ink: 0.55, blur: 3, speed: 28 },
  { d: ridge(19, 1720, 260, 4), ink: 0.85, blur: 1.2, speed: 44 },
];

export const InkWash: React.FC<InkWashProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const L = useLook();
  const t = (s: number) => s * fps;
  const run = lin(f, 0, D);
  const sunRise = k(f, t(0.3), t(2.6), E.inOutCubic);
  const sunColor = p.sun ?? (L && L.accent.startsWith('#') ? L.accent : '#d8342a');
  const chars = [...p.title];
  const brushAt = (i: number) => t(1.0) + i * t(0.16);
  const sealAt = brushAt(chars.length) + t(0.35);
  const seal = lin(f, sealAt, sealAt + t(0.25));
  return (
    <AbsoluteFill style={{ background: '#efe8da', overflow: 'hidden' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="iw-paper">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" />
            <feColorMatrix values="0 0 0 0 0.45  0 0 0 0 0.38  0 0 0 0 0.3  0 0 0 0.09 0" />
          </filter>
          <filter id="iw-bleed" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="2" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="40" />
          </filter>
          <linearGradient id="iw-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a1714" stopOpacity="1" />
            <stop offset="0.55" stopColor="#1a1714" stopOpacity="0.15" />
            <stop offset="1" stopColor="#1a1714" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="iw-sun">
            <stop offset="0.75" stopColor={sunColor} />
            <stop offset="1" stopColor={sunColor} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={400} cy={mix(1180, 620, sunRise)} r={118} fill="url(#iw-sun)" opacity={0.92} />
        {LAYERS.map((l, i) => {
          const appear = k(f, t(0.1 * i), t(0.1 * i) + t(1.2), E.outCubic);
          return (
            <g key={i} transform={`translate(${-run * l.speed} ${(1 - appear) * 60})`} opacity={appear}>
              <path d={l.d} fill="url(#iw-fade)" opacity={l.ink} filter="url(#iw-bleed)" style={{ filter: `url(#iw-bleed) blur(${l.blur}px)` }} />
            </g>
          );
        })}
        {/* mist bands drifting across the ridges */}
        {[0, 1, 2].map((i) => (
          <ellipse
            key={i}
            cx={((rand(i + 40) * 1400 + run * (90 + i * 40)) % 1600) - 260}
            cy={1150 + i * 230}
            rx={560}
            ry={70}
            fill="#efe8da"
            opacity={0.55}
            style={{ filter: 'blur(28px)' }}
          />
        ))}
        <rect width="1080" height="1920" filter="url(#iw-paper)" />
      </svg>
      {p.sub ? (
        <div
          style={{
            position: 'absolute',
            right: 250,
            top: 260,
            writingMode: 'vertical-rl',
            fontFamily: fonts.minchoJP,
            fontWeight: 500,
            fontSize: 40,
            letterSpacing: '0.3em',
            color: '#3b342c',
            opacity: lin(f, sealAt - t(0.1), sealAt + t(0.5)),
          }}
        >
          {p.sub}
        </div>
      ) : null}
      <div style={{ position: 'absolute', right: 120, top: 220, writingMode: 'vertical-rl', fontFamily: fonts.minchoJP, fontWeight: 800, fontSize: 92, letterSpacing: '0.12em', color: '#14110e' }}>
        {chars.map((c, i) => {
          const a = lin(f, brushAt(i), brushAt(i) + t(0.3));
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: a,
                filter: `blur(${(1 - a) * 6}px)`,
                clipPath: `inset(0 0 ${(1 - E.outCubic(a)) * 100}% 0)`,
              }}
            >
              {c}
            </span>
          );
        })}
      </div>
      {p.seal ? (
        <div
          style={{
            position: 'absolute',
            right: 132,
            top: 240 + chars.length * 104 + 40,
            width: 92,
            height: 92,
            background: '#c4291f',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            color: '#f6e9df',
            fontFamily: fonts.minchoJP,
            fontWeight: 800,
            fontSize: p.seal.length > 2 ? 30 : 42,
            lineHeight: 1,
            writingMode: 'vertical-rl',
            opacity: seal,
            transform: `scale(${mix(1.6, 1, E.outBack(seal))}) rotate(-4deg)`,
            boxShadow: 'inset 0 0 0 4px rgba(246,233,223,.25)',
          }}
        >
          {p.seal}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
