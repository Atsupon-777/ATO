// The style axes as React wrappers: camera move, transition in, texture and accent overlays.
// EffectsReel wraps every scene effect in these, so any scene can wear any combination.
import React from 'react';
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from 'remotion';
import { evolvePath } from '@remotion/paths';
import { fonts } from '../lib/fonts';
import { clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import type { CameraMove, Texture, Transition } from './axes';
import { Filters } from './Craft';
import { DepthContext, Subject, Vignette, rand, useSource } from './layers';

const TRANSITION_FRAMES = 9;

/** Moves the whole frame (footage and graphics) like a camera would. */
export const CameraMotion: React.FC<{ move?: CameraMove; children: React.ReactNode }> = ({ move = 'still', children }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / Math.max(1, durationInFrames - 1);
  const src = useSource();
  let transform = '';
  let filter: string | undefined;
  // parallax: extra shift for the wall (bg) and the person (fg); only visible with a matte
  let bg: string | undefined;
  let fg: string | undefined;
  const e = easeInOut(t);
  switch (move) {
    case 'push':
      transform = `scale(${1 + 0.09 * easeInOut(t)})`;
      break;
    case 'pull':
      transform = `scale(${1.12 - 0.12 * easeInOut(t)})`;
      break;
    case 'drift':
      transform = `scale(1.06) translateX(${interpolate(t, [0, 1], [-24, 24])}px)`;
      break;
    case 'punch': {
      const at = Math.round(durationInFrames * 0.4);
      transform = `scale(${1 + 0.16 * progress(frame, at, at + 4, easeOutExpo)})`;
      break;
    }
    case 'shake': {
      const k = interpolate(frame, [0, 10], [1, 0], clamp);
      transform = `scale(1.05) translate(${(random(`sx${frame}`) - 0.5) * 40 * k}px, ${(random(`sy${frame}`) - 0.5) * 40 * k}px)`;
      break;
    }
    case 'tilt':
      transform = `scale(1.07) rotate(${interpolate(progress(frame, 0, 18, easeOutExpo), [0, 1], [3.5, 0])}deg)`;
      break;
    case 'spinIn': {
      const p = progress(frame, 0, 14, easeOutExpo);
      transform = `scale(${1.25 - 0.2 * p}) rotate(${(1 - p) * -10}deg)`;
      break;
    }
    case 'handheld':
      transform = `scale(1.05) translate(${Math.sin(frame / 9) * 7 + Math.sin(frame / 4.3) * 2}px, ${Math.cos(frame / 11) * 6}px) rotate(${Math.sin(frame / 13) * 0.6}deg)`;
      break;
    case 'rack':
      filter = `blur(${interpolate(frame, [0, 14], [10, 0], clamp)}px)`;
      transform = `scale(${1.03 - 0.03 * progress(frame, 0, 14)})`;
      break;
    case 'dollyIn':
      transform = `scale(${1.02 + 0.16 * e})`;
      fg = `scale(${1 + 0.07 * e})`;
      break;
    case 'panLeft':
    case 'panRight': {
      const dir = move === 'panLeft' ? 1 : -1;
      transform = `scale(1.16) translateX(${dir * interpolate(e, [0, 1], [70, -70])}px)`;
      fg = `translateX(${dir * interpolate(e, [0, 1], [18, -18])}px)`;
      break;
    }
    case 'tiltUp':
    case 'tiltDown': {
      const dir = move === 'tiltUp' ? -1 : 1;
      transform = `scale(1.16) translateY(${dir * interpolate(e, [0, 1], [110, -110])}px)`;
      fg = `translateY(${dir * interpolate(e, [0, 1], [20, -20])}px)`;
      break;
    }
    case 'tracking':
      // the camera follows the speaker: the wall slides by, the person barely moves
      transform = `scale(1.14)`;
      bg = `scale(1.08) translateX(${interpolate(e, [0, 1], [90, -90])}px)`;
      fg = `translateX(${interpolate(e, [0, 1], [10, -10])}px)`;
      break;
    case 'crane':
      transform = `perspective(1800px) translateY(${interpolate(e, [0, 1], [120, -60])}px) rotateX(${interpolate(e, [0, 1], [-4, 7])}deg) scale(${1.18 + 0.05 * e})`;
      fg = `translateY(${interpolate(e, [0, 1], [24, -12])}px)`;
      break;
    case 'orbitCam':
      transform = `perspective(1600px) rotateY(${interpolate(e, [0, 1], [-14, 14])}deg) scale(1.24) translateX(${interpolate(e, [0, 1], [50, -50])}px)`;
      bg = `translateX(${interpolate(e, [0, 1], [60, -60])}px)`;
      fg = `translateX(${interpolate(e, [0, 1], [-25, 25])}px)`;
      break;
    case 'dollyZoom': {
      // the wall zooms in while the person is held at the same size (counter-scaled)
      const z = 1 + (src.matte ? 0.32 : 0.2) * e;
      transform = `scale(${z})`;
      fg = `scale(${1 / z})`;
      bg = `scale(${1 + 0.08 * e})`;
      if (!src.matte) transform = `scale(${z}) perspective(1200px) rotateX(${1.5 * e}deg)`;
      break;
    }
    default:
      break;
  }
  return (
    <AbsoluteFill style={{ transform: transform || undefined, filter }}>
      <DepthContext.Provider value={{ bg, fg }}>{children}</DepthContext.Provider>
    </AbsoluteFill>
  );
};

/** How the beat arrives. Beats play back to back, so transitions come in from black or from motion. */
export const TransitionIn: React.FC<{ kind?: Transition; children: React.ReactNode }> = ({ kind = 'cut', children }) => {
  const frame = useCurrentFrame();
  const n = TRANSITION_FRAMES;
  const p = progress(frame, 0, n, easeOutExpo);
  const done = frame >= n;
  let style: React.CSSProperties = {};
  let over: React.ReactNode = null;
  if (!done) {
    switch (kind) {
      case 'zoomBlur':
        style = { transform: `scale(${1.6 - 0.6 * p})`, filter: `blur(${(1 - p) * 16}px)` };
        break;
      case 'whipLeft':
        style = { transform: `translateX(${(1 - p) * 100}%)`, filter: `blur(${(1 - p) * 22}px)` };
        break;
      case 'whipUp':
        style = { transform: `translateY(${(1 - p) * 100}%)`, filter: `blur(${(1 - p) * 22}px)` };
        break;
      case 'flash':
        over = <AbsoluteFill style={{ background: '#fff', opacity: 1 - progress(frame, 0, 7) }} />;
        break;
      case 'glitch': {
        const j = (k: string) => (random(`${k}${frame}`) - 0.5) * 60 * (1 - p);
        style = {
          transform: `translate(${j('gx')}px, ${j('gy') * 0.3}px)`,
          filter: `hue-rotate(${j('gh') * 3}deg) drop-shadow(${8 * (1 - p)}px 0 0 rgba(255,0,80,0.8)) drop-shadow(${-8 * (1 - p)}px 0 0 rgba(0,220,255,0.8))`,
        };
        break;
      }
      case 'slide':
        style = { transform: `translateX(${(1 - p) * 35}%)`, opacity: p };
        break;
      case 'dip':
        over = <AbsoluteFill style={{ background: '#000', opacity: 1 - p }} />;
        break;
      case 'iris':
        style = { clipPath: `circle(${p * 80}% at 50% 45%)` };
        break;
      case 'split':
        style = { clipPath: `inset(${(1 - p) * 50}% 0 ${(1 - p) * 50}% 0)` };
        break;
      case 'spin':
        style = { transform: `rotate(${(1 - p) * 90}deg) scale(${0.5 + 0.5 * p})` };
        break;
      case 'blurDissolve':
        style = { opacity: p, filter: `blur(${(1 - p) * 20}px)` };
        break;
      default:
        break;
    }
  }
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={style}>{children}</AbsoluteFill>
      {over}
    </AbsoluteFill>
  );
};

