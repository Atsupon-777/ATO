import React, { createContext, useContext } from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from 'remotion';
import { asset } from '../lib/assets';
import { fonts } from '../lib/fonts';
import { pop, progress } from '../lib/timing';
import type { BeatStyle, EffectSegment } from '../schemas';
import type { CaptionStyle, Grade } from './axes';

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
  /** This beat's picks on the style axes (src/effects/axes.ts). */
  style: BeatStyle;
  /** Where this beat sits in the whole reel, for accents such as the progress bar. */
  reelFrom: number;
  reelTotal: number;
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

/** Colour grades, applied to the footage and the person only, so UI and type keep their colours. */
export const GRADES: Record<Grade, { filter: string; overlay?: { background: string; blend: React.CSSProperties['mixBlendMode']; opacity: number } }> = {
  natural: { filter: '' },
  warm: { filter: 'sepia(0.18) saturate(1.15) hue-rotate(-6deg)' },
  cool: { filter: 'saturate(0.9) hue-rotate(10deg) brightness(1.03)' },
  mono: { filter: 'grayscale(1) contrast(1.18)' },
  film: { filter: 'contrast(1.08) saturate(0.85) sepia(0.14)', overlay: { background: '#2B1D0E', blend: 'lighten', opacity: 0.25 } },
  tealOrange: { filter: 'contrast(1.12) saturate(1.2)', overlay: { background: 'linear-gradient(180deg, #0E5E6F, #F28C38)', blend: 'soft-light', opacity: 0.55 } },
  pastel: { filter: 'saturate(0.75) brightness(1.08) contrast(0.92)', overlay: { background: '#FFD9EC', blend: 'soft-light', opacity: 0.5 } },
  punchy: { filter: 'contrast(1.22) saturate(1.35)' },
  faded: { filter: 'contrast(0.85) saturate(0.8) brightness(1.06)', overlay: { background: '#3A3A4A', blend: 'lighten', opacity: 0.35 } },
  neon: { filter: 'contrast(1.15) saturate(1.4) hue-rotate(-18deg)', overlay: { background: 'linear-gradient(135deg, #7A2BFF, #00D1FF)', blend: 'soft-light', opacity: 0.6 } },
  sepia: { filter: 'sepia(0.75) contrast(1.05)' },
  night: { filter: 'brightness(0.82) contrast(1.15) saturate(0.85) hue-rotate(14deg)', overlay: { background: '#0B1A3A', blend: 'soft-light', opacity: 0.6 } },
};

const GradeOverlay: React.FC = () => {
  const g = GRADES[useSource().style.grade ?? 'natural'];
  return g.overlay ? <AbsoluteFill style={{ background: g.overlay.background, mixBlendMode: g.overlay.blend, opacity: g.overlay.opacity }} /> : null;
};

/** The talking video (always muted: the template plays the segment's sound once, so copies never double it). */
export const Footage: React.FC<{ style?: React.CSSProperties; muted?: boolean }> = ({ style }) => {
  const s = useSource();
  const grade = GRADES[s.style.grade ?? 'natural'].filter;
  return (
    <AbsoluteFill style={style}>
      <OffthreadVideo src={asset(s.video)} trimBefore={s.trimBefore} muted style={{ ...cover(s.focusX), filter: grade || undefined }} />
      <GradeOverlay />
    </AbsoluteFill>
  );
};

