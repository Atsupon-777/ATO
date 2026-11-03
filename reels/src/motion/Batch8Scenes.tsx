// Motion styles, batch 8 (built on the customer's own photos): 2.5D photo, photo wall, collage,
// polaroids, text filled with a photo and split screen. Photo props take a URL or a public/ path.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, asset, k, lin, mix, rand, springX } from './kit';
import { useLook } from './theme';

// ---------- 2.5D photo: the subject stays sharp while the frame drifts, depth from blur layers ----------

export type Photo25dProps = {
  image: string;
  title?: string;
  sub?: string;
  /** Where the subject sits (0–1), the part kept sharp. */
  focus?: { x: number; y: number };
  accent?: string;
};

export const Photo25d: React.FC<Photo25dProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const fx = (p.focus?.x ?? 0.5) * 100, fy = (p.focus?.y ?? 0.45) * 100;
  const m = lin(f, 0, D);
  const src = asset(p.image);
  // background layer moves more and is blurred; the sharp subject layer moves less: parallax
  const bg = `translate(${mix(-40, 40, m)}px, ${mix(10, -10, m)}px) scale(${mix(1.22, 1.3, m)})`;
  const fg = `translate(${mix(-12, 12, m)}px, ${mix(4, -4, m)}px) scale(${mix(1.12, 1.17, m)})`;
  const mask = `radial-gradient(48% 34% at ${fx}% ${fy}%, #000 55%, transparent 100%)`;
  const txt = k(f, t(0.8), t(1.4));
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: bg, filter: 'blur(9px) brightness(.85)' }} />
      <Img src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transform: fg, WebkitMaskImage: mask, maskImage: mask }} />
      {/* light dust drifting in front adds a third depth layer */}
      {Array.from({ length: 22 }, (_, i) => (
        <div key={i} style={{ position: 'absolute', left: ((rand(i) * 1080 + f * (0.6 + rand(i + 4))) % 1140) - 30, top: rand(i + 50) * 1920 - f * 0.4 * rand(i + 9), width: 6 + rand(i + 2) * 10, height: 6 + rand(i + 2) * 10, borderRadius: '50%', background: 'rgba(255,240,220,.5)', filter: 'blur(2px)' }} />
      ))}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(0,0,0,.65) 100%)' }} />
      {p.title ? (
        <div style={{ position: 'absolute', bottom: 260, left: 80, right: 80, opacity: txt, transform: `translateY(${(1 - txt) * 40}px)` }}>
          <div style={{ fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 84, color: '#fff', lineHeight: 1.2 }}>{p.title}</div>
          {p.sub ? <div style={{ marginTop: 16, fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 38, color: 'rgba(255,255,255,.8)' }}>{p.sub}</div> : null}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- photo wall: many photos tile the screen, the camera dives into one ----------

export type PhotoWallProps = {
  images: string[];
  /** Index of the photo the camera ends on. */
  hero?: number;
  title?: string;
  accent?: string;
};

export const PhotoWall: React.FC<PhotoWallProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const cols = 4, rows = 7, cw = 270, ch = 274;
  const hero = Math.min(cols * rows - 1, p.hero ?? 13);
  const hx = (hero % cols) * cw + cw / 2, hy = Math.floor(hero / cols) * ch + ch / 2;
  const dive = k(f, t(1.4), D - t(0.4), E.inOutCubic);
  const s = mix(1, 4.2, dive);
  const tx = mix(0, 540 - hx, dive), ty = mix(0, 960 - hy, dive);
  return (
    <AbsoluteFill style={{ background: L?.bg ?? '#0b0b0d', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: -10, width: cols * cw, height: rows * ch, transform: `translate(${tx}px, ${ty}px) scale(${s})`, transformOrigin: `${hx}px ${hy}px` }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const img = p.images[(i * 7) % p.images.length];
          const pop = springX(lin(f, (rand(i) * t(0.9)) | 0, ((rand(i) * t(0.9)) | 0) + t(0.5)), 1.2, 6);
          const isHero = i === hero;
          return (
            <div key={i} style={{ position: 'absolute', left: (i % cols) * cw + 6, top: Math.floor(i / cols) * ch + 6, width: cw - 12, height: ch - 12, borderRadius: 18, overflow: 'hidden', transform: `scale(${pop})`, opacity: isHero ? 1 : mix(1, 0.35, dive), boxShadow: isHero ? `0 0 0 ${4 * dive}px ${L?.accent ?? '#fff'}` : 'none' }}>
              <Img src={asset(isHero ? p.images[0] : img)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          );
        })}
      </div>
      {p.title ? (
        <div style={{ position: 'absolute', bottom: 240, width: '100%', textAlign: 'center', fontFamily: L?.head ?? fonts.sansJP, fontWeight: L?.headWeight ?? 900, fontSize: 76, color: '#fff', textShadow: '0 6px 30px rgba(0,0,0,.6)', opacity: k(f, D - t(1.2), D - t(0.7)) }}>
          {p.title}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- collage: cut-out photos stuck on paper in stop-motion steps ----------

export type CollageProps = {
  images: string[];
  words: string[];
  accent?: string;
};

export const Collage: React.FC<CollageProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#ff4f2e';
  const step = Math.floor(f / 4); // stop-motion: everything jitters on 4-frame steps
  const jit = (i: number, a: number) => (rand(step * 13 + i * 7) - 0.5) * a;
  const items = [
    ...p.images.slice(0, 4).map((img, i) => ({ kind: 'img' as const, img, i })),
    ...p.words.slice(0, 3).map((w, i) => ({ kind: 'word' as const, w, i })),
  ];
  const slots = [
    { x: 80, y: 280, w: 560, h: 700, r: -6 },
    { x: 470, y: 520, w: 520, h: 640, r: 5 },
    { x: 130, y: 1040, w: 480, h: 560, r: 3 },
    { x: 560, y: 1180, w: 420, h: 480, r: -4 },
  ];
  const per = (D - t(1.0)) / items.length;
  return (
    <AbsoluteFill style={{ background: '#ece6da', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.025) 0 2px, transparent 2px 6px)' }} />
      {items.map((it, j) => {
        const at = t(0.2) + j * per;
        if (f < at) return null;
        const landed = f >= at + 4;
        if (it.kind === 'img') {
          const s = slots[it.i];
          return (
            <div key={j} style={{ position: 'absolute', left: s.x + jit(j, 6), top: s.y + jit(j + 1, 6), width: s.w, height: s.h, transform: `rotate(${s.r + jit(j + 2, 1.5)}deg) scale(${landed ? 1 : 1.12})`, background: '#fff', padding: 14, boxShadow: '0 16px 30px rgba(0,0,0,.25)', clipPath: 'polygon(2% 1%, 97% 0%, 100% 6%, 98% 98%, 4% 100%, 0% 94%)' }}>
              <Img src={asset(it.img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'contrast(1.05) saturate(1.1)' }} />
              <div style={{ position: 'absolute', top: -18, left: '40%', width: 140, height: 44, background: 'rgba(255,230,140,.75)', transform: `rotate(${-8 + jit(j, 4)}deg)` }} />
            </div>
          );
        }
        // words: ransom-note style blocks
        const y = [180, 980, 1640][it.i];
        return (
          <div key={j} style={{ position: 'absolute', left: 60 + it.i * 120 + jit(j, 8), top: y + jit(j + 3, 8), display: 'flex', gap: 6, transform: `rotate(${(it.i % 2 ? 4 : -4) + jit(j, 2)}deg) scale(${landed ? 1 : 1.2})` }}>
            {[...it.w].map((c, ci) => (
              <span key={ci} style={{ fontFamily: ci % 2 ? fonts.minchoJP : fonts.sansJP, fontWeight: 900, fontSize: 92, padding: '4px 14px', background: (ci + it.i) % 3 === 0 ? accent : (ci + it.i) % 3 === 1 ? '#111' : '#fff', color: (ci + it.i) % 3 === 2 ? '#111' : '#fff', transform: `rotate(${(rand(ci + it.i * 9) - 0.5) * 10}deg)`, boxShadow: '0 6px 12px rgba(0,0,0,.2)' }}>
                {c}
              </span>
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- polaroids thrown onto a table ----------

export type PolaroidsProps = {
  images: string[];
  captions?: string[];
  title?: string;
  accent?: string;
};

export const Polaroids: React.FC<PolaroidsProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const imgs = p.images.slice(0, 5);
  const per = (D - t(1.4)) / imgs.length;
  const spots = [
    { x: 120, y: 360, r: -9 },
    { x: 480, y: 520, r: 7 },
    { x: 160, y: 930, r: 5 },
    { x: 500, y: 1080, r: -6 },
    { x: 300, y: 700, r: 2 },
  ];
  return (
    <AbsoluteFill style={{ background: L?.bg ?? 'radial-gradient(90% 70% at 50% 40%, #6d5440 0%, #3e2d22 100%)', overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'repeating-linear-gradient(92deg, rgba(0,0,0,.06) 0 3px, transparent 3px 22px)' }} />
      {imgs.map((img, i) => {
        const at = t(0.2) + i * per;
        const throwIn = k(f, at, at + t(0.45), E.outCubic);
        const settle = springX(lin(f, at + t(0.3), at + t(0.9)), 1.5, 6);
        const s = spots[i];
        const develop = lin(f, at + t(0.3), at + t(1.6)); // the photo develops from pale to full colour
        if (f < at) return null;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: s.x,
              top: s.y,
              width: 440,
              padding: '22px 22px 90px',
              background: '#fbfaf6',
              boxShadow: `0 ${mix(80, 18, throwIn)}px ${mix(80, 30, throwIn)}px rgba(0,0,0,.4)`,
              transform: `translate(${(1 - throwIn) * (i % 2 ? 900 : -900)}px, ${(1 - throwIn) * 400}px) rotate(${s.r + (1 - throwIn) * (i % 2 ? 60 : -60) + (1 - settle) * 3}deg) scale(${mix(1.25, 1, throwIn)})`,
            }}
          >
            <div style={{ width: 396, height: 396, overflow: 'hidden', background: '#ddd' }}>
              <Img src={asset(img)} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: `saturate(${mix(0.1, 1.05, develop)}) brightness(${mix(1.6, 1, develop)}) contrast(${mix(0.6, 1, develop)})` }} />
            </div>
            {p.captions?.[i] ? <div style={{ marginTop: 22, textAlign: 'center', fontFamily: `"Klee One", ${fonts.sansJP}`, fontWeight: 600, fontSize: 40, color: '#333' }}>{p.captions[i]}</div> : null}
          </div>
        );
      })}
      {p.title ? (
        <div style={{ position: 'absolute', bottom: 200, width: '100%', textAlign: 'center', fontFamily: L?.head ?? `"Klee One", ${fonts.sansJP}`, fontWeight: 700, fontSize: 78, color: '#fff', textShadow: '0 6px 24px rgba(0,0,0,.5)', opacity: k(f, D - t(1.2), D - t(0.7)) }}>{p.title}</div>
      ) : null}
    </AbsoluteFill>
  );
};

// ---------- huge text filled with a photo ----------

export type TextMaskProps = {
  text: string;
  image: string;
  sub?: string;
  accent?: string;
};

export const TextMask: React.FC<TextMaskProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const bg = L?.bg ?? '#f4f1ea';
  const cs = [...p.text];
  const size = Math.min(520, 1500 / Math.max(2, cs.length));
  const zoom = k(f, 0, t(1.2), E.outExpo);
  // at the end the letters open up and the photo fills the frame
  const open = k(f, D - t(1.1), D - t(0.2), E.inOutCubic);
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Img src={asset(p.image)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: open, transform: `scale(${mix(1.3, 1, open)})` }} />
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 0.9,
          letterSpacing: '-0.04em',
          textAlign: 'center',
          backgroundImage: `url(${asset(p.image)})`,
          backgroundSize: `${mix(240, 140, zoom)}% auto`,
          backgroundPosition: `${mix(30, 60, lin(f, 0, D))}% 50%`,
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          transform: `scale(${mix(0.6, 1, zoom) * mix(1, 6, open)})`,
          opacity: 1 - open,
          wordBreak: 'break-all',
          maxWidth: 1000,
        }}
      >
        {p.text}
      </div>
      {p.sub ? <div style={{ position: 'absolute', bottom: 360, fontFamily: L?.body ?? fonts.sansJP, fontWeight: 800, fontSize: 40, letterSpacing: '0.2em', color: L?.ink ?? '#15161a', opacity: k(f, t(0.8), t(1.3)) * (1 - open) }}>{p.sub}</div> : null}
    </AbsoluteFill>
  );
};

// ---------- split screen ----------

export type SplitScreenProps = {
  /** 2 or 3 photos with a short label each, shown as stacked panels. */
  panels: { image: string; label: string }[];
  accent?: string;
};

export const SplitScreen: React.FC<SplitScreenProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#dfff4f';
  const panels = p.panels.slice(0, 3);
  const n = panels.length;
  const h = 1920 / n;
  return (
    <AbsoluteFill style={{ background: '#000', overflow: 'hidden' }}>
      {panels.map((pn, i) => {
        const s = k(f, i * 5, t(0.6) + i * 5, E.outExpo);
        const dir = i % 2 ? 1 : -1;
        const drift = lin(f, 0, D);
        return (
          <div key={i} style={{ position: 'absolute', left: 0, right: 0, top: i * h, height: h - (i < n - 1 ? 8 : 0), overflow: 'hidden', transform: `translateX(${(1 - s) * dir * 1100}px)` }}>
            <Img src={asset(pn.image)} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(1.15) translateX(${dir * mix(-20, 20, drift)}px)` }} />
            <div style={{ position: 'absolute', [i % 2 ? 'right' : 'left']: 50, bottom: 40, padding: '12px 28px', background: accent, color: L?.onAccent ?? '#111', fontFamily: L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: 44, opacity: k(f, t(0.6) + i * 6, t(0.9) + i * 6), transform: `translateY(${(1 - k(f, t(0.6) + i * 6, t(0.9) + i * 6)) * 30}px)` } as React.CSSProperties}>
              {pn.label}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
