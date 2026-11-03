// "Paper desk" scene: a printed note taped to a green cutting mat, a pencil chart drawing itself, an
// index card sliding in with check marks, a marker loop around the key point, a handwritten aside and
// a label slapped down last. Everything is drawn in code with paper grain and a little hand wobble.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, k, lin, mix, rand, springX } from './kit';

export type PaperDeskProps = {
  kicker?: string;
  headline: string;
  /** Short lines on the index card, each gets a check mark. */
  card: string[];
  /** Two or three words written by hand next to the marker loop. */
  aside?: string;
  /** Two or three words on the label slapped down last. */
  label?: string;
  ink?: string;
};

const MAT = '#1d3b31';
const PAPERC = '#f3ede2';
const PENCIL = '#231c19';

export const PaperDesk: React.FC<PaperDeskProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const ink = p.ink ?? '#7b1f2d';
  const settle = k(f, 0, t(0.9), E.outExpo);
  const sc = D / t(7.9); // the beats are timed for 7.9 s and scale to the scene length
  const T = (s: number) => t(s) * sc;
  const chart = k(f, T(0.55), T(2.35), E.inOutCubic);
  const card = springX(lin(f, T(2.38), T(2.95)), 1.1, 5.5);
  const loop = k(f, T(3.92), T(4.42), E.inOutCubic);
  const hand = lin(f, T(4.46), T(5.34));
  const slap = springX(lin(f, T(5.28), T(5.62)), 1.3, 7);
  const bump = card > 0 && card < 1 ? Math.sin(card * Math.PI) * 6 : 0;
  const wob = (s: number) => (Math.sin(f / 9 + s) + Math.sin(f / 17 + s * 2)) * 2.5;
  // marker loop: 1.13 turns with a slow radius wobble
  const loopPath = (() => {
    const cx = 400, cy = 1046, rx = 270, ry = 46, turns = 1.13, N = 90;
    const end = Math.max(1, Math.floor(N * loop));
    let d = '';
    for (let i = 0; i <= end; i++) {
      const a = -Math.PI * 0.9 + (i / N) * Math.PI * 2 * turns;
      const r = 1 + 0.07 * Math.sin(i / 11 + 1.3);
      d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rx * r).toFixed(1)} ${(cy + Math.sin(a) * ry * r).toFixed(1)}`;
    }
    return d;
  })();
  const chartPts = Array.from({ length: 7 }, (_, i) => [140 + i * 110, 600 - (Math.sin(i * 0.9) * 0.3 + i * 0.12) * 260 + rand(i) * 18]);
  const chartD = chartPts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return (
    <AbsoluteFill style={{ background: `radial-gradient(80% 60% at 20% 10%, #2a5244 0%, ${MAT} 60%)`, overflow: 'hidden' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {Array.from({ length: 37 }, (_, i) => (
          <line key={`v${i}`} x1={i * 30} x2={i * 30} y1={0} y2={1920} stroke="#fff" strokeOpacity={i % 5 === 0 ? 0.075 : 0.04} />
        ))}
        {Array.from({ length: 65 }, (_, i) => (
          <line key={`h${i}`} y1={i * 30} y2={i * 30} x1={0} x2={1080} stroke="#fff" strokeOpacity={i % 5 === 0 ? 0.075 : 0.04} />
        ))}
        <line x1={0} y1={1920} x2={1080} y2={840} stroke="#fff" strokeOpacity={0.05} />
        <circle cx={900} cy={1500} r={260} fill="none" stroke="#fff" strokeOpacity={0.05} />
      </svg>
      <AbsoluteFill style={{ transform: `scale(${mix(1.13, 1, settle)}) rotate(${mix(-1.6, 0, settle)}deg) translate(${wob(1)}px, ${wob(2) + bump}px)` }}>
        {/* the printed note */}
        <div style={{ position: 'absolute', left: 70, top: 190, width: 940, height: 1000, background: PAPERC, borderRadius: 3, transform: 'rotate(-2.5deg)', boxShadow: '0 2px 3px rgba(0,0,0,.35), 0 26px 50px -10px rgba(0,0,0,.55)' }}>
          <div style={{ position: 'absolute', left: 60, top: 54, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, letterSpacing: '0.3em', color: 'rgba(35,28,25,.6)' }}>{p.kicker ?? 'FIELD NOTES · Nº 01'}</div>
          <div style={{ position: 'absolute', left: 60, right: 60, top: 100, fontFamily: fonts.minchoJP, fontWeight: 800, fontSize: 60, lineHeight: 1.25, color: PENCIL, whiteSpace: 'pre-line' }}>{p.headline}</div>
          <svg width={940} height={1000} style={{ position: 'absolute', inset: 0 }}>
            <line x1={120} y1={640} x2={850} y2={640} stroke={PENCIL} strokeOpacity={0.5} strokeWidth={2} />
            <line x1={120} y1={330} x2={120} y2={640} stroke={PENCIL} strokeOpacity={0.5} strokeWidth={2} />
            <path d={chartD} fill="none" stroke={PENCIL} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - chart} />
          </svg>
          {/* tape on two corners */}
          {[
            { l: -30, t: -20, r: -35 },
            { l: 810, t: -24, r: 35 },
          ].map((c, i) => (
            <div key={i} style={{ position: 'absolute', left: c.l, top: c.t, width: 160, height: 46, background: 'rgba(222,190,118,.86)', mixBlendMode: 'multiply', transform: `rotate(${c.r}deg)`, clipPath: 'polygon(0 8%,4% 0,96% 6%,100% 0,98% 100%,94% 92%,4% 100%,0 90%)' }} />
          ))}
        </div>
        {/* index card */}
        <div
          style={{
            position: 'absolute',
            left: 120,
            top: 980,
            width: 560,
            padding: '34px 40px',
            background: '#fbf8f1',
            backgroundImage: 'repeating-linear-gradient(transparent 0 57px, rgba(80,120,190,.25) 57px 59px)',
            borderTop: '6px solid rgba(200,70,70,.5)',
            boxShadow: '0 22px 40px -8px rgba(0,0,0,.5)',
            transform: `translate(${(1 - card) * -500}px, ${(1 - card) * 500}px) rotate(${mix(-14, 4, card)}deg)`,
            opacity: card > 0 ? 1 : 0,
          }}
        >
          {p.card.slice(0, 3).map((c, i) => {
            const chk = k(f, T(2.92) + i * T(0.19), T(3.1) + i * T(0.19));
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, height: 59, fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 32, color: PENCIL }}>
                <svg width={36} height={36}>
                  <path d="M4 18 L14 28 L32 6" fill="none" stroke={ink} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - chk} />
                </svg>
                {c}
              </div>
            );
          })}
        </div>
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
          <path d={loopPath} fill="none" stroke={ink} strokeWidth={7} strokeLinecap="round" opacity={loop > 0 ? 0.9 : 0} />
          {loop >= 1 ? <path d="M672 1070 Q 720 1110 730 1170" fill="none" stroke={ink} strokeWidth={6} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - k(f, T(4.38), T(4.58))} /> : null}
        </svg>
        {p.aside ? (
          <div style={{ position: 'absolute', left: 690, top: 1180, fontFamily: fonts.minchoJP, fontSize: 56, color: ink, transform: 'rotate(-6deg)', clipPath: `inset(0 ${(1 - hand) * 100}% 0 0)`, fontWeight: 700 }}>
            {p.aside}
          </div>
        ) : null}
        {p.label ? (
          <div
            style={{
              position: 'absolute',
              left: 190,
              top: 1360,
              padding: '18px 34px',
              background: PENCIL,
              color: PAPERC,
              fontFamily: fonts.sansJP,
              fontWeight: 900,
              fontSize: 54,
              letterSpacing: '0.04em',
              transform: `scale(${mix(1.9, 1, slap)}) rotate(-3deg)`,
              opacity: slap > 0 ? 1 : 0,
              boxShadow: `0 ${mix(40, 6, slap)}px ${mix(60, 10, slap)}px rgba(0,0,0,.5)`,
              clipPath: 'polygon(0 4%,3% 0,100% 2%,98% 100%,2% 96%)',
            }}
          >
            {p.label}
          </div>
        ) : null}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 40%, transparent 55%, rgba(0,0,0,.45))' }} />
    </AbsoluteFill>
  );
};
