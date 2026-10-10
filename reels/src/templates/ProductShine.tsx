import React from 'react';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { beatFrames, clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { Dust, Grain, LightLeak, Vignette } from '../components/Film';
import { Glint, Reflection, ShinyProduct } from '../components/Shine';

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const productShineSchema = z.object({
  brand: z.string().max(16),
  productName: z.string().max(24),
  tagline: z.string().max(22),
  /** The original photo, used for macro detail shots. */
  photo: z.string(),
  /** Transparent PNG of the product, trimmed to its bounds. */
  cutout: z.string(),
  /** Cut-out width / height, so layout does not need to load the image first. */
  cutoutAspect: z.number().positive(),
  /** Points on the cut-out (0–1) where metal or glass should catch a glint. */
  glints: z.array(point).max(4),
  details: z
    .array(
      point.extend({
        zoom: z.number().min(1).max(4),
        kicker: z.string().max(24),
        title: z.string().max(14),
      }),
    )
    .length(3),
  cta: z.string().max(16),
  handle: z.string().max(30),
  bpm: z.number().min(80).max(160),
  music: z.string().optional(),
  palette: z.object({ accent: zColor(), glow: zColor(), base: zColor() }),
});

export type ProductShineProps = z.infer<typeof productShineSchema>;

/** Scene lengths in beats. Total 28 beats = 14 s at 120 BPM. */
const BEATS = { open: 4, hero: 8, detail: 3, end: 7 };
export const productShineBeats = BEATS.open + BEATS.hero + BEATS.detail * 3 + BEATS.end;

export const ProductShine: React.FC<ProductShineProps> = (p) => {
  useFonts(p);
  const b = beatFrames(p.bpm);
  const f = (beats: number) => Math.round(beats * b);
  const tOpen = 0;
  const tHero = f(BEATS.open);
  const tDetail = tHero + f(BEATS.hero);
  const tEnd = tDetail + f(BEATS.detail * 3);
  const frame = useCurrentFrame();

  // Light leaks hide the two big scene changes.
  const leak = (at: number) => interpolate(frame, [at - 8, at, at + 12], [0, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: p.palette.base }}>
      <Sequence from={tOpen} durationInFrames={tHero + 4}>
        <Opening {...p} />
      </Sequence>
      <Sequence from={tHero} durationInFrames={tDetail - tHero}>
        <Hero {...p} />
      </Sequence>
      {p.details.map((d, i) => (
        <Sequence key={i} from={tDetail + f(BEATS.detail) * i} durationInFrames={f(BEATS.detail)}>
          <Detail {...p} detail={d} index={i} />
        </Sequence>
      ))}
      <Sequence from={tEnd}>
        <EndCard {...p} />
      </Sequence>
      <LightLeak t={Math.max(leak(tHero), leak(tEnd))} color={hexToRgb(p.palette.glow)} />
      <Vignette strength={0.6} />
      <Grain opacity={0.07} />
      {p.music ? <Audio src={asset(p.music)} /> : null}
    </AbsoluteFill>
  );
};

const Opening: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const line = progress(frame, 2, 26, easeInOut);
  const glow = progress(frame, 0, 60);
  const letters = [...p.productName];
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 40% at 50% 50%, ${p.palette.glow}${toHexAlpha(0.22 * glow)} 0%, ${p.palette.base} 70%)`,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: fonts.serif,
          fontSize: 34,
          letterSpacing: '0.6em',
          color: p.palette.accent,
          opacity: progress(frame, 6, 22),
          marginBottom: 46,
          paddingLeft: '0.6em',
        }}
      >
        {p.brand.toUpperCase()}
      </div>
      <div style={{ display: 'flex', fontFamily: fonts.serif, fontWeight: 500, fontSize: 92, color: '#F6EFE3', letterSpacing: '0.04em' }}>
        {letters.map((ch, i) => {
          const t = progress(frame, 12 + i * 1.6, 34 + i * 1.6, easeOutExpo);
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                whiteSpace: 'pre',
                opacity: t,
                filter: `blur(${(1 - t) * 14}px)`,
                transform: `translate(${(1 - t) * (i - letters.length / 2) * 6}px, ${(1 - t) * 30}px)`,
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
          height: 2,
          margin: '44px 0 40px',
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
          opacity: progress(frame, 30, 48),
          transform: `translateY(${(1 - progress(frame, 30, 48)) * 16}px)`,
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
  const enter = pop(frame, fps, 0, 18);
  const h = 1120;
  const w = h * p.cutoutAspect;
  const baseY = 1480; // floor line
  const camera = interpolate(frame, [0, durationInFrames], [1, 1.07], clamp);
  const sweep1 = interpolate(frame, [18, 52], [-1, 1], { ...clamp, easing: easeInOut });
  const sweep2 = interpolate(frame, [80, 108], [-1, 1], { ...clamp, easing: easeInOut });
  const sweep = frame < 66 ? sweep1 : sweep2;
  const left = (1080 - w) / 2;
  const top = baseY - h + (1 - enter) * 220;
  const textT = progress(frame, 26, 46);
  const pulse = (at: number) => interpolate(frame, [at - 6, at, at + 14], [0, 1, 0], clamp);

  return (
    <AbsoluteFill style={{ background: p.palette.base, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `scale(${camera})`, transformOrigin: '50% 62%' }}>
        {/* key light behind the product */}
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 55% 38% at 50% 50%, ${p.palette.glow}55 0%, ${p.palette.glow}12 45%, rgba(0,0,0,0) 72%)`,
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
        <div style={{ position: 'absolute', left, top: baseY + (1 - enter) * 220, opacity: enter }}>
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
        <div style={{ position: 'absolute', left, top, opacity: enter, transform: `scale(${0.92 + enter * 0.08})` }}>
          <ShinyProduct src={asset(p.cutout)} width={w} height={h} sweep={sweep} />
          {p.glints.map((g, i) => (
            <Glint key={i} x={g.x * w} y={g.y * h} t={pulse(48 + i * 9) + pulse(100 + i * 6) * 0.8} size={150} rotate={i * 20} />
          ))}
        </div>
        <Dust seed="hero" />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          top: 170,
          width: '100%',
          textAlign: 'center',
          opacity: textT,
          transform: `translateY(${(1 - textT) * 20}px)`,
        }}
      >
        <div style={{ fontFamily: fonts.serif, fontSize: 30, letterSpacing: '0.5em', color: p.palette.accent }}>
          {p.brand.toUpperCase()}
        </div>
        <div style={{ fontFamily: fonts.serif, fontWeight: 500, fontSize: 78, color: '#F6EFE3', marginTop: 18 }}>
          {p.productName}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Detail: React.FC<
  ProductShineProps & { detail: ProductShineProps['details'][number]; index: number }
