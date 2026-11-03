// "Big number" scene: a huge figure counts up while a glowing line chart draws itself in step with it,
// milestones pop as the line passes them, a payoff pill lands and a dot matrix sweeps out of the tip.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, fmtNum, k, lin, mix, rand, springX } from './kit';

export type StatChartProps = {
  brand?: string;
  label: string;
  from?: number;
  to: number;
  unit?: string;
  prefix?: string;
  decimals?: number;
  /** Optional series 0..1 shape; a smooth rising curve when absent. */
  series?: number[];
  /** Up to 3 milestones at a fraction of the run, with a short label. */
  milestones?: { at: number; label: string }[];
  payoff?: string;
  subtitle?: string;
  accent?: string;
};

const W = 1080;
const PLOT = { x: 140, y: 1010, w: 800, h: 480 };

export const StatChart: React.FC<StatChartProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const gold = p.accent ?? '#ecd29c';
  const t = (s: number) => s * fps;
  // the count runs over the first ~60% of the scene, then the payoff and the sweep
  const runEnd = Math.min(D * 0.5, t(3.4));
  const prog = E.inOutCubic(lin(f, t(0.25), runEnd));
  const enter = k(f, 0, t(0.55), E.outExpo);
  const from = p.from ?? 0;
  const value = mix(from, p.to, prog);
  const landKick = f > runEnd ? 1 + 0.06 * Math.exp(-7 * ((f - runEnd) / fps)) : 1;
  const N = 60;
  const shape = (u: number) => {
    if (p.series?.length && p.series.length > 1) {
      const s = p.series;
      const x = u * (s.length - 1);
      const i = Math.min(s.length - 2, Math.floor(x));
      return mix(s[i]!, s[i + 1]!, x - i);
    }
    return u ** 0.78;
  };
  const pts: [number, number][] = [];
  const upto = prog * N;
  for (let i = 0; i <= Math.floor(upto); i++) pts.push([i / N, shape(i / N)]);
  if (upto % 1 > 0) pts.push([upto / N, shape(upto / N)]);
  const X = (u: number) => PLOT.x + u * PLOT.w;
  const Y = (v: number) => PLOT.y + PLOT.h - v * PLOT.h * 0.92;
  const line = pts.map(([u, v], i) => `${i ? 'L' : 'M'}${X(u).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const tip = pts[pts.length - 1] ?? [0, shape(0)];
  const area = pts.length > 1 ? `${line} L${X(tip[0])} ${PLOT.y + PLOT.h} L${X(0)} ${PLOT.y + PLOT.h} Z` : '';
  const payoffAt = runEnd + t(0.35);
  const pill = springX(lin(f, payoffAt + t(0.25), payoffAt + t(1.05)), 1.3, 6);
  const burst = lin(f, payoffAt, payoffAt + t(0.7));
  const sweepStart = D - t(0.5);
  const sweep = lin(f, sweepStart, D);
  const push = 1 + 0.035 * lin(f, 0, D);
  const label = `${p.prefix ?? ''}${fmtNum(value, p.decimals ?? 0)}`;
  // the number and its unit share the width: about 0.62 em per digit or comma
  const size = Math.min(330, (900 - (p.unit ? 60 * [...p.unit].length : 0)) / (Math.max(3, label.length) * 0.6));
  return (
    <AbsoluteFill style={{ background: 'radial-gradient(120% 70% at 50% 0%, #3a1520 0%, #120a0d 60%)', overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translateY(${(1 - enter) * 260}px) scale(${(1.08 - 0.08 * enter) * push})`,
          filter: `blur(${(1 - enter) * 18}px)`,
          opacity: enter,
        }}
      >
        {p.brand ? (
          <div style={{ position: 'absolute', left: 90, top: 150, fontFamily: fonts.display, fontWeight: 800, fontSize: 30, letterSpacing: '0.26em', color: gold }}>
            ◆ {p.brand.toUpperCase()}
          </div>
        ) : null}
        <div style={{ position: 'absolute', right: 90, top: 156, display: 'flex', gap: 30, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 22, letterSpacing: '0.14em' }}>
          {['WEEK', 'MONTH', 'ALL'].map((w) => (
            <span key={w} style={{ color: w === 'ALL' ? '#f6ead2' : 'rgba(246,234,210,.35)', borderBottom: w === 'ALL' ? `3px solid ${gold}` : 'none', paddingBottom: 6 }}>
              {w}
            </span>
          ))}
        </div>
        <div style={{ position: 'absolute', left: 90, top: 300, fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 40, color: 'rgba(246,234,210,.62)' }}>{p.label}</div>
        <div style={{ position: 'absolute', left: 80, top: 360, display: 'flex', alignItems: 'baseline', gap: 18, transform: `scale(${landKick})`, transformOrigin: 'left center' }}>
          <span
            style={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              fontVariantNumeric: 'tabular-nums',
              backgroundImage: `linear-gradient(180deg, #fff8ea 10%, ${gold} 95%)`,
              WebkitBackgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {label}
          </span>
          {p.unit ? <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 48, color: gold }}>{p.unit}</span> : null}
        </div>
        {p.subtitle ? (
          <div style={{ position: 'absolute', left: 90, right: 90, top: 760, fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 44, lineHeight: 1.35, color: '#f6ead2' }}>
            {[...p.subtitle].map((ch, i, all) => (
              <span key={i} style={{ opacity: lin(f, t(0.5) + (i / all.length) * (runEnd - t(0.6)), t(0.5) + (i / all.length) * (runEnd - t(0.6)) + 4) }}>
                {ch}
              </span>
            ))}
          </div>
        ) : null}
        <svg width={W} height={1920} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <linearGradient id="sc-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={gold} stopOpacity="0.3" />
              <stop offset="1" stopColor={gold} stopOpacity="0" />
            </linearGradient>
            <filter id="sc-glow">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <line x1={PLOT.x} x2={PLOT.x + PLOT.w} y1={PLOT.y + (PLOT.h / 3) * i} y2={PLOT.y + (PLOT.h / 3) * i} stroke="rgba(246,234,210,.08)" strokeWidth="2" />
              <text x={PLOT.x - 24} y={PLOT.y + (PLOT.h / 3) * i + 8} textAnchor="end" fontFamily="ui-monospace, Menlo, monospace" fontSize="20" fill="rgba(246,234,210,.3)">
                {fmtNum(from + ((p.to - from) * (3 - i)) / 3, 0)}
              </text>
            </g>
          ))}
          {area ? <path d={area} fill="url(#sc-area)" /> : null}
          <path d={line} fill="none" stroke={gold} strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" filter="url(#sc-glow)" opacity="0.7" />
          <path d={line} fill="none" stroke={gold} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <line x1={X(tip[0])} x2={X(tip[0])} y1={Y(tip[1])} y2={PLOT.y + PLOT.h} stroke={gold} strokeOpacity="0.4" strokeWidth="2" strokeDasharray="6 8" />
          <circle cx={X(tip[0])} cy={Y(tip[1])} r="11" fill="#fff" />
          <circle cx={X(tip[0])} cy={Y(tip[1])} r={14 + 150 * E.outCubic(burst)} fill="none" stroke={gold} strokeWidth={4 * (1 - burst)} opacity={burst > 0 ? 1 - burst : 0} />
          {(p.milestones ?? []).slice(0, 3).map((m, i) => {
            const passed = lin(f, t(0.25) + (runEnd - t(0.25)) * m.at, t(0.25) + (runEnd - t(0.25)) * m.at + t(0.6));
            const s = springX(passed, 1.2, 6);
            const cx = X(m.at), cy = Y(shape(m.at));
            return (
              <g key={i} opacity={Math.min(1, passed * 3)} transform={`translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`}>
                <circle cx={cx} cy={cy} r="22" fill="#120a0d" stroke={gold} strokeWidth="4" />
                <circle cx={cx} cy={cy} r="8" fill={gold} />
                <text x={cx} y={cy - 40} textAnchor="middle" fontFamily={fonts.sansJP} fontWeight="700" fontSize="28" fill="#f6ead2">
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
        {p.payoff ? (
          <div
            style={{
              position: 'absolute',
              // centred over the tip but kept inside the frame (the tip ends near the right edge)
              left: Math.min(1080 - 40 - 600, Math.max(40, X(tip[0]) - 300)),
              width: 600,
              top: Y(tip[1]) - 150,
              display: 'flex',
              justifyContent: X(tip[0]) - 300 > 1080 - 640 ? 'flex-end' : 'center',
              transform: `scale(${pill})`,
              transformOrigin: '85% 100%',
              opacity: Math.min(1, pill * 2),
            }}
          >
            <span
              style={{
                padding: '16px 34px',
                borderRadius: 999,
                background: `linear-gradient(180deg, #fff3d6, ${gold})`,
                color: '#1d0d12',
                fontFamily: fonts.sansJP,
                fontWeight: 900,
                fontSize: 38,
                whiteSpace: 'nowrap',
                boxShadow: '0 20px 60px rgba(236,210,156,.35)',
              }}
            >
              {p.payoff}
            </span>
          </div>
        ) : null}
      </AbsoluteFill>
      {sweep > 0 ? <DotSweep progress={sweep} ox={X(tip[0])} oy={Y(tip[1])} color={gold} /> : null}
    </AbsoluteFill>
  );
};

/** The exit: a dot matrix grows out of the chart tip until it fills the frame. */
const DotSweep: React.FC<{ progress: number; ox: number; oy: number; color: string }> = ({ progress, ox, oy, color }) => {
  const pitch = 27;
  const dots: React.ReactNode[] = [];
  const maxD = Math.hypot(1080, 1920);
  for (let y = pitch / 2; y < 1920; y += pitch)
    for (let x = pitch / 2; x < 1080; x += pitch) {
      const d = Math.hypot(x - ox, y - oy) / maxD;
      const local = Math.min(1, Math.max(0, (progress * 1.6 - d) * 2.2 + rand(x * 7 + y) * 0.08));
      if (local <= 0) continue;
      dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={2 + local * pitch * 0.62} fill={local > 0.7 ? '#120a0d' : color} opacity={0.9} />);
    }
  return (
    <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
      {dots}
    </svg>
  );
};
