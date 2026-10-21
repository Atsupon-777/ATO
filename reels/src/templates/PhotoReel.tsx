import React from 'react';
import { AbsoluteFill, Audio, Easing, Img, interpolate, random, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { PhotoMotion, PhotoReelProps } from '../photoreel';
import type { Lang } from '../lang';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { beatFrames, clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { Dust, Grain, LightLeak, Vignette } from '../components/Film';

/**
 * Photo reel: 1–10 stills cut to the beat. Every motion shares one timeline — a title over the first photo,
 * one segment per photo, and an end card over the last — so a reel's length depends only on motion, count and tempo.
 */
const W = 1080;
const H = 1920;
const INTRO_BEATS = 4;
const OUTRO_BEATS = 4;

type Spec = {
  /** Beats each photo stays on screen, by photo count. */
  beats: (n: number) => number;
  /** Where the shared title sits, or 'own' when the motion draws it. */
  title: 'top' | 'bottom' | 'center' | 'own';
  captions: 'shared' | 'own';
  /** Frames before each cut that the transition starts, so captions leave before it. */
  lead: (plan: Plan) => number;
  ownsEnd?: boolean;
  /** Blur on the motion layer under the end card, and how much the backdrop colour covers it. */
  endBlur?: number;
  endScrim?: number;
};

const steady = (one: number, few: number, mid: number, many: number) => (n: number) =>
  n === 1 ? one : n <= 3 ? few : n <= 6 ? mid : many;

const SPECS: Record<PhotoMotion, Spec> = {
  cinematic: { beats: steady(10, 5, 4, 3), title: 'bottom', captions: 'shared', lead: (p) => Math.round(transCinematic(p) / 2) },
  beatcut: { beats: steady(8, 4, 3, 2), title: 'bottom', captions: 'own', lead: () => 2 },
  portal: { beats: steady(8, 4, 3, 2), title: 'bottom', captions: 'shared', lead: (p) => transPortal(p) },
  push: { beats: steady(8, 4, 3, 2), title: 'bottom', captions: 'shared', lead: (p) => transPush(p) },
  polaroid: { beats: steady(10, 4, 3, 2), title: 'center', captions: 'own', lead: () => 0, endBlur: 8 },
  collage: { beats: steady(8, 4, 3, 2), title: 'bottom', captions: 'shared', lead: (p) => Math.round(p.b * 0.75), endBlur: 3, endScrim: 0.5 },
  magazine: { beats: steady(10, 4, 3, 2), title: 'own', captions: 'own', lead: (p) => transPush(p), ownsEnd: true },
  carousel: { beats: steady(8, 4, 3, 2), title: 'own', captions: 'own', lead: (p) => transCarousel(p), endBlur: 10 },
  flip: { beats: steady(8, 4, 3, 2), title: 'top', captions: 'own', lead: (p) => transFlip(p), endBlur: 10 },
  filmstrip: { beats: steady(8, 4, 3, 2), title: 'top', captions: 'shared', lead: (p) => transFilm(p), endBlur: 10 },
  thennow: { beats: steady(8, 5, 4, 3), title: 'bottom', captions: 'shared', lead: (p) => transThenNow(p) },
  split: { beats: steady(8, 4, 3, 2), title: 'bottom', captions: 'shared', lead: (p) => transSplit(p) },
  scrapbook: { beats: steady(10, 4, 3, 2), title: 'own', captions: 'own', lead: () => 0, endBlur: 8 },
  cube: { beats: steady(8, 4, 3, 2), title: 'bottom', captions: 'shared', lead: (p) => transCube(p) },
  burn: { beats: steady(10, 4, 3, 2), title: 'bottom', captions: 'shared', lead: (p) => burnSpan(p)[0] },
};

type Plan = {
  b: number;
  n: number;
  per: number;
  intro: number;
  outroAt: number;
  total: number;
  starts: number[];
  ends: number[];
};

export const photoReelPlan = (p: Pick<PhotoReelProps, 'photos' | 'motion' | 'bpm'>, fps: number): Plan => {
  const b = beatFrames(p.bpm, fps);
  const n = p.photos.length;
  const bp = SPECS[p.motion].beats(n);
  const at = (beats: number) => Math.round(beats * b);
  const starts = p.photos.map((_, i) => (i === 0 ? 0 : at(INTRO_BEATS + i * bp)));
  const outroAt = at(INTRO_BEATS + n * bp);
  const total = at(INTRO_BEATS + n * bp + OUTRO_BEATS);
  const ends = starts.map((_, i) => (i < n - 1 ? starts[i + 1] : total));
  return { b, n, per: bp * b, intro: at(INTRO_BEATS), outroAt, total, starts, ends };
};

export const photoReelDuration = (p: Pick<PhotoReelProps, 'photos' | 'motion' | 'bpm'>, fps: number) =>
  photoReelPlan(p, fps).total;

const transCinematic = (p: Plan) => Math.round(Math.min(p.b * 1.5, p.per * 0.5));
const transPortal = (p: Plan) => Math.round(Math.min(p.b * 1.4, p.per * 0.6));
const transPush = (p: Plan) => Math.round(Math.min(p.b * 0.9, p.per * 0.45));
const transCarousel = (p: Plan) => Math.round(Math.min(p.b * 1.1, p.per * 0.5));
const transFlip = (p: Plan) => Math.round(Math.min(p.b * 1.2, p.per * 0.55));
const transFilm = (p: Plan) => Math.round(Math.min(p.b * 1.1, p.per * 0.5));

/** Index of the photo whose segment holds `frame`. */
const currentIndex = (plan: Plan, frame: number) => {
  let i = 0;
  while (i < plan.n - 1 && frame >= plan.starts[i + 1]) i++;
  return i;
};

/** When the transition into photo `k` runs: [start, cut]. */
const transWindow = (plan: Plan, k: number, len: number) => [plan.starts[k] - len, plan.starts[k]] as const;

const swing = Easing.bezier(0.83, 0, 0.17, 1);
const glide = Easing.bezier(0.65, 0, 0.35, 1);

// ── colour & type ─────────────────────────────────────────────────────────────────────────

const rgb = (hex: string) => {
  const m = hex.replace('#', '');
  const v = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m.slice(0, 6), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const rgba = (hex: string, a: number) => `rgba(${rgb(hex).join(',')},${a})`;
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

type Labels = { next: string; issue: (n: string) => string; then: string; now: string };

/** Fixed words the motions print themselves, per reel language. */
const LABELS: Record<Lang, Labels> = {
  en: { next: 'NEXT', issue: (n) => `NO.${n}`, then: 'THEN', now: 'NOW' },
  ja: { next: '次のページ', issue: (n) => `第${n}号`, then: 'ビフォー', now: 'アフター' },
  zh: { next: '下一页', issue: (n) => `第${n}期`, then: '从前', now: '现在' },
  fr: { next: 'À SUIVRE', issue: (n) => `N°${n}`, then: 'AVANT', now: 'APRÈS' },
  es: { next: 'PRÓXIMO', issue: (n) => `N.º ${n}`, then: 'ANTES', now: 'AHORA' },
  id: { next: 'BERIKUTNYA', issue: (n) => `NO.${n}`, then: 'DULU', now: 'SEKARANG' },
  ta: { next: 'அடுத்து', issue: (n) => `இதழ் ${n}`, then: 'அப்போது', now: 'இப்போது' },
};

/** Every label string for `lang`, so the font loader fetches their glyphs too. */
const labelText = (lang: Lang) => {
  const l = LABELS[lang];
  return [l.next, l.issue('0123456789'), l.then, l.now].join(' ');
};

type Look = {
  style: PhotoReelProps['style'];
  face: string;
  metrics: Metrics;
  bg: string;
  ink: string;
  accent: string;
  /** Text colour that reads on the accent. */
  onAccent: string;
  lightBg: boolean;
  t: Labels;
};

type Metrics = { lower: number; upper: number };
const METRICS: Record<NonNullable<PhotoReelProps['font']>, Metrics> = {
  serif: { lower: 0.44, upper: 0.68 },
  display: { lower: 0.6, upper: 0.74 },
  sansJP: { lower: 0.56, upper: 0.7 },
  mincho: { lower: 0.52, upper: 0.72 },
};
const FACES: Record<NonNullable<PhotoReelProps['font']>, string> = {
  serif: fonts.serif,
  display: fonts.display,
  sansJP: fonts.sansJP,
  mincho: fonts.minchoJP,
};

const resolveLook = (p: PhotoReelProps): Look => {
  const font = p.font ?? (p.style === 'editorial' ? 'serif' : 'display');
  return {
    style: p.style,
    face: FACES[font],
    metrics: METRICS[font],
    bg: p.palette.bg,
    ink: p.palette.ink,
    accent: p.palette.accent,
    onAccent: luminance(p.palette.accent) > 0.5 ? '#0C0C0C' : '#FFFFFF',
    lightBg: luminance(p.palette.bg) > 0.55,
    t: LABELS[p.lang ?? 'en'],
  };
};

const CJK = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef\uac00-\ud7af]/;

/** Rough rendered width of `text` in em, so long copy can be sized down before it overflows. */
const measure = (text: string, m: Metrics, tracking = 0) => {
  let w = 0;
  for (const ch of text) {
    if (CJK.test(ch)) w += 1;
    else if (/\s/.test(ch)) w += 0.28;
    else if (/[A-Z]/.test(ch)) w += m.upper;
    else if (/[0-9]/.test(ch)) w += 0.58;
    else if (/[.,'\u2019:;!|]/.test(ch)) w += 0.26;
    else w += m.lower;
    w += tracking;
  }
  return w;
};

/** Largest size ≤ `base` at which `text` fits `lines` lines of `maxW` and its longest word fits one line. */
const fit = (text: string, maxW: number, lines: number, base: number, m: Metrics, tracking = 0) => {
  const words = tokens(text).filter((t) => !/^\s+$/.test(t));
  const longest = Math.max(0.5, ...words.map((w) => measure(w, m, tracking)));
  const total = measure(text, m, tracking);
  return Math.floor(Math.min(base, (maxW * 0.97) / longest, (maxW * lines) / (total * 1.15)));
};

const upper = (text: string, look: Look) => (look.style === 'bold' && !CJK.test(text) ? text.toUpperCase() : text);

type Script = 'kanji' | 'kata' | 'hira' | 'punct' | 'space' | 'other';
const script = (ch: string): Script => {
  const c = ch.codePointAt(0) ?? 0;
  if (/\s/.test(ch)) return 'space';
  if (c >= 0x3040 && c <= 0x309f) return 'hira';
  if ((c >= 0x30a0 && c <= 0x30ff) || (c >= 0xff66 && c <= 0xff9f)) return 'kata';
  if ((c >= 0x3400 && c <= 0x9fff) || c === 0x3005 || (c >= 0xac00 && c <= 0xd7af)) return 'kanji';
  if ((c >= 0x3000 && c <= 0x303f) || (c >= 0xff00 && c <= 0xffef) || c === 0x2026) return 'punct';
  return 'other';
};

/**
 * Splits copy into animatable, unbreakable tokens: words in spaced scripts, and short phrases in Japanese and
 * Chinese (a kanji or katakana run with the kana and punctuation that follow it), so lines break between phrases.
 */
const tokens = (text: string) => {
  const out: string[] = [];
  let cur = '';
  let prev: Script | null = null;
  for (const ch of text) {
    const s = script(ch);
    const joins =
      prev !== null &&
      ((s === 'punct' && !OPENING.includes(ch)) ||
        (s === 'space' && prev === 'space') ||
        (s === 'other' && prev === 'other') ||
        (s === 'hira' && (prev === 'kanji' || prev === 'kata' || prev === 'hira')) ||
        (s === 'kanji' && prev === 'kanji') ||
        (s === 'kata' && prev === 'kata'));
    if (prev !== null && OPENING.includes(prev === 'punct' ? cur.slice(-1) : '')) {
      cur += ch;
      prev = s;
      continue;
    }
    if (!joins && cur) {
      out.push(cur);
      cur = '';
    }
    cur += ch;
    prev = s;
  }
  if (cur) out.push(cur);
  // Chinese has no kana to break on: long kanji runs break every two characters
  return out.flatMap((t) => (script(t[0]) === 'kanji' && [...t].filter((ch) => script(ch) === 'kanji').length > 4 ? pairs(t) : [t]));
};

const OPENING = ['\u300c', '\u300e', '\uff08', '\u3010'];

const pairs = (t: string) => {
  const chars = [...t];
  const out: string[] = [];
  for (const ch of chars) {
    const last = out[out.length - 1];
    if (last && (script(ch) === 'punct' || [...last].filter((x) => script(x) === 'kanji').length < 2)) out[out.length - 1] = last + ch;
    else out.push(ch);
  }
  return out;
};

type Reveal = 'rise' | 'mask' | 'fade';

/** Copy that arrives token by token. `f` is the local frame, starting at `delay`. */
const Words: React.FC<{ text: string; f: number; delay?: number; stagger?: number; kind: Reveal; fps: number }> = ({
  text,
  f,
  delay = 0,
  stagger = 2.2,
  kind,
  fps,
}) => {
  let k = 0;
  return (
    <>
      {tokens(text).map((tok, i) => {
        if (/^\s+$/.test(tok)) return ' ';
        const d = delay + k++ * stagger;
        if (kind === 'mask') {
          const t = pop(f, fps, d, 15);
          return (
            <span key={i} style={{ display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.06em 0.02em 0.1em', margin: '-0.06em -0.02em -0.1em' }}>
              <span style={{ display: 'inline-block', transform: `translateY(${(1 - t) * 115}%) rotate(${(1 - t) * 6}deg)` }}>{tok}</span>
            </span>
          );
        }
        const t = progress(f, d, d + (kind === 'rise' ? 18 : 14), easeOutExpo);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: t,
              filter: `blur(${(1 - t) * (kind === 'rise' ? 8 : 12)}px)`,
              transform: kind === 'rise' ? `translateY(${(1 - t) * 38}px)` : `scale(${1.06 - t * 0.06})`,
            }}
          >
            {tok}
          </span>
        );
      })}
    </>
  );
};

// ── shared building blocks ────────────────────────────────────────────────────────────────

type Focus = { x: number; y: number } | undefined;

/** A photo filling its box, moved about its point of interest. */
const Shot: React.FC<{
  src: string;
  focus?: Focus;
  scale?: number;
  x?: number;
  y?: number;
  rot?: number;
  filter?: string;
  style?: React.CSSProperties;
}> = ({ src, focus, scale = 1, x = 0, y = 0, rot = 0, filter, style }) => {
  const fx = (focus?.x ?? 0.5) * 100;
  const fy = (focus?.y ?? 0.45) * 100;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}>
      <Img
        src={asset(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: `${fx}% ${fy}%`,
          transform: `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${scale})`,
          transformOrigin: `${fx}% ${fy}%`,
          filter,
        }}
      />
    </div>
  );
};

type Ctx = { p: PhotoReelProps; plan: Plan; look: Look; frame: number; fps: number; spec: Spec };

/** Frames during which photo i's caption is on screen. */
const captionSpan = (c: Ctx, i: number) => {
  const from = i === 0 ? c.plan.intro : c.plan.starts[i];
  const to = (i === c.plan.n - 1 ? c.plan.outroAt : c.plan.ends[i]) - (i === c.plan.n - 1 ? 0 : c.spec.lead(c.plan));
  return [from, to] as const;
};

const titleSize = (text: string, look: Look, maxW: number, compact = false) => {
  if (look.style === 'bold') return fit(text, maxW, compact ? 2 : 3, compact ? 110 : 160, look.metrics, -0.02);
  if (look.style === 'minimal') return fit(text, maxW, compact ? 2 : 3, compact ? 76 : 92, look.metrics, -0.01);
  return fit(text, maxW, compact ? 2 : 3, compact ? 104 : 136, look.metrics);
};

/** The reel's title in the style's voice. `f` counts from the title's entrance. */
const TitleBlock: React.FC<{ c: Ctx; f: number; maxW?: number; align?: 'left' | 'center'; compact?: boolean }> = ({ c, f, maxW = 920, align, compact }) => {
  const { p, look, fps } = c;
  const title = upper(p.title, look);
  const size = titleSize(title, look, maxW, compact);
  const rule = progress(f, 4, 22, easeInOut);
  if (look.style === 'bold') {
    return (
      <div style={{ textAlign: align ?? 'left', width: maxW }}>
        <div style={{ fontFamily: look.face, fontWeight: 800, fontSize: size, lineHeight: 0.98, letterSpacing: '-0.02em', color: look.ink }}>
          <Words text={title} f={f} kind="mask" fps={fps} stagger={2.5} />
        </div>
        {p.subtitle ? (
          <div
            style={{
              display: 'inline-block',
              marginTop: 30,
              padding: '12px 22px 14px',
              background: look.accent,
              color: look.onAccent,
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: fit(p.subtitle.toUpperCase(), maxW - 44, 1, 34, METRICS.display, 0.04),
              letterSpacing: '0.04em',
              clipPath: `inset(0 ${(1 - progress(f, 10, 22, easeOutExpo)) * 100}% 0 0)`,
            }}
          >
            {upper(p.subtitle, look)}
          </div>
        ) : null}
      </div>
    );
  }
  if (look.style === 'minimal') {
    return (
      <div style={{ textAlign: align ?? 'center', width: maxW }}>
        <div style={{ width: 56 * rule, height: 3, background: look.accent, margin: align === 'left' ? '0 0 34px' : '0 auto 34px', borderRadius: 2 }} />
        <div style={{ fontFamily: look.face, fontWeight: 600, fontSize: size, lineHeight: 1.08, letterSpacing: '-0.01em', color: look.ink, textWrap: 'balance' } as React.CSSProperties}>
          <Words text={p.title} f={f} kind="fade" fps={fps} stagger={2.5} delay={2} />
        </div>
        {p.subtitle ? (
          <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: fit(p.subtitle, maxW, 2, 32, METRICS.display), color: rgba(look.ink, 0.72), marginTop: 26, opacity: progress(f, 12, 26), transform: `translateY(${(1 - progress(f, 12, 26, easeOutExpo)) * 16}px)` }}>
            {p.subtitle}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ textAlign: align ?? 'left', width: maxW }}>
      <div style={{ fontFamily: look.face, fontWeight: 500, fontSize: size, lineHeight: 1.0, letterSpacing: '-0.005em', color: look.ink, textWrap: 'balance' } as React.CSSProperties}>
        <Words text={p.title} f={f} kind="rise" fps={fps} stagger={3} />
      </div>
      <div style={{ width: 120 * rule, height: 2, background: look.accent, margin: align === 'center' ? '34px auto 26px' : '34px 0 26px' }} />
      {p.subtitle ? (
        <div style={{ fontFamily: fonts.serif, fontStyle: CJK.test(p.subtitle) ? 'normal' : 'italic', fontWeight: 500, fontSize: fit(p.subtitle, maxW, 2, 44, METRICS.serif), color: rgba(look.ink, 0.85), opacity: progress(f, 14, 30), clipPath: `inset(-20% ${(1 - progress(f, 14, 32, easeInOut)) * 100}% -20% 0)` }}>
          {p.subtitle}
        </div>
      ) : null}
    </div>
  );
};

