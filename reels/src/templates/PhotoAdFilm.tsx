import React from 'react';
import type { PhotoAdProps } from '../schemas';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { clamp, easeInOut, easeOutExpo, progress } from '../lib/timing';
import { Grain } from '../components/Film';

/**
 * A product ad made from one photo: the product's substance moving for real (a pour, a macro), a matched cut from
 * falling liquid onto skin, a person using it, and the pack shot, which keeps playing under a small end card.
 * Shots play as filmed: no push-ins or zooms, hard cuts on motion and short dissolves only where time passes.
 * Type is small and quiet, in the colour that reads on the film (props.ink).
 */

/** Frames a dissolve takes. Cuts take none. */
const DISSOLVE = 10;
/** The end card starts this many seconds into the last shot. */
const END_AT = 1.4;

export const photoAdTimeline = (p: Pick<PhotoAdProps, 'shots'>, fps: number) => {
  const starts: number[] = [];
  let t = 0;
  p.shots.forEach((s, i) => {
    if (i > 0 && s.enter === 'dissolve') t -= DISSOLVE;
    starts.push(t);
    t += Math.round(s.seconds * fps);
  });
  return { starts, total: t };
};
export const photoAdDuration = (p: Pick<PhotoAdProps, 'shots'>, fps: number) => photoAdTimeline(p, fps).total;

const light = (hex: string) => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
};

