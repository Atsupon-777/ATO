// Motion styles, batch 5: donut chart, ranking race, split-flap board, typewriter, pins dropping on a map,
// and a search that finds the answer. All theme-aware through useLook(), with their own look otherwise.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
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

const Title: React.FC<{ text?: string; U: ReturnType<typeof useBase>; f: number; top?: number }> = ({ text, U, f, top = 220 }) =>
  text ? (
    <div style={{ position: 'absolute', top, left: 80, right: 80, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink, lineHeight: 1.2, opacity: k(f, 0, 12), transform: `translateY(${(1 - k(f, 0, 15, E.outExpo)) * 40}px)` }}>
      {text}
    </div>
  ) : null;

// ---------- donut chart ----------

export type DonutProps = {
  title?: string;
  /** Slices in order; the first is the highlighted one and its percentage counts up in the middle. */
  slices: { label: string; value: number }[];
  accent?: string;
};

export const Donut: React.FC<DonutProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#3ddc84';
  const slices = p.slices.slice(0, 5);
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  const grow = k(f, t(0.3), t(1.8), E.inOutCubic);
  const spin = mix(-140, -90, k(f, 0, t(1.8), E.outCubic));
  const R = 300, SW = 110, C = 2 * Math.PI * R;
  const shade = (i: number) => (i === 0 ? accent : U.L ? `color-mix(in srgb, ${U.ink} ${40 - i * 8}%, ${U.bg})` : `rgba(246,244,239,${0.42 - i * 0.08})`);
  let acc = 0;
  const pct = (slices[0]?.value / sum) * 100;
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      <Title text={p.title} U={U} f={f} />
      <svg width={1080} height={1080} viewBox="0 0 1080 1080" style={{ position: 'absolute', top: 400 }}>
        <g transform={`rotate(${spin} 540 540)`}>
          {slices.map((s, i) => {
            const frac = (s.value / sum) * grow;
            const off = acc;
            acc += (s.value / sum) * grow;
            const pop = i === 0 ? springX(lin(f, t(1.8), t(2.4)), 1.2, 6) : 0;
            return (
              <circle
                key={i}
                cx={540}
                cy={540}
                r={R + pop * 18}
                fill="none"
                stroke={shade(i)}
                strokeWidth={SW + pop * 20}
                strokeDasharray={`${Math.max(0, frac * C - 6)} ${C}`}
                strokeDashoffset={-off * C}
              />
            );
          })}
        </g>
        <text x={540} y={560} textAnchor="middle" fontFamily={fonts.display} fontWeight={800} fontSize={150} fill={U.ink}>
          {fmtNum(pct * grow)}
          <tspan fontSize={70}>%</tspan>
        </text>
        <text x={540} y={640} textAnchor="middle" fontFamily={U.body} fontWeight={700} fontSize={38} fill={accent}>
          {slices[0]?.label}
        </text>
      </svg>
      <div style={{ position: 'absolute', top: 1520, left: 90, right: 90, display: 'flex', flexWrap: 'wrap', gap: '18px 40px', justifyContent: 'center' }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: U.body, fontWeight: 700, fontSize: 32, color: U.ink, opacity: k(f, t(1.2) + i * 3, t(1.6) + i * 3) }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: shade(i) }} />
            {s.label} {Math.round((s.value / sum) * 100)}%
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------- ranking race ----------

export type RankingRaceProps = {
  title?: string;
  /** Each item's values over the periods; bars re-sort as they grow. */
  items: { label: string; values: number[] }[];
  periods: string[];
  unit?: string;
  /** The item to highlight (usually the brand). */
  highlight?: string;
  accent?: string;
};

