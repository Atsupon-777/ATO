// Motion styles, batch 11 (places and endings): access guide, paper map, shop info card, a tapped
// button, light leak, analog (VHS) look and a dive through a photo into the next one.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, asset, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

// ---------- access guide: station to shop on a simple street plan ----------

export type AccessGuideProps = {
  station: string;
  exit?: string;
  shop: string;
  minutes: number;
  accent?: string;
};

export const AccessGuide: React.FC<AccessGuideProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#f6f4ef';
  const road = L ? `color-mix(in srgb, ${L.ink} 10%, ${L.surface})` : '#ffffff';
  const ink = L?.ink ?? '#1a1b20';
  const accent = p.accent ?? L?.accent ?? '#ff5a36';
  const walk = k(f, t(0.8), D - t(1.0), E.inOutCubic);
  const pts = [[250, 1450], [250, 1080], [620, 1080], [620, 700], [820, 700]];
  // the walker's position along the polyline
  const seg = pts.slice(1).map((q, i) => Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  let d = walk * total, wx = pts[0][0], wy = pts[0][1];
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i]) { const r = d / seg[i]; wx = mix(pts[i][0], pts[i + 1][0], r); wy = mix(pts[i][1], pts[i + 1][1], r); break; }
    d -= seg[i]; wx = pts[i + 1][0]; wy = pts[i + 1][1];
  }
  const path = 'M ' + pts.map((q) => q.join(' ')).join(' L ');
  const arrive = springX(lin(f, D - t(1.0), D - t(0.4)), 1.3, 6);
  return (
    <AbsoluteFill style={{ background: bg }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {/* streets */}
        {[250, 620, 900].map((x) => <rect key={x} x={x - 40} y={380} width={80} height={1300} fill={road} />)}
        {[700, 1080, 1450].map((y) => <rect key={y} x={60} y={y - 40} width={960} height={80} fill={road} />)}
        {/* blocks */}
        {[[320, 790, 230, 220], [690, 790, 140, 220], [320, 1160, 230, 220], [690, 1160, 140, 220], [70, 1160, 110, 220], [70, 790, 110, 220]].map(([x, y, w, h], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} rx={14} fill={L ? `color-mix(in srgb, ${L.ink} 5%, ${L.bg})` : '#ebe7de'} />
        ))}
        <path d={path} fill="none" stroke={accent} strokeOpacity={0.25} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 26" />
        <path d={path} fill="none" stroke={accent} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - walk} />
      </svg>
      {/* station */}
      <div style={{ position: 'absolute', left: 120, top: 1500, padding: '18px 30px', borderRadius: 20, background: ink, color: bg, fontFamily: L?.body ?? fonts.sansJP, fontWeight: 800, fontSize: 38, opacity: k(f, 0, t(0.4)) }}>
        {p.station}
        {p.exit ? <span style={{ opacity: 0.7, fontSize: 30 }}> {p.exit}</span> : null}
      </div>
      {/* shop pin */}
      <div style={{ position: 'absolute', left: 820 - 50, top: 700 - 130, width: 100, transform: `scale(${arrive})`, transformOrigin: 'bottom center' }}>
        <svg width={100} height={130} viewBox="0 0 24 32"><path d="M12 0C5.4 0 0 5.2 0 11.6 0 20.3 12 32 12 32s12-11.7 12-20.4C24 5.2 18.6 0 12 0z" fill={accent} /><circle cx={12} cy={11.5} r={4.5} fill="#fff" /></svg>
      </div>
      <div style={{ position: 'absolute', right: 60, top: 470, padding: '18px 30px', borderRadius: 20, background: accent, color: L?.onAccent ?? '#fff', fontFamily: L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: 40, transform: `scale(${arrive})`, transformOrigin: 'right bottom' }}>{p.shop}</div>
      {/* walker */}
      <div style={{ position: 'absolute', left: wx - 34, top: wy - 34, width: 68, height: 68, borderRadius: 34, background: '#fff', boxShadow: `0 0 0 6px ${accent}, 0 10px 20px rgba(0,0,0,.2)`, display: 'grid', placeItems: 'center', transform: `translateY(${Math.abs(Math.sin(f / 3)) * -6}px)` }}><div style={{ width: 26, height: 26, borderRadius: 13, background: accent }} /></div>
      <div style={{ position: 'absolute', left: 80, top: 220, fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, color: ink }}>
        <div style={{ fontSize: 40, opacity: 0.6 }}>{p.station}から</div>
        <div style={{ fontSize: 100, lineHeight: 1.1 }}>
          徒歩 <span style={{ color: accent, fontFamily: fonts.display }}>{Math.max(1, Math.round(p.minutes * walk))}</span> 分
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- paper map unfolding ----------

