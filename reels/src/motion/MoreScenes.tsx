// More motion scenes: a cursor demo on a web app, KPI tiles counting up, and a logo drawn as a line.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, fmtNum, k, lin, mix, springX } from './kit';
import { useLook } from './theme';

// ---------- cursor demo ----------

export type CursorDemoProps = {
  app: string;
  /** Steps the cursor performs, in order: each clicks a button with this label and shows the result line. */
  steps: { button: string; result: string }[];
  /** A screenshot of the real app; without one a clean generic window is drawn. */
  screen?: string;
  accent?: string;
};

export const CursorDemo: React.FC<CursorDemoProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#4f46e5';
  const ink = L?.ink ?? '#14161c';
  const steps = p.steps.slice(0, 3);
  const win = k(f, 0, t(0.6), E.outExpo);
  const span = (D - t(1)) / Math.max(1, steps.length);
  const stepAt = (i: number) => t(0.7) + i * span;
  // buttons sit in a column; the cursor glides to each, presses, and the result card appears
  const btnY = (i: number) => 760 + i * 170;
  const cur = steps.reduce(
    (acc, _, i) => {
      const m = E.inOutCubic(lin(f, stepAt(i), stepAt(i) + span * 0.45));
      return { x: mix(acc.x, 640, m), y: mix(acc.y, btnY(i) + 50, m) };
    },
    { x: 900, y: 1500 },
  );
  const pressOf = (i: number) => {
    const a = stepAt(i) + span * 0.5;
    return lin(f, a, a + 4) * (1 - lin(f, a + 4, a + 9));
  };
  const press = steps.reduce((m, _, i) => Math.max(m, pressOf(i)), 0);
  return (
    <AbsoluteFill style={{ background: L ? `radial-gradient(110% 70% at 50% 0%, ${L.surface} 0%, ${L.bg} 70%)` : 'linear-gradient(160deg, #eef2ff 0%, #f8fafc 60%)' }}>
      <div
        style={{
          position: 'absolute',
          left: 70,
          top: 260,
          width: 940,
          height: 1300,
          borderRadius: 34,
          background: L?.surface ?? '#fff',
          boxShadow: '0 50px 120px rgba(30,40,80,.18)',
          overflow: 'hidden',
          transform: `translateY(${(1 - win) * 200}px) scale(${mix(0.94, 1, win)})`,
          opacity: win,
        }}
      >
        <div style={{ height: 76, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', background: L ? `color-mix(in srgb, ${ink} 6%, ${L.surface})` : '#f1f3f8' }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
            <div key={c} style={{ width: 18, height: 18, borderRadius: 9, background: c }} />
          ))}
          <div style={{ marginLeft: 20, fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 26, color: ink, opacity: 0.7 }}>{p.app}</div>
        </div>
        {p.screen ? <Img src={p.screen} style={{ width: '100%', height: 420, objectFit: 'cover' }} /> : <div style={{ height: 300, margin: 40, borderRadius: 24, background: `color-mix(in srgb, ${accent} 12%, transparent)` }} />}
      </div>
      {steps.map((s, i) => {
        const done = lin(f, stepAt(i) + span * 0.55, stepAt(i) + span * 0.8);
        const pr = pressOf(i);
        return (
          <React.Fragment key={i}>
            <div
              style={{
                position: 'absolute',
                left: 150,
                top: btnY(i),
                width: 780,
                height: 110,
                borderRadius: 26,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 36px',
                boxSizing: 'border-box',
                background: done > 0 ? accent : L ? `color-mix(in srgb, ${ink} 6%, ${L.surface})` : '#f1f3f8',
                color: done > 0 ? L?.onAccent ?? '#fff' : ink,
                fontFamily: L?.head ?? fonts.sansJP,
                fontWeight: 800,
                fontSize: 36,
                transform: `scale(${1 - 0.04 * pr})`,
                opacity: k(f, t(0.4) + i * 4, t(0.8) + i * 4),
              }}
            >
              <span>{done > 0 ? s.result : s.button}</span>
              <span style={{ fontSize: 34, opacity: done }}>✓</span>
            </div>
          </React.Fragment>
        );
      })}
      {/* the cursor */}
      <svg width={70} height={84} viewBox="0 0 24 28" style={{ position: 'absolute', left: cur.x, top: cur.y, transform: `scale(${1 - 0.15 * press})`, transformOrigin: 'top left', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.3))' }}>
        <path d="M2 2 L2 22 L8 17 L12 26 L16 24 L12 15 L20 15 Z" fill="#111" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
      {press > 0 ? <div style={{ position: 'absolute', left: cur.x - 40, top: cur.y - 40, width: 80, height: 80, borderRadius: 40, border: `4px solid ${accent}`, opacity: press, transform: `scale(${1 + press})` }} /> : null}
    </AbsoluteFill>
  );
};

