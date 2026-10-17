// Motion-graphics scenes: kinetic typography and an animated infographic.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { FONT_FAMILY, Footage, Sandwich, splitWords, useSource, type EffectProps } from './layers';

/** Rough width of a word in ems: full-width CJK glyphs are about 1em, Latin capitals about 0.68em, combining marks 0. */
const emWidth = (w: string) =>
  [...w].reduce((n, ch) => n + (/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1 : /\p{M}/u.test(ch) ? 0 : 0.68), 0);

/**
 * Kinetic typography: the line itself becomes the picture. Words slam in one at a time, each sized to
 * fill the width, stacking up like a poster; emphasised words turn accent-coloured and flip in.
 * Sits behind the speaker when there is a matte.
 */
export const KineticType: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = useSource();
  const family = s.style.font ? FONT_FAMILY[s.style.font] : fonts.display;
  const line = seg.text ?? seg.caption ?? 'MAKE IT MOVE';
  const words = splitWords(line).slice(0, 8);
  const emph = seg.emphasis.map((w) => w.toLowerCase());
  const per = Math.max(5, (durationInFrames * 0.75) / words.length);
  const shown = words.filter((_, i) => frame >= i * per).length;
  // keep the last three words on screen; older ones scroll up and out
  const firstVisible = Math.max(0, shown - 3);
  const lineH = 270;
  const scroll = interpolate(frame, [Math.max(0, firstVisible - 1) * per, firstVisible * per + 8], [Math.max(0, firstVisible - 1), firstVisible], clamp);
  const behind = (
    <AbsoluteFill style={{ perspective: 1400 }}>
      <div style={{ position: 'absolute', left: 110, right: 110, top: 420, transform: `translateY(${-scroll * lineH}px)` }}>
        {words.map((w, i) => {
          const at = i * per;
          const p = pop(frame, fps, at, 12);
          const isEm = emph.includes(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
          const size = Math.min(230, 840 / Math.max(1.4, emWidth(w)));
          const kind = i % 3;
          const enter =
            kind === 0
              ? `scale(${2.4 - 1.4 * p})`
              : kind === 1
                ? `translateX(${(1 - p) * (i % 2 ? 900 : -900)}px)`
                : `rotateX(${(1 - p) * 90}deg)`;
          const fade = i < firstVisible - 1 ? 0 : 1;
          return (
            <div
              key={i}
              style={{
                height: lineH,
                display: 'flex',
                alignItems: 'center',
                justifyContent: i % 2 ? 'flex-end' : 'flex-start',
                opacity: frame >= at ? Math.min(1, p * 1.5) * fade : 0,
              }}
            >
              <span
                style={{
                  fontFamily: family,
                  fontWeight: 800,
                  fontSize: size,
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  color: isEm ? s.accent : '#fff',
                  WebkitTextStroke: isEm ? undefined : kind === 2 ? `4px #fff` : undefined,
                  textShadow: '0 12px 40px rgba(0,0,0,0.45)',
                  transform: enter,
                  transformOrigin: '50% 100%',
                  display: 'inline-block',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                }}
              >
                {w}
              </span>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={<><AbsoluteFill style={{ background: 'rgba(0,0,0,0.35)' }} />{behind}</>} />
    </AbsoluteFill>
  );
};

const count = (to: number, frame: number, from: number, len: number) => to * progress(frame, from, from + len, easeOutExpo);
const fmt = (v: number, to: number) => (Number.isInteger(to) ? Math.round(v).toLocaleString('en-US') : v.toFixed(1));

/**
 * Infographic animation: a headline stat counts up inside a ring, then labelled bars grow one by one.
 * `values[0]` is the ring percentage, the rest pair with `items` as bars; `text` is the title.
 */
export const Infographic: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useSource();
  const family = s.style.font ? FONT_FAMILY[s.style.font] : fonts.display;
  const [ringV, ...rest] = seg.values.length ? seg.values : [87, 120, 64, 38];
  const ringPct = Math.max(0, Math.min(100, ringV));
  const bars = (rest.length ? rest : [120, 64, 38]).slice(0, 4);
  const labels = seg.items.length ? seg.items : ['With AI', 'Agency', 'DIY'];
  const max = Math.max(...bars, 1);
  const enter = pop(frame, fps, 0, 15);
  const ring = progress(frame, 6, 40, easeOutExpo);
  const R = 130;
  const C = 2 * Math.PI * R;
  const colors = [s.accent, '#FFFFFF', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0.35)'];
  return (
    <AbsoluteFill>
      <Footage />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.15) 60%, rgba(0,0,0,0.5))' }} />
      <div
        style={{
          position: 'absolute',
          left: 130,
          right: 130,
          top: 300,
          fontFamily: family,
          color: '#fff',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 40}px)`,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.2em', opacity: 0.75 }}>
          <span style={{ color: s.accent }}>■</span> {(seg.text ?? 'THE NUMBERS').toUpperCase()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 50, marginTop: 40 }}>
          <svg width={2 * R + 40} height={2 * R + 40} style={{ flexShrink: 0 }}>
            <circle cx={R + 20} cy={R + 20} r={R} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={30} />
            <circle
              cx={R + 20}
              cy={R + 20}
              r={R}
              fill="none"
              stroke={s.accent}
              strokeWidth={30}
              strokeLinecap="round"
              strokeDasharray={`${C * (ringPct / 100) * ring} ${C}`}
              transform={`rotate(-90 ${R + 20} ${R + 20})`}
              style={{ filter: `drop-shadow(0 0 16px ${s.accent})` }}
            />
            <text x={R + 20} y={R + 46 - 6} textAnchor="middle" fill="#fff" fontWeight={800} fontSize={76} style={{ fontFamily: family }}>
              {Math.round(ringPct * ring)}%
            </text>
          </svg>
          <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15, opacity: progress(frame, 20, 34) }}>
            {seg.caption ?? 'of viewers watch to the end'}
          </div>
        </div>
        <div style={{ marginTop: 60 }}>
          {bars.map((v, i) => {
            const from = 26 + i * 9;
            const g = progress(frame, from, from + 22, easeInOut);
            return (
              <div key={i} style={{ marginBottom: 34, opacity: progress(frame, from - 4, from + 4) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 34, fontWeight: 800, marginBottom: 12 }}>
                  <span>{labels[i] ?? ''}</span>
                  <span style={{ color: i === 0 ? s.accent : '#fff' }}>{fmt(count(v, frame, from, 22), v)}</span>
                </div>
                <div style={{ height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                  <div style={{ width: `${(v / max) * 100 * g}%`, height: '100%', borderRadius: 17, background: colors[i] }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