export const RankingRace: React.FC<RankingRaceProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ffcc00';
  const items = p.items.slice(0, 6);
  const n = p.periods.length;
  const pos = (n - 1) * k(f, t(0.5), D - t(0.8), E.inOutCubic);
  const i0 = Math.floor(pos), fr = pos - i0;
  const val = (it: (typeof items)[number]) => mix(it.values[i0] ?? 0, it.values[Math.min(n - 1, i0 + 1)] ?? 0, fr);
  const vals = items.map(val);
  const max = Math.max(...vals, 1);
  // a smooth rank: how many items are ahead, softened so rows glide past each other instead of jumping
  const rankOf = (i: number) => vals.reduce((a, v, j) => (j === i ? a : a + 1 / (1 + Math.exp(-(v - vals[i]) / (max * 0.02)))), 0);
  const ROW = 150, TOP = 470;
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      <Title text={p.title} U={U} f={f} />
      <div style={{ position: 'absolute', right: 80, top: 1450, fontFamily: fonts.display, fontWeight: 800, fontSize: 120, color: U.muted, opacity: 0.6 }}>{p.periods[Math.round(pos)]}</div>
      {items.map((it, i) => {
        const r = rankOf(i);
        const hl = it.label === p.highlight;
        const w = (vals[i] / max) * 640 * k(f, t(0.1), t(0.6));
        return (
          <div key={it.label} style={{ position: 'absolute', left: 80, top: TOP + r * ROW, display: 'flex', alignItems: 'center', gap: 22, transition: 'none' }}>
            <div style={{ width: 52, fontFamily: fonts.display, fontWeight: 800, fontSize: 40, color: hl ? accent : U.muted }}>{Math.round(r) + 1}</div>
            <div>
              <div style={{ fontFamily: U.body, fontWeight: 800, fontSize: 32, color: U.ink, marginBottom: 10 }}>{it.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: Math.max(8, w), height: 54, borderRadius: 12, background: hl ? accent : U.L ? `color-mix(in srgb, ${U.ink} 22%, ${U.bg})` : '#33353d', boxShadow: hl ? `0 0 40px color-mix(in srgb, ${accent} 45%, transparent)` : 'none' }} />
                <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 34, color: hl ? accent : U.ink, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtNum(vals[i])}
                  {p.unit ?? ''}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- split-flap board ----------

export type FlapBoardProps = {
  /** Up to 4 lines, each up to 10 characters. */
  lines: string[];
  label?: string;
  accent?: string;
};

const FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-';

export const FlapBoard: React.FC<FlapBoardProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ffcc00';
  const lines = p.lines.slice(0, 4).map((l) => [...l.slice(0, 10)]);
  const cols = Math.max(...lines.map((l) => l.length), 1);
  const cw = Math.min(92, 940 / cols - 8);
  return (
    <AbsoluteFill style={{ background: U.L ? U.bg : '#101012', alignItems: 'center', justifyContent: 'center' }}>
      {p.label ? <div style={{ position: 'absolute', top: 360, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 44, fontWeight: 700, letterSpacing: '0.3em', color: accent }}>{p.label}</div> : null}
      <div style={{ display: 'grid', gap: 18 }}>
        {lines.map((l, r) => (
          <div key={r} style={{ display: 'flex', gap: 8 }}>
            {Array.from({ length: cols }, (_, c) => {
              const target = l[c] ?? ' ';
              const stop = t(0.5) + r * t(0.35) + c * 3 + Math.floor(rand(r * 31 + c) * 10);
              const spinning = f < stop;
              const ch = spinning ? FLAP_CHARS[Math.floor(rand(f * 3 + c * 7 + r * 11) * FLAP_CHARS.length)] : target;
              const flip = spinning ? (f % 2) * 0.5 : Math.max(0, 1 - (f - stop) / 3) * 0.5;
              return (
                <div key={c} style={{ position: 'relative', width: cw, height: cw * 1.35, borderRadius: 10, background: '#1d1d22', boxShadow: 'inset 0 -3px 0 rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  <span style={{ fontFamily: `ui-monospace, Menlo, ${fonts.sansJP}`, fontWeight: 800, fontSize: cw * 0.9, color: r === lines.length - 1 && !spinning ? accent : '#f2f0ea', transform: `scaleY(${1 - flip})` }}>{ch}</span>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 2, background: '#0a0a0c' }} />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------- typewriter / terminal ----------

export type TypewriterProps = {
  /** Lines typed one after another; the last stays with a blinking caret. */
  lines: string[];
  terminal?: boolean;
  accent?: string;
};

export const Typewriter: React.FC<TypewriterProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase(!!p.terminal);
  const accent = p.accent ?? U.L?.accent ?? (p.terminal ? '#3ddc84' : '#d4402b');
  const lines = p.lines.slice(0, 5);
  const total = lines.reduce((a, l) => a + [...l].length, 0);
  const cps = Math.max(10, total / ((D - t(1.2)) / fps)); // characters per second, fits the scene
  let left = Math.max(0, ((f - t(0.3)) / fps) * cps);
  const shown = lines.map((l) => {
    const cs = [...l];
    const n = Math.min(cs.length, Math.floor(left));
    left -= cs.length + 2; // a short pause at each line end
    return cs.slice(0, n).join('');
  });
  const curLine = Math.max(0, shown.findIndex((s, i) => s.length < [...lines[i]].length));
  const caretOn = Math.floor(f / 15) % 2 === 0;
  const mono = p.terminal;
  return (
    <AbsoluteFill style={{ background: mono ? (U.L ? U.bg : '#0c0f0d') : U.L ? U.bg : '#f3eee3', padding: '0 80px', justifyContent: 'center' }}>
      {mono ? (
        <div style={{ position: 'absolute', top: 300, left: 80, display: 'flex', gap: 12 }}>
          {['#ff5f57', '#febc2e', '#28c840'].map((c) => <div key={c} style={{ width: 22, height: 22, borderRadius: 11, background: c }} />)}
        </div>
      ) : null}
      {shown.map((s, i) => (
        <div key={i} style={{ fontFamily: mono ? `ui-monospace, Menlo, ${fonts.sansJP}` : U.L?.head ?? fonts.minchoJP, fontWeight: mono ? 600 : 700, fontSize: mono ? 46 : 64, lineHeight: 1.5, color: i === lines.length - 1 ? accent : U.ink, minHeight: mono ? 69 : 96 }}>
          {mono ? <span style={{ color: accent }}>{'> '}</span> : null}
          {s}
          {i === (curLine === -1 ? lines.length - 1 : curLine) && caretOn ? <span style={{ display: 'inline-block', width: mono ? 24 : 6, height: mono ? 46 : 64, marginLeft: 4, verticalAlign: 'middle', background: accent }} /> : null}
        </div>
      ))}
    </AbsoluteFill>
  );
};

// ---------- pins dropping on a map ----------

export type PinDropProps = {
  title?: string;
  /** How many places; pins drop across a stylised area map. */
  count: number;
  label?: string;
  accent?: string;
};

export const PinDrop: React.FC<PinDropProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase(false);
  const accent = p.accent ?? U.L?.accent ?? '#ff3b5c';
  const shown = Math.min(40, p.count);
  const land = U.L ? `color-mix(in srgb, ${U.ink} 8%, ${U.surface})` : '#e7e3da';
  const tilt = k(f, 0, t(1.2), E.inOutCubic);
  const counter = Math.round(p.count * k(f, t(0.5), D - t(1.0)));
  return (
    <AbsoluteFill style={{ background: U.bg, overflow: 'hidden' }}>
      <Title text={p.title} U={U} f={f} />
      <div style={{ position: 'absolute', left: 90, top: 470, width: 900, height: 1000, perspective: 1800 }}>
        <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transform: `rotateX(${mix(0, 38, tilt)}deg) scale(${mix(1, 1.05, tilt)})` }}>
          <svg width={900} height={1000} viewBox="0 0 900 1000">
            {/* a stylised area: blobs and a river, not a real map */}
            <path d="M80 160 Q260 60 470 120 T820 180 Q880 420 800 640 T560 930 Q300 960 160 820 T70 420 Z" fill={land} />
            <path d="M120 620 Q330 520 470 600 T840 470" fill="none" stroke={U.L ? `color-mix(in srgb, ${accent} 25%, ${U.surface})` : '#bcd7ee'} strokeWidth={26} strokeLinecap="round" />
            {[200, 380, 560, 740].map((y) => <line key={y} x1={60} x2={860} y1={y} y2={y + 30} stroke={U.L ? `color-mix(in srgb, ${U.ink} 12%, transparent)` : '#d8d3c7'} strokeWidth={6} />)}
            {[230, 450, 670].map((x) => <line key={x} x1={x} x2={x + 40} y1={90} y2={940} stroke={U.L ? `color-mix(in srgb, ${U.ink} 12%, transparent)` : '#d8d3c7'} strokeWidth={6} />)}
          </svg>
          {Array.from({ length: shown }, (_, i) => {
            const x = 140 + rand(i * 3 + 1) * 620, y = 200 + rand(i * 3 + 2) * 640;
            const at = t(0.6) + (i / shown) * (D - t(1.8));
            const d = lin(f, at, at + 9);
            const bounce = springX(d, 1.4, 5);
            return (
              <div key={i} style={{ position: 'absolute', left: x - 22, top: y - 60, width: 44, height: 60, transform: `translateY(${(1 - bounce) * -500}px) rotateX(${-mix(0, 38, tilt)}deg)`, transformOrigin: 'bottom center', opacity: d > 0 ? 1 : 0 }}>
                <svg width={44} height={60} viewBox="0 0 24 32">
                  <path d="M12 0C5.4 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.6 0 12 0z" fill={accent} />
                  <circle cx={12} cy={11.5} r={4.5} fill="#fff" />
                </svg>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 230, width: '100%', textAlign: 'center' }}>
        <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 150, color: U.ink, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(counter)}</span>
        {p.label ? <span style={{ fontFamily: U.body, fontWeight: 800, fontSize: 48, color: accent, marginLeft: 14 }}>{p.label}</span> : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- search that finds the answer ----------

export type SearchFindProps = {
  query: string;
  /** The result card that answers it (the brand). */
  result: { name: string; text: string; tag?: string };
  /** Plain results shown greyed under it. */
  others?: string[];
  accent?: string;
};

export const SearchFind: React.FC<SearchFindProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase(false);
  const accent = p.accent ?? U.L?.accent ?? '#2f6bff';
  const q = [...p.query];
  const typed = q.slice(0, Math.floor(lin(f, t(0.4), t(0.4) + q.length * 3) * q.length)).join('');
  const press = lin(f, t(0.5) + q.length * 3, t(0.5) + q.length * 3 + 5);
  const resAt = t(0.7) + q.length * 3;
  const hero = springX(lin(f, resAt, resAt + t(0.6)), 1.1, 6);
  const glow = k(f, resAt + t(0.9), resAt + t(1.3));
  const others = (p.others ?? []).slice(0, 3);
  const barY = mix(820, 360, k(f, resAt - 6, resAt + 8, E.inOutCubic));
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      <div style={{ position: 'absolute', left: 70, right: 70, top: barY, height: 120, borderRadius: 60, background: U.surface, boxShadow: '0 18px 50px rgba(0,0,0,.12)', display: 'flex', alignItems: 'center', gap: 22, padding: '0 40px', transform: `scale(${1 - 0.03 * press * (1 - press) * 4})` }}>
        <svg width={44} height={44} viewBox="0 0 24 24"><circle cx={10} cy={10} r={7} fill="none" stroke={U.muted} strokeWidth={2.5} /><path d="M15 15l6 6" stroke={U.muted} strokeWidth={2.5} strokeLinecap="round" /></svg>
        <span style={{ fontFamily: U.body, fontWeight: 700, fontSize: 42, color: U.ink }}>{typed}</span>
        {Math.floor(f / 14) % 2 === 0 && press === 0 ? <span style={{ width: 4, height: 50, background: accent }} /> : null}
      </div>
      <div style={{ position: 'absolute', left: 70, right: 70, top: 540, opacity: hero > 0 ? 1 : 0, transform: `translateY(${(1 - hero) * 200}px)` }}>
        <div style={{ padding: '44px 46px', borderRadius: 36, background: U.surface, boxShadow: `0 0 0 ${4 * glow}px ${accent}, 0 30px 80px color-mix(in srgb, ${accent} ${Math.round(10 + 20 * glow)}%, transparent)`, fontFamily: U.body }}>
          {p.result.tag ? <div style={{ display: 'inline-block', padding: '8px 20px', borderRadius: 99, background: accent, color: U.L?.onAccent ?? '#fff', fontWeight: 800, fontSize: 24 }}>{p.result.tag}</div> : null}
          <div style={{ marginTop: 18, fontFamily: U.head, fontWeight: U.headWeight, fontSize: 56, color: U.ink }}>{p.result.name}</div>
          <div style={{ marginTop: 12, fontSize: 34, color: U.muted, lineHeight: 1.5 }}>{p.result.text}</div>
        </div>
        {others.map((o, i) => (
          <div key={i} style={{ marginTop: 26, padding: '30px 46px', borderRadius: 30, background: U.surface, opacity: 0.45 * k(f, resAt + 6 + i * 4, resAt + 16 + i * 4), fontFamily: U.body, fontWeight: 700, fontSize: 32, color: U.ink }}>
            {o}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
