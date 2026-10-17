import React from 'react';
import type { ProductShineProps } from '../schemas';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { beatFrames, clamp, easeInExpo, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { Dust, Grain, LightLeak, Vignette } from '../components/Film';
import { Glint, Reflection, ShinyProduct } from '../components/Shine';

/**
 * Scene lengths in beats. Cuts land on the beat and every scene moves the camera, so the reel never sits still:
 * opening slam → 3D hero → AI motion clip (2× speed) → three whip-panned macro shots → strobe montage → end card.
 * Total 31 beats ≈ 14.5 s at 128 BPM (23 beats without a motion clip).
 */
const BEATS = { open: 3, hero: 6, motion: 8, detail: 2, flash: 2, end: 6 };
export const productShineBeats = (p: { clip?: string } | object) =>
  BEATS.open + BEATS.hero + ("clip" in p && p.clip ? BEATS.motion : 0) + BEATS.detail * 3 + BEATS.flash + BEATS.end;

/** 1 on the beat, decaying fast: drives zoom punches and glow pulses in time with the music. */
const beatHit = (frame: number, beat: number, decay = 5) => Math.exp(-(((frame % beat) + beat) % beat) / decay);

/** A short, decaying camera shake after an impact at frame `at`. */
const shake = (frame: number, at: number, amp = 18) => {
  const t = frame - at;
  if (t < 0 || t > 14) return { x: 0, y: 0, r: 0 };
  const k = amp * Math.exp(-t / 4);
  return { x: Math.sin(t * 2.7) * k, y: Math.cos(t * 3.3) * k * 0.6, r: Math.sin(t * 2.1) * k * 0.04 };
};

/** Zoom-blur entrance used on every cut: the new shot rushes in from a larger, blurred frame. */
const rushIn = (frame: number, len = 9) => {
  const t = progress(frame, 0, len, easeOutExpo);
  return { scale: 1 + (1 - t) * 0.35, blur: (1 - t) * 22, t };
};

export const ProductShine: React.FC<ProductShineProps> = (p) => {
  useFonts(p);
  const b = beatFrames(p.bpm);
  const f = (beats: number) => Math.round(beats * b);
  const tHero = f(BEATS.open);
  const tMotion = tHero + f(BEATS.hero);
  const tDetail = tMotion + (p.clip ? f(BEATS.motion) : 0);
  const tFlash = tDetail + f(BEATS.detail * 3);
  const tEnd = tFlash + f(BEATS.flash);
  const frame = useCurrentFrame();

  const cuts = [tHero, ...(p.clip ? [tMotion, tMotion + Math.round((tDetail - tMotion) / 2)] : []), tDetail, tDetail + f(BEATS.detail), tDetail + f(BEATS.detail * 2), tFlash, tEnd];
  // A white-hot flash on each cut, bigger light leaks on the scene changes.
  const flash = Math.max(...cuts.map((c) => interpolate(frame, [c - 2, c, c + 5], [0, 1, 0], clamp)));
  const leak = (at: number) => interpolate(frame, [at - 6, at, at + 10], [0, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: p.palette.base }}>
      <Sequence from={0} durationInFrames={tHero}>
        <Opening {...p} />
      </Sequence>
      <Sequence from={tHero} durationInFrames={tMotion - tHero}>
        <Hero {...p} />
      </Sequence>
      {p.clip ? (
        <Sequence from={tMotion} durationInFrames={tDetail - tMotion}>
          <Motion {...p} />
        </Sequence>
      ) : null}
      {p.details.map((d, i) => (
        <Sequence key={i} from={tDetail + f(BEATS.detail) * i} durationInFrames={f(BEATS.detail)}>
          <Detail {...p} detail={d} index={i} />
        </Sequence>
      ))}
      <Sequence from={tFlash} durationInFrames={tEnd - tFlash}>
        <Flash {...p} />
      </Sequence>
      <Sequence from={tEnd}>
        <EndCard {...p} />
      </Sequence>
      <LightLeak t={Math.max(leak(tHero), leak(tEnd), p.clip ? leak(tMotion) : 0)} color={hexToRgb(p.palette.glow)} />
      <AbsoluteFill style={{ background: '#FFF6E6', opacity: flash * 0.55, mixBlendMode: 'screen', pointerEvents: 'none' }} />
      <Vignette strength={0.6} />
      <Grain opacity={0.07} />
      {p.music ? <Audio src={asset(p.music)} /> : null}
    </AbsoluteFill>
  );
};

