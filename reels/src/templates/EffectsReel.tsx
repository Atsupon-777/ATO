import React from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import type { EffectsReelProps } from '../schemas';
import { effectIds } from '../schemas';
import { asset } from '../lib/assets';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { effects } from '../effects';
import { SourceContext } from '../effects/layers';
import { AccentOverlays, CameraMotion, TextureOverlay, TransitionIn } from '../effects/modifiers';

/** Segments play back to back; each one is a slice of the source with one effect on it. */
export const effectsReelDuration = (p: EffectsReelProps, fps: number) =>
  Math.max(1, p.segments.reduce((sum, s) => sum + Math.max(1, Math.round((s.end - s.start) * fps)), 0));

export const EffectsReel: React.FC<EffectsReelProps> = (p) => {
  useFonts(p);
  const { fps } = useVideoConfig();
  const total = effectsReelDuration(p, fps);
  let at = 0;
  return (
    <AbsoluteFill lang={p.lang} style={{ background: '#000', ...cjkVars(p.lang) }}>
      {p.segments.map((seg, i) => {
        const dur = Math.max(1, Math.round((seg.end - seg.start) * fps));
        const from = at;
        at += dur;
        const Effect = effects[seg.effect];
        const trimBefore = Math.round(seg.start * fps);
        const style = seg.style ?? {};
        return (
          <Sequence key={i} from={from} durationInFrames={dur} premountFor={20}>
            <SourceContext.Provider
              value={{
                video: p.video,
                matte: p.matte,
                focusX: p.focusX,
                trimBefore,
                ...p.palette,
                accent: style.color ?? p.palette.accent,
                style,
                reelFrom: from,
                reelTotal: total,
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
              <Audio src={asset(p.video)} trimBefore={trimBefore} />
              {p.counter ? <Counter n={effectIds.indexOf(seg.effect) + 1} /> : null}
            </SourceContext.Provider>
          </Sequence>
        );
      })}
      {p.music ? <Audio src={asset(p.music)} volume={0.25} loop /> : null}
    </AbsoluteFill>
  );
};

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