> = ({ detail, index, ...p }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // whip in: fast blur + slide, then a slow push for the rest of the shot
  const whip = progress(frame, 0, 9, easeOutExpo);
  const push = interpolate(frame, [0, durationInFrames], [1.12, 1], clamp);
  const zoom = detail.zoom * push;
  const dir = index % 2 === 0 ? 1 : -1;
  const tx = (0.5 - detail.x) * 100 * zoom;
  const ty = (0.5 - detail.y) * 100 * zoom;
  const textT = progress(frame, 7, 22);
  const lineT = progress(frame, 5, 20, easeInOut);
  return (
    <AbsoluteFill style={{ background: p.palette.base, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          transform: `translateX(${(1 - whip) * 340 * dir}px) translate(${tx}%, ${ty}%) scale(${zoom})`,
          filter: `blur(${(1 - whip) * 24}px) brightness(${0.9 + whip * 0.12}) contrast(1.06)`,
        }}
      >
        <Img src={asset(p.photo)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* moving specular band across the macro */}
      <AbsoluteFill
        style={{
          mixBlendMode: 'soft-light',
          background: `linear-gradient(115deg, rgba(255,255,255,0) ${interpolate(frame, [0, durationInFrames], [-20, 90])}%, rgba(255,240,210,0.9) ${interpolate(frame, [0, durationInFrames], [-8, 102])}%, rgba(255,255,255,0) ${interpolate(frame, [0, durationInFrames], [4, 114])}%)`,
        }}
      />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 52%, rgba(0,0,0,0.78) 100%)' }} />
      <div style={{ position: 'absolute', left: 90, right: 90, bottom: 260 }}>
        <div
          style={{
            fontFamily: fonts.serif,
            fontSize: 30,
            letterSpacing: '0.35em',
            color: p.palette.accent,
            opacity: textT,
          }}
        >
          {String(index + 1).padStart(2, '0')} — {detail.kicker.toUpperCase()}
        </div>
        <div style={{ width: 160 * lineT, height: 2, background: p.palette.accent, margin: '26px 0 30px' }} />
        <div
          style={{
            fontFamily: fonts.minchoJP,
            fontWeight: 800,
            fontSize: 92,
            lineHeight: 1.25,
            color: '#FBF6EC',
            opacity: textT,
            transform: `translateY(${(1 - textT) * 26}px)`,
            textShadow: '0 4px 30px rgba(0,0,0,0.6)',
          }}
        >
          {detail.title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const EndCard: React.FC<ProductShineProps> = (p) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = pop(frame, fps, 2, 20);
  const h = 820;
  const w = h * p.cutoutAspect;
  const sweep = interpolate(frame, [14, 46], [-1, 1], { ...clamp, easing: easeInOut });
  const t1 = progress(frame, 16, 34);
  const t2 = progress(frame, 26, 44);
  const cta = pop(frame, fps, 40, 12);
  const breathe = 1 + Math.sin(frame / 7) * 0.015 * cta;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 60% 35% at 50% 34%, ${p.palette.glow}40 0%, ${p.palette.base} 70%)`,
        alignItems: 'center',
      }}
    >
      <Dust seed="end" count={26} />
      <div style={{ marginTop: 200, opacity: enter, transform: `translateY(${(1 - enter) * 80}px)` }}>
        <ShinyProduct src={asset(p.cutout)} width={w} height={h} sweep={sweep} />
      </div>
      <div style={{ fontFamily: fonts.serif, fontWeight: 500, fontSize: 82, color: '#F6EFE3', marginTop: 70, opacity: t1 }}>
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
          opacity: t2,
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
          transform: `scale(${(0.85 + cta * 0.15) * breathe})`,
          boxShadow: `0 0 ${40 * cta}px ${p.palette.glow}40`,
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
