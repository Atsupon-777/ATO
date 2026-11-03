// Motion styles, batch 9 (products): ingredient callouts, price tag, size comparison, colourways,
// turntable and a logo with a light sweep. Product props take a cut-out PNG or a photo (URL or public/ path).
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, asset, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

const useBase = (dark = false) => {
  const L = useLook();
  return {
    L,
    bg: L?.bg ?? (dark ? '#0b0b0d' : '#f3efe8'),
    surface: L?.surface ?? (dark ? '#17171b' : '#ffffff'),
    ink: L?.ink ?? (dark ? '#f6f4ef' : '#16171b'),
    muted: L?.muted ?? (dark ? 'rgba(246,244,239,.6)' : 'rgba(22,23,27,.55)'),
    head: L?.head ?? fonts.sansJP,
    body: L?.body ?? fonts.sansJP,
    headWeight: L?.headWeight ?? 900,
  };
};

/** The product, cut out (PNG with alpha) or a photo inside a soft rounded card. */
const Product: React.FC<{ src: string; cutout?: boolean; w: number; h: number; style?: React.CSSProperties }> = ({ src, cutout, w, h, style }) =>
  cutout ? (
    <Img src={asset(src)} style={{ width: w, height: h, objectFit: 'contain', filter: 'drop-shadow(0 40px 50px rgba(0,0,0,.28))', ...style }} />
  ) : (
    <div style={{ width: w, height: h, borderRadius: 40, overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,.25)', ...style }}>
      <Img src={asset(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );

// ---------- ingredient callouts ----------

export type IngredientsProps = {
  product: string;
  cutout?: boolean;
  name?: string;
  /** Up to 4 points; they alternate left and right of the product. */
  points: { title: string; text?: string }[];
  accent?: string;
};

export const Ingredients: React.FC<IngredientsProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#b48a5a';
  const pts = p.points.slice(0, 4);
  const inP = springX(lin(f, 0, t(0.9)), 0.9, 6);
  const per = (D - t(1.4)) / pts.length;
  const anchors = [
    { ax: 470, ay: 760, lx: 30, ly: 600 },
    { ax: 610, ay: 900, lx: 720, ly: 760 },
    { ax: 470, ay: 1140, lx: 30, ly: 1180 },
    { ax: 610, ay: 1290, lx: 720, ly: 1360 },
  ];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 45% at 50% 52%, ${U.surface} 0%, ${U.bg} 80%)` }}>
      {p.name ? <div style={{ position: 'absolute', top: 220, width: '100%', textAlign: 'center', fontFamily: U.head, fontWeight: U.headWeight, fontSize: 68, color: U.ink, opacity: k(f, 0, t(0.5)) }}>{p.name}</div> : null}
      <div style={{ position: 'absolute', left: 540 - 150, top: 560, transform: `translateY(${(1 - inP) * 400}px) scale(${mix(0.8, 1, inP)})`, opacity: Math.min(1, inP * 1.5) }}>
        <Product src={p.product} cutout={p.cutout} w={300} h={900} />
      </div>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {pts.map((_, i) => {
          const a = anchors[i];
          const on = lin(f, t(0.9) + i * per, t(0.9) + i * per + t(0.4));
          const right = i % 2 === 1;
          const ex = right ? a.lx - 10 : a.lx + 340, ey = a.ly + 30;
          return (
            <g key={i} opacity={on > 0 ? 1 : 0}>
              <circle cx={a.ax} cy={a.ay} r={10 * springX(on, 1.3, 6)} fill={accent} />
              <circle cx={a.ax} cy={a.ay} r={10 + 26 * on} fill="none" stroke={accent} strokeOpacity={0.6 * (1 - on)} strokeWidth={3} />
              <path d={`M ${a.ax} ${a.ay} L ${ex} ${ey}`} stroke={accent} strokeWidth={3} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - E.outCubic(on)} />
            </g>
          );
        })}
      </svg>
      {pts.map((pt, i) => {
        const a = anchors[i];
        const on = k(f, t(1.1) + i * per, t(1.1) + i * per + t(0.4));
        return (
          <div key={i} style={{ position: 'absolute', left: a.lx, top: a.ly, width: 330, textAlign: i % 2 ? 'left' : 'right', opacity: on, transform: `translateY(${(1 - on) * 20}px)` }}>
            <div style={{ fontFamily: U.head, fontWeight: U.headWeight, fontSize: 44, color: U.ink }}>{pt.title}</div>
            {pt.text ? <div style={{ marginTop: 6, fontFamily: U.body, fontSize: 28, color: U.muted, lineHeight: 1.4 }}>{pt.text}</div> : null}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- price tag ----------

export type PriceTagProps = {
  product?: string;
  cutout?: boolean;
  label?: string;
  before?: string;
  price: string;
  badge?: string;
  until?: string;
  accent?: string;
};

export const PriceTag: React.FC<PriceTagProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#ff2e4d';
  const prod = springX(lin(f, 0, t(0.8)), 0.9, 6);
  const strike = k(f, t(0.9), t(1.2));
  const slam = lin(f, t(1.2), t(1.4));
  const settle = springX(lin(f, t(1.35), t(1.9)), 1.6, 6);
  const shake = f > t(1.35) && f < t(1.6) ? (rand(f) - 0.5) * 16 : 0;
  const burst = springX(lin(f, t(1.6), t(2.1)), 1.2, 6);
  return (
    <AbsoluteFill style={{ background: U.bg, overflow: 'hidden', transform: `translate(${shake}px, ${shake * 0.4}px)` }}>
      {/* sunburst rays behind */}
      <div style={{ position: 'absolute', left: 540 - 1200, top: 760 - 1200, width: 2400, height: 2400, background: `repeating-conic-gradient(from ${f * 0.6}deg, color-mix(in srgb, ${accent} 10%, transparent) 0deg 8deg, transparent 8deg 16deg)`, opacity: k(f, t(1.3), t(1.8)) }} />
      {p.product ? (
        <div style={{ position: 'absolute', left: 540 - 260, top: 300, transform: `translateY(${(1 - prod) * -900}px) rotate(${(1 - prod) * -20}deg)` }}>
          <Product src={p.product} cutout={p.cutout} w={520} h={720} />
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 1110, width: '100%', textAlign: 'center' }}>
        {p.label ? <div style={{ fontFamily: U.body, fontWeight: 800, fontSize: 42, color: U.ink, opacity: k(f, t(0.5), t(0.9)) }}>{p.label}</div> : null}
        {p.before ? (
          <div style={{ position: 'relative', display: 'inline-block', marginTop: 20, fontFamily: fonts.display, fontWeight: 700, fontSize: 64, color: U.muted, opacity: k(f, t(0.6), t(0.9)) }}>
            {p.before}
            <div style={{ position: 'absolute', left: -10, top: '52%', height: 6, width: `${strike * 110}%`, background: accent, transform: 'rotate(-8deg)', transformOrigin: 'left' }} />
          </div>
        ) : null}
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 210, lineHeight: 1.05, color: accent, letterSpacing: '-0.03em', transform: `scale(${f < t(1.2) ? 0 : mix(3, 1, E.outCubic(slam)) * (1 + 0.06 * (1 - settle))})`, opacity: f < t(1.2) ? 0 : 1 }}>{p.price}</div>
        {p.until ? <div style={{ marginTop: 8, fontFamily: U.body, fontWeight: 700, fontSize: 34, color: U.muted, opacity: k(f, t(1.8), t(2.2)) }}>{p.until}</div> : null}
      </div>
      {p.badge ? (
        <div style={{ position: 'absolute', right: 90, top: 330, width: 230, height: 230, borderRadius: '50%', background: accent, color: '#fff', display: 'grid', placeItems: 'center', textAlign: 'center', fontFamily: U.head, fontWeight: 900, fontSize: 52, lineHeight: 1.05, transform: `scale(${burst}) rotate(${12 - 20 * (1 - burst)}deg)`, boxShadow: '0 20px 40px rgba(0,0,0,.25)' }}>
          {p.badge}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- size comparison ----------

export type SizeCompareProps = {
  product: string;
  cutout?: boolean;
  /** The product's real height in cm; the reference is a phone (14.7 cm). */
  heightCm: number;
  label?: string;
  accent?: string;
};

export const SizeCompare: React.FC<SizeCompareProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const accent = p.accent ?? U.L?.accent ?? '#2f6bff';
  const PHONE_CM = 14.7;
  const pxPerCm = 760 / Math.max(PHONE_CM, p.heightCm);
  const phoneH = PHONE_CM * pxPerCm, prodH = p.heightCm * pxPerCm;
  const base = 1440;
  const inA = springX(lin(f, 0, t(0.7)), 1, 6);
  const inB = springX(lin(f, t(0.35), t(1.05)), 1, 6);
  const ruler = k(f, t(1.0), t(1.8), E.inOutCubic);
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      {p.label ? <div style={{ position: 'absolute', top: 220, width: '100%', textAlign: 'center', fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink }}>{p.label}</div> : null}
      {/* floor line */}
      <div style={{ position: 'absolute', left: 80, right: 80, top: base, height: 3, background: U.muted, opacity: 0.4 }} />
      {/* phone silhouette */}
      <div style={{ position: 'absolute', left: 110, top: base - phoneH, width: phoneH * 0.48, height: phoneH, borderRadius: 40, background: '#202228', boxShadow: 'inset 0 0 0 10px #34363d', transform: `translateY(${(1 - inA) * 600}px)`, opacity: Math.min(1, inA * 1.5) }}>
        <div style={{ position: 'absolute', bottom: -64, width: '100%', textAlign: 'center', fontFamily: U.body, fontWeight: 700, fontSize: 30, color: U.muted }}>スマホ</div>
      </div>
      {/* product */}
      <div style={{ position: 'absolute', left: 560, top: base - prodH, height: prodH, transform: `translateY(${(1 - inB) * 600}px)`, opacity: Math.min(1, inB * 1.5) }}>
        <Product src={p.product} cutout={p.cutout} w={prodH * 0.6} h={prodH} style={{ boxShadow: p.cutout ? undefined : '0 20px 40px rgba(0,0,0,.2)' }} />
      </div>
      {/* ruler on the product */}
      <div style={{ position: 'absolute', left: 520, top: base - prodH * ruler, width: 4, height: prodH * ruler, background: accent }} />
      {Array.from({ length: Math.floor(p.heightCm) + 1 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: i % 5 === 0 ? 500 : 508, top: base - i * pxPerCm - 2, width: i % 5 === 0 ? 24 : 14, height: 3, background: accent, opacity: i * pxPerCm <= prodH * ruler ? 1 : 0 }} />
      ))}
      <div style={{ position: 'absolute', left: 500, width: 300, textAlign: 'left', top: base - prodH * ruler - 90, fontFamily: fonts.display, fontWeight: 800, fontSize: 72, color: accent, opacity: k(f, t(1.3), t(1.7)) }}>
        {(p.heightCm * ruler).toFixed(1)}
        <span style={{ fontSize: 34 }}>cm</span>
      </div>
    </AbsoluteFill>
  );
};

// ---------- colourways ----------

export type ColorwaysProps = {
  product: string;
  cutout?: boolean;
  name?: string;
  /** Colours as hue rotations of the product photo, each with a swatch colour and a name. */
  colors: { name: string; swatch: string; hue: number }[];
  accent?: string;
};

export const Colorways: React.FC<ColorwaysProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase();
  const cols = p.colors.slice(0, 5);
  const per = (D - t(0.6)) / cols.length;
  const idx = Math.min(cols.length - 1, Math.floor(Math.max(0, f - t(0.3)) / per));
  const local = Math.max(0, f - t(0.3) - idx * per);
  const swap = E.outCubic(lin(local, 0, 8));
  const c = cols[idx];
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 50% at 50% 45%, color-mix(in srgb, ${c.swatch} 28%, ${U.bg}) 0%, ${U.bg} 80%)` }}>
      {p.name ? <div style={{ position: 'absolute', top: 220, width: '100%', textAlign: 'center', fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink }}>{p.name}</div> : null}
      <div style={{ position: 'absolute', left: 540 - 300, top: 420, transform: `translateX(${(1 - swap) * 160}px) scale(${mix(0.92, 1, swap)})`, opacity: swap, filter: `hue-rotate(${c.hue}deg)` }}>
        <Product src={p.product} cutout={p.cutout} w={600} h={820} />
      </div>
      <div style={{ position: 'absolute', top: 1340, width: '100%', textAlign: 'center', fontFamily: U.body, fontWeight: 800, fontSize: 48, color: U.ink }}>{c.name}</div>
      <div style={{ position: 'absolute', top: 1460, width: '100%', display: 'flex', justifyContent: 'center', gap: 34 }}>
        {cols.map((cc, i) => {
          const on = i === idx;
          return <div key={i} style={{ width: 84, height: 84, borderRadius: 42, background: cc.swatch, boxShadow: on ? `0 0 0 6px ${U.bg}, 0 0 0 10px ${U.ink}` : '0 6px 14px rgba(0,0,0,.15)', transform: `scale(${on ? 1.12 : 1}) translateY(${(1 - springX(lin(f, i * 3, t(0.5) + i * 3), 1.2, 6)) * 120}px)` }} />;
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- turntable ----------

export type TurntableProps = {
  product: string;
  cutout?: boolean;
  name?: string;
  sub?: string;
  accent?: string;
};

export const Turntable: React.FC<TurntableProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useBase(true);
  const accent = p.accent ?? U.L?.accent ?? '#c9a86a';
  const spin = lin(f, 0, D) * Math.PI * 2;
  // a flat image can't truly turn, so it swings like a turntable: width breathes, light slides across
  const sx = 0.82 + 0.18 * Math.abs(Math.cos(spin * 0.5));
  const light = (Math.sin(spin) + 1) / 2;
  const enter = k(f, 0, t(0.8), E.outExpo);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(60% 40% at 50% 40%, color-mix(in srgb, ${accent} 22%, ${U.bg}) 0%, ${U.bg} 70%)`, overflow: 'hidden' }}>
      {/* pedestal */}
      <div style={{ position: 'absolute', left: 540 - 330, top: 1290, width: 660, height: 150, borderRadius: '50%', background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 30%, #2a2a2e), #121214)`, boxShadow: '0 40px 80px rgba(0,0,0,.6)' }} />
      <div style={{ position: 'absolute', left: 540 - 330, top: 1280, width: 660, height: 130, borderRadius: '50%', background: `conic-gradient(from ${spin}rad, rgba(255,255,255,.1), rgba(255,255,255,.02), rgba(255,255,255,.12), rgba(255,255,255,.02), rgba(255,255,255,.1))`, boxShadow: `inset 0 0 0 3px color-mix(in srgb, ${accent} 50%, transparent)` }} />
      <div style={{ position: 'absolute', left: 540 - 250, top: 480, width: 500, height: 860, transform: `translateY(${(1 - enter) * 300}px) scaleX(${sx})`, opacity: enter }}>
        <Product src={p.product} cutout={p.cutout} w={500} h={860} />
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(100deg, transparent ${light * 100 - 30}%, rgba(255,255,255,.28) ${light * 100}%, transparent ${light * 100 + 30}%)`, mixBlendMode: 'screen', borderRadius: p.cutout ? 0 : 40, WebkitMaskImage: p.cutout ? `url(${asset(p.product)})` : undefined, WebkitMaskSize: 'contain', WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center' }} />
      </div>
      {p.name ? (
        <div style={{ position: 'absolute', top: 1560, width: '100%', textAlign: 'center', opacity: k(f, t(0.8), t(1.3)) }}>
          <div style={{ fontFamily: U.head, fontWeight: U.headWeight, fontSize: 64, color: U.ink, letterSpacing: '0.06em' }}>{p.name}</div>
          {p.sub ? <div style={{ marginTop: 12, fontFamily: U.body, fontSize: 32, color: accent, letterSpacing: '0.2em' }}>{p.sub}</div> : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- logo with a light sweep ----------

export type LogoShineProps = {
  name: string;
  logo?: string;
  tagline?: string;
  accent?: string;
};

export const LogoShine: React.FC<LogoShineProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#08080a';
  const gold = p.accent ?? L?.accent ?? '#e7c98b';
  const appear = k(f, 0, t(1.0), E.outCubic);
  const sweep = lin(f, t(0.9), t(1.8));
  const sweep2 = lin(f, t(2.2), t(2.8));
  const size = Math.min(170, 1500 / Math.max(4, [...p.name].length));
  const metal = `linear-gradient(100deg, ${gold} 0%, ${gold} ${sweep * 120 - 25}%, #fff7e0 ${sweep * 120 - 12}%, ${gold} ${sweep * 120}%, ${gold} ${sweep2 * 120 - 12}%, #fff ${sweep2 * 120 - 6}%, ${gold} ${sweep2 * 120}%, ${gold} 100%)`;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(60% 35% at 50% 47%, color-mix(in srgb, ${gold} 14%, ${bg}) 0%, ${bg} 75%)`, alignItems: 'center', justifyContent: 'center' }}>
      {p.logo ? (
        <Img src={asset(p.logo)} style={{ width: 380, height: 380, objectFit: 'contain', opacity: appear, transform: `scale(${mix(1.08, 1, appear)})`, marginBottom: 40 }} />
      ) : null}
      <div style={{ fontFamily: L?.head && L.head !== fonts.sansJP ? L.head : fonts.display, fontWeight: 700, fontSize: size, letterSpacing: '0.14em', backgroundImage: metal, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', opacity: appear, filter: `blur(${(1 - appear) * 12}px)`, transform: `scale(${mix(1.06, 1, appear)})` }}>
        {p.name}
      </div>
      <div style={{ width: 420 * k(f, t(1.0), t(1.6), E.inOutCubic), height: 2, background: gold, margin: '36px 0', opacity: 0.8 }} />
      {p.tagline ? <div style={{ fontFamily: L?.body ?? fonts.minchoJP, fontSize: 36, letterSpacing: '0.3em', color: gold, opacity: k(f, t(1.4), t(1.9)) }}>{p.tagline}</div> : null}
    </AbsoluteFill>
  );
};
