// Hand-made looks: paper collage and boiling doodles.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { evolvePath } from '@remotion/paths';
import { fonts } from '../lib/fonts';
import { pop, progress } from '../lib/timing';
import { Caption, Footage, Subject, rand, useHasSubject, type EffectProps } from './layers';

/** SVG filters used by the craft effects. Ids are scoped per segment so two segments never clash. */
export const Filters: React.FC<{ id: string; seed: number; outline: number; sticker: number }> = ({ id, seed, outline, sticker }) => (
  <svg width={0} height={0} style={{ position: 'absolute' }}>
    <defs>
      {/* white outline only, wobbling with the seed ("boil") */}
      <filter id={`${id}-boil`} x="-5%" y="-5%" width="110%" height="110%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={outline} result="fat" />
        <feMorphology in="SourceAlpha" operator="dilate" radius={Math.max(1, outline - 4)} result="thin" />
        <feComposite in="fat" in2="thin" operator="out" result="ring" />
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={seed} result="noise" />
        <feDisplacementMap in="ring" in2="noise" scale={14} xChannelSelector="R" yChannelSelector="G" result="wobble" />
        <feFlood floodColor="#fff" />
        <feComposite in2="wobble" operator="in" />
      </filter>
      {/* person with a thick white sticker border and a soft shadow */}
      <filter id={`${id}-sticker`} x="-10%" y="-10%" width="120%" height="120%">
        <feMorphology in="SourceAlpha" operator="dilate" radius={sticker} result="fat" />
        <feFlood floodColor="#fff" />
        <feComposite in2="fat" operator="in" result="border" />
        <feGaussianBlur in="fat" stdDeviation={10} result="blur" />
        <feOffset in="blur" dx={8} dy={14} result="shadowAlpha" />
        <feFlood floodColor="rgba(0,0,0,0.35)" />
        <feComposite in2="shadowAlpha" operator="in" result="shadow" />
        <feMerge>
          <feMergeNode in="shadow" />
          <feMergeNode in="border" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id={`${id}-crayon`}>
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={1} seed={3} result="grain" />
        <feDisplacementMap in="SourceGraphic" in2="grain" scale={6} />
      </filter>
    </defs>
  </svg>
);

const scribble = (x: number, y: number, w: number, h: number, rows: number, seed: number) => {
  let d = `M${x},${y}`;
  for (let i = 0; i < rows; i++) {
    const yy = y + (i / rows) * h;
    d += ` L${x + w + (rand(seed + i) - 0.5) * 40},${yy + (rand(seed + i + 50) - 0.5) * 20} L${x + (rand(seed + i + 9) - 0.5) * 40},${yy + h / rows / 2}`;
  }
  return d;
};

/** 13 paper cut: a torn-paper collage with the speaker as a white-bordered sticker and ransom-note letters. */
export const PaperCut: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const hasSubject = useHasSubject();
  const id = `pc${Math.round(seg.start * 100)}`;
  const letters = (seg.text ?? '100%').split('');
  const tiles = [
    { bg: '#1D3FA6', fg: '#fff' },
    { bg: '#F5F1E6', fg: '#111' },
    { bg: '#fff', fg: '#C8202B' },
    { bg: '#111', fg: '#F1E45B' },
  ];
  const ringAt = letters.length * 4 + 6;
  const ring = progress(frame, ringAt, ringAt + 12);
  const ellipse = 'M 120 360 C 120 250 980 250 980 360 C 980 470 120 470 120 360';
  const ringPath = evolvePath(ring, ellipse);
  return (
    <AbsoluteFill style={{ background: '#F4F1E8' }}>
      <Filters id={id} seed={1} outline={8} sticker={16} />
      {/* grid paper */}
      <AbsoluteFill style={{ backgroundImage: 'linear-gradient(#DCE3EE 2px, transparent 2px), linear-gradient(90deg, #DCE3EE 2px, transparent 2px)', backgroundSize: '54px 54px', opacity: 0.7 }} />
      <svg width={1080} height={1920} style={{ position: 'absolute' }}>
        <path d={scribble(80, 120, 900, 520, 26, 4)} stroke="#8C9FD6" strokeWidth={26} fill="none" strokeLinejoin="round" opacity={0.75} filter={`url(#${id}-crayon)`} />
        <polygon points="420,780 1080,700 1080,1500 640,1560 600,1250 470,1180" fill="#F3EA4F" />
        <path d={scribble(660, 820, 330, 420, 14, 21)} stroke="#6F7FB8" strokeWidth={18} fill="none" opacity={0.85} filter={`url(#${id}-crayon)`} />
        <path d={scribble(760, 1350, 200, 220, 9, 33)} stroke="#E4708F" strokeWidth={16} fill="none" filter={`url(#${id}-crayon)`} />
        {[
          [80, 840],
          [930, 1260],
          [880, 1300],
        ].map(([x, y], i) => (
          <text key={i} x={x} y={y} fontSize={60} fontFamily="Plus Jakarta Sans" fontWeight={800} fill="#2B2B2B">
            ✕
          </text>
        ))}
      </svg>
      {hasSubject ? (
        <Subject filter={`url(#${id}-sticker)`} style={{ transform: 'translateY(120px) scale(0.92)' }} />
      ) : (
        <AbsoluteFill style={{ clipPath: 'polygon(4% 42%, 60% 38%, 66% 55%, 58% 70%, 70% 82%, 62% 100%, 0% 100%, 0% 46%)' }}>
          <Footage />
        </AbsoluteFill>
      )}
      <div style={{ position: 'absolute', top: 290, width: '100%', display: 'flex', justifyContent: 'center', gap: 14 }}>
        {letters.map((ch, i) => {
          const s = pop(frame, fps, i * 4, 9);
          const t = tiles[i % tiles.length];
          return (
            <div key={i} style={{ background: t.bg, color: t.fg, fontFamily: i % 2 ? fonts.serif : fonts.display, fontWeight: 800, fontSize: 130, lineHeight: 1, padding: '10px 22px', transform: `scale(${s}) rotate(${(rand(i + 2) - 0.5) * 14 + (1 - s) * 40}deg)`, boxShadow: '4px 6px 0 rgba(0,0,0,0.2)' }}>
              {ch}
            </div>
          );
        })}
      </div>
      <svg width={1080} height={1920} style={{ position: 'absolute' }}>
        <path d={ellipse} transform="translate(0,0) rotate(-3 540 360)" stroke="#C8202B" strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray={ringPath.strokeDasharray} strokeDashoffset={ringPath.strokeDashoffset} />
      </svg>
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.86} />
    </AbsoluteFill>
  );
};

