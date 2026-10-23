import React from 'react';
import type { FilmShot, ProductFilmProps } from '../schemas';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { Dust, Grain, LightLeak, Vignette } from '../components/Film';
import { Reflection, ShinyProduct } from '../components/Shine';

/**
 * A short product film instead of a slideshow: several AI shots (sensory hook → craft → mood → the product →
 * a person's moment) dissolve into each other under a music bed and the shots' own sound, with one quiet line
 * of copy per shot, then an end card where the product rises out of an ink stroke.
 */

/** Frames two neighbouring shots overlap while they dissolve. */
export const OVERLAP = 14;
const END_SECONDS = 4;

const shotFrames = (s: FilmShot, fps: number) => Math.round(s.seconds * fps);

/** Start frame of every shot, then the end card. */
export const filmTimeline = (p: Pick<ProductFilmProps, 'shots'>, fps: number) => {
  const starts: number[] = [];
  let t = 0;
  for (const s of p.shots) {
    starts.push(t);
    t += shotFrames(s, fps) - OVERLAP;
  }
  return { starts, end: t, total: t + Math.round(END_SECONDS * fps) };
};

export const productFilmDuration = (p: Pick<ProductFilmProps, 'shots'>, fps: number) => filmTimeline(p, fps).total;

export const isVideo = (src: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(src);

export const GRADES: Record<ProductFilmProps['grade'], { filter: string; tint: string }> = {
  warm: {
    filter: 'contrast(1.07) saturate(1.04) sepia(0.12)',
    tint: 'linear-gradient(180deg, rgba(255,196,120,0.10), rgba(40,20,0,0.18))',
  },
  cool: {
    filter: 'contrast(1.08) saturate(0.9) hue-rotate(-6deg)',
    tint: 'linear-gradient(180deg, rgba(160,200,255,0.08), rgba(0,10,30,0.22))',
  },
  neutral: { filter: 'contrast(1.05)', tint: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(0,0,0,0.15))' },
  verdant: {
    filter: 'contrast(1.09) saturate(1.1) sepia(0.06)',
    tint: 'linear-gradient(180deg, rgba(255,226,160,0.10), rgba(0,30,12,0.24))',
  },
  noir: { filter: 'contrast(1.16) saturate(0.55)', tint: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.3))' },
};

