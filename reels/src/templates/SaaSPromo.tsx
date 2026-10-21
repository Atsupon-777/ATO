import React from 'react';
import type { SaaSPromoProps } from '../schemas';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { beatFrames, clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { BrowserFrame, Cursor, PhoneFrame } from '../components/Devices';

const BEATS = { hook: 8, reveal: 6, feature: 5, stats: 5, cta: 6 };
export const saasPromoBeats = BEATS.hook + BEATS.reveal + BEATS.feature * 3 + BEATS.stats + BEATS.cta;

export const SaaSPromo: React.FC<SaaSPromoProps> = (p) => {
  useFonts(p);
  const b = beatFrames(p.bpm);
  const f = (beats: number) => Math.round(beats * b);
  const tReveal = f(BEATS.hook);
  const tFeat = tReveal + f(BEATS.reveal);
  const tStats = tFeat + f(BEATS.feature * 3);
  const tCta = tStats + f(BEATS.stats);
  return (
    <AbsoluteFill style={{ background: p.palette.bg }}>
      <Sequence durationInFrames={tReveal}>
        <Hook {...p} beat={b} />
      </Sequence>
      <Sequence from={tReveal} durationInFrames={tFeat - tReveal}>
        <Reveal {...p} beat={b} />
      </Sequence>
      {p.features.map((ft, i) => (
        <Sequence key={i} from={tFeat + f(BEATS.feature) * i} durationInFrames={f(BEATS.feature)}>
          <Feature {...p} feature={ft} index={i} beat={b} />
        </Sequence>
      ))}
      <Sequence from={tStats} durationInFrames={tCta - tStats}>
        <Stats {...p} beat={b} />
      </Sequence>
      <Sequence from={tCta}>
        <Cta {...p} beat={b} />
      </Sequence>
      {p.music ? <Audio src={asset(p.music)} /> : null}
    </AbsoluteFill>
  );
};

type SceneProps = SaaSPromoProps & { beat: number };

/** Soft dotted grid that drifts, so flat backgrounds never feel static. */
const Backdrop: React.FC<{ color: string; dot: string; shift?: number }> = ({ color, dot, shift = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: color,
        backgroundImage: `radial-gradient(${dot} 2.2px, transparent 2.6px)`,
        backgroundSize: '44px 44px',
        backgroundPosition: `${shift + frame * 0.6}px ${frame * 1.2}px`,
      }}
    />
  );
};