const Opening: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const line = progress(frame, 4, 18, easeOutExpo);
  const glow = progress(frame, 0, 30);
  const letters = [...p.productName];
  // the whole title slams in big, settles, then the camera dives through it into the hero
  const slam = pop(frame, fps, 0, 12);
  const dive = progress(frame, durationInFrames - 9, durationInFrames, easeInExpo);
  const sh = shake(frame, 6, 10);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 40% at 50% 50%, ${p.palette.glow}${toHexAlpha(0.3 * glow)} 0%, ${p.palette.base} 70%)`,
        alignItems: 'center',
        justifyContent: 'center',
        transform: `translate(${sh.x}px, ${sh.y}px) scale(${(2.2 - slam * 1.2) * (1 + dive * 2.4)})`,
        filter: `blur(${dive * 18}px)`,
        opacity: 1 - dive * 0.6,
      }}
    >
      <div
        style={{
          fontFamily: fonts.serif,
          fontSize: 34,
          letterSpacing: `${0.2 + progress(frame, 2, 20) * 0.4}em`,
          color: p.palette.accent,
          opacity: progress(frame, 2, 12),
          marginBottom: 46,
          paddingLeft: '0.6em',
        }}
      >
        {p.brand.toUpperCase()}
      </div>
      <div style={{ display: 'flex', fontFamily: fonts.serif, fontWeight: 500, fontSize: 104, color: '#F6EFE3', letterSpacing: '0.04em' }}>
        {letters.map((ch, i) => {
          const t = progress(frame, i * 1.2, 10 + i * 1.2, easeOutExpo);
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                whiteSpace: 'pre',
                opacity: t,
                filter: `blur(${(1 - t) * 10}px)`,
                transform: `translateY(${(1 - t) * (i % 2 ? -90 : 90)}px) rotate(${(1 - t) * (i % 2 ? 12 : -12)}deg)`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
      <div
        style={{
          width: 620 * line,
          height: 3,
          margin: '40px 0 36px',
          background: `linear-gradient(90deg, transparent, ${p.palette.accent}, transparent)`,
        }}
      />
      <div
        style={{
          fontFamily: fonts.minchoJP,
          fontWeight: 500,
          fontSize: 46,
          letterSpacing: '0.18em',
          color: '#E9DFCF',
          opacity: progress(frame, 12, 24),
          clipPath: `inset(0 ${(1 - progress(frame, 12, 26, easeInOut)) * 100}% 0 0)`,
        }}
      >
        {p.tagline}
      </div>
    </AbsoluteFill>
  );
};

const Hero: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const beat = beatFrames(p.bpm);
  const enter = pop(frame, fps, 0, 13);
  // wide cut-outs (product + props) are fitted to the frame width so the camera push never crops them
  const h = Math.min(1120, 900 / p.cutoutAspect);
  const w = h * p.cutoutAspect;
  const baseY = 1480; // floor line
  // camera: fast push with an orbit swing and a zoom punch on every beat
  const push = interpolate(frame, [0, durationInFrames], [1, 1.2], { ...clamp, easing: easeInOut });
  const punch = 1 + beatHit(frame, beat) * 0.035 * enter;
  const orbit = Math.sin((frame / durationInFrames) * Math.PI * 1.2) * 9;
  const spin = (1 - enter) * -55; // product swings in on its vertical axis
  const sweep1 = interpolate(frame, [10, 30], [-1, 1], { ...clamp, easing: easeInOut });
  const sweep2 = interpolate(frame, [48, 66], [-1, 1], { ...clamp, easing: easeInOut });
  const sweep = frame < 40 ? sweep1 : sweep2;
  const left = (1080 - w) / 2;
  const top = baseY - h + (1 - enter) * 420;
  const sh = shake(frame, 8, 14);
  const pulse = (at: number) => interpolate(frame, [at - 4, at, at + 10], [0, 1, 0], clamp);
  const nameT = progress(frame, 12, 26, easeOutExpo);

  return (
    <AbsoluteFill style={{ background: p.palette.base, overflow: 'hidden', perspective: 1600 }}>
      <AbsoluteFill
        style={{
          transform: `translate(${sh.x}px, ${sh.y}px) rotate(${sh.r}deg) scale(${push * punch}) rotateY(${orbit}deg)`,
          transformOrigin: '50% 62%',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* key light behind the product, breathing with the beat */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse ${55 + beatHit(frame, beat) * 10}% 38% at 50% 50%, ${p.palette.glow}66 0%, ${p.palette.glow}14 45%, rgba(0,0,0,0) 72%)`,
          }}
        />
        {/* rotating light rays */}
        <AbsoluteFill
          style={{
            opacity: 0.18 * enter,
            mixBlendMode: 'screen',
            background: `repeating-conic-gradient(from ${frame * 1.6}deg at 50% 55%, ${p.palette.glow}55 0deg 4deg, rgba(0,0,0,0) 4deg 18deg)`,
            WebkitMaskImage: 'radial-gradient(circle at 50% 55%, black 0%, transparent 60%)',
            maskImage: 'radial-gradient(circle at 50% 55%, black 0%, transparent 60%)',
          }}
        />
        {/* glossy floor */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: baseY,
            bottom: 0,
            background: `linear-gradient(180deg, ${p.palette.glow}22 0%, rgba(0,0,0,0.85) 60%)`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 90,
            right: 90,
            top: baseY - 1,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${p.palette.accent}88, transparent)`,
          }}
        />
        <div style={{ position: 'absolute', left, top: baseY + (1 - enter) * 420, opacity: enter, transform: `rotateY(${spin}deg)` }}>
          <Reflection src={asset(p.cutout)} width={w} height={h} />
        </div>
        {/* contact shadow */}
        <div
          style={{
            position: 'absolute',
            left: 1080 / 2 - w * 0.42,
            top: baseY - 26,
            width: w * 0.84,
            height: 52,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 70%)',
            opacity: enter,
          }}
        />
        <div
          style={{
            position: 'absolute',
            left,
            top,
            opacity: Math.min(1, enter * 1.5),
            transform: `rotateY(${spin}deg) scale(${0.85 + enter * 0.15})`,
          }}
        >
          <ShinyProduct src={asset(p.cutout)} width={w} height={h} sweep={sweep} />
          {p.glints.map((g, i) => (
            <Glint key={i} x={g.x * w} y={g.y * h} t={pulse(24 + i * 7) + pulse(60 + i * 5) * 0.8} size={170} rotate={i * 20} />
          ))}
        </div>
        <Dust seed="hero" />
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 170, width: '100%', textAlign: 'center' }}>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: 30,
            letterSpacing: `${0.2 + nameT * 0.3}em`,
            color: p.palette.accent,
            opacity: nameT,
          }}
        >
          {p.brand.toUpperCase()}
        </div>
        <div
          style={{
            fontFamily: fonts.serif,
            fontWeight: 500,
            fontSize: 84,
            color: '#F6EFE3',
            marginTop: 18,
            clipPath: `inset(0 ${(1 - nameT) * 50}% 0 ${(1 - nameT) * 50}%)`,
            transform: `scale(${1.25 - nameT * 0.25})`,
          }}
        >
          {p.productName}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** The AI motion clip at double speed with beat punches, graded to match the rest of the reel. */
const Motion: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const beat = beatFrames(p.bpm);
  // two shots from one clip: a wide parallax slide, then a jump cut to a tighter, faster push
  const half = Math.round(durationInFrames / 2);
  const second = frame >= half;
  const r = rushIn(second ? frame - half : frame, second ? 6 : 10);
  const push = second
    ? interpolate(frame, [half, durationInFrames], [1.38, 1.55], clamp)
    : interpolate(frame, [0, half], [1.12, 1.22], clamp);
  const slide = second ? 0 : interpolate(frame, [0, half], [-4, 4], { ...clamp, easing: easeInOut });
  const punch = 1 + beatHit(frame, beat * 2, 6) * 0.05;
  const out = progress(frame, durationInFrames - 8, durationInFrames);
  const words = p.tagline.split(/(\s+)/).filter(Boolean);
  const spaced = words.length > 1;
  let n = 0;
  return (
    <AbsoluteFill style={{ background: p.palette.base, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${slide}%) scale(${r.scale * push * punch})`,
          transformOrigin: '50% 58%',
          filter: `blur(${r.blur}px) contrast(1.08) saturate(1.08)`,
        }}
      >
        <OffthreadVideo src={asset(p.clip!)} muted playbackRate={2} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.6) 100%)' }} />
      <div
        style={{
          position: 'absolute',
          top: 200,
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          padding: '0 60px',
          fontFamily: fonts.minchoJP,
          fontWeight: 800,
          fontSize: spaced ? 64 : 76,
          letterSpacing: spaced ? '0.02em' : '0.1em',
          color: '#FBF6EC',
          textShadow: '0 4px 30px rgba(0,0,0,0.6)',
          opacity: 1 - out,
        }}
      >
        {/* Letters animate one by one, but each word stays on one line so spaced languages wrap between words. */}
        {words.map((w, wi) =>
          /^\s+$/.test(w) ? (
            <span key={wi} style={{ width: '0.35em' }} />
          ) : (
            <span key={wi} style={{ display: 'inline-flex', whiteSpace: 'nowrap' }}>
              {[...w].map((ch) => {
                const i = n++;
                const t = progress(frame, 8 + i * 1.5, 20 + i * 1.5, easeOutExpo);
                return (
                  <span key={i} style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 50}px) scale(${1.4 - t * 0.4})`, filter: `blur(${(1 - t) * 8}px)` }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          ),
        )}
      </div>
    </AbsoluteFill>
  );
};

const Detail: React.FC<
  ProductShineProps & { detail: ProductShineProps['details'][number]; index: number }
> = ({ detail, index, ...p }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const beat = beatFrames(p.bpm);
  // whip pan in (alternating direction and tilt), then a snap zoom on the off-beat
  const whip = progress(frame, 0, 8, easeOutExpo);
  const dir = index % 2 === 0 ? 1 : -1;
  const snap = progress(frame, beat, beat + 5, easeOutExpo);
  const drift = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const zoom = detail.zoom * (1.18 - whip * 0.18) * (1 + snap * 0.14) * (1 + drift * 0.04);
  const tx = (0.5 - detail.x) * 100 * zoom;
  const ty = (0.5 - detail.y) * 100 * zoom;
  const rot = (1 - whip) * 8 * dir + drift * 1.5 * dir;
  const textT = progress(frame, 4, 14, easeOutExpo);
  const lineT = progress(frame, 3, 12, easeInOut);
  return (
    <AbsoluteFill style={{ background: p.palette.base, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${(1 - whip) * 520 * dir}px) rotate(${rot}deg) translate(${tx}%, ${ty}%) scale(${zoom})`,
          filter: `blur(${(1 - whip) * 28 + snap * (1 - snap) * 10}px) brightness(${0.9 + whip * 0.12}) contrast(1.08)`,
        }}
      >
        <Img src={asset(p.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* fast specular band across the macro */}
      <AbsoluteFill
        style={{
          mixBlendMode: 'soft-light',
          background: `linear-gradient(115deg, rgba(255,255,255,0) ${interpolate(frame, [0, durationInFrames], [-30, 110])}%, rgba(255,240,210,0.95) ${interpolate(frame, [0, durationInFrames], [-18, 122])}%, rgba(255,255,255,0) ${interpolate(frame, [0, durationInFrames], [-6, 134])}%)`,
        }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,0.78) 100%)' }} />
      {/* oversized index number behind the copy */}
      <div
        style={{
          position: 'absolute',
          right: 60,
          bottom: 420,
          fontFamily: fonts.serif,
          fontSize: 260,
          lineHeight: 1,
          color: 'transparent',
          WebkitTextStroke: `2px ${p.palette.accent}`,
          opacity: 0.55 * textT,
          transform: `translateX(${(1 - textT) * 120 * dir}px)`,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div style={{ position: 'absolute', left: 90, right: 90, bottom: 260 }}>
        <div style={{ fontFamily: fonts.serif, fontSize: 30, letterSpacing: '0.35em', color: p.palette.accent, opacity: textT }}>
          {detail.kicker.toUpperCase()}
        </div>
        <div style={{ width: 200 * lineT, height: 3, background: p.palette.accent, margin: '24px 0 28px' }} />
        <div
          style={{
            fontFamily: fonts.minchoJP,
            fontWeight: 800,
            fontSize: 92,
            lineHeight: 1.25,
            color: '#FBF6EC',
            clipPath: `inset(-20% ${(1 - textT) * 100}% -20% 0)`,
            transform: `translateX(${(1 - textT) * -60}px)`,
            textShadow: '0 4px 30px rgba(0,0,0,0.6)',
          }}
        >
          {detail.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Strobe montage: four half-beat hard cuts between crops of the studio shot and the cut-out on colour. */
const Flash: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const n = 4;
  const len = durationInFrames / n;
  const i = Math.min(n - 1, Math.floor(frame / len));
  const local = frame - i * len;
  const t = progress(local, 0, len, easeOutExpo);
  const h = 1180;
  const w = h * p.cutoutAspect;
  if (i % 2 === 1) {
    // cut-out on a solid accent field, rotating in
    const bg = i === 1 ? p.palette.accent : p.palette.glow;
    return (
      <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            fontFamily: fonts.serif,
            fontWeight: 600,
            fontSize: 300,
            letterSpacing: '-0.02em',
            whiteSpace: 'nowrap',
            color: p.palette.base,
            opacity: 0.12,
            transform: `translateX(${(i === 1 ? 1 : -1) * (200 - t * 400)}px)`,
          }}
        >
          {p.brand.toUpperCase()}
        </div>
        <div style={{ transform: `rotate(${(1 - t) * (i === 1 ? -14 : 14)}deg) scale(${1.25 - t * 0.25})`, filter: 'drop-shadow(0 40px 60px rgba(0,0,0,0.45))' }}>
          <Img src={asset(p.cutout)} style={{ width: w * 0.8, height: h * 0.8, display: 'block' }} />
        </div>
      </AbsoluteFill>
    );
  }
  const d = p.details[i === 0 ? 0 : 2];
  const zoom = 1.4 + t * 0.35;
  return (
    <AbsoluteFill style={{ background: p.palette.base, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `translate(${(0.5 - d.x) * 60 * zoom}%, ${(0.5 - d.y) * 60 * zoom}%) scale(${zoom}) rotate(${i === 0 ? -3 : 3}deg)` }}>
        <Img src={asset(p.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = pop(frame, fps, 0, 11);
  const h = 820;
  const w = h * p.cutoutAspect;
  const sweep = interpolate(frame, [10, 34], [-1, 1], { ...clamp, easing: easeInOut });
  const t1 = progress(frame, 10, 22, easeOutExpo);
  const t2 = progress(frame, 16, 30);
  const cta = pop(frame, fps, 26, 12);
  const breathe = 1 + Math.sin(frame / 6) * 0.02 * cta;
  const sh = shake(frame, 7, 14);
  const float = Math.sin(frame / 14) * 10 * enter;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 35% at 50% 34%, ${p.palette.glow}40 0%, ${p.palette.base} 70%)`,
        alignItems: 'center',
        perspective: 1600,
        transform: `translate(${sh.x}px, ${sh.y}px)`,
      }}
    >
      <Dust seed="end" count={26} />
      <div
        style={{
          marginTop: 200,
          opacity: Math.min(1, enter * 1.5),
          transform: `translateY(${(1 - enter) * -700 + float}px) rotateY(${(1 - enter) * 70}deg) scale(${1.3 - enter * 0.3})`,
        }}
      >
        <ShinyProduct src={asset(p.cutout)} width={w} height={h} sweep={sweep} />
      </div>
      <div
        style={{
          fontFamily: fonts.serif,
          fontWeight: 500,
          fontSize: 82,
          color: '#F6EFE3',
          marginTop: 70,
          opacity: t1,
          letterSpacing: `${0.3 - t1 * 0.3}em`,
          transform: `scale(${1.15 - t1 * 0.15})`,
        }}
      >
        {p.productName}
      </div>
      <div
        style={{
          fontFamily: fonts.minchoJP,
          fontWeight: 500,
          fontSize: 40,
          letterSpacing: '0.16em',
          color: '#D9CDB8',
          marginTop: 22,
          clipPath: `inset(0 ${(1 - t2) * 100}% 0 0)`,
        }}
      >
        {p.tagline}
      </div>
      <div
        style={{
          marginTop: 70,
          padding: '28px 70px',
          border: `2px solid ${p.palette.accent}`,
          borderRadius: 999,
          fontFamily: fonts.sansJP,
          fontWeight: 700,
          fontSize: 40,
          letterSpacing: '0.12em',
          color: p.palette.accent,
          opacity: cta,
          transform: `scale(${(0.7 + cta * 0.3) * breathe})`,
          boxShadow: `0 0 ${50 * cta}px ${p.palette.glow}50`,
        }}
      >
        {p.cta}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 150,
          fontFamily: fonts.serif,
          fontSize: 32,
          letterSpacing: '0.25em',
          color: '#B9AE9C',
          opacity: t2,
        }}
      >
        {p.handle}
      </div>
    </AbsoluteFill>
  );
};

function hexToRgb(hex: string) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

function toHexAlpha(a: number) {
  return Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, '0');
}