/** Shared title over the opening photo, leaving just before the first caption. */
const TitleOverlay: React.FC<{ c: Ctx; anchor: 'top' | 'bottom' | 'center' }> = ({ c, anchor }) => {
  const { frame, plan, look } = c;
  const out = progress(frame, plan.intro - 9, plan.intro, easeInOut);
  if (frame > plan.intro) return null;
  const inT = progress(frame, 0, 14);
  const scrim = anchor === 'bottom'
    ? `linear-gradient(0deg, ${rgba(look.bg, 0.85)} 0%, ${rgba(look.bg, 0.55)} 30%, ${rgba(look.bg, 0)} 62%)`
    : anchor === 'center'
      ? `radial-gradient(ellipse 80% 40% at 50% 46%, ${rgba(look.bg, 0.5)} 0%, ${rgba(look.bg, 0)} 100%)`
      : `linear-gradient(180deg, ${rgba(look.bg, 0.8)} 0%, ${rgba(look.bg, 0.45)} 22%, ${rgba(look.bg, 0)} 42%)`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: scrim, opacity: inT * (1 - out) }} />
      <div
        style={{
          position: 'absolute',
          left: 80,
          right: 80,
          ...(anchor === 'bottom' ? { bottom: 470 } : anchor === 'top' ? { top: 210 } : { top: 0, bottom: 200, alignItems: 'center' }),
          display: 'flex',
          justifyContent: look.style === 'minimal' || anchor === 'center' ? 'center' : 'flex-start',
          opacity: 1 - out,
          transform: `translateY(${out * -40}px)`,
          filter: `blur(${out * 10}px)`,
        }}
      >
        <TitleBlock c={c} f={frame - 3} compact={anchor === 'top'} align={anchor === 'center' ? 'center' : undefined} />
      </div>
    </AbsoluteFill>
  );
};

