// Motion styles, batch 10 (3D and materials): puffy floating icons, liquid blobs, glass cards,
// extruded 3D text, clay shapes and handwriting. All drawn in code, theme-aware through useLook().
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

// simple line glyphs for the icons (24x24 paths), so nothing depends on an icon font
const GLYPHS: Record<string, string> = {
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5',
  chat: 'M4 5h16v11H9l-5 4z',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  star: 'M12 3l2.7 6 6.3.6-4.8 4.2 1.5 6.2L12 16.8 6.3 20l1.5-6.2L3 9.6 9.3 9z',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 20h4',
  chart: 'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  cart: 'M3 4h3l2 11h11l2-8H7 M9 20a1 1 0 1 0 0.01 0 M18 20a1 1 0 1 0 0.01 0',
  clock: 'M12 3a9 9 0 1 0 0.01 0z M12 7v5l3 3',
};
export const iconIds = Object.keys(GLYPHS);

// ---------- puffy floating icons ----------

export type FloatIconsProps = {
  title?: string;
  /** Up to 6 features: an icon id and a short label. */
  items: { icon: string; label: string }[];
  accent?: string;
};

export const FloatIcons: React.FC<FloatIconsProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#eef1ff';
  const ink = L?.ink ?? '#1a1d2e';
  const hues = [250, 330, 190, 30, 140, 280];
  const items = p.items.slice(0, 6);
  const spots = [
    { x: 90, y: 500 }, { x: 560, y: 440 }, { x: 290, y: 840 },
    { x: 660, y: 920 }, { x: 90, y: 1200 }, { x: 520, y: 1310 },
  ];
  return (
    <AbsoluteFill style={{ background: L ? `radial-gradient(80% 60% at 50% 40%, ${L.surface} 0%, ${bg} 75%)` : 'radial-gradient(80% 60% at 50% 40%, #ffffff 0%, #e6eaff 75%)', overflow: 'hidden' }}>
      {p.title ? <div style={{ position: 'absolute', top: 220, width: '100%', textAlign: 'center', fontFamily: L?.head ?? `"M PLUS Rounded 1c", ${fonts.sansJP}`, fontWeight: 800, fontSize: 70, color: ink, opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      {items.map((it, i) => {
        const s = spots[i];
        const pop = springX(lin(f, t(0.3) + i * 5, t(1.0) + i * 5), 1.4, 5);
        const bob = Math.sin(f / fps * 1.6 + i * 1.3) * 16;
        const tilt = Math.sin(f / fps * 1.1 + i) * 6;
        const h = L ? 0 : hues[i];
        const top = L ? `color-mix(in srgb, ${i % 2 ? L.accent2 : L.accent} 60%, #fff)` : `hsl(${h} 90% 78%)`;
        const bot = L ? (i % 2 ? L.accent2 : L.accent) : `hsl(${h} 80% 58%)`;
        return (
          <div key={i} style={{ position: 'absolute', left: s.x, top: s.y + bob, width: 320, textAlign: 'center', transform: `scale(${pop}) rotate(${tilt}deg)` }}>
            <div style={{ width: 220, height: 220, margin: '0 auto', borderRadius: 66, background: `linear-gradient(160deg, ${top} 0%, ${bot} 100%)`, boxShadow: `inset 0 -16px 30px rgba(0,0,0,.18), inset 0 14px 24px rgba(255,255,255,.65), 0 40px 60px -10px color-mix(in srgb, ${bot} 55%, transparent)`, display: 'grid', placeItems: 'center' }}>
              <svg width={120} height={120} viewBox="0 0 24 24" style={{ filter: 'drop-shadow(0 4px 4px rgba(0,0,0,.18))' }}>
                <path d={GLYPHS[it.icon] ?? GLYPHS.star} fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ marginTop: 24, fontFamily: L?.body ?? `"M PLUS Rounded 1c", ${fonts.sansJP}`, fontWeight: 800, fontSize: 38, color: ink, opacity: k(f, t(0.8) + i * 5, t(1.2) + i * 5) }}>{it.label}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- liquid blobs ----------

export type LiquidProps = {
  title: string;
  sub?: string;
  accent?: string;
};

export const Liquid: React.FC<LiquidProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const a1 = p.accent ?? L?.accent ?? '#ff6fa8';
  const a2 = L?.accent2 ?? '#7a6bff';
  const bg = L?.bg ?? '#fff3f6';
  const T = f / fps;
  const merge = k(f, D - t(1.6), D - t(0.6), E.inOutCubic); // all drops pool into one at the end
  const blobs = Array.from({ length: 7 }, (_, i) => {
    const r = 120 + rand(i) * 110;
    const x = 540 + Math.cos(T * (0.5 + rand(i + 3) * 0.6) + i * 2) * (180 + rand(i + 5) * 160);
    const y = 860 + Math.sin(T * (0.6 + rand(i + 7) * 0.5) + i) * (260 + rand(i + 9) * 160);
    return { x: mix(x, 540, merge), y: mix(y, 880, merge), r: mix(r, i === 0 ? 330 : 40, merge) };
  });
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="goo">
            <feGaussianBlur stdDeviation={34} />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 36 -16" />
          </filter>
          <linearGradient id="lq" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a1} />
            <stop offset="1" stopColor={a2} />
          </linearGradient>
          <radialGradient id="hl" cx="0.35" cy="0.3" r="0.5">
            <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <stop offset="1" stopColor="#fff" stopOpacity={0} />
          </radialGradient>
        </defs>
        <g filter="url(#goo)">
          {blobs.map((b, i) => <circle key={i} cx={b.x} cy={b.y} r={b.r * k(f, i * 3, t(0.8) + i * 3, E.outBack)} fill="url(#lq)" />)}
        </g>
        <g filter="url(#goo)" opacity={0.7}>
          {blobs.map((b, i) => <circle key={i} cx={b.x - b.r * 0.25} cy={b.y - b.r * 0.3} r={b.r * 0.45 * k(f, i * 3, t(0.8) + i * 3)} fill="url(#hl)" />)}
        </g>
      </svg>
      <div style={{ position: 'absolute', top: 820, width: '100%', textAlign: 'center', fontFamily: L?.head ?? `"M PLUS Rounded 1c", ${fonts.sansJP}`, fontWeight: 800, fontSize: 92, color: '#fff', textShadow: '0 6px 30px rgba(0,0,0,.18)', opacity: merge }}>{p.title}</div>
      {p.sub ? <div style={{ position: 'absolute', top: 1340, width: '100%', textAlign: 'center', fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 40, color: L?.ink ?? '#3a2b33', opacity: merge }}>{p.sub}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- glass cards ----------

export type GlassCardsProps = {
  title?: string;
  /** Up to 3 cards: a small label and a big value. */
  cards: { label: string; value: string }[];
  accent?: string;
};

export const GlassCards: React.FC<GlassCardsProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const a1 = p.accent ?? L?.accent ?? '#4f7cff';
  const a2 = L?.accent2 ?? '#ff5fa2';
  const T = f / fps;
  const cards = p.cards.slice(0, 3);
  return (
    <AbsoluteFill style={{ background: L?.bg ?? '#0b0d18', overflow: 'hidden' }}>
      {/* colour blobs behind the glass */}
      {[a1, a2, '#ffc94f'].map((c, i) => (
        <div key={i} style={{ position: 'absolute', left: 540 + Math.cos(T * 0.7 + i * 2.1) * 260 - 280, top: 900 + Math.sin(T * 0.6 + i * 1.7) * 380 - 280, width: 560, height: 560, borderRadius: '50%', background: c, filter: 'blur(70px)', opacity: 0.75 }} />
      ))}
      {p.title ? <div style={{ position: 'absolute', top: 220, left: 80, right: 80, fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 66, color: '#fff', opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      {cards.map((c, i) => {
        const s = springX(lin(f, t(0.3) + i * t(0.25), t(1.1) + i * t(0.25)), 1, 6);
        const y = 480 + i * 360;
        const rx = Math.sin(T * 0.9 + i) * 6;
        return (
          <div key={i} style={{ position: 'absolute', left: 90 + (i % 2) * 90, top: y, width: 810, height: 300, borderRadius: 44, background: 'linear-gradient(135deg, rgba(255,255,255,.28), rgba(255,255,255,.08))', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,.35), inset 0 2px 0 rgba(255,255,255,.6), 0 30px 60px rgba(0,0,0,.25)', transform: `perspective(1600px) translateX(${(1 - s) * (i % 2 ? 900 : -900)}px) rotateY(${rx}deg) rotateX(${-rx * 0.5}deg)`, padding: '50px 56px', boxSizing: 'border-box', overflow: 'hidden' }}>
            {/* a moving highlight across the glass */}
            <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(110deg, transparent ${((T * 30 + i * 30) % 160) - 40}%, rgba(255,255,255,.25) ${((T * 30 + i * 30) % 160) - 25}%, transparent ${((T * 30 + i * 30) % 160) - 10}%)` }} />
            <div style={{ fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 32, color: 'rgba(255,255,255,.8)' }}>{c.label}</div>
            <div style={{ marginTop: 18, fontFamily: fonts.display, fontWeight: 800, fontSize: 110, color: '#fff', letterSpacing: '-0.02em' }}>{c.value}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- extruded 3D text ----------

export type Text3dProps = {
  text: string;
  sub?: string;
  accent?: string;
};

export const Text3d: React.FC<Text3dProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const face = p.accent ?? L?.accent ?? '#ffd23f';
  const bg = L?.bg ?? '#ff4f2e';
  const ry = mix(-70, 0, k(f, 0, t(1.2), E.outBack)) + Math.sin(lin(f, t(1.2), D) * Math.PI * 2) * 14;
  const rx = mix(30, 12, k(f, 0, t(1.2), E.outCubic));
  const size = Math.min(300, 1600 / Math.max(3, [...p.text].length));
  const DEPTH = 26;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 50% at 50% 45%, color-mix(in srgb, ${bg} 80%, #fff) 0%, ${bg} 70%)`, alignItems: 'center', justifyContent: 'center', perspective: 1800, overflow: 'hidden' }}>
      <div style={{ position: 'relative', transformStyle: 'preserve-3d', transform: `rotateX(${rx}deg) rotateY(${ry}deg)`, marginTop: -100 }}>
        {Array.from({ length: DEPTH }, (_, i) => (
          <div key={i} style={{ position: i === 0 ? 'relative' : 'absolute', inset: 0, fontFamily: fonts.display, fontWeight: 800, fontSize: size, letterSpacing: '-0.03em', whiteSpace: 'nowrap', color: i === 0 ? face : `color-mix(in srgb, ${face} ${Math.round(55 - i)}%, #000)`, transform: `translateZ(${-i * 3}px)`, textShadow: i === 0 ? '0 2px 0 rgba(255,255,255,.4)' : 'none' }}>
            {p.text}
          </div>
        ))}
      </div>
      {p.sub ? <div style={{ position: 'absolute', bottom: 420, fontFamily: L?.body ?? fonts.sansJP, fontWeight: 900, fontSize: 52, color: '#fff', letterSpacing: '0.1em', opacity: k(f, t(1.0), t(1.5)) }}>{p.sub}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- clay shapes ----------

export type ClayProps = {
  title: string;
  sub?: string;
  accent?: string;
};

export const Clay: React.FC<ClayProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#fde9d9';
  const colors = L ? [L.accent, L.accent2, `color-mix(in srgb, ${L.accent} 50%, #fff)`, `color-mix(in srgb, ${L.accent2} 50%, #fff)`] : ['#ff8a65', '#7ec8a6', '#ffcf5c', '#8fb2ff'];
  const shapes = [
    { x: 160, y: 380, w: 260, h: 260, br: '50%' },
    { x: 650, y: 300, w: 300, h: 220, br: '44% 56% 52% 48% / 60% 50% 50% 40%' },
    { x: 110, y: 1260, w: 320, h: 240, br: '60% 40% 46% 54% / 50% 58% 42% 50%' },
    { x: 660, y: 1300, w: 260, h: 260, br: '30%' },
  ];
  // squash and stretch: a drop, a squash on landing, a wobble back
  const sq = (i: number) => {
    const a = t(0.2) + i * 6;
    const fall = lin(f, a, a + 12);
    const land = lin(f, a + 12, a + 30);
    const y = (1 - E.inCubic(fall)) * -900;
    const s = land > 0 ? 1 - Math.sin(land * Math.PI) * 0.22 * (1 - land) : 1;
    return { y, sx: 2 - s, sy: s };
  };
  const word = springX(lin(f, t(1.0), t(1.7)), 1.4, 5);
  return (
    <AbsoluteFill style={{ background: bg, overflow: 'hidden' }}>
      {shapes.map((s, i) => {
        const m = sq(i);
        const c = colors[i];
        return (
          <div key={i} style={{ position: 'absolute', left: s.x, top: s.y, width: s.w, height: s.h, borderRadius: s.br, background: `radial-gradient(60% 55% at 35% 30%, color-mix(in srgb, ${c} 55%, #fff) 0%, ${c} 55%, color-mix(in srgb, ${c} 70%, #000) 100%)`, boxShadow: `inset -14px -18px 30px rgba(0,0,0,.15), inset 10px 12px 20px rgba(255,255,255,.35), 0 30px 40px -12px rgba(0,0,0,.25)`, transform: `translateY(${m.y}px) scale(${m.sx}, ${m.sy})`, transformOrigin: 'bottom center' }}>
            {/* fingerprint-like dents */}
            {[0, 1].map((d) => <div key={d} style={{ position: 'absolute', left: `${30 + d * 30}%`, top: `${40 + d * 15}%`, width: 30, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,.06)' }} />)}
          </div>
        );
      })}
      <div style={{ position: 'absolute', top: 760, width: '100%', textAlign: 'center', transform: `scale(${mix(0.4, 1, word)}, ${mix(1.6, 1, word)})` }}>
        <span style={{ display: 'inline-block', padding: '30px 60px', borderRadius: 80, background: colors[0], fontFamily: `"M PLUS Rounded 1c", ${fonts.sansJP}`, fontWeight: 800, fontSize: 96, color: '#fff', boxShadow: 'inset -10px -14px 24px rgba(0,0,0,.18), inset 8px 10px 18px rgba(255,255,255,.4), 0 26px 40px -10px rgba(0,0,0,.3)', textShadow: '0 4px 0 rgba(0,0,0,.12)' }}>{p.title}</span>
      </div>
      {p.sub ? <div style={{ position: 'absolute', top: 1010, width: '100%', textAlign: 'center', fontFamily: `"M PLUS Rounded 1c", ${fonts.sansJP}`, fontWeight: 800, fontSize: 44, color: L?.ink ?? '#5a3b2e', opacity: k(f, t(1.5), t(1.9)) }}>{p.sub}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- handwriting ----------

export type HandwritingProps = {
  /** 1–3 short lines written by hand. */
  lines: string[];
  /** A small underline doodle under the last line. */
  underline?: boolean;
  accent?: string;
};

export const Handwriting: React.FC<HandwritingProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const ink = L?.ink ?? '#2b2a33';
  const accent = p.accent ?? L?.accent ?? '#ff5a5f';
  const lines = p.lines.slice(0, 3);
  const total = lines.reduce((a, l) => a + [...l].length, 0);
  const per = (D - t(1.4)) / Math.max(1, total);
  let idx = 0;
  return (
    <AbsoluteFill style={{ background: L?.bg ?? '#fffaf0', padding: '0 90px', justifyContent: 'center' }}>
      {/* faint ruled lines */}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(180deg, transparent 0 158px, rgba(80,120,200,.12) 158px 161px)', backgroundPositionY: 40 }} />
      {lines.map((l, i) => (
        <div key={i} style={{ position: 'relative', fontFamily: `"Klee One", ${fonts.sansJP}`, fontWeight: 600, fontSize: 100, lineHeight: 1.6, color: i === lines.length - 1 ? accent : ink }}>
          {[...l].map((c, j) => {
            const at = t(0.3) + idx++ * per;
            const o = lin(f, at, at + per * 1.6);
            // each stroke reveals from top-left like a pen moving: a diagonal mask
            const m = `linear-gradient(135deg, #000 ${o * 140 - 30}%, transparent ${o * 140}%)`;
            return <span key={j} style={{ display: 'inline-block', WebkitMaskImage: m, maskImage: m, transform: `rotate(${(rand(i * 30 + j) - 0.5) * 4}deg) translateY(${(rand(j + 50) - 0.5) * 6}px)` }}>{c}</span>;
          })}
          {p.underline && i === lines.length - 1 ? (
            <svg width={800} height={60} style={{ position: 'absolute', left: 0, bottom: -10 }}>
              <path d="M 10 30 C 160 10, 300 50, 450 26 S 700 18, 780 34" fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - lin(f, D - t(1.0), D - t(0.4))} />
            </svg>
          ) : null}
        </div>
      ))}
    </AbsoluteFill>
  );
};