/** Full-frame surface texture on top of everything. */
export const TextureOverlay: React.FC<{ kind?: Texture }> = ({ kind = 'none' }) => {
  const frame = useCurrentFrame();
  const { trimBefore } = useSource();
  const id = `tx${trimBefore}`;
  switch (kind) {
    case 'grain':
      return (
        <AbsoluteFill style={{ mixBlendMode: 'overlay', opacity: 0.35, pointerEvents: 'none' }}>
          <svg width={1080} height={1920}>
            <filter id={`${id}-g`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={frame % 12} />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter={`url(#${id}-g)`} />
          </svg>
        </AbsoluteFill>
      );
    case 'lightLeak': {
      const x = 20 + Math.sin(frame / 20) * 25;
      return (
        <AbsoluteFill
          style={{
            mixBlendMode: 'screen',
            opacity: 0.55,
            background: `radial-gradient(ellipse 60% 40% at ${x}% 10%, rgba(255,140,60,0.9), transparent 70%), radial-gradient(ellipse 50% 35% at ${100 - x}% 95%, rgba(255,80,140,0.7), transparent 70%)`,
          }}
        />
      );
    }
    case 'vignette':
      return <Vignette strength={0.65} />;
    case 'halftone':
      return <AbsoluteFill style={{ mixBlendMode: 'multiply', opacity: 0.22, backgroundImage: 'radial-gradient(#000 28%, transparent 30%)', backgroundSize: '14px 14px' }} />;
    case 'scanlines':
      return (
        <AbsoluteFill
          style={{
            opacity: 0.22,
            backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.9) 0 2px, transparent 2px 6px)',
            backgroundPosition: `0 ${(frame * 2) % 6}px`,
          }}
        />
      );
    case 'dust':
      return (
        <AbsoluteFill>
          {Array.from({ length: 10 }, (_, i) => {
            const r = (k: number) => random(`d${i}-${k}-${Math.floor(frame / 2)}`);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: r(1) * 1080,
                  top: r(2) * 1920,
                  width: i % 4 === 0 ? 2 : 3 + r(3) * 5,
                  height: i % 4 === 0 ? 60 + r(4) * 140 : 3 + r(3) * 5,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.7)',
                  opacity: r(5) > 0.4 ? 0.8 : 0,
                }}
              />
            );
          })}
        </AbsoluteFill>
      );
    case 'paper':
      return (
        <AbsoluteFill style={{ mixBlendMode: 'multiply', opacity: 0.4, pointerEvents: 'none' }}>
          <svg width={1080} height={1920}>
            <filter id={`${id}-p`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={4} seed={7} />
              <feColorMatrix type="matrix" values="0 0 0 0 0.93  0 0 0 0 0.89  0 0 0 0 0.8  0 0 0 -1.1 1.2" />
            </filter>
            <rect width="100%" height="100%" filter={`url(#${id}-p)`} />
          </svg>
        </AbsoluteFill>
      );
    default:
      return null;
  }
};