/** One caption in the style's voice; `t` in, `o` out (0–1). */
const CaptionBlock: React.FC<{ c: Ctx; text: string; index: number; f: number; o: number; maxW?: number; align?: 'left' | 'center' }> = ({
  c,
  text,
  index,
  f,
  o,
  maxW = 900,
  align,
}) => {
  const { look, fps, plan } = c;
  const counter = `${String(index + 1).padStart(2, '0')}`;
  const total = `${String(plan.n).padStart(2, '0')}`;
  const out: React.CSSProperties = { opacity: 1 - o, transform: `translateY(${o * -24}px)`, filter: `blur(${o * 8}px)` };
  if (look.style === 'bold') {
    const t = upper(text, look);
    const size = fit(t, maxW - 40, 2, 66, METRICS.display, 0.0);
    const wipe = progress(f, 0, 12, easeOutExpo);
    return (
      <div style={{ width: maxW, textAlign: align ?? 'left', ...out }}>
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 30, letterSpacing: '0.06em', color: look.ink, marginBottom: 16, opacity: progress(f, 2, 10) }}>
          {counter}
          <span style={{ color: rgba(look.ink, 0.45) }}> / {total}</span>
        </div>
        <div style={{ clipPath: `inset(-10% ${(1 - wipe) * 100}% -10% 0)`, transform: `translateX(${(1 - wipe) * -40}px)` }}>
          <span
            style={{
              fontFamily: look.face,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.32,
              color: look.onAccent,
              background: look.accent,
              padding: '4px 18px 6px',
              boxDecorationBreak: 'clone',
              WebkitBoxDecorationBreak: 'clone',
            }}
          >
            {t}
          </span>
        </div>
      </div>
    );
  }
  if (look.style === 'minimal') {
    const size = fit(text, maxW - 150, 2, 44, METRICS.display);
    const t = progress(f, 0, 14, easeOutExpo);
    return (
      <div style={{ width: maxW, display: 'flex', justifyContent: align === 'left' ? 'flex-start' : 'center', ...out }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            padding: '20px 34px',
            borderRadius: 999,
            background: rgba(look.bg, 0.62),
            backdropFilter: 'blur(22px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(22px) saturate(1.4)',
            border: `1px solid ${rgba(look.ink, 0.12)}`,
            opacity: t,
            transform: `translateY(${(1 - t) * 30}px) scale(${0.94 + t * 0.06})`,
            maxWidth: maxW,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 5, background: look.accent, flexShrink: 0 }} />
          <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: size, color: look.ink, lineHeight: 1.25 }}>{text}</div>
          <div style={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 24, color: rgba(look.ink, 0.5), flexShrink: 0 }}>
            {index + 1}/{plan.n}
          </div>
        </div>
      </div>
    );
  }
  const italic = !CJK.test(text);
  const size = fit(text, maxW, 2, 76, METRICS.serif);
  const rule = progress(f, 0, 16, easeInOut);
  return (
    <div style={{ width: maxW, textAlign: align ?? 'left', ...out }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: align === 'center' ? 'center' : 'flex-start',
          gap: 18,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 26,
          letterSpacing: '0.32em',
          color: look.accent,
          marginBottom: 20,
          textShadow: `0 1px 12px ${rgba(look.bg, 0.5)}`,
          opacity: progress(f, 0, 10),
        }}
      >
        <span>{counter}</span>
        <span style={{ width: 70 * rule, height: 1.5, background: look.accent, display: 'inline-block' }} />
        <span style={{ color: rgba(look.ink, 0.75) }}>{total}</span>
      </div>
      <div style={{ fontFamily: fonts.serif, fontStyle: italic ? 'italic' : 'normal', fontWeight: 500, fontSize: size, lineHeight: 1.08, color: look.ink, textShadow: `0 2px 24px ${rgba(look.bg, 0.35)}` }}>
        <Words text={text} f={f} delay={3} kind="rise" fps={fps} stagger={2.4} />
      </div>
    </div>
  );
};

/** Captions over full-screen motions: bottom left (centred for minimal), above the app's own UI. */
const SharedCaptions: React.FC<{ c: Ctx }> = ({ c }) => {
  const { p, frame, look } = c;
  return (
    <>
      {p.photos.map((ph, i) => {
        if (!ph.caption) return null;
        const [from, to] = captionSpan(c, i);
        if (frame < from || frame > to) return null;
        const o = progress(frame, to - 8, to, easeInOut);
        const s = progress(frame, from, from + 10) * (1 - o);
        return (
          <AbsoluteFill key={i} style={{ pointerEvents: 'none' }}>
            {look.style === 'minimal' ? null : (
              <AbsoluteFill style={{ opacity: s, background: `linear-gradient(0deg, ${rgba(look.bg, 0.78)} 0%, ${rgba(look.bg, 0.5)} 28%, ${rgba(look.bg, 0)} 50%)` }} />
            )}
            <div style={{ position: 'absolute', left: 90, right: 90, bottom: look.style === 'minimal' ? 440 : 450, display: 'flex', justifyContent: look.style === 'minimal' ? 'center' : 'flex-start' }}>
              <CaptionBlock c={c} text={ph.caption} index={i} f={frame - from - 2} o={o} />
            </div>
          </AbsoluteFill>
        );
      })}
    </>
  );
};

/** Title, call to action and handle over the last photo. */
const EndCard: React.FC<{ c: Ctx }> = ({ c }) => {
  const { p, plan, look, frame, fps } = c;
  if (frame < plan.outroAt) return null;
  const f = frame - plan.outroAt;
  const t = progress(f, 0, 16, easeOutExpo);
  const cta = pop(f, fps, 14, 13);
  const handleT = progress(f, 20, 34);
  const button: React.CSSProperties =
    look.style === 'bold'
      ? { background: look.accent, color: look.onAccent, fontWeight: 800, letterSpacing: '0.04em', padding: '30px 64px', borderRadius: 0 }
      : look.style === 'minimal'
        ? { background: look.ink, color: look.bg, fontWeight: 600, padding: '28px 60px', borderRadius: 999 }
        : { border: `1.5px solid ${look.accent}`, color: look.ink, fontWeight: 600, letterSpacing: '0.24em', padding: '26px 60px', borderRadius: 999 };
  return (
    <AbsoluteFill style={{ background: rgba(look.bg, (c.spec.endScrim ?? (look.lightBg ? 0.72 : 0.6)) * t), alignItems: 'center', justifyContent: 'center', paddingBottom: 140 }}>
      <div style={{ opacity: t, transform: `translateY(${(1 - t) * 40}px)`, display: 'flex', justifyContent: 'center' }}>
        <TitleBlock c={c} f={f} maxW={900} align="center" />
      </div>
      {p.cta ? (
        <div
          style={{
            marginTop: 64,
            fontFamily: fonts.display,
            fontSize: look.style === 'editorial' ? 30 : 38,
            opacity: Math.min(1, cta * 1.4),
            transform: `scale(${0.8 + cta * 0.2})`,
            ...button,
          }}
        >
          {look.style === 'editorial' && !CJK.test(p.cta) ? p.cta.toUpperCase() : upper(p.cta, look)}
        </div>
      ) : null}
      {p.handle ? (
        <div style={{ marginTop: 40, fontFamily: look.style === 'editorial' ? fonts.serif : fonts.display, fontStyle: look.style === 'editorial' ? 'italic' : 'normal', fontWeight: 600, fontSize: look.style === 'editorial' ? 40 : 32, color: rgba(look.ink, 0.8), opacity: handleT, letterSpacing: look.style === 'bold' ? '0.04em' : 0 }}>
          {p.handle}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** A decaying camera shake after an impact at local frame 0. */
const shake = (t: number, amp = 16) => {
  if (t < 0 || t > 12) return { x: 0, y: 0 };
  const k = amp * Math.exp(-t / 3.5);
  return { x: Math.sin(t * 2.7) * k, y: Math.cos(t * 3.3) * k * 0.6 };
};

// ── motions ───────────────────────────────────────────────────────────────────────────────

/** Slow Ken Burns pushes that alternate in and out, joined by blurred dissolves and a warm light leak. */
const Cinematic: React.FC<Ctx> = ({ p, plan, frame, look }) => {
  const n = plan.n;
  const tr = transCinematic(plan);
  const leak = Math.max(0, ...plan.starts.slice(1).map((s) => interpolate(frame, [s - tr / 2, s, s + tr], [0, 0.5, 0], clamp)));
  return (
    <AbsoluteFill>
      {p.photos.map((ph, i) => {
        const from = i === 0 ? 0 : plan.starts[i] - tr / 2;
        const to = i === n - 1 ? plan.total : plan.ends[i] + tr / 2;
        if (frame < from || frame > to) return null;
        const t = (frame - from) / (to - from);
        const z = n === 1 ? 1.04 + easeInOut(t) * 0.3 : i % 2 === 0 ? 1.05 + t * 0.15 : 1.2 - t * 0.14;
        const pan = (t - 0.5) * 46 * (i % 2 ? -1 : 1);
        const fade = i === 0 ? 1 : progress(frame, from, from + tr, easeInOut);
        return (
          <Shot
            key={i}
            src={ph.src}
            focus={ph.focus}
            scale={z}
            x={pan}
            filter={`blur(${(1 - fade) * 14}px) brightness(${1 + (1 - fade) * 0.25})`}
            style={{ opacity: fade }}
          />
        );
      })}
      <Dust count={12} seed="cine" color={rgb(look.lightBg ? '#FFFFFF' : '#FFE2AA').join(',')} />
      <LightLeak t={leak} color={rgb(look.accent).join(',')} />
    </AbsoluteFill>
  );
};

/** Per-beat shots: the scale a cut opens on and ramps to (fast, then slow), its offset, and the angle it snaps from and settles at. */
const CUTS = [
  { s0: 1.42, s1: 1.1, x: 0, y: 0, r0: 0, r1: 0 },
  { s0: 1.3, s1: 1.4, x: -46, y: 36, r0: -5, r1: -1.5 },
  { s0: 1.5, s1: 1.44, x: 40, y: -50, r0: 4, r1: 1.5 },
  { s0: 1.12, s1: 1.24, x: 0, y: 40, r0: 0, r1: 0 },
  { s0: 1.36, s1: 1.3, x: 30, y: 70, r0: -3, r1: 2 },
];
const ramp = Easing.bezier(0.1, 0.9, 0.2, 1);

/**
 * A new shot on every beat: a hard crop that speed-ramps, a rotation snap, a motion smear, flash frames in white and
 * the accent, and the caption slammed in one word group per beat.
 */
const BeatCut: React.FC<Ctx> = (c) => {
  const { p, plan, frame, look } = c;
  const i = currentIndex(plan, frame);
  const local = frame - plan.starts[i];
  const k = Math.floor(local / plan.b);
  const lk = local - Math.round(k * plan.b);
  const first = k === 0 && i > 0;
  const cut = CUTS[(k + i * 2) % CUTS.length];
  const r = ramp(Math.min(1, lk / plan.b));
  const snap = progress(lk, 0, 6, easeOutExpo);
  const scale = cut.s0 + (cut.s1 - cut.s0) * r;
  const rot = cut.r0 + (cut.r1 - cut.r0) * snap;
  const x = cut.x * (1 + (1 - r) * 0.4);
  const dir = (k + i) % 2 ? 1 : -1;
  const smear = Math.max(0, 1 - lk / 4);
  const sh = first ? shake(lk, 22) : shake(lk, 6);
  const ph = p.photos[i];
  const white = first && lk < 1 ? 1 : 0;
  const tint = first ? interpolate(lk, [1, 2, 6], [0.8, 0.45, 0], clamp) : k % 2 === 1 ? interpolate(lk, [0, 3], [0.32, 0], clamp) : 0;
  const bright = k % 2 === 0 && !first ? interpolate(lk, [0, 4], [0.35, 0], clamp) : 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translate(${sh.x}px, ${sh.y}px)` }}>
        <Shot src={ph.src} focus={ph.focus} scale={scale} x={x} y={cut.y} rot={rot} filter={`brightness(${1 + bright}) contrast(1.08) saturate(1.1) blur(${smear * 2.5}px)`} />
        {smear > 0.05 ? (
          <Shot src={ph.src} focus={ph.focus} scale={scale * 1.02} x={x + dir * 80 * smear} y={cut.y} rot={rot} filter="blur(10px)" style={{ opacity: 0.4 * smear, mixBlendMode: 'screen' }} />
        ) : null}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: look.accent, opacity: tint, mixBlendMode: 'screen' }} />
      <AbsoluteFill style={{ background: '#FFFFFF', opacity: white }} />
      <KineticWords c={c} />
    </AbsoluteFill>
  );
};

/** The caption one word group per beat, big and centred; on the segment's last beat the whole caption settles. */
const KineticWords: React.FC<{ c: Ctx }> = ({ c }) => {
  const { p, plan, frame, look } = c;
  const i = currentIndex(plan, frame);
  const ph = p.photos[i];
  if (!ph.caption) return null;
  const [from, to] = captionSpan(c, i);
  if (frame < from || frame >= to) return null;
  const beats = Math.max(1, Math.round((to - from) / plan.b));
  const k = Math.min(beats - 1, Math.floor((frame - from) / plan.b));
  const lk = frame - from - Math.round(k * plan.b);
  const words = tokens(ph.caption).filter((t) => !/^\s+$/.test(t));
  const groups = beats >= 3 ? Math.min(beats - 1, words.length) : 0;
  if (k >= groups) {
    const start = from + Math.round(groups * plan.b);
    const o = progress(frame, to - 6, to, easeInOut);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {look.style === 'minimal' ? null : (
          <AbsoluteFill style={{ background: `linear-gradient(0deg, ${rgba(look.bg, 0.7)} 0%, ${rgba(look.bg, 0)} 45%)`, opacity: 1 - o }} />
        )}
        <div style={{ position: 'absolute', left: 90, right: 90, bottom: 450, display: 'flex', justifyContent: look.style === 'minimal' ? 'center' : 'flex-start' }}>
          <CaptionBlock c={c} text={ph.caption} index={i} f={frame - start} o={o} />
        </div>
      </AbsoluteFill>
    );
  }
  const size = Math.ceil(words.length / groups);
  const cjk = CJK.test(ph.caption);
  const text = upper(words.slice(k * size, (k + 1) * size).join(cjk ? '' : ' '), look);
  const t = progress(lk, 0, 6, easeOutExpo);
  const serif = look.style === 'editorial';
  const fontSize = fit(text, 920, 1, look.style === 'bold' ? 210 : 180, serif ? METRICS.serif : METRICS.display);
  const boxed = look.style === 'bold' && k % 2 === 1;
  const y = k % 2 ? 1080 : 780;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 18% at 50% ${(y / H) * 100}%, ${rgba(look.bg, 0.4)} 0%, ${rgba(look.bg, 0)} 100%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: y - fontSize * 0.6, textAlign: 'center' }}>
        <span
          style={{
            display: 'inline-block',
            fontFamily: serif ? fonts.serif : look.face,
            fontStyle: serif && !cjk ? 'italic' : 'normal',
            fontWeight: look.style === 'bold' ? 800 : serif ? 500 : 600,
            fontSize,
            lineHeight: 1.1,
            letterSpacing: look.style === 'bold' ? '-0.02em' : 0,
            whiteSpace: 'nowrap',
            color: boxed ? look.onAccent : look.ink,
            background: boxed ? look.accent : undefined,
            padding: boxed ? '0 0.18em' : 0,
            textShadow: boxed ? undefined : `0 6px 40px ${rgba('#000000', 0.45)}`,
            opacity: Math.min(1, t * 3),
            transform: `scale(${1.35 - 0.35 * t}) rotate(${(1 - t) * (k % 2 ? 5 : -5)}deg)`,
          }}
        >
          {text}
        </span>
      </div>
    </AbsoluteFill>
  );
};

const PORTAL_POINTS = [
  { x: 0.5, y: 0.42 },
  { x: 0.36, y: 0.5 },
  { x: 0.62, y: 0.38 },
  { x: 0.44, y: 0.56 },
];

/** The next photo appears as a small print inside the current one and the camera flies into it. */
const Portal: React.FC<Ctx> = ({ p, plan, frame, look }) => {
  const T = transPortal(plan);
  const i = currentIndex(plan, frame);
  const hold = (k: number) => 1 + 0.08 * progress(frame, plan.starts[k], plan.ends[k], (x) => x);
  const cur = p.photos[i];
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  if (frame < w0) return <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />;
  const e = Easing.bezier(0.6, 0, 0.3, 1)(Math.min(1, (frame - w0) / (w1 - w0)));
  const kk = 0.22;
  const cam = Math.pow(1 / kk, e);
  const g = (cam * kk - kk) / (1 - kk);
  const P = PORTAL_POINTS[i % PORTAL_POINTS.length];
  const px = P.x * W;
  const py = P.y * H;
  const dx = (W / 2 - px) * g;
  const dy = (H / 2 - py) * g;
  const appear = progress(frame, w0, w0 + 7, easeOutExpo);
  const cw = W * kk * cam;
  const ch = H * kk * cam;
  const blur = Math.sin(Math.PI * e) * 4;
  const nx = p.photos[next];
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${dx}px, ${dy}px) scale(${cam})`, transformOrigin: `${px}px ${py}px`, filter: `blur(${blur}px) brightness(${1 - e * 0.3})` }}>
        <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: px + dx - cw / 2,
          top: py + dy - ch / 2,
          width: cw,
          height: ch,
          opacity: appear,
          transform: `rotate(${(1 - g) * -4}deg) scale(${0.6 + 0.4 * appear})`,
          boxShadow: `0 0 0 ${(1 - g) * 9}px ${look.ink}, 0 ${30 * (1 - g)}px ${70 * (1 - g)}px rgba(0,0,0,${0.55 * (1 - g)})`,
          overflow: 'hidden',
        }}
      >
        <Shot src={nx.src} focus={nx.focus} filter={`blur(${blur * 0.5}px)`} />
      </div>
    </AbsoluteFill>
  );
};

