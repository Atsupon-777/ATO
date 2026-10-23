// Beats without the speaker on screen, the way short-form editors cut away while the voice carries on
// (the template keeps playing the beat's sound, so these read as J/L cuts): a full-screen line of kinetic
// text, a picture (b-roll), or a split screen with the speaker on top and the picture below.
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { asset } from '../lib/assets';
import { fonts } from '../lib/fonts';
import { clamp, easeOutExpo, pop, progress } from '../lib/timing';
import { Caption, FONT_FAMILY, Footage, GRADES, SourceContext, splitWords, useSource, type EffectProps } from './layers';

const emWidth = (w: string) => [...w].reduce((n, ch) => n + (/[　-鿿가-힯＀-￯]/.test(ch) ? 1 : /\p{M}/u.test(ch) ? 0 : 0.62), 0);
const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** The spoken line as a full-screen poster: words slam in as they are said, the key word in the accent colour. */
export const TextCard: React.FC<EffectProps & { half?: boolean }> = ({ seg, half }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = useSource();
  const family = s.style.font && s.style.font !== 'serif' ? FONT_FAMILY[s.style.font] : fonts.display;
  const line = seg.caption || seg.text || '';
  const words = splitWords(line).slice(0, 9);
  const em = seg.emphasis.map(bare);
  // light card on even source moments, dark on odd ones, so two text beats in one reel do not look the same
  const light = Math.round(s.trimBefore / 7) % 2 === 0;
  const bg = light ? s.accent : '#0B0B0D';
  const ink = light ? '#111' : '#fff';
  const hot = light ? '#fff' : s.accent;
  const chars = words.reduce((n, w) => n + emWidth(w), 0);
  const area = half ? 0.42 : 1;
  const longest = Math.max(1, ...words.map(emWidth));
  // big enough to fill the card, small enough that the longest (emphasised, 1.25×) word fits the width
  const size = Math.round(
    Math.min(half ? 120 : 210, 900 / (longest * 1.25), Math.max(half ? 64 : 92, (half ? 620 : 1050) / Math.sqrt(Math.max(1, chars) / (2.2 * area)))),
  );
  // a short line becomes a poster: one word per row, each as wide as the card allows
  const poster = words.length <= 4;
  const wordSize = (w: string, isEm: boolean) => Math.round(Math.min(isEm ? 330 : 230, (half ? 760 : 900) / Math.max(1.2, emWidth(w)), half ? 200 : 999));
  const per = Math.max(3, (durationInFrames * 0.7) / Math.max(1, words.length));
  const push = 1 + 0.05 * progress(frame, 0, durationInFrames, (x) => x);
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      {light ? null : <AbsoluteFill style={{ background: `linear-gradient(180deg, #16161B 0%, #0B0B0D 60%), radial-gradient(70% 40% at 50% 100%, ${s.accent}55, transparent 70%)`, backgroundBlendMode: 'screen' }} />}
      <AbsoluteFill
        style={{
          padding: half ? '40px 70px' : '0 80px',
          display: 'flex',
          flexDirection: poster ? 'column' : 'row',
          flexWrap: poster ? 'nowrap' : 'wrap',
          alignItems: poster ? 'center' : 'baseline',
          alignContent: 'center',
          justifyContent: 'center',
          columnGap: size * 0.28,
          transform: `scale(${push})`,
        }}
      >
        {words.map((w, i) => {
          const at = i * per;
          const p = pop(frame, fps, at, 11);
          const isEm = em.includes(bare(w)) || (!em.length && i === words.length - 1 && words.length > 1);
          return (
            <span
              key={i}
              style={{
                fontFamily: family,
                fontWeight: 800,
                fontSize: poster ? wordSize(w, isEm) : isEm ? size * 1.25 : size,
                lineHeight: poster ? 0.98 : 1.02,
                letterSpacing: '-0.035em',
                color: isEm ? hot : ink,
                opacity: frame >= at ? Math.min(1, p * 1.6) : 0,
                transform: `translateY(${(1 - p) * 40}px) scale(${1.5 - 0.5 * p})`,
                display: 'inline-block',
                textTransform: light ? 'none' : undefined,
                fontStyle: isEm && !light ? 'italic' : 'normal',
              }}
            >
              {w}
            </span>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A picture with a slow push and drift (Ken Burns), graded like the footage so it belongs to the reel. */
const Picture: React.FC<{ src: string; dir?: number }> = ({ src, dir = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = useSource();
  const t = progress(frame, 0, durationInFrames, (x) => x);
  const arrive = progress(frame, 0, 10, easeOutExpo);
  const grade = GRADES[s.style.grade ?? 'natural'].filter;
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: '#000' }}>
      <Img
        src={asset(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${1.22 - 0.06 * arrive + 0.08 * t}) translateX(${dir * interpolate(t, [0, 1], [-2.5, 2.5], clamp)}%)`,
          filter: grade || undefined,
        }}
      />
    </AbsoluteFill>
  );
};

/** B-roll: the picture full-screen while the speaker keeps talking. */
export const BRoll: React.FC<EffectProps> = ({ seg }) => {
  const s = useSource();
  return (
    <AbsoluteFill>
      <Picture src={seg.shot!.image!} dir={s.trimBefore % 2 ? -1 : 1} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,0.55) 100%)' }} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.74} />
    </AbsoluteFill>
  );
};

/** Split screen: the speaker on top (face in the middle of the half), the picture or the key line below. */
export const Split: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const s = useSource();
  const open = progress(frame, 0, 9, easeOutExpo);
  // the top half shows the footage cover-cropped to 1080×960 (the face lands a third down); a slow push
  const inner = { ...s, shot: undefined };
  const z = 1.06 + 0.06 * progress(frame, 0, 90, (x) => x);
  return (
    <AbsoluteFill style={{ background: '#0B0B0D' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 958, overflow: 'hidden', transform: `translateY(${(1 - open) * -120}px)` }}>
        <SourceContext.Provider value={inner}>
          <AbsoluteFill style={{ transform: `scale(${z})`, transformOrigin: '50% 35%' }}>
            <Footage />
          </AbsoluteFill>
        </SourceContext.Provider>
      </div>
      <div style={{ position: 'absolute', left: 0, top: 962, width: 1080, height: 958, overflow: 'hidden', transform: `translateY(${(1 - open) * 120}px)` }}>
        {seg.shot?.image ? <Picture src={seg.shot.image} /> : <TextCard seg={seg} half />}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 956, height: 8, background: s.accent, transform: `scaleX(${open})` }} />
      {seg.shot?.image ? <Caption text={seg.caption} emphasis={seg.emphasis} y={0.5} size={64} /> : null}
    </AbsoluteFill>
  );
};

/** The body for a beat that leaves the speaker; undefined means the beat's own scene effect plays. */
export const layoutBody = (seg: EffectProps['seg']): React.FC<EffectProps> | undefined => {
  const l = seg.shot?.layout;
  if (l === 'text') return TextCard;
  if (l === 'broll') return seg.shot?.image ? BRoll : TextCard;
  if (l === 'split') return Split;
  return undefined;
};
