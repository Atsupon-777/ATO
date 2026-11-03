// "Teardown" scene: a phone tilts into an isometric view, its screens float apart as layers, numbered
// labels slide in on leader lines and each layer lifts and glows in turn. Layers use real screenshots
// when given; otherwise each is a clean card with its name, so nothing pretends to be a real UI.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { useLook } from './theme';
import { E, k, lin, mix, springX } from './kit';

export type TeardownProps = {
  name: string;
  layers: { title: string; text?: string; image?: string }[];
  accent?: string;
};

const LW = 470, LH = 1016;

export const Teardown: React.FC<TeardownProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const L = useLook();
  const t = (s: number) => s * fps;
  const gold = p.accent ?? L?.accent ?? '#e6cb92';
  const layers = p.layers.slice(0, 4);
  const n = layers.length;
  const tilt = k(f, 0, t(0.9), E.inOutCubic);
  const drift = lin(f, t(0.9), D);
  const collapse = k(f, D - t(0.75), D - t(0.35), E.inOutCubic);
  const dive = k(f, D - t(0.35), D, (x) => (x <= 0 ? 0 : 2 ** (10 * x - 10)));
  const iso = tilt * (1 - collapse);
  const rx = 56 * iso, rz = (-22 - 4 * drift) * iso;
  const scale = mix(0.9, 0.62, iso) * (1 + dive * 3.2);
  // the layer being described: an equal share of the middle of the scene each
  const span0 = t(1.6), span1 = D - t(0.9);
  const activeOf = (i: number) => {
    const a = span0 + ((span1 - span0) / n) * (n - 1 - i);
    const b = a + (span1 - span0) / n;
    return k(f, a - 2, a + t(0.3)) * (1 - k(f, b - t(0.1), b + t(0.2)));
  };
  return (
    <AbsoluteFill style={{ background: L ? `radial-gradient(90% 60% at 50% 45%, ${L.surface} 0%, ${L.bg} 70%)` : 'radial-gradient(90% 60% at 50% 45%, #2b141b 0%, #1b0e12 55%, #0c0709 100%)', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: 150, width: '100%', textAlign: 'center', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 24, letterSpacing: '0.32em', color: L?.muted ?? 'rgba(246,234,210,.5)', opacity: 1 - dive }}>
        {p.name.toUpperCase()} — TEARDOWN
      </div>
      <AbsoluteFill style={{ perspective: 2600, filter: `blur(${dive * 14}px)`, opacity: 1 - dive }}>
        <div
          style={{
            position: 'absolute',
            left: 1080 / 2 - LW / 2 + 140 * iso,
            top: 1920 / 2 - LH / 2 + 60,
            width: LW,
            height: LH,
            transformStyle: 'preserve-3d',
            transform: `scale(${scale}) rotateX(${rx}deg) rotateZ(${rz}deg)`,
          }}
        >
          {/* the device itself, at the bottom of the stack */}
          <div style={{ position: 'absolute', inset: -14, borderRadius: 84, background: L?.surface ?? '#3a1c24', boxShadow: `inset 0 0 0 2px rgba(230,203,146,.35)` }} />
          {layers.map((l, i) => {
            const rise = springX(lin(f, t(0.4) + t(0.1) * i, t(1.45) + t(0.1) * i), 0.9, 6.5) * (1 - collapse);
            const act = activeOf(i);
            const z = (n - i) * 300 * rise + 70 * act;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 66,
                  overflow: 'hidden',
                  transform: `translateZ(${z}px)`,
                  opacity: (i === n - 1 ? 1 : Math.min(1, rise * 2 + collapse)) * (L && !L.dark ? mix(0.55, 1, act) : 1),
                  // on a light theme dimming reads as dirt, so the resting layers fade instead of darkening
                  filter: L && !L.dark ? 'none' : `brightness(${mix(0.45, 1, Math.max(act, i === n - 1 && rise < 0.05 ? 1 : 0))})`,
                  boxShadow: `0 0 0 2px rgba(230,203,146,.45)${act > 0 ? `, 0 0 0 ${3 * act}px ${gold}, 0 0 ${70 * act}px ${10 * act}px rgba(230,203,146,.35)` : ''}`,
                  background: l.image ? '#000' : `linear-gradient(160deg, #fbf6ec 0%, #efe3cc 100%)`,
                }}
              >
                {l.image ? (
                  <Img src={l.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ padding: '120px 48px', fontFamily: fonts.sansJP, color: '#1d0d12' }}>
                    <div style={{ fontSize: 26, letterSpacing: '0.2em', color: '#9a6b2a', fontFamily: 'ui-monospace, Menlo, monospace' }}>0{i + 1}</div>
                    <div style={{ fontSize: 64, fontWeight: 900, marginTop: 18, lineHeight: 1.15 }}>{l.title}</div>
                    {[0, 1, 2, 3].map((r) => (
                      <div key={r} style={{ height: r === 0 ? 220 : 64, borderRadius: 24, marginTop: 28, background: r === 0 ? 'rgba(154,107,42,.18)' : 'rgba(29,13,18,.07)' }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
      {/* labels: a fixed left column, so they never collide with each other */}
      {layers.map((l, i) => {
        const slide = k(f, t(1.05) + t(0.12) * i, t(1.55) + t(0.12) * i, (x) => 1 - (1 - x) ** 5) * (1 - collapse);
        const act = activeOf(i);
        const y = 470 + i * 250;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 70,
              top: y,
              width: 430,
              opacity: slide * mix(0.45, 1, act),
              transform: `translateX(${(1 - slide) * -120}px) scale(${1 + 0.06 * act})`,
              transformOrigin: 'left center',
            }}
          >
            <div style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, color: gold }}>0{i + 1} ——</div>
            <div style={{ fontFamily: L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: 54, color: L?.ink ?? '#f6ead2', lineHeight: 1.15, marginTop: 6 }}>{l.title}</div>
            {l.text ? <div style={{ fontFamily: fonts.sansJP, fontSize: 28, color: L?.muted ?? 'rgba(246,234,210,.6)', marginTop: 8, lineHeight: 1.4 }}>{l.text}</div> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