export const PhotoAdFilm: React.FC<PhotoAdProps> = (p) => {
  useFonts(p);
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { starts } = photoAdTimeline(p, fps);
  const last = p.shots.length - 1;
  const font = p.serif ? fonts.serif : fonts.minchoJP;
  return (
    <AbsoluteFill style={{ background: '#000', ...cjkVars(p.lang) }}>
      {p.shots.map((s, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={Math.round(s.seconds * fps)}>
          <Clip shot={s} fade={i > 0 && s.enter === 'dissolve'} sfx={p.sfxVolume} />
        </Sequence>
      ))}
      {p.shots.map((s, i) =>
        i < last && (s.line || s.kicker) ? (
          <Sequence key={`t${i}`} from={starts[i] + 4} durationInFrames={Math.round(s.seconds * fps) - 8}>
            <Line line={s.line} kicker={s.kicker} ink={p.ink} font={font} top={s.place === 'top'} />
          </Sequence>
        ) : null,
      )}
      <Sequence from={starts[last] + Math.round(END_AT * fps)}>
        <EndCard {...p} font={font} />
      </Sequence>
      <Grain opacity={0.05} />
      {p.music ? (
        <Audio
          src={asset(p.music)}
          volume={(f) => p.musicVolume * interpolate(f, [0, 8, durationInFrames - 36, durationInFrames - 1], [0, 1, 1, 0], clamp)}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const Clip: React.FC<{
  shot: PhotoAdProps['shots'][number];
  fade: boolean;
  sfx: number;
}> = ({ shot, fade, sfx }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const opacity = fade ? interpolate(frame, [0, DISSOLVE], [0, 1], { ...clamp, easing: easeInOut }) : 1;
  return (
    <AbsoluteFill style={{ opacity }}>
      {!/\.(mp4|webm|mov|m4v)(\?|$)/i.test(shot.src) ? (
        <Img src={asset(shot.src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <OffthreadVideo
          src={asset(shot.src)}
          startFrom={Math.round(shot.trimStart * fps)}
          playbackRate={shot.rate}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          volume={(f) => sfx * interpolate(f, [0, 4, durationInFrames - 6, durationInFrames], [0, 1, 1, 0], clamp)}
        />
      )}
    </AbsoluteFill>
  );
};

/** A tiny kicker and one short line in the calmer band (lower third or top), rising softly in and fading out. */
const Line: React.FC<{
  line: string;
  kicker: string;
  ink: string;
  font: string;
  top: boolean;
}> = ({ line, kicker, ink, font, top }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const k = progress(frame, 0, 18, easeOutExpo);
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [0, 1], { ...clamp, easing: easeInOut });
  const veil = light(ink) ? 'rgba(0,0,0,0.28)' : 'rgba(255,250,244,0.38)';
  const shadow = light(ink) ? '0 1px 14px rgba(0,0,0,0.35)' : '0 1px 14px rgba(255,255,255,0.45)';
  return (
    <AbsoluteFill style={{ opacity: k * (1 - out) }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${top ? 180 : 0}deg, ${veil} 0%, rgba(0,0,0,0) 30%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          ...(top ? { top: 250 } : { bottom: 300 }),
          textAlign: 'center',
          color: ink,
          textShadow: shadow,
          transform: `translateY(${(1 - k) * 12}px)`,
        }}
      >
        {kicker ? (
          <div
            style={{
              fontFamily: fonts.serif,
              fontSize: 24,
              letterSpacing: '0.42em',
              textTransform: 'uppercase',
              opacity: 0.85,
              marginBottom: 18,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {line ? (
          <div
            style={{
              fontFamily: font,
              fontWeight: 500,
              fontSize: 46,
              letterSpacing: '0.16em',
              filter: `blur(${(1 - k) * 6}px)`,
            }}
          >
            {line}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

/** Over the pack shot: the brand set wide and thin, the product name, one line, then a quiet call to action. */
const EndCard: React.FC<PhotoAdProps & { font: string }> = (p) => {
  const frame = useCurrentFrame();
  const textIn = (d: number) => progress(frame, d, d + 24, easeOutExpo);
  const shadow = light(p.ink) ? '0 1px 18px rgba(0,0,0,0.35)' : '0 1px 18px rgba(255,255,255,0.5)';
  const veil = light(p.ink) ? 'rgba(0,0,0,0.25)' : 'rgba(255,250,244,0.35)';
  const showName = p.name && p.name.toLowerCase() !== p.brand.toLowerCase();
  return (
    <AbsoluteFill style={{ color: p.ink, textShadow: shadow }}>
      <AbsoluteFill
        style={{
          opacity: textIn(0),
          background: `linear-gradient(180deg, ${veil} 0%, rgba(0,0,0,0) 42%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          top: 250,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: fonts.serif,
            fontWeight: 500,
            fontSize: 76,
            letterSpacing: '0.42em',
            paddingLeft: '0.42em',
            textTransform: 'uppercase',
            opacity: textIn(0),
            filter: `blur(${(1 - textIn(0)) * 8}px)`,
          }}
        >
          {p.brand}
        </div>
        <div
          style={{
            margin: '26px auto 0',
            height: 1,
            width: 180 * textIn(8),
            background: p.accent ?? p.ink,
            opacity: p.accent ? 0.9 : 0.6,
          }}
        />
        {showName ? (
          <div
            style={{
              fontFamily: p.font,
              fontWeight: 500,
              fontSize: 34,
              letterSpacing: '0.2em',
              marginTop: 26,
              opacity: textIn(10),
            }}
          >
            {p.name}
          </div>
        ) : null}
        {p.tagline ? (
          <div
            style={{
              fontFamily: p.font,
              fontWeight: 500,
              fontSize: 40,
              letterSpacing: '0.14em',
              marginTop: 28,
              opacity: 0.92 * textIn(16),
            }}
          >
            {p.tagline}
          </div>
        ) : null}
      </div>
      {/* the call to action sits at the foot of the frame, under the product, wherever the bottle stands */}
      <AbsoluteFill style={{ opacity: textIn(30), background: `linear-gradient(0deg, ${veil} 0%, rgba(0,0,0,0) 18%)` }} />
      <div
        style={{
          position: 'absolute',
          left: 60,
          right: 60,
          bottom: 120,
          textAlign: 'center',
          opacity: textIn(30),
        }}
      >
        {p.cta ? (
          <div
            style={{
              fontFamily: fonts.sansJP,
              fontWeight: 400,
              fontSize: 28,
              letterSpacing: '0.24em',
              display: 'inline-block',
              paddingBottom: 10,
              borderBottom: p.accent ? `2px solid ${p.accent}` : `1px solid ${p.ink}99`,
            }}
          >
            {p.cta}
          </div>
        ) : null}
        {p.handle ? (
          <div
            style={{
              fontFamily: fonts.display,
              fontSize: 24,
              letterSpacing: '0.08em',
              marginTop: 20,
              opacity: 0.75,
            }}
          >
            {p.handle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