const Hook: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const exit = progress(frame, p.beat * 7, p.beat * 8, easeInOut);
  return (
    <AbsoluteFill>
      <Backdrop color={p.palette.bg} dot={`${p.palette.ink}14`} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          padding: '0 90px',
          transform: `translateY(${-exit * 1400}px) scale(${1 + exit * 0.3})`,
          filter: `blur(${exit * 18}px)`,
        }}
      >
        {p.hook.map((line, i) => {
          const s = pop(frame, fps, Math.round(i * 2 * p.beat), 9);
          const parts = splitEmphasis(line, p.hookEmphasis);
          const swipe = progress(frame, i * 2 * p.beat + 6, i * 2 * p.beat + 16, easeOutExpo);
          return (
            <div
              key={i}
              style={{
                fontFamily: fonts.sansJP,
                fontWeight: 900,
                fontSize: 128,
                lineHeight: 1.22,
                letterSpacing: '-0.02em',
                color: p.palette.ink,
                transform: `scale(${0.6 + s * 0.4}) rotate(${(1 - s) * (i % 2 ? 6 : -6)}deg)`,
                transformOrigin: 'left center',
                opacity: Math.min(1, s * 1.5),
                whiteSpace: 'nowrap',
              }}
            >
              {parts.map((pt, j) =>
                pt.em ? (
                  <span key={j} style={{ position: 'relative', display: 'inline-block', color: p.palette.bg, padding: '0 14px' }}>
                    <span
                      style={{
                        position: 'absolute',
                        inset: '8% 0 4% 0',
                        background: p.palette.accent,
                        transform: `scaleX(${swipe})`,
                        transformOrigin: 'left',
                        borderRadius: 14,
                      }}
                    />
                    <span style={{ position: 'relative', color: swipe > 0.5 ? '#fff' : p.palette.ink }}>{pt.text}</span>
                  </span>
                ) : (
                  <span key={j}>{pt.text}</span>
                ),
              )}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Reveal: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const logo = pop(frame, fps, 0, 10);
  const ring = progress(frame, 0, 22, easeOutExpo);
  const fly = pop(frame, fps, Math.round(p.beat * 2), 16);
  const titleUp = progress(frame, p.beat * 2, p.beat * 3, easeInOut);
  const drift = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Backdrop color={p.palette.bg} dot={`${p.palette.ink}12`} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, ${p.palette.accent}33 0%, transparent 55%)`,
          opacity: logo,
        }}
      />
      {/* burst ring */}
      <div
        style={{
          position: 'absolute',
          left: 540 - 500 * ring,
          top: 600 - 500 * ring,
          width: 1000 * ring,
          height: 1000 * ring,
          borderRadius: '50%',
          border: `${10 * (1 - ring)}px solid ${p.palette.accent}`,
          opacity: 1 - ring,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: '100%',
          top: interpolate(titleUp, [0, 1], [520, 200]),
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `scale(${(0.4 + logo * 0.6) * (1 - titleUp * 0.35)})`,
        }}
      >
        {p.logo ? <Img src={asset(p.logo)} style={{ height: 150, marginBottom: 26 }} /> : null}
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 132, letterSpacing: '-0.03em', color: p.palette.ink }}>
          {p.name}
        </div>
      </div>
      {/* desktop flies up in 3D */}
      <AbsoluteFill style={{ perspective: 2200, alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: 760 + (1 - fly) * 1300,
            transform: `rotateX(${(1 - fly) * 40 + 14 - drift * 6}deg) rotateZ(${-6 + drift * 3}deg) rotateY(${8 - drift * 6}deg)`,
            transformStyle: 'preserve-3d',
          }}
        >
          <BrowserFrame src={asset(p.desktop)} width={980} url={p.url} />
        </div>
      </AbsoluteFill>
      {/* floating feature chips with parallax */}
      {p.chips.map((c, i) => {
        const s = pop(frame, fps, Math.round(p.beat * (3 + i * 0.5)), 11);
        const side = i % 2 === 0 ? -1 : 1;
        const x = side < 0 ? 60 + random(`cx${i}`) * 80 : 1080 - 470 - random(`cx${i}`) * 80;
        const y = 820 + i * 230 + Math.sin(frame / 18 + i) * 14 - drift * 60 * (i + 1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              transform: `scale(${s}) rotate(${side * (3 + i)}deg)`,
              padding: '22px 34px',
              borderRadius: 26,
              background: p.palette.panel,
              boxShadow: '0 24px 60px rgba(20,24,50,0.22)',
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontFamily: fonts.sansJP,
              fontWeight: 700,
              fontSize: 40,
              color: p.palette.ink,
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: i % 2 ? p.palette.accent2 : p.palette.accent,
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                fontSize: 30,
              }}
            >
              ✓
            </div>
            {c}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Feature: React.FC<SceneProps & { feature: SaaSPromoProps['features'][number]; index: number }> = ({
  feature,
  index,
  ...p
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const colors = [p.palette.accent, p.palette.ink, p.palette.accent2];
  const wipe = progress(frame, 0, 10, easeOutExpo);
  const enter = pop(frame, fps, 2, 15);
  const zoomT = progress(frame, p.beat * 1.2, p.beat * 2.6, easeInOut);
  const zoom = 1 + (feature.focus.zoom - 1) * zoomT;
  const clickAt = Math.round(p.beat * 2.8);
  const press = interpolate(frame, [clickAt - 3, clickAt, clickAt + 5], [0, 1, 0], clamp);
  const ripple = interpolate(frame, [clickAt, clickAt + 16], [0, 1], clamp);
  const sway = Math.sin(frame / 22) * 1.5;
  const isPhone = feature.device === 'mobile' && p.mobile;
  const dw = isPhone ? 560 : 980;
  const dh = isPhone ? 560 * 2.16 : 980 / 1.6 + 54;
  const deviceTop = isPhone ? 600 : 860;
  // cursor travels from a corner to the focus point (screen space)
  const cursorT = progress(frame, p.beat * 0.8, clickAt - 2, easeInOut);
  // With the pan-within-bounds zoom, a focus point keeps its place in the frame, so aim straight at it.
  const fx = 540 - dw / 2 + dw * feature.focus.x;
  const fy = deviceTop + (isPhone ? dh * feature.focus.y : 54 + (dh - 54) * feature.focus.y);
  const cx = interpolate(cursorT, [0, 1], [index % 2 ? 140 : 940, fx]);
  const cy = interpolate(cursorT, [0, 1], [1780, fy]);
  const words = feature.title.split('');
  const exit = progress(frame, durationInFrames - 6, durationInFrames, easeInOut);
  const bg = colors[index % 3];
  const light = index % 3 === 1;
  const text = light ? p.palette.bg : '#FFFFFF';
  return (
    <AbsoluteFill style={{ background: p.palette.bg, overflow: 'hidden' }}>
      {/* diagonal colour wipe */}
      <AbsoluteFill
        style={{
          background: bg,
          clipPath: `polygon(0 0, ${wipe * 200}% 0, ${wipe * 200 - 60}% 100%, 0 100%)`,
        }}
      />
      <AbsoluteFill style={{ opacity: wipe }}>
        <Backdrop color="transparent" dot="rgba(255,255,255,0.12)" shift={index * 20} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 190, left: 90, right: 90, transform: `translateX(${-exit * 300}px)`, opacity: 1 - exit }}>
        <div
          style={{
            display: 'inline-block',
            padding: '12px 26px',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.16)',
            border: '2px solid rgba(255,255,255,0.35)',
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: '0.08em',
            color: text,
            opacity: enter,
          }}
        >
          {String(index + 1).padStart(2, '0')} · {feature.kicker.toUpperCase()}
        </div>
        <div style={{ marginTop: 34, display: 'flex', flexWrap: 'wrap' }}>
          {words.map((w, i) => {
            const s = pop(frame, fps, 4 + i * 1.2, 12);
            return (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  fontFamily: fonts.sansJP,
                  fontWeight: 900,
                  fontSize: 104,
                  lineHeight: 1.18,
                  color: text,
                  transform: `translateY(${(1 - s) * 80}px)`,
                  opacity: Math.min(1, s * 1.4),
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </div>
      <AbsoluteFill style={{ perspective: 2400, alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            top: deviceTop + (1 - enter) * 900 + exit * 200,
            transform: `rotateX(${(1 - zoomT) * 10 + sway}deg) rotateY(${(index % 2 ? 1 : -1) * (1 - zoomT) * 12}deg) scale(${1 + zoomT * 0.06})`,
            opacity: 1 - exit,
          }}
        >
          {isPhone ? (
            <PhoneFrame src={asset(p.mobile!)} width={dw} zoom={zoom} focusX={feature.focus.x} focusY={feature.focus.y} />
          ) : (
            <BrowserFrame src={asset(p.desktop)} width={dw} url={p.url} zoom={zoom} focusX={feature.focus.x} focusY={feature.focus.y} />
          )}
        </div>
      </AbsoluteFill>
      <Cursor x={cx} y={cy} press={press} ripple={ripple} color={light ? p.palette.accent : '#FFFFFF'} />
    </AbsoluteFill>
  );
};

const Stats: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ justifyContent: 'center', padding: '0 90px', gap: 70 }}>
      <Backdrop color={p.palette.bg} dot={`${p.palette.ink}12`} />
      {p.stats.map((s, i) => {
        const start = Math.round(i * p.beat);
        const e = pop(frame, fps, start, 14);
        const count = progress(frame, start, start + p.beat * 2.2, easeOutExpo);
        const value = s.value * count;
        const shown = Number.isInteger(s.value) ? Math.round(value).toLocaleString('ja-JP') : value.toFixed(1);
        return (
          <div key={i} style={{ position: 'relative', opacity: e, transform: `translateX(${(1 - e) * -200}px)` }}>
            <div style={{ fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 40, color: `${p.palette.ink}99` }}>{s.label}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span
                style={{
                  fontFamily: fonts.display,
                  fontWeight: 800,
                  fontSize: 190,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  color: i === 1 ? p.palette.accent2 : p.palette.accent,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {shown}
              </span>
              <span style={{ fontFamily: fonts.sansJP, fontWeight: 900, fontSize: 84, color: p.palette.ink }}>{s.suffix}</span>
            </div>
            <div style={{ height: 10, borderRadius: 5, background: `${p.palette.ink}14`, marginTop: 18 }}>
              <div
                style={{
                  height: '100%',
                  width: `${count * 100}%`,
                  borderRadius: 5,
                  background: i === 1 ? p.palette.accent2 : p.palette.accent,
                }}
              />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const Cta: React.FC<SceneProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const name = pop(frame, fps, 0, 11);
  const btn = pop(frame, fps, Math.round(p.beat * 1.5), 10);
  const clickAt = Math.round(p.beat * 3.2);
  const press = interpolate(frame, [clickAt - 3, clickAt, clickAt + 6], [0, 1, 0], clamp);
  const ripple = interpolate(frame, [clickAt, clickAt + 18], [0, 1], clamp);
  const cursorT = progress(frame, p.beat * 2, clickAt - 1, easeInOut);
  const shimmer = interpolate(frame % 45, [0, 45], [-60, 160]);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Backdrop color={p.palette.ink} dot="rgba(255,255,255,0.08)" />
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, ${p.palette.accent}55 0%, transparent 60%)` }} />
      <div style={{ transform: `scale(${0.5 + name * 0.5})`, opacity: name, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {p.logo ? <Img src={asset(p.logo)} style={{ height: 170, marginBottom: 30, filter: 'brightness(0) invert(1)' }} /> : null}
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 150, letterSpacing: '-0.03em', color: '#fff' }}>{p.name}</div>
        <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 44, color: 'rgba(255,255,255,0.7)', marginTop: 10 }}>{p.url}</div>
      </div>
      <div
        style={{
          position: 'relative',
          marginTop: 110,
          padding: '40px 90px',
          borderRadius: 999,
          overflow: 'hidden',
          background: p.palette.accent,
          fontFamily: fonts.sansJP,
          fontWeight: 900,
          fontSize: 56,
          color: '#fff',
          transform: `scale(${btn * (1 - press * 0.08)})`,
          boxShadow: `0 30px 80px ${p.palette.accent}88`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `linear-gradient(110deg, transparent ${shimmer - 20}%, rgba(255,255,255,0.45) ${shimmer}%, transparent ${shimmer + 20}%)`,
          }}
        />
        <span style={{ position: 'relative' }}>{p.cta} →</span>
      </div>
      <Cursor
        x={interpolate(cursorT, [0, 1], [900, 640])}
        y={interpolate(cursorT, [0, 1], [1800, 1250])}
        press={press}
        ripple={ripple}
        color="#fff"
      />
    </AbsoluteFill>
  );
};

function splitEmphasis(line: string, em: string) {
  const i = em ? line.indexOf(em) : -1;
  if (i < 0) return [{ text: line, em: false }];
  return [
    { text: line.slice(0, i), em: false },
    { text: em, em: true },
    { text: line.slice(i + em.length), em: false },
  ].filter((x) => x.text);
}