/**
 * The next photo slides over the current one, which sinks back into a rounded card like an app switcher. Each photo
 * lags inside its own frame (parallax), and the moving panel trails a motion-blur smear at full speed.
 */
const Push: React.FC<Ctx> = ({ p, plan, frame }) => {
  const T = transPush(plan);
  const i = currentIndex(plan, frame);
  const hold = (k: number) => 1.14 - 0.08 * progress(frame, plan.starts[k], plan.ends[k], (x) => x);
  const drift = (k: number) => (progress(frame, plan.starts[k], plan.ends[k], (x) => x) - 0.5) * 30 * (k % 2 ? 1 : -1);
  const cur = p.photos[i];
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  if (frame < w0) {
    return (
      <AbsoluteFill>
        <Shot src={cur.src} focus={cur.focus} scale={hold(i)} y={drift(i)} />
      </AbsoluteFill>
    );
  }
  const tt = Math.min(1, (frame - w0) / (w1 - w0));
  const e = swing(tt);
  const v = Math.min(1, (swing(Math.min(1, tt + 0.05)) - swing(Math.max(0, tt - 0.05))) / 0.3);
  const up = next % 2 === 1;
  const dist = up ? H : W;
  const move = (d: number) => (up ? `translateY(${d}px)` : `translateX(${d}px)`);
  const nx = p.photos[next];
  const off = (1 - e) * dist;
  const panel = (d: number, opacity: number, blur: number, key: string) => (
    <AbsoluteFill
      key={key}
      style={{
        transform: `${move(d)} rotate(${up ? 0 : (1 - e) * 2}deg)`,
        borderRadius: (1 - e) * 56,
        overflow: 'hidden',
        opacity,
        filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
        boxShadow: opacity === 1 ? `0 0 90px rgba(0,0,0,${0.65 * (1 - e)})` : undefined,
      }}
    >
      <AbsoluteFill style={{ transform: move(-off * 0.3) }}>
        <Shot src={nx.src} focus={nx.focus} scale={1.14} y={drift(next)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill
        style={{
          transform: `${move(-e * dist * 0.16)} scale(${1 - 0.14 * e})`,
          borderRadius: e * 56,
          overflow: 'hidden',
          filter: `brightness(${1 - 0.6 * e}) blur(${v * 3}px)`,
        }}
      >
        <AbsoluteFill style={{ transform: move(-e * dist * 0.1) }}>
          <Shot src={cur.src} focus={cur.focus} scale={hold(i)} y={drift(i)} />
        </AbsoluteFill>
      </AbsoluteFill>
      {v > 0.15 ? [panel(off + v * 140, 0.22 * v, 14, 'g2'), panel(off + v * 70, 0.32 * v, 8, 'g1')] : null}
      {panel(off, 1, v * 2.5, 'main')}
      <div
        style={{
          position: 'absolute',
          ...(up ? { left: 0, right: 0, top: off - 1, height: 3 } : { top: 0, bottom: 0, left: off - 1, width: 3 }),
          background: 'rgba(255,255,255,0.85)',
          boxShadow: '0 0 30px 6px rgba(255,255,255,0.35)',
          opacity: v * (1 - e),
        }}
      />
    </AbsoluteFill>
  );
};

/** Polaroids drop onto a pile one per photo, develop from a pale wash, and get a handwritten caption. */
const Polaroid: React.FC<Ctx> = (c) => {
  const { p, plan, frame, fps, look } = c;
  const CW = 780;
  const PW = 700;
  const PH = 875;
  const CH = 40 + PH + 200;
  const cx = W / 2;
  const cy = 1030;
  const land = (i: number) => (i === 0 ? plan.intro - Math.round(plan.b * 0.25) : plan.starts[i]);
  const cur = currentIndex(plan, frame);
  const top = frame >= land(cur) ? cur : Math.max(0, cur - 1);
  const cam = plan.n === 1 ? 1 + progress(frame, 0, plan.total, (x) => x) * 0.1 : 1 + Math.sin(frame / 50) * 0.012;
  return (
    <AbsoluteFill style={{ background: look.bg }}>
      <Shot src={p.photos[top].src} scale={1.4} filter={`blur(60px) saturate(1.2) brightness(${look.lightBg ? 1.1 : 0.7})`} style={{ opacity: look.lightBg ? 0.35 : 0.45 }} />
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 50% at 50% 54%, ${rgba(look.ink, look.lightBg ? 0 : 0.06)} 0%, ${rgba(look.bg, 0.55)} 100%)` }} />
      <AbsoluteFill style={{ transform: `scale(${cam})`, transformOrigin: `50% ${cy / H * 100}%` }}>
        {p.photos.map((ph, i) => {
          const at = land(i);
          const dropStart = at - 9;
          if (frame < dropStart || i < cur - 3) return null;
          const d = spring({ frame: frame - dropStart, fps, config: { damping: 15, stiffness: 140, mass: 0.9 } });
          const rot0 = (random(`pr${i}`) - 0.5) * 12;
          const x0 = (random(`px${i}`) - 0.5) * 80;
          const y0 = (random(`py${i}`) - 0.5) * 40;
          const fall = 1 - d;
          const dev = progress(frame, at, at + plan.b * 3, easeInOut);
          const write = progress(frame, at + 6, at + 6 + plan.b * 1.8, Easing.bezier(0.45, 0, 0.55, 1));
          const age = Math.max(0, cur - i);
          const cap = ph.caption ?? '';
          const capCJK = CJK.test(cap);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: cx - CW / 2 + x0,
                top: cy - CH / 2 + y0 - fall * 1800,
                width: CW,
                height: CH,
                transform: `rotate(${rot0 + fall * (i % 2 ? 28 : -28)}deg) scale(${1 + fall * 0.25})`,
                background: 'linear-gradient(165deg, #FFFFFF 0%, #F4F1EA 100%)',
                boxShadow: `0 ${18 + fall * 60}px ${40 + fall * 80}px rgba(0,0,0,${0.32 - age * 0.04}), 0 2px 4px rgba(0,0,0,0.12)`,
                filter: age > 0 ? `brightness(${1 - age * 0.06})` : undefined,
              }}
            >
              <div style={{ position: 'absolute', left: 40, top: 40, width: PW, height: PH, overflow: 'hidden', background: '#DDD7CC' }}>
                <Shot
                  src={ph.src}
                  focus={ph.focus}
                  scale={1.02 + dev * 0.04}
                  filter={`sepia(${(1 - dev) * 0.55}) saturate(${0.35 + dev * 0.65}) brightness(${1.55 - dev * 0.55}) contrast(${0.75 + dev * 0.25})`}
                />
                <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08), inset 0 0 40px rgba(0,0,0,0.12)' }} />
              </div>
              {cap ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 50,
                    right: 50,
                    top: 40 + PH + 10,
                    height: 180,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    lineHeight: 1.1,
                    fontFamily: capCJK ? fonts.minchoJP : fonts.serif,
                    fontStyle: capCJK ? 'normal' : 'italic',
                    fontWeight: 500,
                    fontSize: fit(cap, CW - 100, 2, capCJK ? 46 : 64, METRICS.serif),
                    color: '#2C2824',
                    clipPath: `inset(-30% ${(1 - write) * 100}% -30% 0)`,
                  }}
                >
                  {cap}
                </div>
              ) : null}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const ROWS: Record<number, number[]> = {
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 1, 2],
  6: [2, 2, 2],
  7: [2, 3, 2],
  8: [3, 2, 3],
  9: [3, 3, 3],
  10: [2, 3, 3, 2],
};

type Rect = { x: number; y: number; w: number; h: number };

const collageCells = (n: number): Rect[] => {
  const rows = ROWS[n] ?? [1];
  const x0 = 60;
  const x1 = W - 60;
  const y0 = 250;
  const y1 = 1640;
  const gap = 14;
  const weights = rows.map((r) => (r === 1 ? 1.35 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  const avail = y1 - y0 - gap * (rows.length - 1);
  const cells: Rect[] = [];
  let y = y0;
  rows.forEach((count, r) => {
    const h = (avail * weights[r]) / sum;
    const w = (x1 - x0 - gap * (count - 1)) / count;
    for (let j = 0; j < count; j++) cells.push({ x: x0 + j * (w + gap), y, w, h });
    y += h + gap;
  });
  return cells;
};

/** Each photo opens full screen out of its cell, then flies back into the grid, which fills up one beat at a time. */
const Collage: React.FC<Ctx> = ({ p, plan, frame, look }) => {
  const cells = collageCells(plan.n);
  const radius = look.style === 'bold' ? 0 : look.style === 'minimal' ? 22 : 6;
  const full: Rect = { x: 0, y: 0, w: W, h: H };
  const settle = progress(frame, plan.outroAt, plan.total, (x) => x);
  const items = p.photos.map((ph, i) => {
    const cell = cells[i] ?? full;
    const enter0 = i === 0 ? -1 : plan.starts[i];
    const exit1 = i === plan.n - 1 ? plan.outroAt : plan.ends[i];
    const exit0 = exit1 - Math.round(plan.b * 0.75);
    const a = i === 0 ? 1 : progress(frame, enter0, enter0 + Math.round(plan.b * 0.55), Easing.bezier(0.2, 0.9, 0.2, 1));
    const r = progress(frame, exit0, exit1, Easing.bezier(0.7, 0, 0.2, 1));
    const k = a * (1 - r);
    const landed = frame >= exit1;
    const bump = landed ? interpolate(frame, [exit1, exit1 + 10], [1.04, 1], { ...clamp, easing: easeOutExpo }) : 1;
    const rect = {
      x: cell.x + (full.x - cell.x) * k,
      y: cell.y + (full.y - cell.y) * k,
      w: cell.w + (full.w - cell.w) * k,
      h: cell.h + (full.h - cell.h) * k,
    };
    const visible = frame >= enter0;
    const kb = 1.02 + 0.08 * progress(frame, enter0, exit1, (x) => x);
    return { ph, i, rect, k, visible, bump, kb, cell };
  });
  const order = [...items].sort((a, b) => a.k - b.k);
  return (
    <AbsoluteFill style={{ background: look.bg, transform: `scale(${1 + settle * 0.03})` }}>
      {cells.map((cell, i) => (
        <div
          key={`e${i}`}
          style={{ position: 'absolute', left: cell.x, top: cell.y, width: cell.w, height: cell.h, borderRadius: radius, border: `1.5px solid ${rgba(look.ink, 0.14)}`, background: rgba(look.ink, 0.03) }}
        />
      ))}
      {order.map(({ ph, i, rect, k, visible, bump, kb }) =>
        visible ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              borderRadius: radius * (1 - k),
              overflow: 'hidden',
              transform: `scale(${bump})`,
              boxShadow: k > 0.01 && k < 0.99 ? `0 30px 80px rgba(0,0,0,${0.5 * Math.sin(Math.PI * k)})` : undefined,
            }}
          >
            <Shot src={ph.src} focus={ph.focus} scale={kb} />
          </div>
        ) : null,
      )}
    </AbsoluteFill>
  );
};

/**
 * The masthead has to read as a magazine logo: one big line, or two balanced lines broken between phrases. A title
 * too long for either gives its opening phrase to the masthead and runs in full as the first cover line.
 */
const masthead = (title: string, look: Look) => {
  const cjk = CJK.test(title);
  const text = cjk ? title : title.toUpperCase();
  const tracking = cjk ? 0.02 : look.style === 'minimal' ? 0.12 : look.style === 'bold' ? -0.03 : -0.01;
  const face = cjk ? (look.style === 'bold' ? fonts.sansJP : fonts.minchoJP) : look.face;
  const weight = cjk ? (look.style === 'bold' ? 900 : 800) : look.style === 'bold' ? 800 : 600;
  const size1 = (t: string) => Math.floor(Math.min(330, 940 / measure(t, look.metrics, tracking)));
  const base = { tracking, face, weight };
  if (size1(text) >= 150) return { ...base, lines: [text], size: size1(text), full: false };
  const parts = tokens(text).filter((t) => !/^\s+$/.test(t));
  const join = (a: string[]) => a.join(cjk ? '' : ' ');
  let best = { lines: [text], size: 0 };
  for (let b = 1; b < parts.length; b++) {
    const lines = [join(parts.slice(0, b)), join(parts.slice(b))];
    const size = Math.min(...lines.map(size1));
    if (size > best.size) best = { lines, size };
  }
  if (best.size >= 120) return { ...base, ...best, size: Math.min(best.size, 230), full: false };
  let head = parts[0] ?? text;
  for (let b = 2; b <= parts.length && size1(join(parts.slice(0, b))) >= 170; b++) head = join(parts.slice(0, b));
  return { ...base, lines: [head], size: Math.min(size1(head), 300), full: true };
};

const Barcode: React.FC<{ color: string; bg: string }> = ({ color, bg }) => (
  <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, height: 64, padding: '8px 10px', background: bg }}>
    {new Array(30).fill(0).map((_, i) => (
      <div key={i} style={{ width: 1 + Math.floor(random(`bc${i}`) * 3), marginRight: 1 + Math.floor(random(`bg${i}`) * 3), background: color }} />
    ))}
  </div>
);

/** Every photo is a new magazine cover: a fixed masthead, issue line and cover lines over a page-turn. */
const Magazine: React.FC<Ctx> = (c) => {
  const { p, plan, frame, fps, look } = c;
  const T = transPush(plan);
  const i = currentIndex(plan, frame);
  const hold = (k: number) => 1.12 - 0.1 * progress(frame, plan.starts[k], plan.ends[k], easeInOut);
  const cur = p.photos[i];
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  const e = frame >= w0 ? swing(Math.min(1, (frame - w0) / (w1 - w0))) : 0;
  const mast = masthead(p.title, look);
  const mastTop = 190;
  const rowTop = mastTop + mast.size * 0.95 * mast.lines.length + 14;
  const [cin, cout] = captionSpan(c, i);
  const capOut = progress(frame, cout - 8, cout, easeInOut);
  const capText = frame < plan.intro ? (mast.full ? p.title : p.subtitle ?? '') : cur.caption ?? '';
  const capF = frame < plan.intro ? frame - 10 : frame - cin;
  const capIn = frame < plan.intro ? progress(frame, 10, 24) : 1;
  const introOut = frame < plan.intro ? progress(frame, plan.intro - 8, plan.intro, easeInOut) : capOut;
  const teaser = next > 0 ? p.photos[next].caption : undefined;
  const endF = frame - plan.outroAt;
  const sticker = endF >= 0 ? pop(endF, fps, 4, 11) : 0;
  const coverSize = capText ? fit(capText, 760, 3, look.style === 'bold' ? 80 : 100, look.style === 'bold' ? METRICS.display : METRICS.serif) : 0;
  const ctaSize = p.cta ? fit(p.cta.toUpperCase(), 200, 3, 44, METRICS.display) : 0;
  let li = 0;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translateX(${-e * 260}px)`, filter: `brightness(${1 - 0.45 * e})` }}>
        <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />
      </AbsoluteFill>
      {next > 0 && e > 0 ? (
        <AbsoluteFill style={{ transform: `translateX(${(1 - e) * W}px)`, boxShadow: '-40px 0 80px rgba(0,0,0,0.55)' }}>
          <Shot src={p.photos[next].src} focus={p.photos[next].focus} scale={1.12} />
          <AbsoluteFill style={{ background: `linear-gradient(90deg, rgba(0,0,0,${0.35 * (1 - e)}) 0%, rgba(0,0,0,0) 18%)` }} />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgba(look.bg, 0.55)} 0%, ${rgba(look.bg, 0)} 28%, ${rgba(look.bg, 0)} 55%, ${rgba(look.bg, 0.7)} 100%)` }} />
      <div
        style={{
          position: 'absolute',
          top: mastTop,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: mast.face,
          fontWeight: mast.weight,
          fontSize: mast.size,
          lineHeight: 0.95,
          letterSpacing: `${mast.tracking}em`,
          color: look.ink,
          textShadow: `0 6px 40px ${rgba(look.bg, 0.3)}`,
        }}
      >
        {mast.lines.map((line, l) => (
          <div key={l} style={{ whiteSpace: 'nowrap' }}>
            {[...line].map((ch, k) => {
              const t = progress(frame, 2 + li++ * 1.4, 18 + li * 1.4, easeOutExpo);
              return (
                <span key={k} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: t, transform: `translateY(${(1 - t) * -60}px)`, filter: `blur(${(1 - t) * 10}px)` }}>
                  {ch}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: rowTop,
          left: 80,
          right: 80,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          fontFamily: fonts.display,
          fontWeight: 600,
          fontSize: 26,
          letterSpacing: '0.3em',
          color: look.ink,
          textShadow: `0 1px 12px ${rgba(look.bg, 0.5)}`,
          opacity: progress(frame, 14, 26),
        }}
      >
        <span style={{ color: look.accent }}>{look.t.issue(String(i + 1).padStart(2, '0'))}</span>
        <span style={{ flex: 1, height: 1.5, background: rgba(look.ink, 0.6), transform: `scaleX(${progress(frame, 14, 34, easeInOut)})`, transformOrigin: 'left' }} />
        <span>{(p.handle ?? '').toUpperCase()}</span>
      </div>
      {teaser && frame >= plan.intro ? (
        <div
          style={{
            position: 'absolute',
            right: 80,
            top: rowTop + 120,
            width: 300,
            textAlign: 'right',
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 24,
            letterSpacing: '0.12em',
            lineHeight: 1.4,
            color: look.ink,
            opacity: progress(frame, cin + 8, cin + 20) * (1 - capOut),
          }}
        >
          <div style={{ color: look.accent, marginBottom: 6 }}>{look.t.next}</div>
          {CJK.test(teaser) ? teaser : teaser.toUpperCase()}
        </div>
      ) : null}
      {capText && endF < 0 ? (
        <div style={{ position: 'absolute', left: 80, bottom: 460, width: 760, opacity: capIn * (1 - introOut), transform: `translateY(${introOut * -20}px)` }}>
          <div style={{ width: 70, height: 6, background: look.accent, marginBottom: 26, transform: `scaleX(${progress(capF, 0, 14, easeOutExpo)})`, transformOrigin: 'left' }} />
          <div
            style={{
              fontFamily: look.style === 'bold' ? fonts.display : fonts.serif,
              fontWeight: look.style === 'bold' ? 800 : 500,
              fontStyle: look.style === 'editorial' && !CJK.test(capText) ? 'italic' : 'normal',
              fontSize: coverSize,
              lineHeight: 1.02,
              color: look.ink,
              textShadow: `0 4px 30px ${rgba(look.bg, 0.4)}`,
            }}
          >
            <Words text={upper(capText, look)} f={capF} delay={2} kind={look.style === 'bold' ? 'mask' : 'rise'} fps={fps} />
          </div>
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: 80, bottom: 380, opacity: progress(frame, 20, 32) }}>
        <Barcode color="#111" bg="#F4F1EA" />
      </div>
      {p.cta && endF >= 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 1120,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: look.accent,
            color: look.onAccent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 40,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: ctaSize,
            lineHeight: 1.1,
            letterSpacing: '0.02em',
            transform: `rotate(${-10 + (1 - sticker) * -30}deg) scale(${sticker})`,
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          }}
        >
          {CJK.test(p.cta) ? p.cta : p.cta.toUpperCase()}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** An Instagram-style carousel post: swipe with a finger-drag and spring settle, dots and caption below. */
const Carousel: React.FC<Ctx> = (c) => {
  const { p, plan, frame, fps, look } = c;
  const T = transCarousel(plan);
  const CW = 920;
  const CH = 1150;
  const CX = (W - CW) / 2;
  const CY = 310;
  let pos = 0;
  for (let k = 1; k < plan.n; k++) {
    const [w0, w1] = transWindow(plan, k, T);
    if (frame < w0) break;
    const release = w0 + Math.round((w1 - w0) * 0.45);
    const drag = progress(frame, w0, release, easeInOut) * 0.1;
    const snap = frame < release ? 0 : spring({ frame: frame - release, fps, config: { damping: 16, stiffness: 150, mass: 0.75 } });
    pos += drag * (1 - snap) + snap;
  }
  const active = Math.min(plan.n - 1, Math.round(pos));
  const enter = pop(frame, fps, 0, 15);
  const radius = look.style === 'bold' ? 6 : 26;
  const hold = 1.12 - 0.06 * progress(frame, 0, plan.total, (x) => x);
  const handle = p.handle ?? '';
  const ph = p.photos[active];
  const [cin, cout] = captionSpan(c, active);
  const capT = progress(frame, cin, cin + 12) * (1 - progress(frame, cout - 6, cout));
  const titleOut = progress(frame, plan.intro - 9, plan.intro, easeInOut);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${rgba(look.accent, look.lightBg ? 0.1 : 0.14)} 0%, ${look.bg} 70%)` }}>
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: CY - 92,
          right: CX,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          opacity: progress(frame, 4, 16),
        }}
      >
        <div style={{ width: 64, height: 64, borderRadius: 32, padding: 3, background: `linear-gradient(45deg, ${look.accent}, ${rgba(look.accent, 0.4)})` }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', border: `3px solid ${look.bg}`, position: 'relative' }}>
            <Shot src={p.photos[0].src} focus={p.photos[0].focus} scale={1.6} />
          </div>
        </div>
        <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 30, color: look.ink, flex: 1 }}>{handle.replace(/^@/, '')}</div>
        <div style={{ display: 'flex', gap: 7 }}>
          {[0, 1, 2].map((d) => (
            <div key={d} style={{ width: 8, height: 8, borderRadius: 4, background: look.ink }} />
          ))}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: CX,
          top: CY,
          width: CW,
          height: CH,
          borderRadius: radius,
          overflow: 'hidden',
          background: rgba(look.ink, 0.06),
          boxShadow: `0 40px 90px rgba(0,0,0,${look.lightBg ? 0.18 : 0.45})`,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 120}px) scale(${0.94 + enter * 0.06})`,
        }}
      >
        {p.photos.map((q, j) => {
          const d = j - pos;
          if (Math.abs(d) > 1.05) return null;
          return (
            <div key={j} style={{ position: 'absolute', inset: 0, transform: `translateX(${d * CW}px)`, overflow: 'hidden' }}>
              <Shot src={q.src} focus={q.focus} scale={hold} x={-d * CW * 0.12} />
            </div>
          );
        })}
        {plan.n > 1 ? (
          <div
            style={{
              position: 'absolute',
              top: 28,
              right: 28,
              padding: '8px 18px',
              borderRadius: 999,
              background: 'rgba(18,18,18,0.6)',
              color: '#FFF',
              fontFamily: fonts.display,
              fontWeight: 600,
              fontSize: 24,
              opacity: progress(frame, plan.intro - 6, plan.intro + 4),
            }}
          >
            {active + 1}/{plan.n}
          </div>
        ) : null}
        {frame <= plan.intro ? (
          <AbsoluteFill style={{ opacity: 1 - titleOut, filter: `blur(${titleOut * 8}px)` }}>
            <AbsoluteFill style={{ background: `linear-gradient(0deg, ${rgba(look.bg, 0.85)} 0%, ${rgba(look.bg, 0.5)} 35%, ${rgba(look.bg, 0)} 65%)` }} />
            <div style={{ position: 'absolute', left: 60, right: 60, bottom: 70, display: 'flex', justifyContent: look.style === 'minimal' ? 'center' : 'flex-start' }}>
              <TitleBlock c={c} f={frame - 6} maxW={CW - 120} />
            </div>
          </AbsoluteFill>
        ) : null}
      </div>
      {plan.n > 1 ? (
        <div style={{ position: 'absolute', top: CY + CH + 34, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12, opacity: enter }}>
          {p.photos.map((_, j) => {
            const near = Math.max(0, 1 - Math.abs(j - pos));
            return <div key={j} style={{ width: 12 + near * 18, height: 12, borderRadius: 6, background: near > 0.5 ? look.accent : rgba(look.ink, 0.25 + near * 0.5) }} />;
          })}
        </div>
      ) : null}
      {ph.caption && frame >= plan.intro ? (
        <div
          style={{
            position: 'absolute',
            left: CX + 4,
            right: CX,
            top: CY + CH + (plan.n > 1 ? 82 : 40),
            fontFamily: fonts.display,
            fontWeight: 600,
            fontSize: fit(`${handle} ${ph.caption}`, CW, 2, 34, METRICS.display),
            lineHeight: 1.35,
            color: rgba(look.ink, 0.9),
            opacity: capT,
            transform: `translateY(${(1 - capT) * 12}px)`,
          }}
        >
          {handle ? <span style={{ fontWeight: 800, color: look.ink }}>{handle.replace(/^@/, '')} </span> : null}
          {ph.caption}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** A floating photo card that flips in 3D to reveal the next photo on its back, alternating axes. */
const Flip: React.FC<Ctx> = (c) => {
  const { p, plan, frame, look } = c;
  const T = transFlip(plan);
  const CW = 860;
  const CH = 1240;
  const left = (W - CW) / 2;
  const top = 470;
  const i = currentIndex(plan, frame);
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  const e = frame >= w0 ? glide(Math.min(1, (frame - w0) / (w1 - w0))) : 0;
  const axisY = next % 2 === 1;
  const ry = Math.sin(frame / 34) * 5;
  const rx = Math.cos(frame / 43) * 3;
  const lift = Math.sin(Math.PI * e);
  // the card waits low and small under the title, then rises as the title leaves
  const low = 1 - progress(frame, plan.intro - 12, plan.intro + 6, easeInOut);
  const radius = look.style === 'bold' ? 8 : 34;
  const face = (k: number, back: boolean) => {
    const ph = p.photos[k];
    const [cin, cout] = captionSpan(c, k);
    const o = progress(frame, cout - 8, cout, easeInOut);
    const showCap = ph.caption && frame >= cin && frame <= cout;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: radius,
          overflow: 'hidden',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          transform: back ? (axisY ? 'rotateY(180deg)' : 'rotateX(180deg)') : undefined,
          background: '#111',
        }}
      >
        <Shot src={ph.src} focus={ph.focus} scale={1.04 + 0.05 * progress(frame, plan.starts[k], plan.ends[k], (x) => x)} />
        <AbsoluteFill style={{ background: `linear-gradient(${110 + ry * 6}deg, rgba(255,255,255,0) 30%, rgba(255,255,255,${0.14 + lift * 0.2}) 50%, rgba(255,255,255,0) 70%)`, mixBlendMode: 'soft-light' }} />
        {showCap ? (
          <>
            <AbsoluteFill style={{ background: `linear-gradient(0deg, ${rgba(look.bg, 0.75)} 0%, ${rgba(look.bg, 0)} 40%)`, opacity: progress(frame, cin, cin + 10) * (1 - o) }} />
            <div style={{ position: 'absolute', left: 56, right: 56, bottom: 64, display: 'flex', justifyContent: look.style === 'minimal' ? 'center' : 'flex-start' }}>
              <CaptionBlock c={c} text={ph.caption!} index={k} f={frame - cin - 2} o={o} maxW={CW - 112} />
            </div>
          </>
        ) : null}
      </div>
    );
  };
  const bgPhoto = (k: number, op: number) => (
    <Shot src={p.photos[k].src} scale={1.5} filter={`blur(50px) saturate(1.3) brightness(${look.lightBg ? 1.05 : 0.55})`} style={{ opacity: op }} />
  );
  return (
    <AbsoluteFill style={{ background: look.bg, perspective: 2400 }}>
      {bgPhoto(i, look.lightBg ? 0.5 : 1)}
      {next > 0 && e > 0 ? bgPhoto(next, e * (look.lightBg ? 0.5 : 1)) : null}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 60% at 50% 55%, ${rgba(look.bg, 0)} 0%, ${rgba(look.bg, 0.5)} 100%)` }} />
      <div
        style={{
          position: 'absolute',
          left: left + 60,
          right: left + 60,
          top: top + CH - 30,
          height: 60,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          filter: `blur(${30 + lift * 30}px)`,
          transform: `translateY(${low * 150}px) scale(${(1 - lift * 0.2) * (1 - low * 0.2)})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: CW,
          height: CH,
          transformStyle: 'preserve-3d',
          transform: `translateY(${low * 170}px) scale(${(1 - 0.12 * lift) * (1 - low * 0.18)}) rotateX(${rx + (axisY ? 0 : -180 * e)}deg) rotateY(${ry + (axisY ? 180 * e : 0)}deg)`,
        }}
      >
        {face(i, false)}
        {next > 0 && e > 0 ? face(next, true) : null}
      </div>
    </AbsoluteFill>
  );
};

/** A backlit 35mm strip scrolls frame to frame on the beat; the camera eases out while it moves. */
const Filmstrip: React.FC<Ctx> = ({ p, plan, frame, look }) => {
  const T = transFilm(plan);
  const SW = 860;
  const IW = 700;
  const IH = 934;
  const FH = IH + 64;
  const LEAD = 2;
  let pos = 0;
  let moving = 0;
  for (let k = 1; k < plan.n; k++) {
    const [w0, w1] = transWindow(plan, k, T);
    const t = glide(progress(frame, w0, w1, (x) => x));
    pos += t;
    moving = Math.max(moving, Math.sin(Math.PI * t));
  }
  const frames = plan.n + LEAD * 2;
  const stripH = frames * FH;
  const centerY = 930;
  const ty = centerY - (LEAD * FH + pos * FH + FH / 2);
  const cam = 1.04 - moving * 0.1 + progress(frame, plan.outroAt, plan.total, (x) => x) * 0.03;
  const lightBox = '#F6F1E7';
  const orange = '#F0A23B';
  return (
    <AbsoluteFill style={{ background: look.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 60% 45% at 50% 48%, ${rgba(lightBox, look.lightBg ? 0.9 : 0.16)} 0%, ${rgba(look.bg, 0)} 70%)` }} />
      <AbsoluteFill style={{ transform: `scale(${cam}) rotate(-4deg)`, transformOrigin: `50% ${(centerY / H) * 100}%` }}>
        <div
          style={{
            position: 'absolute',
            left: (W - SW) / 2,
            top: ty,
            width: SW,
            height: stripH,
            background: 'linear-gradient(90deg, #17130F 0%, #221C16 50%, #17130F 100%)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
            filter: `blur(${moving * 3}px)`,
          }}
        >
          <svg width={SW} height={stripH} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <pattern id="sprocket" width={SW} height={62} patternUnits="userSpaceOnUse">
                <rect x={22} y={18} width={36} height={26} rx={6} fill={lightBox} opacity={0.92} />
                <rect x={SW - 58} y={18} width={36} height={26} rx={6} fill={lightBox} opacity={0.92} />
              </pattern>
            </defs>
            <rect width={SW} height={stripH} fill="url(#sprocket)" />
          </svg>
          {new Array(frames).fill(0).map((_, j) => {
            const k = j - LEAD;
            const ph = p.photos[k];
            const near = Math.max(0, 1 - Math.abs(k - pos));
            return (
              <div key={j} style={{ position: 'absolute', left: (SW - IW) / 2, top: j * FH + 32, width: IW, height: IH, background: '#0E0B08', overflow: 'hidden', borderRadius: 4 }}>
                {ph ? (
                  <Shot src={ph.src} focus={ph.focus} scale={1.04 + near * 0.03} filter={`brightness(${0.5 + near * 0.5}) saturate(${0.7 + near * 0.35}) contrast(1.05)`} />
                ) : null}
              </div>
            );
          })}
          {new Array(frames).fill(0).map((_, j) => (
            <div
              key={`t${j}`}
              style={{
                position: 'absolute',
                left: SW - 18,
                top: j * FH + 60,
                transformOrigin: '0 0',
                transform: 'rotate(90deg)',
                whiteSpace: 'nowrap',
                fontFamily: fonts.display,
                fontWeight: 800,
                fontSize: 15,
                letterSpacing: '0.2em',
                color: orange,
                opacity: 0.85,
              }}
            >
              {j - LEAD + 1 > 0 ? `${j - LEAD + 1}  ▸  ${j - LEAD + 1}A` : '▸'}
              <span style={{ marginLeft: 260 }}>400</span>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const transThenNow = (p: Plan) => Math.round(Math.min(p.b * 2.2, p.per * 0.7));
const transSplit = (p: Plan) => Math.round(Math.min(p.b * 1.2, p.per * 0.5));
const transCube = (p: Plan) => Math.round(Math.min(p.b * 1.1, p.per * 0.5));
const transScrap = (p: Plan) => Math.round(Math.min(p.b * 1.3, p.per * 0.55));
const burnSpan = (p: Plan) => [Math.round(p.b * 0.7), Math.round(p.b * 0.6)] as const;

/** A small fixed label (THEN, NOW…) in the style's voice. */
const Tag: React.FC<{ look: Look; text: string; style?: React.CSSProperties }> = ({ look, text, style }) => {
  const base: React.CSSProperties =
    look.style === 'bold'
      ? { background: look.accent, color: look.onAccent, fontFamily: fonts.display, fontWeight: 800, fontSize: 38, letterSpacing: '0.08em', padding: '12px 24px' }
      : look.style === 'minimal'
        ? { background: rgba(look.bg, 0.6), color: look.ink, backdropFilter: 'blur(18px)', fontFamily: fonts.display, fontWeight: 600, fontSize: 36, padding: '14px 32px', borderRadius: 999 }
        : { color: '#FFFFFF', fontFamily: fonts.serif, fontWeight: 600, fontSize: 44, letterSpacing: '0.3em', borderBottom: '1.5px solid rgba(255,255,255,0.8)', paddingBottom: 6, textShadow: '0 2px 18px rgba(0,0,0,0.5)' };
  return <div style={{ position: 'absolute', whiteSpace: 'nowrap', ...base, ...style }}>{text}</div>;
};

/** Then → now: a comparison slider sweeps in, hesitates at the middle with both photos labelled, then completes. */
const ThenNow: React.FC<Ctx> = ({ p, plan, frame, look }) => {
  const T = transThenNow(plan);
  const i = currentIndex(plan, frame);
  const hold = (k: number) => 1.04 + 0.06 * progress(frame, plan.starts[k], plan.ends[k], (x) => x);
  const cur = p.photos[i];
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  if (frame < w0) return <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />;
  const t = Math.min(1, (frame - w0) / (w1 - w0));
  const pos =
    t < 0.4
      ? 0.5 * Easing.bezier(0.3, 0, 0.2, 1)(t / 0.4)
      : t < 0.72
        ? 0.5 + Math.sin(((t - 0.4) / 0.32) * Math.PI * 2) * 0.05
        : 0.5 + 0.5 * Easing.bezier(0.6, 0, 0.3, 1)((t - 0.72) / 0.28);
  const x = W * (1 - pos);
  const lab = Math.min(progress(t, 0.22, 0.36), 1 - progress(t, 0.74, 0.84));
  const knob = Math.min(progress(t, 0, 0.08), 1 - progress(t, 0.9, 1));
  const nx = p.photos[next];
  return (
    <AbsoluteFill>
      <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${x}px)` }}>
        <Shot src={nx.src} focus={nx.focus} scale={1.04} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', left: x - 2, top: 0, bottom: 0, width: 4, background: '#FFFFFF', boxShadow: '0 0 30px rgba(0,0,0,0.45)' }} />
      <div
        style={{
          position: 'absolute',
          left: x - 50,
          top: 910,
          width: 100,
          height: 100,
          borderRadius: 50,
          background: '#FFFFFF',
          boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${knob})`,
        }}
      >
        <svg width={56} height={30} viewBox="0 0 56 30">
          <path d="M18 4 L6 15 L18 26 M38 4 L50 15 L38 26" stroke="#141414" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <Tag look={look} text={look.t.then} style={{ right: W - x + 34, top: 300, opacity: lab, transform: `translateX(${(1 - lab) * -20}px)` }} />
      <Tag look={look} text={look.t.now} style={{ left: x + 34, top: 300, opacity: lab, transform: `translateX(${(1 - lab) * 20}px)` }} />
    </AbsoluteFill>
  );
};

