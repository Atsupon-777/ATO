import React from 'react';
import type { ExperienceFilmProps } from '../schemas';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { Dust, Grain, LightLeak, Vignette } from '../components/Film';
import { GRADES, OVERLAP, Shot, Whisper, hexToRgb, isVideo } from './ProductFilm';

/**
 * A wordless short film for an experience, cut like the product films: hook → arriving at the place → the activity
 * in motion → its sensory details → the peak moment, dissolving into each other under a music bed, one quiet line
 * of copy per shot. The last shot keeps playing, slower and darker, under the end card: the place, the name, one
 * line, a few chips (duration, price) and the booking line, drawn in after a hand-drawn route line.
 */

const END_SECONDS = 4.8;

type Timeline = { starts: number[]; end: number; total: number };
export const experienceTimeline = (p: Pick<ExperienceFilmProps, 'shots'>, fps: number): Timeline => {
  const starts: number[] = [];
  let t = 0;
  for (const s of p.shots) {
    starts.push(t);
    t += Math.round(s.seconds * fps) - OVERLAP;
  }
  return { starts, end: t, total: t + Math.round(END_SECONDS * fps) };
};

export const experienceFilmDuration = (p: Pick<ExperienceFilmProps, 'shots'>, fps: number) => experienceTimeline(p, fps).total;

export const typeFont = (t: ExperienceFilmProps['type']) => (t === 'serif' ? fonts.serif : t === 'sans' ? fonts.sansJP : fonts.minchoJP);

export const ExperienceFilm: React.FC<ExperienceFilmProps> = (p) => {
  useFonts(p);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { starts, end } = experienceTimeline(p, fps);
  const grade = GRADES[p.grade];
  const font = typeFont(p.type);
  const leak = Math.max(0, ...starts.slice(1).map((s) => interpolate(frame, [s, s + OVERLAP / 2, s + OVERLAP], [0, 0.45, 0], clamp)));
  const frames = (i: number) => Math.round(p.shots[i].seconds * fps);
  return (
    <AbsoluteFill style={{ background: p.palette.base, ...cjkVars(p.lang) }}>
      {p.shots.map((s, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={frames(i)}>
          <Shot shot={s} index={i} first={i === 0} grade={grade} />
        </Sequence>
      ))}
      <Sequence from={end - OVERLAP}>
        <EndBackdrop {...p} />
      </Sequence>
      <LightLeak t={leak} color={hexToRgb(p.palette.glow)} />
      {p.shots.map((s, i) => {
        // the first shot names the place, so the viewer knows where they are before anything else
        const kicker = i === 0 && !s.kicker ? p.place : s.kicker;
        return s.line || kicker ? (
          <Sequence key={`l${i}`} from={starts[i] + (i === 0 ? 0 : OVERLAP / 2)} durationInFrames={frames(i) - (i === 0 ? OVERLAP / 2 : OVERLAP)}>
            <Whisper line={s.line} kicker={kicker} vertical={p.vertical} accent={p.palette.accent} lead={i === 0} font={font} />
          </Sequence>
        ) : null;
      })}
      <Sequence from={end}>
        <EndCard {...p} />
      </Sequence>
      <Grain opacity={0.07} />
      <Vignette strength={0.45} />
      {p.music ? (
        <Audio src={asset(p.music)} volume={(f) => p.musicVolume * interpolate(f, [0, 12, durationInFrames - 45, durationInFrames - 2], [0, 1, 1, 0], clamp)} />
      ) : null}
      <Sequence from={end + 14}>
        <Audio src={staticFile('sfx/chime.wav')} volume={0.22} />
      </Sequence>
    </AbsoluteFill>
  );
};

