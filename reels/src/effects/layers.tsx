import React, { createContext, useContext } from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { asset } from '../lib/assets';
import { fonts } from '../lib/fonts';
import { pop, progress } from '../lib/timing';
import type { EffectSegment } from '../schemas';

/**
 * Every effect is built from the same few layers:
 *   Footage  – the talking video, cropped to 9:16
 *   Subject  – the same frames with only the person kept (transparent WebM from server/matte.ts)
 * Putting graphics between the two is what makes them sit "behind" the person.
 * Without a matte, Subject renders nothing and the graphics simply sit on top.
 */
export type Source = {
  video: string;
  matte?: string;
  focusX: number;
  /** First source frame of this segment. */
  trimBefore: number;
  accent: string;
  ink: string;
  paper: string;
};

export const SourceContext = createContext<Source | null>(null);

export const useSource = () => {
  const s = useContext(SourceContext);
  if (!s) throw new Error('Effect rendered outside <SourceContext>');
  return s;
};

export type EffectProps = { seg: EffectSegment };

const cover = (focusX: number): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  objectPosition: `${focusX * 100}% 50%`,
});

/** The talking video (always muted: the template plays the segment's sound once, so copies never double it). */
export const Footage: React.FC<{ style?: React.CSSProperties; muted?: boolean }> = ({ style }) => {
  const s = useSource();
  return (
    <AbsoluteFill style={style}>
      <OffthreadVideo src={asset(s.video)} trimBefore={s.trimBefore} muted style={cover(s.focusX)} />
    </AbsoluteFill>
  );
};

/** The cut-out person, frame-aligned with Footage. `filter` lets effects add outlines or sticker borders. */
export const Subject: React.FC<{ style?: React.CSSProperties; filter?: string }> = ({ style, filter }) => {
  const s = useSource();
  if (!s.matte) return null;
  return (
    <AbsoluteFill style={style}>
      <OffthreadVideo
        src={asset(s.matte)}
        trimBefore={s.trimBefore}
        transparent
        muted
        style={{ ...cover(s.focusX), filter }}
      />
    </AbsoluteFill>
  );
};

export const useHasSubject = () => Boolean(useSource().matte);

/** Footage, then `behind`, then the person on top: graphics that sit between the wall and the speaker. */
export const Sandwich: React.FC<{
  behind: React.ReactNode;
  footageStyle?: React.CSSProperties;
  subjectStyle?: React.CSSProperties;
}> = ({ behind, footageStyle, subjectStyle }) => (
  <AbsoluteFill>
    <Footage style={footageStyle} />
    {behind}
    <Subject style={{ ...footageStyle, ...subjectStyle }} />
  </AbsoluteFill>
);

/** Spoken line, word by word, spread evenly over the segment. Words in `emphasis` turn accent-coloured and larger. */
export const Caption: React.FC<{
  text?: string;
  emphasis?: string[];
  y?: number;
  size?: number;
  variant?: 'bold' | 'spaced' | 'upper';
  /** Seconds over which words appear; defaults to 70% of the segment. */
  over?: number;
}> = ({ text, emphasis = [], y = 0.62, size = 74, variant = 'bold', over }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = useSource();
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean);
  const span = (over ?? (durationInFrames / fps) * 0.7) * fps;
  const step = span / Math.max(1, words.length);
  const em = emphasis.map((e) => e.toLowerCase());
  return (
    <div
      style={{
        position: 'absolute',
        top: y * 1920,
        left: 70,
        right: 70,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        columnGap: variant === 'spaced' ? size * 0.9 : size * 0.26,
        transform: 'translateY(-50%)',
      }}
    >
      {words.map((w, i) => {
        const at = Math.round(i * step);
        if (frame < at) return null;
        const isEm = em.includes(w.toLowerCase().replace(/[.,!?]/g, ''));
        const p = progress(frame, at, at + 6);
        const sz = isEm ? size * 1.45 : size;
        return (
          <span
            key={i}
            style={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: variant === 'spaced' ? size * 0.42 : sz,
              letterSpacing: variant === 'spaced' ? '0.6em' : '-0.01em',
              textTransform: variant === 'bold' ? 'none' : 'uppercase',
              lineHeight: 1.05,
              color: isEm ? s.accent : '#fff',
              textShadow: '0 4px 24px rgba(0,0,0,0.45)',
              filter: `blur(${(1 - p) * (isEm ? 18 : 8)}px)`,
              opacity: p,
              transform: `scale(${0.85 + 0.15 * pop(frame, fps, at, 12)})`,
              display: 'inline-block',
              flexBasis: isEm && i > 0 ? '100%' : undefined,
              textAlign: 'center',
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Gold italic serif line with sparkles ("cool girl" accent from the orbit / zoom-through demos). */
export const ScriptLine: React.FC<{ kicker?: string; text: string; sub?: string; y: number; delay?: number }> = ({
  kicker,
  text,
  sub,
  y,
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, delay, 16);
  const twinkle = (o: number) => 0.4 + 0.6 * Math.abs(Math.sin((frame + o) / 6));
  return (
    <div style={{ position: 'absolute', top: y * 1920, width: '100%', textAlign: 'center', transform: 'translateY(-50%)' }}>
      {kicker ? (
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 44, color: '#fff', opacity: p, textShadow: '0 2px 16px rgba(0,0,0,0.5)' }}>
          {kicker}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: fonts.serif,
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 150,
          lineHeight: 1,
          color: '#F2E3A0',
          textShadow: '0 0 30px rgba(242,227,160,0.55)',
          opacity: p,
          filter: `blur(${(1 - p) * 10}px)`,
          display: 'inline-block',
          position: 'relative',
        }}
      >
        <Sparkle style={{ left: -70, top: 50, opacity: twinkle(0) * p }} />
        {text}
        <Sparkle style={{ right: -60, bottom: 10, opacity: twinkle(7) * p }} />
      </div>
      {sub ? (
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 40, color: '#fff', opacity: progress(frame, delay + 10, delay + 22) }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
};

const Sparkle: React.FC<{ style: React.CSSProperties }> = ({ style }) => (
  <svg width="44" height="44" viewBox="0 0 24 24" style={{ position: 'absolute', ...style }}>
    <path d="M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z" fill="#F7EBB5" />
  </svg>
);

/** A soft vignette that darkens the edges. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.6 }) => (
  <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(0,0,0,${strength}) 100%)` }} />
);

/** Deterministic pseudo-random in [0,1) for layouts that must look random but render the same every time. */
export const rand = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