export const ProductFilm: React.FC<ProductFilmProps> = (p) => {
  useFonts(p);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { starts, end } = filmTimeline(p, fps);
  const grade = GRADES[p.grade];
  const glowRgb = hexToRgb(p.palette.glow);
  // a warm bloom rides each dissolve so the cut feels like light, not an edit
  const leak = Math.max(0, ...starts.slice(1).map((s) => interpolate(frame, [s, s + OVERLAP / 2, s + OVERLAP], [0, 0.55, 0], clamp)));

  return (
    <AbsoluteFill style={{ background: p.palette.base, ...cjkVars(p.lang) }}>
      {p.shots.map((s, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={shotFrames(s, fps)}>
          <Shot shot={s} index={i} first={i === 0} grade={grade} />
        </Sequence>
      ))}
      <LightLeak t={leak} color={glowRgb} />
      {p.shots.map((s, i) =>
        s.line || s.kicker ? (
          <Sequence key={`l${i}`} from={starts[i] + (i === 0 ? 0 : OVERLAP / 2)} durationInFrames={shotFrames(s, fps) - (i === 0 ? OVERLAP / 2 : OVERLAP)}>
            <Whisper line={s.line} kicker={s.kicker} vertical={p.vertical} accent={p.palette.accent} lead={i === 0} />
          </Sequence>
        ) : null,
      )}
      <Sequence from={end}>
        <EndCard {...p} />
      </Sequence>
      <Grain opacity={0.07} />
      <Vignette strength={0.5} />
      {p.music ? (
        <Audio
          src={asset(p.music)}
          volume={(f) =>
            p.musicVolume *
            interpolate(f, [0, 12, durationInFrames - 40, durationInFrames - 2], [0, 1, 1, 0], clamp)
          }
        />
      ) : null}
      <Sequence from={end + 10}>
        <Audio src={staticFile('sfx/chime.wav')} volume={0.35} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const Shot: React.FC<{ shot: FilmShot; index: number; first: boolean; grade: { filter: string; tint: string } }> = ({
  shot,
  index,
  first,
  grade,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const len = shotFrames(shot, fps);
  const fadeIn = first ? 1 : interpolate(frame, [0, OVERLAP], [0, 1], { ...clamp, easing: easeInOut });
  const t = frame / len;
  // every shot keeps breathing: a slow push-in with a little drift, the product shot slowest
  const push = shot.kind === 'hero' ? 0.06 : 0.1;
  const scale = 1.04 + push * t + (first ? 0.08 * (1 - progress(frame, 0, 24, easeOutExpo)) : 0);
  const driftX = (index % 2 ? 1 : -1) * 18 * (t - 0.5);
  const src = asset(shot.src);
  const media: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `50% ${shot.focusY * 100}%`,
  };
  return (
    <AbsoluteFill style={{ opacity: fadeIn, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translateX(${driftX}px) scale(${scale})`, filter: grade.filter }}>
        {isVideo(shot.src) ? (
          <OffthreadVideo
            src={src}
            startFrom={Math.round(shot.trimStart * fps)}
            playbackRate={shot.rate}
            style={media}
            volume={(f) => shot.audio * interpolate(f, [0, OVERLAP, len - OVERLAP, len], [0, 1, 1, 0], clamp)}
          />
        ) : (
          <Img src={src} style={media} />
        )}
      </AbsoluteFill>
      {!isVideo(shot.src) && shot.kind === 'hero' ? (
        // a still hero gets a slow band of light across it, like a spotlight passing over a glossy surface
        <AbsoluteFill
          style={{
            mixBlendMode: 'soft-light',
            background: `linear-gradient(115deg, rgba(255,255,255,0) ${t * 140 - 40}%, rgba(255,236,200,0.75) ${t * 140 - 20}%, rgba(255,255,255,0) ${t * 140}%)`,
          }}
        />
      ) : null}
      <AbsoluteFill style={{ background: grade.tint, mixBlendMode: 'soft-light' }} />
    </AbsoluteFill>
  );
};

/** Splits copy into phrases at Japanese / Chinese commas and stops, keeping the punctuation. */
const phrases = (line: string) =>
  line
    .split(/(?<=[、。，．！？!?])/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * One quiet line of copy: characters surface one by one out of a soft blur, hold, then dissolve upward.
 * Vertical (tategaki) for Japanese / Chinese on the right edge, otherwise a centred lower third.
 */
export const Whisper: React.FC<{ line: string; kicker: string; vertical: boolean; accent: string; lead: boolean; font?: string }> = ({
  line,
  kicker,
  vertical,
  accent,
  lead,
  font = fonts.minchoJP,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const out = interpolate(frame, [durationInFrames - 14, durationInFrames - 2], [0, 1], { ...clamp, easing: easeInOut });
  const begin = lead ? 4 : 6;
  const step = vertical ? 2.6 : 1.6;
  let n = 0;
  const char = (c: string, key: string) => {
    const d = begin + n++ * step;
    const k = progress(frame, d, d + 16, easeOutExpo);
    return (
      <span
        key={key}
        style={{
          display: 'inline-block',
          opacity: k * (1 - out),
          filter: `blur(${(1 - k) * 10 + out * 8}px)`,
          transform: vertical ? `translateY(${(1 - k) * -14 - out * 20}px)` : `translateY(${(1 - k) * 16 - out * 14}px)`,
        }}
      >
        {c === ' ' ? ' ' : c}
      </span>
    );
  };
  const kickerK = progress(frame, 2, 22, easeOutExpo) * (1 - out);
  const shadow = '0 2px 24px rgba(0,0,0,0.55), 0 0 2px rgba(0,0,0,0.4)';

  if (vertical) {
    const cols = phrases(line);
    return (
      <AbsoluteFill>
        <AbsoluteFill
          style={{
            opacity: (1 - out) * 0.9,
            background: 'linear-gradient(270deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 38%)',
          }}
        />
        <div style={{ position: 'absolute', right: 96, top: 250, display: 'flex', flexDirection: 'row-reverse', gap: 26, alignItems: 'flex-start' }}>
          {kicker ? (
            <div
              style={{
                writingMode: 'vertical-rl',
                fontFamily: fonts.serif,
                fontSize: 26,
                letterSpacing: '0.42em',
                color: accent,
                opacity: kickerK,
                textTransform: 'uppercase',
                paddingTop: 6,
                textShadow: shadow,
              }}
            >
              {kicker}
            </div>
          ) : null}
          {kicker ? <div style={{ width: 1, height: 220 * kickerK, background: accent, opacity: 0.7 * kickerK, marginTop: 8 }} /> : null}
          {cols.map((col, ci) => (
            <div
              key={ci}
              style={{
                writingMode: 'vertical-rl',
                fontFamily: font,
                fontWeight: 500,
                fontSize: lead ? 86 : 76,
                lineHeight: 1,
                letterSpacing: '0.2em',
                color: '#fbf8f1',
                textShadow: shadow,
                marginTop: ci * 90,
              }}
            >
              {Array.from(col).map((c, i) => char(c, `${ci}-${i}`))}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: (1 - out) * 0.9, background: 'linear-gradient(0deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 36%)' }} />
      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 380, textAlign: 'center' }}>
        {kicker ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, marginBottom: 26, opacity: kickerK }}>
            <div style={{ height: 1, width: 70 * kickerK, background: accent }} />
            <div style={{ fontFamily: fonts.serif, fontSize: 28, letterSpacing: '0.38em', color: accent, textTransform: 'uppercase', textShadow: shadow }}>
              {kicker}
            </div>
            <div style={{ height: 1, width: 70 * kickerK, background: accent }} />
          </div>
        ) : null}
        <div
          style={{
            fontFamily: font,
            fontWeight: 500,
            fontSize: lead ? 70 : 62,
            lineHeight: 1.35,
            letterSpacing: '0.04em',
            color: '#fbf8f1',
            textShadow: shadow,
          }}
        >
          {line.split(' ').map((w, wi, all) => (
            <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
              {Array.from(w + (wi < all.length - 1 ? ' ' : '')).map((c, i) => char(c, `${wi}-${i}`))}
            </span>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The product rises out of a hand-drawn ink stroke; name, tagline and call to action settle under it. */
const EndCard: React.FC<ProductFilmProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = interpolate(frame, [0, OVERLAP], [0, 1], { ...clamp, easing: easeInOut });
  const ink = progress(frame, 4, 30, easeInOut);
  const rise = progress(frame, 8, 40, easeOutExpo);
  const sweep = interpolate(frame, [26, 58], [-1.1, 1.1], { ...clamp, easing: easeInOut });
  const h = 800;
  // tall products fill the height, wide ones (a plate, a pair of shoes) the width
  const w = Math.min(p.cutoutAspect > 1.4 ? 960 : 820, h * p.cutoutAspect);
  const ph = w / p.cutoutAspect;
  const textIn = (d: number) => progress(frame, d, d + 22, easeOutExpo);
  const cta = pop(frame, fps, 52, 16);
  const accent = p.palette.accent;
  return (
    <AbsoluteFill style={{ opacity: fadeIn, background: p.palette.base, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% 45% at 50% 40%, ${p.palette.glow}44 0%, ${p.palette.base}00 70%)`,
        }}
      />
      <Dust count={26} color={hexToRgb(p.palette.glow)} seed="film-end" />
      {/* ink stroke: a dry brush drawn on behind the product, built from bristle lines that run out at different points */}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="brush" x="-10%" y="-40%" width="120%" height="180%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves={2} seed={7} />
            <feDisplacementMap in="SourceGraphic" scale={12} />
          </filter>
        </defs>
        <g filter="url(#brush)">
          {BRISTLES.map((b, i) => (
            <path
              key={i}
              d={`M 90 ${960 + b.off} C 330 ${790 + b.off}, 620 ${1020 + b.off}, 990 ${690 + b.off}`}
              fill="none"
              stroke={accent}
              strokeOpacity={b.o}
              strokeWidth={b.w}
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${b.len} 2`}
              strokeDashoffset={b.len * (1 - Math.min(1, Math.max(0, (ink - b.delay) / (1 - b.delay))))}
            />
          ))}
        </g>
      </svg>
      <div
        style={{
          position: 'absolute',
          left: (1080 - w) / 2,
          top: 860 - ph / 2 + (1 - rise) * 90,
          opacity: rise,
          filter: `blur(${(1 - rise) * 16}px) drop-shadow(0 40px 50px rgba(0,0,0,0.5))`,
          transform: `scale(${0.94 + 0.06 * rise + frame * 0.0004})`,
        }}
      >
        <ShinyProduct src={asset(p.cutout)} width={w} height={ph} sweep={sweep} sweepOpacity={0.7} />
        <Reflection src={asset(p.cutout)} width={w} height={ph} opacity={0.18} />
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 1340, textAlign: 'center' }}>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: 30,
            letterSpacing: '0.5em',
            color: accent,
            textTransform: 'uppercase',
            opacity: textIn(30),
            transform: `translateY(${(1 - textIn(30)) * 20}px)`,
          }}
        >
          {p.brand}
        </div>
        <div
          style={{
            fontFamily: fonts.minchoJP,
            fontWeight: 800,
            fontSize: 88,
            letterSpacing: '0.12em',
            color: p.palette.ink,
            marginTop: 18,
            opacity: textIn(36),
            filter: `blur(${(1 - textIn(36)) * 10}px)`,
          }}
        >
          {p.productName}
        </div>
        <div
          style={{
            fontFamily: fonts.minchoJP,
            fontWeight: 500,
            fontSize: 40,
            letterSpacing: '0.14em',
            color: p.palette.ink,
            opacity: 0.82 * textIn(44),
            marginTop: 22,
          }}
        >
          {p.tagline}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 46 }}>
          <div
            style={{
              fontFamily: fonts.sansJP,
              fontWeight: 700,
              fontSize: 34,
              letterSpacing: '0.1em',
              color: p.palette.base,
              background: accent,
              padding: '20px 54px',
              borderRadius: 999,
              transform: `scale(${cta})`,
              opacity: Math.min(1, cta * 1.4),
              boxShadow: `0 0 ${40 * cta}px ${accent}66`,
            }}
          >
            {p.cta}
          </div>
        </div>
        {p.handle ? (
          <div style={{ fontFamily: fonts.display, fontSize: 30, color: p.palette.ink, opacity: 0.6 * textIn(60), marginTop: 30, letterSpacing: '0.06em' }}>
            {p.handle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** Bristles of the end-card brush stroke: dense in the middle, thin and broken at the edges. */
const BRISTLES = new Array(26).fill(0).map((_, i) => {
  const u = i / 25 - 0.5;
  const edge = Math.abs(u) * 2;
  return {
    off: u * 170 + random(`bo${i}`) * 8,
    w: 6 + (1 - edge) * 14 * random(`bw${i}`) + 4,
    o: (0.25 + 0.5 * (1 - edge)) * (0.6 + 0.4 * random(`bp${i}`)),
    len: 1 - edge * 0.45 * random(`bl${i}`),
    delay: 0.12 * random(`bd${i}`),
  };
});

export const hexToRgb = (hex: string) => {
  const m = hex.replace('#', '');
  const v = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6);
  const n = parseInt(v, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
};