/** The cut-out person, frame-aligned with Footage. `filter` lets effects add outlines or sticker borders. */
export const Subject: React.FC<{ style?: React.CSSProperties; filter?: string }> = ({ style, filter }) => {
  const s = useSource();
  if (!s.matte) return null;
  // An outline filter replaces the person with their outline, so grade and glow only apply to the plain cut-out.
  const plain = !filter;
  const glow = plain && s.style.accents?.includes('glow') ? `drop-shadow(0 0 28px ${s.accent}) drop-shadow(0 0 60px ${s.accent}88)` : '';
  const grade = plain ? GRADES[s.style.grade ?? 'natural'].filter : '';
  return (
    <AbsoluteFill style={style}>
      <OffthreadVideo
        src={asset(s.matte)}
        trimBefore={s.trimBefore}
        transparent
        muted
        style={{ ...cover(s.focusX), filter: [filter, grade, glow].filter(Boolean).join(' ') || undefined }}
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

const FONT_FAMILY = { display: fonts.display, sansJP: fonts.sansJP, serif: fonts.serif, mincho: fonts.minchoJP };
const LEGACY: Record<string, CaptionStyle> = { bold: 'pop', spaced: 'spaced', upper: 'upper' };
const EMOJI = ['🔥', '✨', '👀', '🚀', '💡', '🙌', '📈', '😳'];

/**
 * Spoken line, word by word, spread evenly over the segment. Words in `emphasis` turn accent-coloured and larger.
 * The look comes from the beat's caption style when one is set, otherwise from the effect's own `variant`.
 */
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
  const look: CaptionStyle = s.style.caption ?? LEGACY[variant];
  const family = s.style.font ? FONT_FAMILY[s.style.font] : look === 'script' ? fonts.serif : fonts.display;
  const words = text.split(/\s+/).filter(Boolean);
  const span = (over ?? (durationInFrames / fps) * 0.7) * fps;
  const step = span / Math.max(1, words.length);
  const em = emphasis.map((e) => e.toLowerCase());
  const accent = s.accent;
  const small = look === 'spaced';
  const upper = look === 'upper' || look === 'spaced' || look === 'box';
  const lastAt = Math.round((words.length - 1) * step);
  const underline = s.style.accents?.includes('underline');
  const emoji = s.style.accents?.includes('emoji') ? EMOJI[Math.abs(Math.round(s.trimBefore)) % EMOJI.length] : null;
  return (
    <div
      style={{
        position: 'absolute',
        top: y * 1920,
        left: 70,
        right: 70,
        display: 'flex',
        flexWrap: 'wrap',
        flexDirection: look === 'stack' ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        columnGap: small ? size * 0.9 : size * 0.26,
        rowGap: look === 'box' ? 12 : 0,
        transform: 'translateY(-50%)',
      }}
    >
      {words.map((w, i) => {
        const at = Math.round(i * step);
        if (frame < at) return null;
        const isEm = em.includes(w.toLowerCase().replace(/[.,!?、。！？]/g, ''));
        const p = progress(frame, at, at + 6);
        const sp = pop(frame, fps, at, look === 'bounce' ? 7 : 12);
        let sz = isEm ? size * 1.45 : size;
        if (small) sz = size * 0.42;
        if (look === 'stack') sz = isEm ? size * 1.9 : size * 0.95;
        const shown = look === 'typewriter' ? w.slice(0, Math.max(1, Math.floor((frame - at) / 1.5))) : w;
        const base: React.CSSProperties = {
          fontFamily: family,
          fontStyle: look === 'script' ? 'italic' : 'normal',
          fontWeight: look === 'script' ? 500 : 800,
          fontSize: look === 'script' ? sz * 1.25 : sz,
          letterSpacing: small ? '0.6em' : '-0.01em',
          textTransform: upper ? 'uppercase' : 'none',
          lineHeight: 1.05,
          color: isEm ? accent : '#fff',
          textShadow: '0 4px 24px rgba(0,0,0,0.45)',
          display: 'inline-block',
          position: 'relative',
          textAlign: 'center',
          flexBasis: isEm && i > 0 && look !== 'stack' && look !== 'box' ? '100%' : undefined,
        };
        const looks: Partial<Record<CaptionStyle, React.CSSProperties>> = {
          pop: { transform: `scale(${0.85 + 0.15 * sp})`, opacity: p },
          blur: { filter: `blur(${(1 - p) * 18}px)`, opacity: p, transform: `scale(${1.08 - 0.08 * p})` },
          spaced: { opacity: p, transform: `translateY(${(1 - p) * 14}px)` },
          upper: { transform: `scale(${0.8 + 0.2 * sp})`, opacity: p },
          script: { color: isEm ? accent : '#F2E3A0', textShadow: '0 0 28px rgba(242,227,160,0.55)', filter: `blur(${(1 - p) * 8}px)`, opacity: p },
          outline: { color: 'transparent', WebkitTextStroke: `${Math.max(2, sz * 0.035)}px ${isEm ? accent : '#fff'}`, textShadow: 'none', transform: `scale(${0.85 + 0.15 * sp})` },
          box: { background: isEm ? accent : '#111', color: isEm ? '#111' : '#fff', padding: '6px 18px', borderRadius: 10, textShadow: 'none', transform: `rotate(${(i % 2 ? 1.5 : -1.5)}deg) scale(${sp})` },
          highlighter: { color: '#fff', backgroundImage: isEm ? `linear-gradient(${accent}, ${accent})` : undefined, backgroundRepeat: 'no-repeat', backgroundPosition: '0 85%', backgroundSize: `${p * 100}% 45%`, padding: '0 8px', opacity: Math.min(1, p * 2) },
          typewriter: { fontFamily: s.style.font ? family : fonts.display, letterSpacing: '0.02em' },
          stack: { transform: `scale(${0.8 + 0.2 * sp})`, opacity: p },
          bounce: { transform: `translateY(${(1 - sp) * -120}px)`, opacity: Math.min(1, sp * 2) },
          neon: { color: '#fff', textShadow: `0 0 8px ${isEm ? accent : '#fff'}, 0 0 24px ${accent}, 0 0 48px ${accent}`, opacity: p * (0.7 + 0.3 * Math.abs(Math.sin((frame + i * 5) / 3))) },
        };
        return (
          <span key={i} style={{ ...base, ...looks[look] }}>
            {shown}
            {look === 'typewriter' && i === words.length - 1 && Math.floor(frame / 8) % 2 === 0 ? <span style={{ opacity: 0.8 }}>|</span> : null}
            {underline && isEm ? (
              <svg width="100%" height={sz * 0.3} viewBox="0 0 100 10" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: -sz * 0.18 }}>
                <path d="M2 6 C 30 2, 60 9, 98 4" stroke={accent} strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={110} strokeDashoffset={110 * (1 - progress(frame, at + 4, at + 14))} />
              </svg>
            ) : null}
          </span>
        );
      })}
      {emoji && frame >= lastAt ? (
        <span style={{ fontSize: size * 1.1, transform: `scale(${pop(frame, fps, lastAt + 2, 8)}) rotate(${Math.sin(frame / 5) * 10}deg)`, display: 'inline-block', marginLeft: 10 }}>{emoji}</span>
      ) : null}
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