const HEART = 'M50 88 C20 66 4 48 4 30 C4 14 16 4 30 4 C40 4 47 10 50 18 C53 10 60 4 70 4 C84 4 96 14 96 30 C96 48 80 66 50 88 Z';
const CLAPPER = 'M8 40 L92 40 L92 92 L8 92 Z M8 40 L4 18 L86 4 L90 26 M24 14 L32 36 M46 10 L54 32 M68 6 L76 28';
const STAR = 'M50 4 L61 38 L96 38 L68 59 L79 94 L50 72 L21 94 L32 59 L4 38 L39 38 Z';
const SHAPES: Record<string, string> = { heart: HEART, clapper: CLAPPER, star: STAR };

/** Boiling hand-drawn doodle: the path is redrawn with a new wobble every few frames. */
const Doodle: React.FC<{ d: string; x: number; y: number; size: number; from: number; color: string; boil: number }> = ({ d, x, y, size, from, color, boil }) => {
  const frame = useCurrentFrame();
  const draw = progress(frame, from, from + 12, (t) => t);
  const fill = progress(frame, from + 12, from + 22, (t) => t);
  const outline = evolvePath(draw, d);
  const hatch = Array.from({ length: 9 }, (_, i) => `M${10 + i * 10},${92} L${16 + i * 10},${30}`).join(' ');
  const hatchPath = evolvePath(fill, hatch);
  const jitter = (n: number) => (rand(boil * 7 + n) - 0.5) * 3;
  if (frame < from) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', left: x, top: y, transform: `rotate(${jitter(1)}deg) translate(${jitter(2)}px, ${jitter(3)}px)`, overflow: 'visible' }}>
      <defs>
        <clipPath id={`clip-${x}-${y}`}>
          <path d={d} />
        </clipPath>
      </defs>
      <path d={hatch} stroke={color} strokeWidth={5} fill="none" clipPath={`url(#clip-${x}-${y})`} strokeDasharray={hatchPath.strokeDasharray} strokeDashoffset={hatchPath.strokeDashoffset} opacity={0.9} />
      <path d={d} stroke="#fff" strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={outline.strokeDasharray} strokeDashoffset={outline.strokeDashoffset} />
    </svg>
  );
};

/** 14 doodle boil: a jittery white outline traces the speaker while doodles draw themselves and fill with hatching. */
export const DoodleBoil: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const hasSubject = useHasSubject();
  const boil = Math.floor(frame / 3); // ~10 changes per second, like hand-drawn animation on twos/threes
  const id = `db${Math.round(seg.start * 100)}`;
  const kinds = seg.items.length ? seg.items.filter((k) => SHAPES[k]) : ['heart', 'clapper', 'star'];
  const spots = [
    { x: 760, y: 360, size: 190 },
    { x: 90, y: 330, size: 230 },
    { x: 780, y: 1050, size: 150 },
  ];
  const pink = '#F08BB5';
  return (
    <AbsoluteFill>
      <Filters id={id} seed={boil % 8} outline={9} sticker={14} />
      <Footage style={{ filter: 'brightness(0.85) saturate(0.85)' }} />
      {hasSubject ? <Subject filter={`url(#${id}-boil)`} /> : null}
      {kinds.slice(0, 3).map((k, i) => (
        <Doodle key={k + i} d={SHAPES[k]} {...spots[i]} from={4 + i * 10} color={pink} boil={boil} />
      ))}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.78} />
    </AbsoluteFill>
  );
};