/** The photo breaks into slices that fly off in alternating directions, uncovering the next one as it settles. */
const Split: React.FC<Ctx> = ({ p, plan, frame }) => {
  const T = transSplit(plan);
  const i = currentIndex(plan, frame);
  const hold = (k: number) => 1.04 + 0.07 * progress(frame, plan.starts[k], plan.ends[k], (x) => x);
  const cur = p.photos[i];
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  if (frame < w0) return <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />;
  const rows = next % 2 === 0;
  const S = rows ? 4 : 3;
  const stagger = 3;
  const len = T - (S - 1) * stagger;
  const settle = glide(Math.min(1, (frame - w0) / (w1 - w0)));
  const nx = p.photos[next];
  const sw = rows ? W : W / S;
  const sh = rows ? H / S : H;
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Shot src={nx.src} focus={nx.focus} scale={1.04 + (1 - settle) * 0.16} filter={`brightness(${0.5 + 0.5 * settle})`} />
      {new Array(S).fill(0).map((_, j) => {
        const order = j % 2 ? S - 1 - j : j;
        const tj = Math.max(0, Math.min(1, (frame - w0 - order * stagger) / len));
        const ej = Easing.bezier(0.76, 0, 0.24, 1)(tj);
        const sign = j % 2 ? 1 : -1;
        const d = sign * ej * (rows ? W : H) * 1.05;
        return (
          <div
            key={j}
            style={{
              position: 'absolute',
              left: rows ? 0 : j * sw,
              top: rows ? j * sh : 0,
              width: sw + (rows ? 0 : 1),
              height: sh + (rows ? 1 : 0),
              overflow: 'hidden',
              transform: rows ? `translateX(${d}px)` : `translateY(${d}px)`,
              boxShadow: ej > 0 ? `0 0 50px rgba(0,0,0,${0.6 * Math.sin(Math.PI * ej)})` : undefined,
            }}
          >
            <div style={{ position: 'absolute', left: rows ? 0 : -j * sw, top: rows ? -j * sh : 0, width: W, height: H }}>
              <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** A 3D cube turns to bring the next photo round from its side, alternating left and up. */
const Cube: React.FC<Ctx> = ({ p, plan, frame, look }) => {
  const T = transCube(plan);
  const i = currentIndex(plan, frame);
  const hold = (k: number) => 1.04 + 0.07 * progress(frame, plan.starts[k], plan.ends[k], (x) => x);
  const cur = p.photos[i];
  const next = i + 1 < plan.n ? i + 1 : -1;
  const [w0, w1] = next > 0 ? transWindow(plan, next, T) : [Infinity, Infinity];
  if (frame < w0) return <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />;
  const e = Easing.bezier(0.7, 0, 0.25, 1)(Math.min(1, (frame - w0) / (w1 - w0)));
  const horiz = next % 2 === 1;
  const d = horiz ? W / 2 : H / 2;
  const shrink = 1 - 0.16 * Math.sin(Math.PI * e);
  const nx = p.photos[next];
  const face: React.CSSProperties = { position: 'absolute', inset: 0, overflow: 'hidden', backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 50%, ${rgba(look.accent, 0.18)} 0%, ${look.bg} 70%)`, perspective: 2000 }}>
      <AbsoluteFill style={{ transform: `scale(${shrink})`, transformStyle: 'preserve-3d' }}>
        <AbsoluteFill style={{ transformStyle: 'preserve-3d', transform: `translateZ(${-d}px) ${horiz ? `rotateY(${-90 * e}deg)` : `rotateX(${90 * e}deg)`}` }}>
          <div style={{ ...face, transform: `translateZ(${d}px)` }}>
            <Shot src={cur.src} focus={cur.focus} scale={hold(i)} />
            <AbsoluteFill style={{ background: '#000', opacity: 0.65 * e }} />
          </div>
          <div style={{ ...face, transform: horiz ? `rotateY(90deg) translateZ(${d}px)` : `rotateX(-90deg) translateZ(${d}px)` }}>
            <Shot src={nx.src} focus={nx.focus} scale={1.04} />
            <AbsoluteFill style={{ background: '#000', opacity: 0.65 * (1 - e) }} />
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Analogue film: gate weave and flicker on every shot, and an orange film burn that blows out across each cut. */
const Burn: React.FC<Ctx> = ({ p, plan, frame }) => {
  const [before, after] = burnSpan(plan);
  const i = currentIndex(plan, frame);
  let u = 0;
  let seed = 0;
  for (let k = 1; k < plan.n; k++) {
    const cAt = plan.starts[k];
    if (frame >= cAt - before && frame <= cAt + after) {
      u = frame < cAt ? Easing.bezier(0.5, 0, 0.9, 0.6)((frame - (cAt - before)) / before) : 1 - glide((frame - cAt) / after);
      seed = k;
    }
  }
  const step = Math.floor(frame / 2);
  const weave = { x: (random(`wx${step}`) - 0.5) * 4, y: (random(`wy${step}`) - 0.5) * 5 };
  const flicker = 1 + (random(`fl${frame}`) - 0.5) * 0.06;
  const beatPop = Math.exp(-(frame % plan.b) / 4) * 0.05;
  const ph = p.photos[i];
  const scale = 1.06 + 0.07 * progress(frame, plan.starts[i], plan.ends[i], (x) => x);
  const blob = (n: number) => {
    const bx = random(`bx${seed}${n}`) * 100 + Math.sin(frame / 7 + n) * 6;
    const by = random(`by${seed}${n}`) * 100 + Math.cos(frame / 9 + n) * 6;
    const r = 18 + u * 42 + n * 6;
    return `radial-gradient(circle at ${bx}% ${by}%, rgba(255,214,140,${u}) 0%, rgba(255,112,24,${0.95 * u}) ${r * 0.35}%, rgba(190,28,8,${0.8 * u}) ${r * 0.7}%, rgba(0,0,0,0) ${r}%)`;
  };
  const side = seed % 2 ? 'to left' : 'to right';
  return (
    <AbsoluteFill style={{ background: '#0A0806' }}>
      <AbsoluteFill style={{ transform: `translate(${weave.x}px, ${weave.y}px)` }}>
        <Shot
          src={ph.src}
          focus={ph.focus}
          scale={scale}
          filter={`sepia(${0.14 + u * 0.3}) saturate(${1.12 + u * 0.5}) contrast(${1.06 - u * 0.15}) brightness(${flicker + beatPop + u * 0.45})`}
        />
      </AbsoluteFill>
      {u > 0.01 ? (
        <>
          <AbsoluteFill style={{ mixBlendMode: 'screen', background: [blob(0), blob(1), blob(2)].join(', ') }} />
          <AbsoluteFill style={{ mixBlendMode: 'screen', background: `linear-gradient(${side}, rgba(230,60,10,${u}) 0%, rgba(255,140,40,${0.75 * u}) ${30 * u}%, rgba(0,0,0,0) ${60 * u}%)` }} />
        </>
      ) : null}
      <AbsoluteFill style={{ background: '#FFD9A0', mixBlendMode: 'screen', opacity: u > 0.85 ? (u - 0.85) * 5 : 0 }} />
      <Grain opacity={0.09} />
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 160px rgba(0,0,0,0.55)' }} />
    </AbsoluteFill>
  );
};

/** Doodles drawn on with the pen, one kind per photo. Coordinates are relative to the photo's top-left corner. */
const Doodle: React.FC<{ kind: number; draw: number; color: string; pw: number; ph: number }> = ({ kind, draw, color, pw, ph }) => {
  const stroke = { stroke: color, strokeWidth: 6, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - draw };
  const paths: Record<number, { box: [number, number, number, number]; d: string[] }> = {
    0: { box: [pw - 120, -150, 260, 220], d: ['M20 30 C 90 10, 170 40, 190 120', 'M160 100 L192 126 L214 88'] },
    1: { box: [-110, -90, 220, 200], d: ['M60 20 L72 58 L110 62 L80 84 L92 122 L60 98 L28 122 L40 84 L10 62 L48 58 Z', 'M160 120 L166 140 L186 142 L170 154 L176 174 L160 162 L144 174 L150 154 L134 142 L154 140 Z'] },
    2: { box: [pw - 150, ph - 120, 260, 240], d: ['M130 20 C 40 10, 10 90, 50 150 C 90 210, 220 200, 236 120 C 250 50, 170 10, 110 30', 'M150 200 C 140 180, 170 170, 176 190 C 182 170, 212 180, 200 200 L176 224 Z'] },
    3: { box: [-60, ph - 80, 200, 200], d: ['M20 160 C 40 100, 60 60, 140 40', 'M110 30 L144 38 L126 70'] },
  };
  const g = paths[kind % 4];
  return (
    <svg style={{ position: 'absolute', left: g.box[0], top: g.box[1], overflow: 'visible' }} width={g.box[2]} height={g.box[3]}>
      {g.d.map((d, j) => (
        <path key={j} d={d} {...stroke} strokeDashoffset={1 - Math.max(0, Math.min(1, draw * g.d.length - j))} />
      ))}
    </svg>
  );
};

/**
 * A journal page the camera travels down: the title, then each photo slapped on with washi tape, a handwritten
 * caption and a doodle drawn on beside it.
 */
const Scrapbook: React.FC<Ctx> = (c) => {
  const { p, plan, frame, fps, look } = c;
  const T = transScrap(plan);
  const PW = 700;
  const PH = 875;
  const titleY = 860;
  const spot = (k: number) => ({ x: 540 + (k % 2 ? 70 : -70), y: 1820 + k * 1180, r: (random(`sr${k}`) - 0.5) * 9 });
  const arrive = (k: number) => (k === 0 ? plan.intro : plan.starts[k]);
  const target = (k: number) => (k < 0 ? { x: 540, y: titleY, r: 0 } : { x: spot(k).x, y: spot(k).y + 140, r: spot(k).r * 0.4 });
  let cam = target(-1);
  let moving = 0;
  for (let k = 0; k < plan.n; k++) {
    const e = glide(progress(frame, arrive(k) - T, arrive(k), (x) => x));
    const a = target(k - 1);
    const b = target(k);
    if (e > 0) cam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, r: a.r + (b.r - a.r) * e };
    moving = Math.max(moving, Math.sin(Math.PI * e));
  }
  const zoom = (1 - 0.22 * moving) * (1 + progress(frame, plan.outroAt, plan.total, (x) => x) * 0.03);
  const pageH = 2400 + plan.n * 1180;
  const tape = (left: number, top: number, rot: number, t: number) => (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: 200,
        height: 58,
        transform: `rotate(${rot}deg) scaleX(${t})`,
        transformOrigin: rot < 0 ? 'right center' : 'left center',
        background: `repeating-linear-gradient(45deg, ${rgba(look.accent, 0.62)} 0 12px, ${rgba(look.accent, 0.48)} 12px 24px)`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        opacity: Math.min(1, t * 2),
      }}
    />
  );
  return (
    <AbsoluteFill style={{ background: look.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: W,
          height: pageH,
          transformOrigin: `${cam.x}px ${cam.y}px`,
          transform: `translate(${540 - cam.x}px, ${900 - cam.y}px) scale(${zoom}) rotate(${-cam.r}deg)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: -1200,
            right: -1200,
            top: -1200,
            bottom: -1200,
            backgroundImage: `radial-gradient(${rgba(look.ink, 0.16)} 2px, transparent 2.4px)`,
            backgroundSize: '46px 46px',
          }}
        />
        <div style={{ position: 'absolute', left: 80, right: 80, top: titleY - 260, display: 'flex', justifyContent: 'center' }}>
          <TitleBlock c={c} f={frame - 4} align="center" maxW={920} />
        </div>
        {p.photos.map((ph, k) => {
          const s = spot(k);
          const at = k === 0 ? Math.round(plan.b * 1.5) : arrive(k) - Math.round(T * 0.6);
          if (frame < at) return null;
          const slap = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 170, mass: 0.7 } });
          const tapeT = progress(frame, at + 5, at + 12, easeOutExpo);
          const write = progress(frame, at + 10, at + 10 + plan.b * 1.8, Easing.bezier(0.45, 0, 0.55, 1));
          const draw = progress(frame, at + 14, at + 14 + plan.b * 1.6, easeInOut);
          const cap = ph.caption ?? '';
          const capCJK = CJK.test(cap);
          return (
            <div key={k} style={{ position: 'absolute', left: s.x - PW / 2, top: s.y - PH / 2, width: PW, height: PH, transform: `rotate(${s.r}deg)` }}>
              <div
                style={{
                  position: 'absolute',
                  inset: -18,
                  background: '#FBF9F4',
                  boxShadow: `0 ${10 + (1 - slap) * 40}px ${30 + (1 - slap) * 50}px rgba(0,0,0,0.28)`,
                  transform: `scale(${1.25 - 0.25 * slap})`,
                  opacity: Math.min(1, slap * 2.5),
                }}
              >
                <div style={{ position: 'absolute', inset: 18, overflow: 'hidden' }}>
                  <Shot src={ph.src} focus={ph.focus} scale={1.03} />
                </div>
              </div>
              {tape(-80, -40, -32, tapeT)}
              {tape(PW - 120, -40, 32, tapeT)}
              <Doodle kind={k} draw={draw} color={look.accent} pw={PW} ph={PH} />
              {cap ? (
                <div
                  style={{
                    position: 'absolute',
                    left: -40,
                    right: -40,
                    top: PH + 46,
                    textAlign: 'center',
                    fontFamily: capCJK ? fonts.minchoJP : fonts.serif,
                    fontStyle: capCJK ? 'normal' : 'italic',
                    fontWeight: 500,
                    fontSize: fit(cap, PW + 80, 2, capCJK ? 56 : 72, METRICS.serif),
                    lineHeight: 1.1,
                    color: look.ink,
                    transform: `rotate(${-s.r * 0.6 - 1.5}deg)`,
                    clipPath: `inset(-30% ${(1 - write) * 100}% -30% 0)`,
                  }}
                >
                  {cap}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const MOTIONS: Record<PhotoMotion, React.FC<Ctx>> = {
  cinematic: Cinematic,
  beatcut: BeatCut,
  portal: Portal,
  push: Push,
  polaroid: Polaroid,
  collage: Collage,
  magazine: Magazine,
  carousel: Carousel,
  flip: Flip,
  filmstrip: Filmstrip,
  thennow: ThenNow,
  split: Split,
  scrapbook: Scrapbook,
  cube: Cube,
  burn: Burn,
};

export const PhotoReel: React.FC<PhotoReelProps> = (p) => {
  useFonts([p, labelText(p.lang ?? 'en')]);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const plan = photoReelPlan(p, fps);
  const look = resolveLook(p);
  const spec = SPECS[p.motion];
  const c: Ctx = { p, plan, look, frame, fps, spec };
  const Motion = MOTIONS[p.motion];
  const end = spec.ownsEnd ? 0 : progress(frame, plan.outroAt, plan.outroAt + Math.round(plan.b * 1.2), easeOutExpo);
  const blur = (spec.endBlur ?? 14) * end;
  return (
    <AbsoluteFill style={{ background: look.bg, overflow: 'hidden', ...cjkVars(p.lang) }}>
      <AbsoluteFill style={{ filter: blur > 0.1 ? `blur(${blur}px)` : undefined, transform: `scale(${1 + end * 0.04})` }}>
        <Motion {...c} />
      </AbsoluteFill>
      {spec.captions === 'shared' ? <SharedCaptions c={c} /> : null}
      {spec.title !== 'own' ? <TitleOverlay c={c} anchor={spec.title} /> : null}
      {spec.ownsEnd ? null : <EndCard c={c} />}
      {look.lightBg ? null : <Vignette strength={0.35} />}
      <Grain opacity={0.05} />
      {p.music ? <Audio src={asset(p.music)} /> : null}
    </AbsoluteFill>
  );
};