export type PaperMapProps = {
  title: string;
  /** Marked places (0–1 coordinates on the map) with a short name. */
  spots: { x: number; y: number; name: string }[];
  accent?: string;
};

export const PaperMap: React.FC<PaperMapProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const red = p.accent ?? L?.accent ?? '#d1342a';
  const W = 900, H = 1200, X = 90, Y = 420;
  const o1 = k(f, t(0.1), t(0.8), E.inOutCubic); // left panel unfolds
  const o2 = k(f, t(0.6), t(1.3), E.inOutCubic); // right panel unfolds
  const panel = (i: number, children: React.ReactNode, rot: number, origin: string) => (
    <div style={{ position: 'absolute', left: X + i * (W / 3), top: Y, width: W / 3, height: H, overflow: 'hidden', transformOrigin: origin, transform: `perspective(2000px) rotateY(${rot}deg)`, background: '#f1e6cc', boxShadow: `inset ${i === 0 ? -20 : i === 2 ? 20 : 0}px 0 30px rgba(0,0,0,${0.12 + Math.abs(rot) / 600})`, backfaceVisibility: 'hidden' }}>
      <div style={{ position: 'absolute', left: -i * (W / 3), top: 0, width: W, height: H }}>{children}</div>
    </div>
  );
  const art = (
    <svg width={W} height={H}>
      <rect width={W} height={H} fill="#f1e6cc" />
      <path d="M -20 820 C 200 760, 360 900, 560 820 S 860 700, 940 760" fill="none" stroke="#9cc3d8" strokeWidth={48} />
      <path d="M 120 -20 C 160 300, 80 600, 220 1220" fill="none" stroke="#d8c7a0" strokeWidth={14} strokeDasharray="30 14" />
      <path d="M -20 380 L 940 300" fill="none" stroke="#d8c7a0" strokeWidth={18} />
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M ${rand(i) * 900} ${rand(i + 20) * 600 + 420} l 22 -40 l 22 40 z`} fill="#b9c79a" />
      ))}
      <rect x={20} y={20} width={W - 40} height={H - 40} fill="none" stroke="#b49a6a" strokeWidth={3} />
    </svg>
  );
  return (
    <AbsoluteFill style={{ background: L?.bg ?? '#3b4a3f' }}>
      <div style={{ position: 'absolute', top: 220, width: '100%', textAlign: 'center', fontFamily: L?.head ?? fonts.minchoJP, fontWeight: 800, fontSize: 70, color: L?.ink ?? '#f3ead6', opacity: k(f, t(0.8), t(1.3)) }}>{p.title}</div>
      {panel(0, art, mix(-175, 0, o1), 'right center')}
      {panel(1, art, 0, 'center')}
      {panel(2, art, mix(175, 0, o2), 'left center')}
      {/* fold creases */}
      {[1, 2].map((i) => <div key={i} style={{ position: 'absolute', left: X + (W / 3) * i - 1, top: Y, width: 2, height: H, background: 'rgba(0,0,0,.12)', opacity: o2 }} />)}
      {p.spots.slice(0, 5).map((s, i) => {
        const at = t(1.4) + i * ((D - t(2.0)) / Math.max(1, p.spots.length));
        const draw = lin(f, at, at + 10);
        const x = X + s.x * W, y = Y + s.y * H;
        return (
          <React.Fragment key={i}>
            <svg width={90} height={90} style={{ position: 'absolute', left: x - 45, top: y - 45 }}>
              <path d="M 15 15 L 75 75 M 75 15 L 15 75" stroke={red} strokeWidth={12} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - draw} />
            </svg>
            <div style={{ position: 'absolute', left: x + 46, top: y - 26, fontFamily: `"Klee One", ${fonts.sansJP}`, fontWeight: 600, fontSize: 38, color: red, opacity: lin(f, at + 6, at + 14) }}>{s.name}</div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- shop info card ----------

export type ShopCardProps = {
  name: string;
  address: string;
  hours: string;
  closed?: string;
  url?: string;
  /** A real QR code image if the shop has one (we never draw a fake one). */
  qr?: string;
  photo?: string;
  accent?: string;
};

export const ShopCard: React.FC<ShopCardProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#1a1714';
  const card = L?.surface ?? '#fbf8f2';
  const ink = L ? L.ink : '#1d1b18';
  const accent = p.accent ?? L?.accent ?? '#c8553d';
  const s = springX(lin(f, 0, t(0.8)), 1, 6);
  const rows = [
    { k: '住所', v: p.address },
    { k: '営業', v: p.hours },
    ...(p.closed ? [{ k: '定休', v: p.closed }] : []),
  ];
  return (
    <AbsoluteFill style={{ background: p.photo ? '#000' : bg }}>
      {p.photo ? <Img src={asset(p.photo)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(14px) brightness(.55)', transform: 'scale(1.1)' }} /> : null}
      <div style={{ position: 'absolute', left: 70, right: 70, top: 420, borderRadius: 44, background: card, padding: '60px 56px', boxShadow: '0 40px 100px rgba(0,0,0,.45)', transform: `translateY(${(1 - s) * 1200}px) rotate(${(1 - s) * -6}deg)` }}>
        <div style={{ fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 72, color: ink }}>{p.name}</div>
        <div style={{ width: 120, height: 8, borderRadius: 4, background: accent, margin: '26px 0 40px' }} />
        {rows.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 30, marginTop: i ? 30 : 0, opacity: k(f, t(0.6) + i * 5, t(0.9) + i * 5), transform: `translateX(${(1 - k(f, t(0.6) + i * 5, t(0.9) + i * 5)) * 40}px)` }}>
            <div style={{ flex: '0 0 100px', fontFamily: L?.body ?? fonts.sansJP, fontWeight: 800, fontSize: 34, color: accent }}>{r.k}</div>
            <div style={{ fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 38, color: ink, lineHeight: 1.45 }}>{r.v}</div>
          </div>
        ))}
        {p.qr || p.url ? (
          <div style={{ marginTop: 50, display: 'flex', alignItems: 'center', gap: 30, opacity: k(f, t(1.2), t(1.6)) }}>
            {p.qr ? <Img src={asset(p.qr)} style={{ width: 200, height: 200, borderRadius: 16, background: '#fff', padding: 10 }} /> : null}
            {p.url ? <div style={{ padding: '16px 30px', borderRadius: 99, background: ink, color: card, fontFamily: fonts.display, fontWeight: 700, fontSize: 34 }}>{p.url}</div> : null}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

// ---------- a button that gets tapped ----------

export type CtaTapProps = {
  label: string;
  note?: string;
  accent?: string;
};

export const CtaTap: React.FC<CtaTapProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#0e0f13';
  const accent = p.accent ?? L?.accent ?? '#dfff4f';
  const on = L?.onAccent ?? '#0e0f13';
  const appear = springX(lin(f, 0, t(0.6)), 1.2, 6);
  const tapAt = t(1.3);
  const press = lin(f, tapAt, tapAt + 4) * (1 - lin(f, tapAt + 4, tapAt + 10));
  const ripple = lin(f, tapAt, tapAt + t(0.7));
  const done = f > tapAt + 6;
  const finger = k(f, t(0.5), tapAt, E.inOutCubic);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(60% 40% at 50% 50%, color-mix(in srgb, ${accent} 16%, ${bg}) 0%, ${bg} 75%)`, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'relative', transform: `scale(${appear * (1 - 0.06 * press)})` }}>
        <div style={{ padding: '44px 110px', borderRadius: 99, background: accent, color: on, fontFamily: L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: 64, boxShadow: `0 ${30 - 20 * press}px 60px color-mix(in srgb, ${accent} 45%, transparent)`, display: 'flex', alignItems: 'center', gap: 20 }}>
          {done ? '✓ ' : ''}
          {p.label}
        </div>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 600, height: 600, marginLeft: -300, marginTop: -300, borderRadius: '50%', border: `6px solid ${accent}`, opacity: ripple > 0 ? 1 - ripple : 0, transform: `scale(${0.3 + ripple})` }} />
      </div>
      {/* the finger */}
      <svg width={180} height={220} viewBox="0 0 60 74" style={{ position: 'absolute', left: mix(800, 560, finger), top: mix(1500, 990, finger) + 16 * press, filter: 'drop-shadow(0 16px 20px rgba(0,0,0,.35))', opacity: f > tapAt + t(0.9) ? 1 - lin(f, tapAt + t(0.9), tapAt + t(1.2)) : 1 }}>
        <path d="M22 6c0-3 5-3 5 0v26l3-1V24c0-3 5-3 5 0v8l3-.5V28c0-3 5-3 5 0v6l3 0c0-3 5-3 5 0v18c0 10-7 18-17 18h-4c-6 0-11-4-14-10L8 44c-2-3 2-6 5-3l9 9z" fill="#ffd9c0" stroke="#d9a688" strokeWidth={1.2} />
      </svg>
      {p.note ? <div style={{ position: 'absolute', bottom: 380, fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 38, color: L?.ink ?? '#fff', opacity: k(f, tapAt + 8, tapAt + 18) }}>{p.note}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- light leak over a photo ----------

export type LightLeakProps = {
  image: string;
  title?: string;
  accent?: string;
};

export const LightLeak: React.FC<LightLeakProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const T = f / fps;
  const burst = Math.max(0, Math.sin(lin(f, 0, t(0.9)) * Math.PI)) + Math.max(0, Math.sin(lin(f, D - t(0.9), D) * Math.PI)); // flares at both ends
  const drift = lin(f, 0, D);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Img src={asset(p.image)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${mix(1.06, 1.14, drift)})`, filter: `saturate(1.1) contrast(1.05) brightness(${1 + burst * 0.5})` }} />
      {[
        { c: '255,120,40', x: -200 + Math.sin(T * 0.8) * 120, y: 300, r: 900 },
        { c: '255,60,90', x: 700 + Math.cos(T * 0.7) * 140, y: 1300, r: 800 },
        { c: '255,210,120', x: 300 + Math.sin(T * 1.1) * 200, y: 800 + Math.cos(T) * 200, r: 600 },
      ].map((b, i) => (
        <div key={i} style={{ position: 'absolute', left: b.x - b.r / 2, top: b.y - b.r / 2, width: b.r, height: b.r, borderRadius: '50%', background: `radial-gradient(circle, rgba(${b.c},.85) 0%, rgba(${b.c},0) 70%)`, mixBlendMode: 'screen', opacity: 0.45 + 0.5 * burst + 0.1 * Math.sin(T * 2 + i) }} />
      ))}
      {/* film grain */}
      <AbsoluteFill style={{ backgroundImage: `repeating-radial-gradient(circle at ${rand(f) * 100}% ${rand(f + 1) * 100}%, rgba(255,255,255,.05) 0 1px, transparent 1px 3px)`, mixBlendMode: 'overlay' }} />
      {p.title ? <div style={{ position: 'absolute', bottom: 280, width: '100%', textAlign: 'center', fontFamily: L?.head ?? fonts.minchoJP, fontWeight: 700, fontSize: 80, color: '#fff', textShadow: '0 4px 30px rgba(0,0,0,.5)', opacity: k(f, t(0.8), t(1.4)) }}>{p.title}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- analog / VHS ----------

export type AnalogProps = {
  image: string;
  title?: string;
  /** Date shown in the corner, camcorder style. */
  stamp?: string;
};

export const Analog: React.FC<AnalogProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const jitter = (rand(Math.floor(f / 2)) - 0.5) * 6;
  const glitch = rand(Math.floor(f / 3) + 77) > 0.9;
  const shift = 6 + (glitch ? 18 : 0);
  const tracking = (f * 9) % 2200 - 140;
  const src = asset(p.image);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {/* RGB split: red and blue copies offset sideways */}
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${jitter}px)`, filter: 'saturate(1.25) contrast(1.15) sepia(.18) blur(.6px)' }} />
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${jitter + shift}px)`, mixBlendMode: 'screen', opacity: 0.35, filter: 'grayscale(1) sepia(1) hue-rotate(-50deg) saturate(6)' }} />
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `translateX(${jitter - shift}px)`, mixBlendMode: 'screen', opacity: 0.3, filter: 'grayscale(1) sepia(1) hue-rotate(160deg) saturate(6)' }} />
      {/* scanlines + a rolling tracking band */}
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 2px, transparent 2px 5px)' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: tracking, height: 90, background: 'linear-gradient(180deg, transparent, rgba(255,255,255,.18), transparent)', filter: 'blur(4px)' }} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 220px rgba(0,0,0,.75)' }} />
      <div style={{ position: 'absolute', left: 70, top: 160, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: 48, color: '#fff', textShadow: '3px 0 rgba(255,0,0,.6), -3px 0 rgba(0,160,255,.6)', display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 30, height: 30, borderRadius: 15, background: '#ff2a2a', opacity: Math.floor(f / 15) % 2 ? 1 : 0.2 }} /> REC
      </div>
      <div style={{ position: 'absolute', right: 70, bottom: 170, fontFamily: 'ui-monospace, Menlo, monospace', fontWeight: 700, fontSize: 44, color: '#ffe9a8', textShadow: '3px 0 rgba(255,0,0,.6), -3px 0 rgba(0,160,255,.6)' }}>{p.stamp ?? 'NOV. 3 2026'}</div>
      {p.title ? <div style={{ position: 'absolute', top: 820, width: '100%', textAlign: 'center', fontFamily: L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: 96, color: '#fff', textShadow: `${shift}px 0 rgba(255,0,60,.7), ${-shift}px 0 rgba(0,200,255,.7)`, opacity: k(f, t(0.5), t(0.9)) }}>{p.title}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- dive through a photo into the next ----------

export type PhotoDiveProps = {
  /** Two or three photos; the camera pushes through each into the next. */
  images: string[];
  captions?: string[];
};

export const PhotoDive: React.FC<PhotoDiveProps> = (p) => {
  const f = useCurrentFrame();
  const { durationInFrames: D } = useVideoConfig();
  const L = useLook();
  const imgs = p.images.slice(0, 3);
  const n = imgs.length;
  const per = D / n;
  const i = Math.min(n - 1, Math.floor(f / per));
  const local = (f - i * per) / per;
  const push = E.inCubic(lin(local, 0.55, 1)); // last part of each shot accelerates into the photo
  const next = Math.min(n - 1, i + 1);
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {i < n - 1 ? (
        <Img src={asset(imgs[next])} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${mix(0.4, 1, push)})`, opacity: push, borderRadius: mix(60, 0, push) }} />
      ) : null}
      <Img src={asset(imgs[i])} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${mix(1, 1.12, local) * mix(1, 5, push)})`, opacity: 1 - push, filter: push > 0 ? `blur(${push * 18}px)` : undefined }} />
      {p.captions?.[i] ? (
        <div style={{ position: 'absolute', bottom: 300, width: '100%', textAlign: 'center', fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 78, color: '#fff', textShadow: '0 6px 30px rgba(0,0,0,.55)', opacity: lin(local, 0.08, 0.2) * (1 - lin(local, 0.5, 0.6)) }}>{p.captions[i]}</div>
      ) : null}
    </AbsoluteFill>
  );
};