// ---------- KPI tiles ----------

export type KpiTilesProps = {
  title?: string;
  tiles: { label: string; value: number; unit?: string; decimals?: number }[];
  accent?: string;
};

export const KpiTiles: React.FC<KpiTilesProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#22c55e';
  const ink = L?.ink ?? '#f5f7fb';
  const tiles = p.tiles.slice(0, 4);
  return (
    <AbsoluteFill style={{ background: L?.bg ?? '#0b0d12' }}>
      {p.title ? <div style={{ position: 'absolute', left: 80, right: 80, top: 220, fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 62, color: ink, opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      <div style={{ position: 'absolute', left: 70, right: 70, top: 440, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
        {tiles.map((tile, i) => {
          const s = springX(lin(f, t(0.3) + i * t(0.12), t(1.0) + i * t(0.12)), 1.1, 6);
          const c = E.outCubic(lin(f, t(0.5) + i * t(0.12), D * 0.7));
          return (
            <div
              key={i}
              style={{
                padding: '42px 36px',
                borderRadius: 34,
                background: L?.surface ?? '#151923',
                boxShadow: `inset 0 0 0 2px ${L ? `color-mix(in srgb, ${ink} 8%, transparent)` : 'rgba(255,255,255,.06)'}`,
                transform: `translateY(${(1 - s) * 120}px)`,
                opacity: Math.min(1, s * 1.5),
              }}
            >
              <div style={{ fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 28, color: L?.muted ?? 'rgba(245,247,251,.6)' }}>{tile.label}</div>
              <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 92, color: ink, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}>{fmtNum(tile.value * c, tile.decimals ?? 0)}</span>
                {tile.unit ? <span style={{ fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 32, color: accent }}>{tile.unit}</span> : null}
              </div>
              <div style={{ marginTop: 22, height: 8, borderRadius: 4, background: L ? `color-mix(in srgb, ${ink} 10%, transparent)` : 'rgba(255,255,255,.08)' }}>
                <div style={{ width: `${c * 100}%`, height: '100%', borderRadius: 4, background: accent }} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- logo drawn as a line ----------

export type LogoLineProps = {
  /** The wordmark; each letter is outlined then filled. */
  name: string;
  tagline?: string;
  accent?: string;
};

export const LogoLine: React.FC<LogoLineProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#dfff4f';
  const bg = L?.bg ?? '#0a0a0b';
  const ink = L?.ink ?? '#ffffff';
  const draw = E.inOutCubic(lin(f, 0, t(1.6)));
  const fill = lin(f, t(1.3), t(1.9));
  const glow = lin(f, t(1.8), t(2.4));
  const size = Math.min(220, 1700 / Math.max(3, [...p.name].length));
  const family = L && L.head !== fonts.sansJP ? L.head : fonts.display;
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={1080} height={420} viewBox="0 0 1080 420" style={{ marginTop: -120 }}>
        <text
          x={540}
          y={260}
          textAnchor="middle"
          fontFamily={family}
          fontWeight={800}
          fontSize={size}
          letterSpacing="-0.02em"
          fill={ink}
          fillOpacity={fill}
          stroke={accent}
          strokeWidth={4}
          // each glyph outline is drawn on its own; ~1400 covers one letter's perimeter at this size
          strokeDasharray={1400}
          strokeDashoffset={1400 * (1 - draw)}
          style={{ filter: glow > 0 ? `drop-shadow(0 0 ${30 * (1 - Math.abs(glow - 0.5) * 2)}px ${accent})` : undefined }}
        >
          {p.name}
        </text>
      </svg>
      {p.tagline ? (
        <div style={{ fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 40, color: ink, opacity: 0.75 * lin(f, t(1.7), t(2.2)), marginTop: 10 }}>{p.tagline}</div>
      ) : null}
    </AbsoluteFill>
  );
};
