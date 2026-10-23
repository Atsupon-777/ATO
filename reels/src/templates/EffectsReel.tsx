import React from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import type { EffectsReelProps } from '../schemas';
import { effectIds } from '../schemas';
import { alphaVideoOk, asset, usePreviewMode } from '../lib/assets';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { effects } from '../effects';
import { SourceContext } from '../effects/layers';
import { AccentOverlays, CameraMotion, TextureOverlay, TransitionIn } from '../effects/modifiers';
import { Overlays } from '../effects/overlays';
import { layoutBody } from '../effects/Cutaways';
import { UNFRAMED_SCENES } from '../effects/shots';

/** Segments play back to back; each one is a slice of the source with one effect on it. */
export const effectsReelDuration = (p: EffectsReelProps, fps: number) =>
  Math.max(1, p.segments.reduce((sum, s) => sum + Math.max(1, Math.round((s.end - s.start) * fps)), 0));

export const EffectsReel: React.FC<EffectsReelProps> = (p) => {
  useFonts(p);
  const { fps } = useVideoConfig();
  const total = effectsReelDuration(p, fps);
  const { still } = usePreviewMode();
  const matte = alphaVideoOk() ? p.matte : undefined;
  let at = 0;
  return (
    <AbsoluteFill lang={p.lang} style={{ background: '#000', ...cjkVars(p.lang) }}>
      {p.segments.map((seg, i) => {
        const dur = Math.max(1, Math.round((seg.end - seg.start) * fps));
        const from = at;
        at += dur;
        // a beat may leave the speaker (full-screen text, a picture, a split screen); else its scene plays
        const Effect = layoutBody(seg) ?? effects[seg.effect];
        const framed = !layoutBody(seg) && !UNFRAMED_SCENES.includes(seg.effect);
        const trimBefore = Math.round(seg.start * fps);
        const style = seg.style ?? {};
        return (
          <Sequence key={i} from={from} durationInFrames={dur} premountFor={20}>
            <SourceContext.Provider
              value={{
                video: p.video,
                matte,
                focusX: p.focusX,
                trimBefore,
                ...p.palette,
                accent: style.color ?? p.palette.accent,
                style,
                reelFrom: from,
                reelTotal: total,
                brightness: p.brightness,
                captionY: p.captionY,
                shot: framed ? seg.shot : undefined,
                subject: p.subject,
              }}
            >
              {/* scene × camera × transition × grade/caption/font (read from context) × texture × accents */}
              <TransitionIn kind={style.transition}>
                <CameraMotion move={style.camera}>
                  <Effect seg={seg} />
                  <AccentOverlays />
                </CameraMotion>
                <TextureOverlay kind={style.texture} />
              </TransitionIn>
              {still ? null : <Audio src={asset(p.video)} trimBefore={trimBefore} volume={p.voiceVolume ?? 1} />}
              {p.counter ? <Counter n={effectIds.indexOf(seg.effect) + 1} /> : null}
            </SourceContext.Provider>
          </Sequence>
        );
      })}
      <Overlays items={p.overlays} accent={p.palette.accent} />
      {p.music && !still ? <Audio src={asset(p.music)} volume={(f) => musicLevel(p, f / fps, total / fps)} loop /> : null}
    </AbsoluteFill>
  );
};

export const MUSIC_DEFAULT = 0.35;
/** How far the music drops under speech, and how long it takes to get there. */
const DUCK = 0.3;
const RAMP = 0.25;

/** Music volume at time t: full in pauses, ducked under speech, faded out over the last second. */
export function musicLevel(p: Pick<EffectsReelProps, 'musicVolume' | 'duck' | 'speech'>, t: number, total: number) {
  const base = p.musicVolume ?? MUSIC_DEFAULT;
  const tail = Math.min(1, Math.max(0, (total - t) / 1));
  if (p.duck === false || !p.speech?.length) return base * tail;
  // distance to the nearest stretch of speech, so the dip eases in and out instead of pumping
  let d = Infinity;
  for (const [a, b] of p.speech) {
    if (t >= a && t <= b) {
      d = 0;
      break;
    }
    d = Math.min(d, t < a ? a - t : t - b);
  }
  const k = Math.min(1, d / RAMP);
  return base * (DUCK + (1 - DUCK) * k) * tail;
}

const Counter: React.FC<{ n: number }> = ({ n }) => (
  <div
    style={{
      position: 'absolute',
      left: 50,
      top: 60,
      padding: '10px 24px',
      borderRadius: 30,
      background: 'rgba(20,20,22,0.6)',
      color: '#fff',
      fontFamily: fonts.display,
      fontWeight: 800,
      fontSize: 34,
    }}
  >
    {String(n).padStart(2, '0')}
    <span style={{ opacity: 0.6 }}>/{effectIds.length}</span>
  </div>
);
