// Motion styles, batch 4: kinetic type, review stars, a comparison table, stacked phone screens and a 3D bar chart.
// Each reads the reel's tone and manner through useLook() and keeps its own look without one.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, fmtNum, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

const useBase = (dark = true) => {
  const L = useLook();
  return {
    L,
    bg: L?.bg ?? (dark ? '#0b0b0d' : '#f5f3ee'),
    surface: L?.surface ?? (dark ? '#17171b' : '#ffffff'),
    ink: L?.ink ?? (dark ? '#f6f4ef' : '#141519'),
    muted: L?.muted ?? (dark ? 'rgba(246,244,239,.6)' : 'rgba(20,21,25,.55)'),
    head: L?.head ?? fonts.sansJP,
    body: L?.body ?? fonts.sansJP,
    headWeight: L?.headWeight ?? 900,
  };
};

// ---------- kinetic type: one word per beat, slammed in, the key word in the accent ----------

export type KineticTypeProps = {
  /** Short phrases, one per beat (2–6). */
  words: string[];
  /** Index of the word shown in the accent colour. */
  accentIndex?: number;
  accent?: string;
};

export const KineticType: React.FC<KineticTypeProps> = (p) => {
  const f = useCurrentFrame();
  const { durationInFrames: D } = useVideoConfig();
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ff4d2e';
  const words = p.words.slice(0, 6);
  const beat = D / words.length;
  const i = Math.min(words.length - 1, Math.floor(f / beat));
  const local = f - i * beat;
  const hit = springX(lin(local, 0, 10), 1.6, 5);
  const w = words[i];
  const isAccent = i === (p.accentIndex ?? words.length - 1);
  const size = Math.min(260, 940 / Math.max(2, [...w].length));
  const shake = local < 6 ? (rand(i * 7 + local) - 0.5) * 14 * (1 - local / 6) : 0;
  return (
    <AbsoluteFill style={{ background: isAccent ? accent : U.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {/* the previous words, faint, stacked behind */}
      {words.slice(0, i).map((pw, j) => (
        <div key={j} style={{ position: 'absolute', top: 300 + j * 150, width: '100%', textAlign: 'center', fontFamily: U.head, fontWeight: U.headWeight, fontSize: 110, color: isAccent ? U.L?.onAccent ?? '#111' : U.ink, opacity: 0.08 }}>
          {pw}
        </div>
      ))}
      <div
        style={{
          fontFamily: U.head,
          fontWeight: U.headWeight,
          fontSize: size,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          whiteSpace: 'nowrap',
          color: isAccent ? U.L?.onAccent ?? '#111' : U.ink,
          transform: `translate(${shake}px, ${shake * 0.6}px) scale(${mix(2.2, 1, hit)})`,
          opacity: Math.min(1, lin(local, 0, 3) * 1.2),
        }}
      >
        {w}
      </div>
    </AbsoluteFill>
  );
};

// ---------- review stars: a rating counts up, stars fill, quotes float by ----------

export type ReviewStarsProps = {
  rating: number;
  count?: string;
  source?: string;
  quotes: { text: string; who?: string }[];
  accent?: string;
};

export const ReviewStars: React.FC<ReviewStarsProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase(false);
  const gold = p.accent ?? U.L?.accent ?? '#f5b700';
  const r = p.rating * k(f, t(0.3), t(1.6));
  const quotes = p.quotes.slice(0, 3);
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      <div style={{ position: 'absolute', top: 260, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 200, color: U.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r, 1)}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 14, marginTop: 24 }}>
          {[0, 1, 2, 3, 4].map((i) => {
            const fill = Math.max(0, Math.min(1, r - i));
            const pop = springX(lin(f, t(0.3) + i * 5, t(0.9) + i * 5), 1.3, 6);
            return (
              <svg key={i} width={96} height={96} viewBox="0 0 24 24" style={{ transform: `scale(${pop})` }}>
                <defs>
                  <linearGradient id={`st${i}`}>
                    <stop offset={fill} stopColor={gold} />
                    <stop offset={fill} stopColor={U.L ? `color-mix(in srgb, ${U.ink} 14%, transparent)` : 'rgba(20,21,25,.12)'} />
                  </linearGradient>
                </defs>
                <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" fill={`url(#st${i})`} />
              </svg>
            );
          })}
        </div>
        {p.count || p.source ? (
          <div style={{ marginTop: 22, fontFamily: U.body, fontWeight: 700, fontSize: 32, color: U.muted, opacity: k(f, t(1.2), t(1.6)) }}>
            {[p.source, p.count].filter(Boolean).join(' · ')}
          </div>
        ) : null}
      </div>
      {quotes.map((q, i) => {
        const a = t(1.4) + i * ((D - t(1.8)) / quotes.length) * 0.6;
        const s = springX(lin(f, a, a + t(0.6)), 1.1, 6);
        const side = i % 2 ? 1 : -1;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: 900 + i * 250,
              left: i % 2 ? 200 : 70,
              right: i % 2 ? 70 : 200,
              padding: '30px 38px',
              borderRadius: 30,
              background: U.surface,
              boxShadow: '0 24px 60px rgba(0,0,0,.12)',
              transform: `translateX(${(1 - s) * side * 900}px) rotate(${side * -1.2}deg)`,
              fontFamily: U.body,
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 700, color: U.ink, lineHeight: 1.45 }}>“{q.text}”</div>
            {q.who ? <div style={{ marginTop: 10, fontSize: 24, color: U.muted }}>{q.who}</div> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- comparison table: us vs the usual way, ticks and crosses landing row by row ----------

export type CompareTableProps = {
  title?: string;
  us: string;
  them: string;
  rows: { label: string; us: boolean | string; them: boolean | string }[];
  accent?: string;
};

export const CompareTable: React.FC<CompareTableProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#3ddc84';
  const rows = p.rows.slice(0, 5);
  const step = (D - t(1.6)) / rows.length;
  const colGlow = k(f, D - t(1.0), D - t(0.6));
  const cell = (v: boolean | string, ours: boolean, on: number) =>
    typeof v === 'string' ? (
      <span style={{ fontWeight: 800, fontSize: 34, color: ours ? accent : U.muted }}>{v}</span>
    ) : (
      <span style={{ display: 'inline-grid', placeItems: 'center', width: 64, height: 64, borderRadius: 32, background: v ? (ours ? accent : U.muted) : 'transparent', border: v ? 'none' : `3px solid ${U.muted}`, color: v ? U.L?.onAccent ?? '#0b0b0d' : U.muted, fontSize: 36, fontWeight: 900, transform: `scale(${springX(on, 1.4, 6)})` }}>
        {v ? '✓' : '×'}
      </span>
    );
  return (
    <AbsoluteFill style={{ background: U.bg, fontFamily: U.body }}>
      {p.title ? <div style={{ position: 'absolute', top: 220, left: 80, right: 80, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink, opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      {/* our column highlight */}
      <div style={{ position: 'absolute', top: 420, left: 560, width: 230, height: 140 + rows.length * 150, borderRadius: 34, background: `color-mix(in srgb, ${accent} ${Math.round(12 + 10 * colGlow)}%, transparent)`, boxShadow: `0 0 0 ${3 * colGlow}px ${accent}`, opacity: k(f, t(0.2), t(0.6)) }} />
      <div style={{ position: 'absolute', top: 450, left: 60, right: 60, display: 'grid', gridTemplateColumns: '480px 230px 230px', alignItems: 'center', rowGap: 0 }}>
        <div />
        <div style={{ textAlign: 'center', fontWeight: 900, fontSize: 34, color: accent, height: 90 }}>{p.us}</div>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 30, color: U.muted, height: 90 }}>{p.them}</div>
        {rows.map((r, i) => {
          const on = lin(f, t(0.6) + i * step, t(0.6) + i * step + t(0.45));
          return (
            <React.Fragment key={i}>
              <div style={{ height: 150, display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: 38, color: U.ink, opacity: Math.min(1, on * 2), transform: `translateX(${(1 - E.outCubic(on)) * -60}px)`, borderTop: `2px solid ${U.L ? `color-mix(in srgb, ${U.ink} 8%, transparent)` : 'rgba(255,255,255,.07)'}` }}>{r.label}</div>
              <div style={{ textAlign: 'center' }}>{cell(r.us, true, on)}</div>
              <div style={{ textAlign: 'center', opacity: 0.85 }}>{cell(r.them, false, lin(f, t(0.75) + i * step, t(0.75) + i * step + t(0.45)))}</div>
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- phone stack: three screens fan out in 3D, each slides forward with its caption ----------

export type PhoneStackProps = {
  screens: { caption: string; image?: string }[];
  accent?: string;
};

export const PhoneStack: React.FC<PhoneStackProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#7c5cff';
  const screens = p.screens.slice(0, 3);
  const n = screens.length;
  const fan = k(f, 0, t(0.9), E.outExpo);
  const span = (D - t(1.1)) / n;
  const focusPos = Math.min(n - 1, Math.max(0, (f - t(1.0)) / span)); // 0..n-1, eased per step
  const fi = Math.floor(focusPos);
  const focus = fi + E.inOutCubic(Math.min(1, (focusPos - fi) * 2.2));
  return (
    <AbsoluteFill style={{ background: U.L ? `radial-gradient(80% 60% at 50% 45%, ${U.surface} 0%, ${U.bg} 75%)` : `radial-gradient(80% 60% at 50% 45%, #241b4a 0%, #0b0b12 75%)`, perspective: 2400, overflow: 'hidden' }}>
      {screens.map((s, i) => {
        const d = i - focus; // 0 = in front
        const x = 540 - 210 + d * 330 * fan;
        const z = -Math.abs(d) * 420 * fan;
        const ry = -d * 26 * fan;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: 470,
              width: 420,
              height: 880,
              borderRadius: 64,
              background: '#0d0d10',
              padding: 14,
              boxSizing: 'border-box',
              transform: `translateZ(${z}px) rotateY(${ry}deg) translateY(${(1 - springX(lin(f, i * 4, t(0.8) + i * 4), 1, 6)) * 1300}px)`,
              boxShadow: `0 60px 120px rgba(0,0,0,.45)${Math.abs(d) < 0.3 ? `, 0 0 0 4px ${accent}` : ''}`,
              zIndex: 10 - Math.round(Math.abs(d) * 3),
              opacity: 1 - Math.min(0.55, Math.abs(d) * 0.35),
            }}
          >
            <div style={{ width: '100%', height: '100%', borderRadius: 52, overflow: 'hidden', background: s.image ? '#000' : `linear-gradient(170deg, color-mix(in srgb, ${accent} 30%, #ffffff) 0%, #ffffff 55%)` }}>
              {s.image ? (
                <Img src={s.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ padding: '90px 34px' }}>
                  <div style={{ height: 30, width: 160, borderRadius: 15, background: accent, opacity: 0.85 }} />
                  {[220, 70, 70, 70].map((h, j) => (
                    <div key={j} style={{ height: h, borderRadius: 22, marginTop: 26, background: j === 0 ? `color-mix(in srgb, ${accent} 22%, #ffffff)` : 'rgba(0,0,0,.06)' }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {screens.map((s, i) => {
        const vis = Math.max(0, 1 - Math.abs(i - focus) * 2.5) * fan;
        return (
          <div key={i} style={{ position: 'absolute', bottom: 260, width: '100%', textAlign: 'center', fontFamily: U.head, fontWeight: U.headWeight, fontSize: 60, color: U.ink, opacity: vis, transform: `translateY(${(1 - vis) * 30}px)` }}>
            {s.caption}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- 3D bar chart: isometric blocks rise one by one, the last one in the accent ----------

export type Bars3dProps = {
  title?: string;
  bars: { label: string; value: number }[];
  unit?: string;
  accent?: string;
};

export const Bars3d: React.FC<Bars3dProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ff7a1a';
  const bars = p.bars.slice(0, 5);
  const max = Math.max(...bars.map((b) => b.value), 1);
  const W = 120, gap = 60, H = 820, DEP = 46, BASE_Y = 1500;
  const total = bars.length * W + (bars.length - 1) * gap;
  const base = U.L ? `color-mix(in srgb, ${U.ink} 22%, ${U.surface})` : '#3a3d48';
  return (
    <AbsoluteFill style={{ background: U.bg, overflow: 'hidden' }}>
      {p.title ? <div style={{ position: 'absolute', top: 220, left: 80, right: 80, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink, opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {bars.map((b, i) => {
          const g = springX(lin(f, t(0.4) + i * t(0.22), t(1.3) + i * t(0.22)), 0.8, 5);
          const h = Math.max(4, (b.value / max) * H * g);
          const last = i === bars.length - 1;
          const col = last ? accent : base;
          const x = 540 - total / 2 + i * (W + gap) - DEP / 2;
          const y = BASE_Y;
          return (
            <g key={i}>
              <rect x={x} y={y - h} width={W} height={h} fill={col} />
              <polygon points={`${x + W},${y - h} ${x + W + DEP},${y - h - DEP * 0.6} ${x + W + DEP},${y - DEP * 0.6} ${x + W},${y}`} fill={col} style={{ filter: 'brightness(.68)' }} />
              <polygon points={`${x},${y - h} ${x + DEP},${y - h - DEP * 0.6} ${x + W + DEP},${y - h - DEP * 0.6} ${x + W},${y - h}`} fill={col} style={{ filter: 'brightness(1.25)' }} />
              <text x={x + W / 2 + DEP / 2} y={y - h - DEP * 0.6 - 26} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={last ? 54 : 40} fill={last ? accent : U.ink} opacity={lin(g, 0.6, 1)}>
                {fmtNum(b.value * g)}
                {p.unit ? <tspan fontSize={24}>{p.unit}</tspan> : null}
              </text>
              <text x={x + W / 2} y={y + 60} textAnchor="middle" fontFamily={U.body} fontWeight={700} fontSize={30} fill={U.muted}>
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};
