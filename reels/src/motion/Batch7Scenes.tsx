// Motion styles, batch 7 (Japanese and hand-made): washi + seal, brush lettering, ukiyo-e waves,
// watercolour bloom into a photo, chalkboard and whiteboard. Theme-aware where it makes sense; these
// styles lean on their own materials (paper, ink, chalk), so a theme mostly changes accent and type.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, asset, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

const Paper: React.FC<{ color: string; id: string }> = ({ color, id }) => (
  <AbsoluteFill style={{ background: color }}>
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0, opacity: 0.55, mixBlendMode: 'multiply' }}>
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves={4} seed={3} />
        <feColorMatrix values="0 0 0 0 0.55  0 0 0 0 0.5  0 0 0 0 0.42  0 0 0 0.35 0" />
      </filter>
      <rect width={1080} height={1920} filter={`url(#${id})`} />
    </svg>
  </AbsoluteFill>
);

// ---------- washi and seal ----------

export type WashiSealProps = {
  title: string;
  sub?: string;
  /** Up to 2 characters for the red seal. */
  seal: string;
  since?: string;
  accent?: string;
};

export const WashiSeal: React.FC<WashiSealProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const red = p.accent ?? L?.accent ?? '#b3261e';
  const ink = '#1d1a16';
  const cs = [...p.title];
  const stampAt = t(0.5) + cs.length * 4 + t(0.4);
  const hit = lin(f, stampAt, stampAt + 5);
  const settle = springX(lin(f, stampAt + 4, stampAt + 18), 1.6, 7);
  const shake = f >= stampAt + 4 && f < stampAt + 10 ? (rand(f) - 0.5) * 10 : 0;
  return (
    <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.5}px)` }}>
      <Paper color="#efe7d6" id="washi" />
      {/* fibres */}
      {Array.from({ length: 40 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: rand(i) * 1080, top: rand(i + 99) * 1920, width: 60 + rand(i + 7) * 140, height: 2, background: 'rgba(120,100,70,.18)', transform: `rotate(${rand(i + 3) * 180}deg)`, borderRadius: 2 }} />
      ))}
      <div style={{ position: 'absolute', top: 640, width: '100%', textAlign: 'center' }}>
        <div style={{ fontFamily: L?.head ?? fonts.minchoJP, fontWeight: 800, fontSize: Math.min(150, 900 / cs.length), letterSpacing: '0.12em', color: ink }}>
          {cs.map((c, i) => {
            const o = lin(f, t(0.3) + i * 4, t(0.3) + i * 4 + 14);
            return <span key={i} style={{ opacity: o, filter: `blur(${(1 - o) * 8}px)` }}>{c}</span>;
          })}
        </div>
        {p.sub ? <div style={{ marginTop: 40, fontFamily: L?.body ?? fonts.minchoJP, fontSize: 40, letterSpacing: '0.3em', color: 'rgba(29,26,22,.7)', opacity: k(f, t(1.0), t(1.5)) }}>{p.sub}</div> : null}
      </div>
      {/* the seal: drops in big, slams, ink stays a little uneven */}
      <div
        style={{
          position: 'absolute',
          left: 540 - 110,
          top: 1120,
          width: 220,
          height: 220,
          transform: `scale(${f < stampAt ? 0 : mix(2.4, 1, hit) * (1 + 0.04 * (1 - settle))}) rotate(-6deg)`,
          opacity: f < stampAt ? 0 : 1,
        }}
      >
        <svg width={220} height={220} viewBox="0 0 220 220">
          <filter id="ink">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={8} />
            <feDisplacementMap in="SourceGraphic" scale={6} />
          </filter>
          <g filter="url(#ink)">
            <rect x={10} y={10} width={200} height={200} rx={18} fill="none" stroke={red} strokeWidth={14} />
            <text x={110} y={p.seal.length > 1 ? 105 : 150} textAnchor="middle" fontFamily={fonts.minchoJP} fontWeight={800} fontSize={p.seal.length > 1 ? 82 : 130} fill={red}>
              {[...p.seal][0]}
            </text>
            {p.seal.length > 1 ? (
              <text x={110} y={190} textAnchor="middle" fontFamily={fonts.minchoJP} fontWeight={800} fontSize={82} fill={red}>
                {[...p.seal][1]}
              </text>
            ) : null}
          </g>
        </svg>
      </div>
      {p.since ? <div style={{ position: 'absolute', bottom: 380, width: '100%', textAlign: 'center', fontFamily: fonts.minchoJP, fontSize: 34, letterSpacing: '0.4em', color: red, opacity: k(f, stampAt + 10, stampAt + 20) }}>{p.since}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- brush lettering ----------

export type BrushTextProps = {
  /** 1–4 characters written large with a brush. */
  text: string;
  sub?: string;
  accent?: string;
};

export const BrushText: React.FC<BrushTextProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const red = p.accent ?? L?.accent ?? '#c0392b';
  const cs = [...p.text].slice(0, 4);
  const per = t(0.75);
  const size = cs.length <= 2 ? 520 : 380;
  const vertical = cs.length > 1;
  return (
    <AbsoluteFill>
      <Paper color="#f3eee2" id="brushpaper" />
      <svg width={0} height={0}>
        <filter id="brush">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={3} seed={5} />
          <feDisplacementMap in="SourceGraphic" scale={14} />
        </filter>
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: 'center', justifyContent: 'center', marginTop: -120 }}>
        {cs.map((c, i) => {
          // a mask sweeps diagonally across the glyph like a stroke, with a wet edge
          const w = k(f, t(0.3) + i * per, t(0.3) + i * per + per * 0.9, E.inOutCubic);
          const wet = 1 - lin(f, t(0.3) + i * per + per, t(0.3) + i * per + per + t(0.6));
          const mask = `linear-gradient(115deg, #000 ${w * 130 - 20}%, transparent ${w * 130}%)`;
          return (
            <div key={i} style={{ fontFamily: `"Klee One", ${fonts.minchoJP}`, fontWeight: 600, fontSize: size, lineHeight: 1.02, color: '#121110', filter: `url(#brush) blur(${wet * 1.2}px)`, WebkitMaskImage: mask, maskImage: mask, transform: `rotate(${(rand(i) - 0.5) * 6}deg)` }}>
              {c}
            </div>
          );
        })}
      </div>
      {/* ink splash dots after the last stroke */}
      {Array.from({ length: 10 }, (_, i) => {
        const at = t(0.3) + cs.length * per;
        const o = k(f, at + i, at + i + 6);
        return <div key={i} style={{ position: 'absolute', left: 620 + rand(i) * 300, top: 1200 + rand(i + 20) * 200, width: 8 + rand(i + 5) * 22, height: 8 + rand(i + 5) * 22, borderRadius: '50%', background: '#121110', opacity: o * 0.85, transform: `scale(${o})` }} />;
      })}
      {p.sub ? (
        <div style={{ position: 'absolute', bottom: 300, width: '100%', textAlign: 'center' }}>
          <span style={{ fontFamily: fonts.minchoJP, fontWeight: 700, fontSize: 44, letterSpacing: '0.3em', color: '#fff', background: red, padding: '12px 30px', opacity: k(f, t(0.5) + cs.length * per, t(0.9) + cs.length * per) }}>{p.sub}</span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- ukiyo-e waves ----------

export type UkiyoWaveProps = {
  title: string;
  sub?: string;
  accent?: string;
};

const wavePath = (y: number, amp: number, len: number, phase: number) => {
  let d = `M -100 ${y}`;
  for (let x = -100; x <= 1180; x += 20) d += ` L ${x} ${y + Math.sin((x / len) * Math.PI * 2 + phase) * amp}`;
  return d + ' L 1180 1920 L -100 1920 Z';
};

export const UkiyoWave: React.FC<UkiyoWaveProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const indigo = '#1f3a5f';
  const sun = p.accent ?? L?.accent ?? '#d9472b';
  const rise = k(f, 0, t(1.4), E.outCubic);
  const ph = f / fps;
  const layers = [
    { y: 1080, amp: 46, len: 520, sp: 0.8, c: '#9fb8cf' },
    { y: 1200, amp: 60, len: 430, sp: -1.1, c: '#5f84a8' },
    { y: 1330, amp: 70, len: 380, sp: 1.4, c: indigo },
    { y: 1480, amp: 54, len: 300, sp: -1.8, c: '#13263f' },
  ];
  return (
    <AbsoluteFill style={{ background: '#efe4cc' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          {/* seigaiha (overlapping arcs) pattern for the far sea */}
          <pattern id="sg" width={60} height={30} patternUnits="userSpaceOnUse">
            {[0, 1, 2].map((r) => (
              <circle key={r} cx={30} cy={30} r={28 - r * 9} fill="none" stroke="#efe4cc" strokeWidth={2.4} />
            ))}
            {[0, 1, 2].map((r) => (
              <circle key={`b${r}`} cx={0} cy={15} r={28 - r * 9} fill="none" stroke="#efe4cc" strokeWidth={2.4} opacity={0.6} />
            ))}
          </pattern>
        </defs>
        <circle cx={330} cy={mix(1000, 720, rise)} r={150} fill={sun} />
        {layers.map((l, i) => {
          const y = l.y + (1 - rise) * 500;
          return (
            <g key={i}>
              <path d={wavePath(y, l.amp, l.len, ph * l.sp + i)} fill={l.c} />
              {i === 1 ? <path d={wavePath(y, l.amp, l.len, ph * l.sp + i)} fill="url(#sg)" opacity={0.5} /> : null}
              {/* white foam curls on each crest */}
              {Array.from({ length: 5 }, (_, j) => {
                const x = ((j * 260 + ph * l.sp * 60 + i * 90) % 1300 + 1300) % 1300 - 110;
                const cy = y + Math.sin((x / l.len) * Math.PI * 2 + ph * l.sp + i) * l.amp;
                return <path key={j} d={`M ${x - 26} ${cy} q 10 -30 34 -18 q -18 4 -12 18`} fill="none" stroke="#f7efe0" strokeWidth={6} strokeLinecap="round" opacity={0.9} />;
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', top: 260, right: 120, writingMode: 'vertical-rl', fontFamily: L?.head ?? fonts.minchoJP, fontWeight: 800, fontSize: 104, letterSpacing: '0.16em', color: indigo, opacity: k(f, t(0.6), t(1.2)) }}>{p.title}</div>
      {p.sub ? <div style={{ position: 'absolute', top: 280, left: 560, writingMode: 'vertical-rl', fontFamily: fonts.minchoJP, fontSize: 40, letterSpacing: '0.3em', color: sun, opacity: k(f, t(1.0), t(1.5)) }}>{p.sub}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- watercolour bloom ----------

export type WatercolorProps = {
  image: string;
  title: string;
  sub?: string;
  accent?: string;
};

export const Watercolor: React.FC<WatercolorProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const tint = p.accent ?? L?.accent ?? '#e88aa8';
  const bloom = k(f, t(0.2), t(2.2), E.outCubic);
  const blobs = [
    { x: 380, y: 640, r: 500 },
    { x: 760, y: 880, r: 460 },
    { x: 480, y: 1120, r: 440 },
  ];
  return (
    <AbsoluteFill>
      <Paper color="#faf6ef" id="wcpaper" />
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="wc" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves={4} seed={11} />
            <feDisplacementMap in="SourceGraphic" scale={110} />
            <feGaussianBlur stdDeviation={6} />
          </filter>
          <mask id="wcm">
            <g filter="url(#wc)">
              {blobs.map((b, i) => (
                <circle key={i} cx={b.x} cy={b.y} r={b.r * k(f, t(0.2) + i * 8, t(2.2) + i * 8, E.outCubic)} fill="#fff" />
              ))}
            </g>
          </mask>
        </defs>
        {/* a tinted wash spreads first, the photo follows inside it */}
        <g mask="url(#wcm)">
          <rect width={1080} height={1920} fill={tint} opacity={0.55 * (1 - lin(f, t(1.0), t(2.4)))} />
          <image href={asset(p.image)} x={0} y={170} width={1080} height={1260} preserveAspectRatio="xMidYMid slice" opacity={lin(f, t(0.5), t(2.0))} />
        </g>
      </svg>
      <div style={{ position: 'absolute', bottom: 190, width: '100%', textAlign: 'center', opacity: k(f, t(1.6), t(2.2)) }}>
        <div style={{ fontFamily: L?.head ?? `"Klee One", ${fonts.minchoJP}`, fontWeight: 700, fontSize: 80, color: '#3b2f2a' }}>{p.title}</div>
        {p.sub ? <div style={{ marginTop: 16, fontFamily: L?.body ?? fonts.minchoJP, fontSize: 36, color: 'rgba(59,47,42,.7)', letterSpacing: '0.2em' }}>{p.sub}</div> : null}
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - bloom, background: 'transparent' }} />
    </AbsoluteFill>
  );
};

// ---------- chalkboard ----------

export type ChalkboardProps = {
  title: string;
  /** Menu-like lines: left text and optional right value (price). */
  lines: { text: string; value?: string }[];
  accent?: string;
};

export const Chalkboard: React.FC<ChalkboardProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const chalk2 = p.accent ?? L?.accent ?? '#ffd76a';
  const lines = p.lines.slice(0, 5);
  const per = (D - t(1.6)) / (lines.length + 1);
  const reveal = (a: number, len: number) => `linear-gradient(90deg, #000 ${lin(f, a, a + len) * 110 - 10}%, transparent ${lin(f, a, a + len) * 110}%)`;
  const chalkText: React.CSSProperties = { fontFamily: `"Klee One", ${fonts.sansJP}`, fontWeight: 600, color: '#f2f1ea', filter: 'url(#chalk)', textShadow: '0 0 2px rgba(255,255,255,.4)' };
  return (
    <AbsoluteFill style={{ background: '#5a3b22', padding: 40 }}>
      <svg width={0} height={0}>
        <filter id="chalk">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={4} result="n" />
          <feColorMatrix in="n" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.6" result="holes" />
          <feComposite in="SourceGraphic" in2="holes" operator="in" />
        </filter>
      </svg>
      <div style={{ position: 'absolute', inset: 40, borderRadius: 12, background: 'radial-gradient(90% 70% at 50% 40%, #2f4a3b 0%, #1f3329 100%)', boxShadow: 'inset 0 0 120px rgba(0,0,0,.5)', overflow: 'hidden' }}>
        {/* old erased chalk smudges */}
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ position: 'absolute', left: rand(i) * 800, top: rand(i + 9) * 1700, width: 300, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.04)', filter: 'blur(20px)' }} />
        ))}
        <div style={{ position: 'absolute', top: 200, width: '100%', textAlign: 'center', ...chalkText, fontSize: 96, WebkitMaskImage: reveal(t(0.2), per), maskImage: reveal(t(0.2), per) }}>{p.title}</div>
        <svg width={1000} height={40} style={{ position: 'absolute', top: 340, left: 0 }}>
          <path d="M 200 20 Q 500 4 800 22" fill="none" stroke={chalk2} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - lin(f, t(0.2) + per * 0.6, t(0.2) + per)} filter="url(#chalk)" />
        </svg>
        {lines.map((l, i) => {
          const a = t(0.2) + per * (i + 1);
          return (
            <div key={i} style={{ position: 'absolute', top: 520 + i * 200, left: 90, right: 90, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', ...chalkText, fontSize: 60, WebkitMaskImage: reveal(a, per * 0.9), maskImage: reveal(a, per * 0.9) }}>
              <span>{l.text}</span>
              {l.value ? <span style={{ color: chalk2 }}>{l.value}</span> : null}
            </div>
          );
        })}
        {/* a little chalk star doodle */}
        <svg width={160} height={160} style={{ position: 'absolute', right: 80, top: 120, transform: `rotate(${12 + Math.sin(f / 8) * 3}deg)` }}>
          <path d="M80 10 L98 60 L150 62 L108 94 L124 146 L80 116 L36 146 L52 94 L10 62 L62 60 Z" fill="none" stroke={chalk2} strokeWidth={6} strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - lin(f, D - t(1.4), D - t(0.6))} filter="url(#chalk)" />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// ---------- whiteboard ----------

export type WhiteboardProps = {
  title?: string;
  /** 3 steps drawn as boxes joined by arrows, top to bottom. */
  steps: string[];
  accent?: string;
};

export const Whiteboard: React.FC<WhiteboardProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const marker = '#1e2a44';
  const red = p.accent ?? L?.accent ?? '#e2412e';
  const steps = p.steps.slice(0, 3);
  const per = (D - t(1.2)) / (steps.length * 2);
  // segments in order: box0, arrow0, box1, arrow1, box2, then a circle around the last box
  const segs: { d: string; color: string }[] = [];
  const boxY = (i: number) => 560 + i * 380;
  steps.forEach((_, i) => {
    const y = boxY(i);
    segs.push({ d: `M 200 ${y} L 880 ${y + 6} L 876 ${y + 200} L 196 ${y + 196} Z`, color: marker });
    if (i < steps.length - 1) segs.push({ d: `M 540 ${y + 210} L 536 ${y + 360} M 506 ${y + 326} L 536 ${y + 362} L 568 ${y + 328}`, color: marker });
  });
  const ly = boxY(steps.length - 1);
  segs.push({ d: `M 150 ${ly + 100} C 150 ${ly - 60}, 930 ${ly - 60}, 930 ${ly + 100} C 930 ${ly + 260}, 170 ${ly + 270}, 160 ${ly + 90}`, color: red });
  const segAt = (j: number) => t(0.5) + j * per;
  // the pen tip follows the segment being drawn
  const active = Math.min(segs.length - 1, Math.max(0, Math.floor((f - t(0.5)) / per)));
  const prog = lin(f, segAt(active), segAt(active) + per);
  const penRef = segs[active].d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const penX = penRef[0] + (penRef[2] - penRef[0]) * prog, penY = penRef[1] + (penRef[3] - penRef[1]) * prog;
  const penOn = f > t(0.4) && f < segAt(segs.length);
  return (
    <AbsoluteFill style={{ background: '#fbfbf8' }}>
      <AbsoluteFill style={{ background: 'linear-gradient(115deg, rgba(255,255,255,0) 30%, rgba(255,255,255,.7) 45%, rgba(255,255,255,0) 60%)' }} />
      {p.title ? <div style={{ position: 'absolute', top: 230, width: '100%', textAlign: 'center', fontFamily: `"Klee One", ${fonts.sansJP}`, fontWeight: 600, fontSize: 80, color: marker, opacity: k(f, 0, t(0.4)) }}>{p.title}</div> : null}
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {segs.map((s, j) => (
          <path key={j} d={s.d} fill="none" stroke={s.color} strokeWidth={j === segs.length - 1 ? 9 : 8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - lin(f, segAt(j), segAt(j) + per)} />
        ))}
      </svg>
      {steps.map((s, i) => {
        const j = i * 2;
        return (
          <div key={i} style={{ position: 'absolute', top: boxY(i) + 50, left: 200, width: 680, textAlign: 'center', fontFamily: `"Klee One", ${fonts.sansJP}`, fontWeight: 600, fontSize: 64, color: marker, opacity: k(f, segAt(j) + per * 0.6, segAt(j) + per * 1.1) }}>
            {s}
          </div>
        );
      })}
      {penOn ? (
        <svg width={120} height={260} viewBox="0 0 40 90" style={{ position: 'absolute', left: penX - 6, top: penY - 250, transform: 'rotate(18deg)', transformOrigin: '6px 250px', filter: 'drop-shadow(10px 14px 8px rgba(0,0,0,.2))' }}>
          <rect x={10} y={0} width={20} height={70} rx={6} fill="#2b2f3a" />
          <rect x={10} y={46} width={20} height={10} fill={segs[active].color} />
          <path d="M12 70 L28 70 L22 88 L18 88 Z" fill={segs[active].color} />
        </svg>
      ) : null}
    </AbsoluteFill>
  );
};