/** The last shot carries on under the end card: slower, softer and darker, so the place stays on screen. */
const EndBackdrop: React.FC<ExperienceFilmProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const last = p.shots[p.shots.length - 1];
  const grade = GRADES[p.grade];
  const fadeIn = interpolate(frame, [0, OVERLAP], [0, 1], { ...clamp, easing: easeInOut });
  const dim = interpolate(frame, [OVERLAP, OVERLAP + 30], [0, 1], { ...clamp, easing: easeInOut });
  const src = asset(last.src);
  const media: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', objectPosition: `50% ${last.focusY * 100}%` };
  // pick up where the shot left off (its own seconds at its own rate), then play slower
  const from = Math.round((last.trimStart + last.seconds * last.rate - (OVERLAP / fps) * last.rate) * fps);
  // and from the framing it had then (Shot's push-in and drift), still pushing in slowly
  const len = Math.round(last.seconds * fps);
  const t = (len - OVERLAP) / len;
  const scale = 1.04 + (last.kind === 'hero' ? 0.06 : 0.1) * t + frame * 0.0005;
  const driftX = ((p.shots.length - 1) % 2 ? 1 : -1) * 18 * (t - 0.5);
  return (
    <AbsoluteFill style={{ opacity: fadeIn, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translateX(${driftX}px) scale(${scale})`, filter: `${grade.filter} blur(${dim * 3}px)` }}>
        {isVideo(last.src) ? (
          <OffthreadVideo src={src} startFrom={Math.max(0, from)} playbackRate={Math.max(0.25, last.rate * 0.6)} muted style={media} />
        ) : (
          <Img src={src} style={media} />
        )}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: grade.tint, mixBlendMode: 'soft-light' }} />
      <AbsoluteFill
        style={{
          opacity: dim,
          background: `linear-gradient(180deg, ${p.palette.base}33 0%, ${p.palette.base}66 34%, ${p.palette.base}e6 62%, ${p.palette.base}f5 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Place, name and copy settle in after a route line draws itself across; then chips, the call to action and the booking line. */
const EndCard: React.FC<ExperienceFilmProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const font = typeFont(p.type);
  const accent = p.palette.accent;
  const textIn = (d: number) => progress(frame, d, d + 22, easeOutExpo);
  const route = progress(frame, 6, 40, easeInOut);
  const cta = pop(frame, fps, 50, 16);
  const shadow = '0 2px 24px rgba(0,0,0,0.45)';
  // one line across the card: the size follows the length (Latin titles are narrower per character)
  const titleSize = Math.max(52, Math.min(84, Math.floor((p.vertical ? 920 : 1500) / Math.max(1, Array.from(p.title).length) / 1.1)));
  // a meandering route, drawn left to right, with a pin dropping at its end
  const path = 'M 150 820 C 260 700, 360 900, 470 790 S 690 660, 760 760 S 880 860, 930 720';
  const pin = progress(frame, 34, 52, easeOutExpo);
  return (
    <AbsoluteFill>
      <Dust count={18} color={hexToRgb(p.palette.glow)} seed="exp-end" />
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="exp-route">
            <path d={path} fill="none" stroke="#fff" strokeWidth={30} strokeLinecap="round" pathLength={1} strokeDasharray={`${route} 2`} />
          </mask>
        </defs>
        <g mask="url(#exp-route)">
          <path d={path} fill="none" stroke={accent} strokeOpacity={0.9} strokeWidth={5} strokeLinecap="round" strokeDasharray="1 16" />
          <path d={path} fill="none" stroke={accent} strokeOpacity={0.18} strokeWidth={16} strokeLinecap="round" />
        </g>
        <circle cx={150} cy={820} r={9 * textIn(4)} fill={accent} />
        <g transform={`translate(930 ${720 - (1 - pin) * 40})`} opacity={pin}>
          <circle r={18} fill="none" stroke={accent} strokeWidth={3} opacity={0.6 * (1 - ((frame / 40) % 1))} transform={`scale(${1 + ((frame / 40) % 1) * 1.6})`} />
          <circle r={11} fill={accent} />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 70, right: 70, top: 930, textAlign: 'center', textShadow: shadow }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: textIn(18) }}>
          <div style={{ height: 1, width: 64 * textIn(18), background: accent }} />
          <div style={{ fontFamily: fonts.serif, fontSize: 30, letterSpacing: '0.4em', color: accent, textTransform: 'uppercase' }}>{p.place}</div>
          <div style={{ height: 1, width: 64 * textIn(18), background: accent }} />
        </div>
        <div
          style={{
            fontFamily: font,
            fontWeight: p.type === 'sans' ? 700 : p.type === 'serif' ? 600 : 800,
            fontSize: titleSize,
            lineHeight: 1.18,
            letterSpacing: p.type === 'serif' ? '0.02em' : '0.1em',
            color: p.palette.ink,
            marginTop: 30,
            opacity: textIn(24),
            filter: `blur(${(1 - textIn(24)) * 10}px)`,
            transform: `translateY(${(1 - textIn(24)) * 18}px)`,
          }}
        >
          {p.title}
        </div>
        {p.tagline ? (
          <div style={{ fontFamily: font, fontWeight: 500, fontSize: 40, lineHeight: 1.45, letterSpacing: '0.08em', color: p.palette.ink, opacity: 0.85 * textIn(32), marginTop: 24 }}>
            {p.tagline}
          </div>
        ) : null}
        {p.chips.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 40 }}>
            {p.chips.map((c, i) => {
              const k = textIn(38 + i * 4);
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: fonts.sansJP,
                    fontWeight: 500,
                    fontSize: 30,
                    letterSpacing: '0.06em',
                    color: p.palette.ink,
                    border: `1.5px solid ${accent}aa`,
                    background: `${p.palette.base}55`,
                    borderRadius: 999,
                    padding: '12px 30px',
                    opacity: k,
                    transform: `translateY(${(1 - k) * 14}px)`,
                    textShadow: 'none',
                  }}
                >
                  {c}
                </div>
              );
            })}
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 48 }}>
          <div
            style={{
              fontFamily: fonts.sansJP,
              fontWeight: 700,
              fontSize: 36,
              letterSpacing: '0.1em',
              color: p.palette.base,
              background: accent,
              padding: '22px 60px',
              borderRadius: 999,
              transform: `scale(${cta})`,
              opacity: Math.min(1, cta * 1.4),
              boxShadow: `0 0 ${40 * cta}px ${accent}66`,
              textShadow: 'none',
            }}
          >
            {p.cta}
          </div>
        </div>
        {p.url ? (
          <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 34, color: p.palette.ink, opacity: 0.9 * textIn(58), marginTop: 30, letterSpacing: '0.04em' }}>
            {p.url}
          </div>
        ) : null}
        <div style={{ fontFamily: fonts.serif, fontSize: 28, letterSpacing: '0.36em', textTransform: 'uppercase', color: p.palette.ink, opacity: 0.6 * textIn(62), marginTop: 26 }}>
          {p.brand}
          {p.handle ? <span style={{ letterSpacing: '0.06em', textTransform: 'none', fontFamily: fonts.display }}>{`  ${p.handle}`}</span> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
