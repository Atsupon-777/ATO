// Map scenes: a route travelling through a tilted 3D city, and a globe that turns and dives to a place.
// Everything is drawn in code (no map tiles), so it renders offline and never shows a real map's brand.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

// ---------- route through a city ----------

export type MapRouteProps = {
  from: string;
  to: string;
  /** e.g. "徒歩6分" — shown on the arrival pin. */
  eta?: string;
  accent?: string;
};

const GRID = 9, CELL = 150;
/** Road cells are every third row and column; the rest are blocks with deterministic heights. */
const isRoad = (x: number, y: number) => x % 3 === 1 || y % 3 === 1;
/** The route: along road cells from bottom-left to top-right, as cell-centre points. */
const ROUTE: [number, number][] = [
  [1, 8], [1, 7], [1, 6], [1, 5], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [5, 1], [6, 1], [7, 1],
];

export const MapRoute: React.FC<MapRouteProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#2f7cf6';
  const dark = L?.dark ?? false;
  const ground = dark ? '#1b1e25' : '#eef0f3';
  const block = dark ? '#2a2f3a' : '#ffffff';
  const side = dark ? '#20242d' : '#d9dde4';
  const road = dark ? '#14161b' : '#e3e6eb';
  const ink = L?.ink ?? '#14161c';
  const intro = k(f, 0, t(1.0), E.outExpo);
  const go = E.inOutCubic(lin(f, t(0.8), D - t(1.2)));
  const arrive = springX(lin(f, D - t(1.2), D - t(0.5)), 1.2, 6);
  // route length so far, along the polyline
  const segs = ROUTE.slice(1).map((pt, i) => Math.hypot(pt[0] - ROUTE[i]![0], pt[1] - ROUTE[i]![1]));
  const total = segs.reduce((a, b) => a + b, 0);
  let left = go * total;
  const drawn: [number, number][] = [ROUTE[0]!];
  for (let i = 0; i < segs.length && left > 0; i++) {
    const a = ROUTE[i]!, b = ROUTE[i + 1]!, d = Math.min(left, segs[i]!);
    drawn.push([a[0] + ((b[0] - a[0]) * d) / segs[i]!, a[1] + ((b[1] - a[1]) * d) / segs[i]!]);
    left -= segs[i]!;
  }
  const head = drawn[drawn.length - 1]!;
  const px = (c: number) => c * CELL + CELL / 2;
  // the camera follows the head of the route
  const camX = mix(GRID * CELL * 0.35, px(head[0]), 0.6), camY = mix(GRID * CELL * 0.6, px(head[1]), 0.6);
  const end = ROUTE[ROUTE.length - 1]!;
  return (
    <AbsoluteFill style={{ background: ground, overflow: 'hidden', perspective: 1800 }}>
      <div
        style={{
          position: 'absolute',
          left: 540 - camX,
          top: 1000 - camY,
          width: GRID * CELL,
          height: GRID * CELL,
          transformStyle: 'preserve-3d',
          transformOrigin: `${camX}px ${camY}px`,
          transform: `rotateX(${mix(20, 55, intro)}deg) rotateZ(${mix(0, -32, intro)}deg) scale(${mix(0.8, 1.15, intro)})`,
        }}
      >
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const x = i % GRID, y = Math.floor(i / GRID);
          if (isRoad(x, y)) return <div key={i} style={{ position: 'absolute', left: x * CELL, top: y * CELL, width: CELL, height: CELL, background: road }} />;
          const h = 30 + Math.round(rand(i) * 4) * 40;
          const grow = k(f, t(0.1) + rand(i + 3) * t(0.5), t(0.7) + rand(i + 3) * t(0.5), E.outCubic);
          const hh = h * grow;
          return (
            <div key={i} style={{ position: 'absolute', left: x * CELL + 10, top: y * CELL + 10, width: CELL - 20, height: CELL - 20, transformStyle: 'preserve-3d' }}>
              {/* two visible walls and the roof */}
              <div style={{ position: 'absolute', left: 0, bottom: 0, width: CELL - 20, height: hh, background: side, transformOrigin: 'bottom', transform: 'rotateX(-90deg)' }} />
              <div style={{ position: 'absolute', right: 0, top: 0, width: hh, height: CELL - 20, background: side, filter: 'brightness(.92)', transformOrigin: 'right', transform: 'rotateY(90deg)' }} />
              <div style={{ position: 'absolute', inset: 0, background: block, borderRadius: 6, transform: `translateZ(${hh}px)`, boxShadow: dark ? 'none' : 'inset 0 0 0 1px rgba(20,22,28,.05)' }} />
            </div>
          );
        })}
        <svg width={GRID * CELL} height={GRID * CELL} style={{ position: 'absolute', inset: 0, transform: 'translateZ(2px)' }}>
          <polyline points={drawn.map(([x, y]) => `${px(x)},${px(y)}`).join(' ')} fill="none" stroke={accent} strokeOpacity={0.25} strokeWidth={46} strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={drawn.map(([x, y]) => `${px(x)},${px(y)}`).join(' ')} fill="none" stroke={accent} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={px(ROUTE[0]![0])} cy={px(ROUTE[0]![1])} r={22} fill="#fff" stroke={accent} strokeWidth={8} />
          <circle cx={px(head[0])} cy={px(head[1])} r={30} fill={accent} opacity={0.25 + 0.15 * Math.sin(f / 4)} />
          <circle cx={px(head[0])} cy={px(head[1])} r={18} fill={accent} stroke="#fff" strokeWidth={6} />
        </svg>
        {/* arrival pin stands up out of the map */}
        <div
          style={{
            position: 'absolute',
            left: px(end[0]) - 60,
            top: px(end[1]) - 60,
            width: 120,
            height: 120,
            transformOrigin: 'bottom center',
            transform: `translateZ(4px) rotateX(-90deg) translateY(-60px) scale(${arrive})`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div style={{ width: 90, height: 90, borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)', background: accent, boxShadow: '0 20px 40px rgba(0,0,0,.25)' }} />
        </div>
      </div>
      {/* labels sit flat on screen so they stay readable */}
      <div style={{ position: 'absolute', left: 70, right: 70, top: 200, display: 'flex', flexDirection: 'column', gap: 16, opacity: k(f, t(0.2), t(0.7)) }}>
        <div style={{ fontFamily: L?.body ?? fonts.sansJP, fontSize: 30, color: L?.muted ?? 'rgba(20,22,28,.55)', fontWeight: 700 }}>{p.from}</div>
        <div style={{ fontFamily: L?.head ?? fonts.sansJP, fontSize: 64, fontWeight: L?.headWeight ?? 900, color: ink, lineHeight: 1.15 }}>{p.to}</div>
      </div>
      {p.eta ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 1500,
            transform: `translateX(-50%) scale(${arrive})`,
            padding: '22px 44px',
            borderRadius: 99,
            background: accent,
            color: L?.onAccent ?? '#fff',
            fontFamily: L?.head ?? fonts.sansJP,
            fontWeight: 900,
            fontSize: 44,
            whiteSpace: 'nowrap',
            boxShadow: '0 20px 50px rgba(0,0,0,.2)',
          }}
        >
          {p.eta}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- globe dive ----------

export type GlobeZoomProps = {
  /** Where it lands, in degrees. */
  lat: number;
  lon: number;
  place: string;
  note?: string;
  accent?: string;
};

/** Rough continents as lon/lat dots sampled from a few blobs: enough to read as Earth, not a map product. */
const LAND: [number, number, number][] = [
  // lon, lat, radius (degrees)
  [140, 37, 9], [128, 37, 5], [105, 33, 22], [80, 22, 11], [45, 55, 20], [90, 60, 25], [15, 50, 12], [20, 5, 20], [25, -20, 14],
  [-100, 45, 22], [-80, 35, 10], [-100, 22, 8], [-60, -10, 16], [-65, -35, 9], [135, -25, 14], [-40, 72, 10], [115, -2, 8],
];

export const GlobeZoom: React.FC<GlobeZoomProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#ff5a36';
  const bg = L?.bg ?? '#05070d';
  const spin = E.inOutCubic(lin(f, 0, D * 0.6));
  const dive = E.inOutCubic(lin(f, D * 0.55, D * 0.85));
  const label = springX(lin(f, D * 0.75, D * 0.95), 1.2, 6);
  const R = 380 * (1 + dive * 2.6);
  const rotLon = mix(p.lon + 160, p.lon, spin);
  const tilt = mix(10, p.lat, spin) * (Math.PI / 180);
  const proj = (lon: number, lat: number) => {
    const l = ((lon - rotLon) * Math.PI) / 180, ph = (lat * Math.PI) / 180;
    const x = Math.cos(ph) * Math.sin(l);
    const y0 = Math.sin(ph), z0 = Math.cos(ph) * Math.cos(l);
    const y = y0 * Math.cos(tilt) - z0 * Math.sin(tilt);
    const z = y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
    return { x: 540 + x * R, y: 900 - y * R, z };
  };
  const dots: React.ReactNode[] = [];
  // denser dots far out, sparser as the camera dives so the frame never fills with polka dots
  const step = dive > 0.5 ? 1.5 : 2.5;
  for (let lat = -80; lat <= 80; lat += step)
    for (let lon = -180; lon < 180; lon += step) {
      const land = LAND.some(([a, b, r]) => Math.hypot((lon - a) * Math.cos((lat * Math.PI) / 180), lat - b) < r);
      if (!land) continue;
      const q = proj(lon, lat);
      if (q.z <= 0) continue;
      dots.push(<circle key={`${lon},${lat}`} cx={q.x} cy={q.y} r={Math.min(5, 2.6 * Math.sqrt(R / 380))} fill={L?.ink ?? '#cfe0ff'} opacity={(0.25 + 0.65 * q.z) * (1 - 0.6 * dive)} />);
    }
  const target = proj(p.lon, p.lat);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(70% 45% at 50% 47%, ${L?.surface ?? '#0f1a33'} 0%, ${bg} 70%)`, overflow: 'hidden' }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="gz-body" cx="40%" cy="35%">
            <stop offset="0" stopColor={L?.surface ?? '#1a2c55'} />
            <stop offset="1" stopColor={bg} />
          </radialGradient>
          <radialGradient id="gz-air">
            <stop offset="0.86" stopColor={accent} stopOpacity="0" />
            <stop offset="0.93" stopColor={L?.ink ?? '#8fb3ff'} stopOpacity="0.22" />
            <stop offset="1" stopColor={L?.ink ?? '#8fb3ff'} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={540} cy={900} r={R * 1.12} fill="url(#gz-air)" />
        <circle cx={540} cy={900} r={R} fill="url(#gz-body)" />
        {dots}
        {target.z > 0 ? (
          <g>
            <circle cx={target.x} cy={target.y} r={18 + 30 * ((f % 30) / 30)} fill="none" stroke={accent} strokeWidth={4} opacity={1 - (f % 30) / 30} />
            <circle cx={target.x} cy={target.y} r={14} fill={accent} />
          </g>
        ) : null}
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 1440, textAlign: 'center', transform: `scale(${label})`, opacity: Math.min(1, label * 2) }}>
        <div style={{ fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 76, color: L?.ink ?? '#fff' }}>{p.place}</div>
        {p.note ? <div style={{ marginTop: 14, fontFamily: L?.body ?? fonts.sansJP, fontSize: 34, color: L?.muted ?? 'rgba(255,255,255,.65)' }}>{p.note}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