const SPARK = 'M12 0 C13 8 16 11 24 12 C16 13 13 16 12 24 C11 16 8 13 0 12 C8 11 11 8 12 0Z';

/** Accent overlays drawn over the scene. Caption-bound accents (underline, emoji) and glow live in layers.tsx. */
export const AccentOverlays: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = useSource();
  const on = new Set(s.style.accents ?? []);
  const id = `ac${s.trimBefore}`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {on.has('outline') && s.matte ? (
        <>
          <Filters id={id} seed={Math.floor(frame / 3) % 8} outline={8} sticker={12} />
          <Subject filter={`url(#${id}-boil)`} />
        </>
      ) : null}
      {on.has('sparkles')
        ? Array.from({ length: 7 }, (_, i) => {
            const tw = Math.abs(Math.sin((frame + i * 9) / 7));
            const appear = pop(frame, fps, i * 3, 12);
            return (
              <svg
                key={i}
                width={30 + rand(i + 40) * 50}
                height={30 + rand(i + 40) * 50}
                viewBox="0 0 24 24"
                style={{ position: 'absolute', left: 60 + rand(i + 1) * 900, top: 200 + rand(i + 2) * 1300, opacity: tw * appear, transform: `scale(${0.6 + tw * 0.5})` }}
              >
                <path d={SPARK} fill={i % 2 ? '#fff' : s.accent} />
              </svg>
            );
          })
        : null}
      {on.has('arrows')
        ? [
            { d: 'M 120 760 C 200 700, 300 720, 380 820', head: 'M 352 790 L 384 824 L 340 832', x: 0 },
            { d: 'M 960 1180 C 880 1120, 800 1130, 720 1220', head: 'M 752 1192 L 716 1226 L 760 1236', x: 0 },
          ].map((a, i) => {
            const draw = progress(frame, 4 + i * 8, 16 + i * 8);
            const ev = evolvePath(draw, a.d);
            return (
              <svg key={i} width={1080} height={1920} style={{ position: 'absolute' }}>
                <path d={a.d} stroke={s.accent} strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray={ev.strokeDasharray} strokeDashoffset={ev.strokeDashoffset} />
                {draw >= 1 ? <path d={a.head} stroke={s.accent} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
              </svg>
            );
          })
        : null}
      {on.has('stickers')
        ? [
            { x: 760, y: 260, label: 'NEW', r: 12 },
            { x: 90, y: 1360, label: '✓', r: -10 },
          ].map((st, i) => {
            const sc = pop(frame, fps, 6 + i * 8, 9);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: st.x,
                  top: st.y,
                  width: 190,
                  height: 190,
                  borderRadius: '50%',
                  background: i ? '#fff' : s.accent,
                  color: '#111',
                  border: '6px solid #fff',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: fonts.display,
                  fontWeight: 800,
                  fontSize: i ? 96 : 56,
                  transform: `scale(${sc}) rotate(${st.r + Math.sin(frame / 6) * 3}deg)`,
                }}
              >
                {st.label}
              </div>
            );
          })
        : null}
      {on.has('letterbox')
        ? (() => {
            const h = 150 * progress(frame, 0, 12, easeOutExpo);
            return (
              <>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h, background: '#000' }} />
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: h, background: '#000' }} />
              </>
            );
          })()
        : null}
      {on.has('progress') ? (
        <div style={{ position: 'absolute', left: 0, top: 0, height: 10, width: `${((s.reelFrom + frame) / Math.max(1, s.reelTotal)) * 100}%`, background: s.accent }} />
      ) : null}
      {on.has('beatFlash') ? (
        <AbsoluteFill
          style={{
            background: '#fff',
            // One soft pulse as the cut lands. It used to strobe every half cut (as often as every 8 frames,
            // ~4 flashes a second at 70% white): the screen visibly flickered, and it broke the 3-flashes-a-second
            // safety line for photosensitive viewers.
            opacity: interpolate(frame, [0, 5], [0.35, 0], clamp),
            mixBlendMode: 'screen',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};
