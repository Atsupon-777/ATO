// Motion styles, batch 6: progress ring, two-number comparison, before/after wipe, a long page scrolling,
// vertical mincho copy and a gold line (kintsugi-like) reveal. Theme-aware through useLook().
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, fmtNum, k, lin, mix, springX } from './kit';
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

// ---------- progress ring ----------

export type ProgressRingProps = {
  value: number;
  unit?: string;
  label: string;
  sub?: string;
  accent?: string;
};

export const ProgressRing: React.FC<ProgressRingProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#7cf29c';
  const a2 = U.L?.accent2 ?? '#2fb7ff';
  const fill = k(f, t(0.3), t(2.0), E.inOutCubic);
  const done = springX(lin(f, t(2.0), t(2.6)), 1.3, 6);
  const R = 330, C = 2 * Math.PI * R;
  const frac = Math.min(1, p.value / 100);
  const tickN = 60;
  return (
    <AbsoluteFill style={{ background: U.bg, alignItems: 'center', justifyContent: 'center' }}>
      <svg width={1000} height={1000} viewBox="0 0 1000 1000" style={{ marginTop: -160, transform: `scale(${1 + 0.04 * done * (1 - lin(f, t(2.3), t(2.8)))})` }}>
        <defs>
          <linearGradient id="pr" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={accent} />
            <stop offset="1" stopColor={a2} />
          </linearGradient>
        </defs>
        {Array.from({ length: tickN }, (_, i) => {
          const a = (i / tickN) * Math.PI * 2 - Math.PI / 2;
          const on = i / tickN <= frac * fill;
          return <line key={i} x1={500 + Math.cos(a) * 430} y1={500 + Math.sin(a) * 430} x2={500 + Math.cos(a) * 455} y2={500 + Math.sin(a) * 455} stroke={on ? accent : U.muted} strokeOpacity={on ? 1 : 0.25} strokeWidth={6} strokeLinecap="round" />;
        })}
        <circle cx={500} cy={500} r={R} fill="none" stroke={U.L ? `color-mix(in srgb, ${U.ink} 10%, transparent)` : 'rgba(255,255,255,.08)'} strokeWidth={56} />
        <circle cx={500} cy={500} r={R} fill="none" stroke="url(#pr)" strokeWidth={56} strokeLinecap="round" strokeDasharray={`${C * frac * fill} ${C}`} transform="rotate(-90 500 500)" style={{ filter: `drop-shadow(0 0 ${20 + 30 * done}px color-mix(in srgb, ${accent} 50%, transparent))` }} />
        <text x={500} y={540} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={190} fill={U.ink}>
          {fmtNum(p.value * fill)}
          <tspan fontSize={80}>{p.unit ?? '%'}</tspan>
        </text>
      </svg>
      <div style={{ marginTop: 10, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink, opacity: k(f, t(1.0), t(1.5)) }}>{p.label}</div>
      {p.sub ? <div style={{ marginTop: 16, fontFamily: U.body, fontWeight: 700, fontSize: 34, color: U.muted, opacity: k(f, t(1.3), t(1.8)) }}>{p.sub}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- two numbers side by side ----------

export type VersusProps = {
  title?: string;
  before: { label: string; value: number; unit?: string };
  after: { label: string; value: number; unit?: string };
  /** A short verdict shown last, e.g. "1/3の時間に". */
  verdict?: string;
  accent?: string;
};

export const Versus: React.FC<VersusProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ff4d6d';
  const max = Math.max(p.before.value, p.after.value, 1);
  const g1 = k(f, t(0.4), t(1.3), E.outCubic);
  const g2 = k(f, t(1.0), t(1.9), E.outCubic);
  const v = springX(lin(f, t(2.0), t(2.6)), 1.3, 6);
  const H = 680;
  const col = (side: 'before' | 'after', g: number, x: number) => {
    const d = p[side];
    const hl = side === 'after';
    const h = (d.value / max) * H * g;
    return (
      <div style={{ position: 'absolute', left: x, bottom: 330, width: 360, textAlign: 'center' }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: hl ? 100 : 80, color: hl ? accent : U.muted, marginBottom: 18, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(d.value * g)}
          <span style={{ fontSize: 40 }}>{d.unit ?? ''}</span>
        </div>
        <div style={{ height: h, borderRadius: '28px 28px 8px 8px', background: hl ? accent : U.L ? `color-mix(in srgb, ${U.ink} 18%, ${U.bg})` : '#2c2e35', boxShadow: hl ? `0 0 70px color-mix(in srgb, ${accent} 40%, transparent)` : 'none' }} />
        <div style={{ marginTop: 26, fontFamily: U.body, fontWeight: 800, fontSize: 38, color: hl ? U.ink : U.muted }}>{d.label}</div>
      </div>
    );
  };
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      {p.title ? <div style={{ position: 'absolute', top: 220, left: 80, right: 80, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink, opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      {col('before', g1, 120)}
      {col('after', g2, 600)}
      {p.verdict ? (
        <div style={{ position: 'absolute', top: 400, left: 0, right: 0, textAlign: 'center' }}>
          <span style={{ display: 'inline-block', padding: '20px 44px', borderRadius: 99, background: U.ink, color: U.bg, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 50, transform: `scale(${v}) rotate(${-3 * v}deg)` }}>{p.verdict}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- before / after wipe ----------

export type BeforeAfterProps = {
  before: { label: string; image?: string; lines?: string[] };
  after: { label: string; image?: string; lines?: string[] };
  accent?: string;
};

export const BeforeAfter: React.FC<BeforeAfterProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase(false);
  const accent = p.accent ?? U.L?.accent ?? '#2f6bff';
  // the handle sweeps right→left revealing "after", peeks back, then settles fully open
  const x = 1080 * (1 - k(f, t(0.8), t(2.0), E.inOutCubic)) + Math.sin(lin(f, t(2.0), t(2.8)) * Math.PI) * 220;
  const handleX = Math.max(40, Math.min(1040, x));
  const panel = (d: BeforeAfterProps['before'], after: boolean) => (
    <AbsoluteFill style={{ background: after ? U.surface : U.L ? `color-mix(in srgb, ${U.ink} 6%, ${U.bg})` : '#e9e6df' }}>
      {d.image ? (
        <Img src={d.image} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: after ? 'none' : 'grayscale(.7) contrast(.9)' }} />
      ) : (
        <div style={{ position: 'absolute', top: 520, left: 90, right: 90, display: 'grid', gap: 26 }}>
          {(d.lines ?? []).slice(0, 5).map((l, i) => (
            <div key={i} style={{ padding: '30px 36px', borderRadius: 26, background: after ? `color-mix(in srgb, ${accent} 10%, ${U.surface})` : U.L ? U.surface : '#f7f5f0', fontFamily: U.body, fontWeight: 700, fontSize: 38, color: after ? U.ink : U.muted, textDecoration: after ? 'none' : 'line-through', textDecorationThickness: 3, display: 'flex', alignItems: 'center', gap: 18 }}>
              <span style={{ width: 44, height: 44, borderRadius: 22, display: 'inline-grid', placeItems: 'center', background: after ? accent : 'transparent', border: after ? 'none' : `3px solid ${U.muted}`, color: U.L?.onAccent ?? '#fff', fontSize: 26, fontWeight: 900 }}>{after ? '✓' : ''}</span>
              {l}
            </div>
          ))}
        </div>
      )}
      <div style={{ position: 'absolute', top: 260, [after ? 'right' : 'left']: 80, padding: '14px 32px', borderRadius: 99, background: after ? accent : U.ink, color: after ? U.L?.onAccent ?? '#fff' : U.bg, fontFamily: U.head, fontWeight: 900, fontSize: 40 } as React.CSSProperties}>{d.label}</div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      {panel(p.after, true)}
      <AbsoluteFill style={{ clipPath: `inset(0 ${1080 - handleX}px 0 0)` }}>{panel(p.before, false)}</AbsoluteFill>
      <div style={{ position: 'absolute', left: handleX - 3, top: 0, bottom: 0, width: 6, background: '#fff', boxShadow: '0 0 30px rgba(0,0,0,.25)', opacity: f < D - 2 ? 1 : 0 }} />
      <div style={{ position: 'absolute', left: handleX - 50, top: 910, width: 100, height: 100, borderRadius: 50, background: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,.25)', display: 'grid', placeItems: 'center', fontSize: 40, color: '#222', fontWeight: 900 }}>‹ ›</div>
    </AbsoluteFill>
  );
};

// ---------- long page scrolling inside a phone ----------

export type ScrollPageProps = {
  site: string;
  /** Sections of the page, top to bottom: a heading and an optional image each. */
  sections: { heading: string; image?: string }[];
  accent?: string;
};

export const ScrollPage: React.FC<ScrollPageProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ff7a1a';
  const secs = p.sections.slice(0, 6);
  const SEC = 620;
  const pageH = secs.length * SEC;
  const viewH = 1380;
  const scroll = (pageH - viewH + 200) * k(f, t(0.8), D - t(0.6), E.inOutCubic);
  const enter = springX(lin(f, 0, t(0.8)), 0.9, 6);
  return (
    <AbsoluteFill style={{ background: U.L ? `radial-gradient(80% 60% at 50% 40%, ${U.surface} 0%, ${U.bg} 75%)` : 'radial-gradient(80% 60% at 50% 40%, #2a1d12 0%, #0b0b0d 75%)', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 680, height: viewH + 60, borderRadius: 80, background: '#0d0d10', padding: 22, boxSizing: 'border-box', boxShadow: '0 60px 140px rgba(0,0,0,.5)', transform: `translateY(${(1 - enter) * 1400}px) rotate(${(1 - enter) * 6}deg)` }}>
        <div style={{ width: '100%', height: '100%', borderRadius: 60, overflow: 'hidden', background: '#fff', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 90, background: 'rgba(255,255,255,.92)', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 24, color: '#666' }}>{p.site}</div>
          <div style={{ transform: `translateY(${90 - scroll}px)` }}>
            {secs.map((s, i) => (
              <div key={i} style={{ height: SEC, padding: '50px 44px', boxSizing: 'border-box', background: i % 2 ? '#f6f4ef' : '#fff' }}>
                <div style={{ fontFamily: U.L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: i === 0 ? 58 : 44, color: '#15161a', lineHeight: 1.25 }}>{s.heading}</div>
                {s.image ? (
                  <Img src={s.image} style={{ width: '100%', height: 360, objectFit: 'cover', borderRadius: 24, marginTop: 30 }} />
                ) : (
                  <div style={{ height: 360, borderRadius: 24, marginTop: 30, background: `linear-gradient(135deg, color-mix(in srgb, ${accent} ${30 + (i % 3) * 15}%, #fff), color-mix(in srgb, ${accent} 8%, #fff))` }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- vertical mincho copy ----------

export type VerticalCopyProps = {
  /** Lines set top to bottom, right to left (2–4 short lines). */
  lines: string[];
  seal?: string;
  accent?: string;
};

export const VerticalCopy: React.FC<VerticalCopyProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#f2ede2';
  const ink = L?.ink ?? '#1b1916';
  const red = p.accent ?? L?.accent ?? '#b8342a';
  const lines = p.lines.slice(0, 4);
  const per = (D - t(1.6)) / lines.length;
  const size = Math.min(110, 1300 / Math.max(...lines.map((l) => [...l].length), 1));
  const sealIn = springX(lin(f, D - t(1.2), D - t(0.7)), 1.2, 6);
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      {/* paper fibres */}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(97deg, rgba(0,0,0,.018) 0 2px, transparent 2px 9px)' }} />
      <div style={{ position: 'absolute', top: 260, right: 140, display: 'flex', flexDirection: 'row-reverse', gap: size * 0.7 }}>
        {lines.map((l, i) => {
          const cs = [...l];
          const a = t(0.4) + i * per;
          return (
            <div key={i} style={{ writingMode: 'vertical-rl', fontFamily: L?.head ?? fonts.minchoJP, fontWeight: 700, fontSize: size, lineHeight: 1, letterSpacing: '0.18em', color: ink }}>
              {cs.map((c, j) => {
                const o = lin(f, a + j * 2.4, a + j * 2.4 + 10);
                return (
                  <span key={j} style={{ opacity: o, filter: `blur(${(1 - o) * 6}px)`, display: 'inline-block', transform: `translateY(${(1 - o) * -16}px)` }}>
                    {c}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
      {p.seal ? (
        <div style={{ position: 'absolute', left: 150, bottom: 360, width: 150, height: 150, borderRadius: 14, border: `8px solid ${red}`, color: red, display: 'grid', placeItems: 'center', fontFamily: fonts.minchoJP, fontWeight: 800, fontSize: 70, transform: `scale(${mix(1.8, 1, sealIn)}) rotate(-4deg)`, opacity: sealIn > 0 ? Math.min(1, sealIn * 1.4) * 0.92 : 0 }}>
          {p.seal}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- gold line ----------

export type GoldLineProps = {
  title: string;
  sub?: string;
  accent?: string;
};

export const GoldLine: React.FC<GoldLineProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#0c0b0a';
  const gold = p.accent ?? L?.accent ?? '#d9b46a';
  const ink = L?.ink ?? '#f4ecdc';
  const draw = k(f, t(0.2), t(2.0), E.inOutCubic);
  const shine = lin(f, t(1.8), t(2.6));
  const txt = k(f, t(1.6), t(2.3));
  // a crack-like path across the frame, the way gold repairs follow a break
  const d = 'M -20 760 L 180 700 L 260 790 L 420 720 L 520 840 L 640 760 L 760 810 L 880 700 L 1100 760 M 520 840 L 560 1000 L 500 1160 M 760 810 L 820 960';
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 50% at 50% 45%, color-mix(in srgb, ${bg} 80%, #3a3026) 0%, ${bg} 75%)` }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <linearGradient id="gl" x1="0" x2="1">
            <stop offset={Math.max(0, shine - 0.15)} stopColor={gold} />
            <stop offset={shine} stopColor="#fff6dc" />
            <stop offset={Math.min(1, shine + 0.15)} stopColor={gold} />
          </linearGradient>
        </defs>
        <path d={d} fill="none" stroke={gold} strokeOpacity={0.35} strokeWidth={22} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} style={{ filter: 'blur(10px)' }} />
        <path d={d} fill="none" stroke="url(#gl)" strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
      </svg>
      <div style={{ position: 'absolute', top: 1240, width: '100%', textAlign: 'center', opacity: txt, transform: `translateY(${(1 - txt) * 30}px)` }}>
        <div style={{ fontFamily: L?.head ?? fonts.minchoJP, fontWeight: 700, fontSize: 86, letterSpacing: '0.12em', color: ink }}>{p.title}</div>
        {p.sub ? <div style={{ marginTop: 26, fontFamily: L?.body ?? fonts.minchoJP, fontSize: 36, letterSpacing: '0.3em', color: gold }}>{p.sub}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
