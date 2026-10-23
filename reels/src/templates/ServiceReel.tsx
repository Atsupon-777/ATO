import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, interpolate, random, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ServiceLayout, ServiceReelProps, ServiceScreen } from '../servicereel';
import type { Lang } from '../lang';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { beatFrames, clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { BrowserFrame, Cursor, PhoneFrame } from '../components/Devices';
import { Grain } from '../components/Film';

/* ───────────────────────── timeline ───────────────────────── */

type SceneId =
  | 'hook'
  | 'orbit'
  | 'spot'
  | 'demo'
  | 'summary'
  | 'pains'
  | 'turn'
  | 'solution'
  | 'compare'
  | 'stat'
  | 'intro'
  | 'feature'
  | 'recap'
  | 'plans'
  | 'offer'
  | 'quote'
  | 'steps'
  | 'words'
  | 'slam'
  | 'flash'
  | 'end';
type SceneDef = { id: SceneId; beats: number; i: number };
type Enter = 'up' | 'left' | 'circle' | 'cut';

const DEMO_BEATS = 5;
const STEP_BEATS = 4;

/** Which screen the reel can actually show, given the screenshots supplied. */
export const resolveScreen = (p: ServiceReelProps): ServiceScreen => {
  const { phone, desktop } = p;
  if (p.screen === 'both') return phone && desktop ? 'both' : phone ? 'phone' : desktop ? 'desktop' : 'none';
  if (p.screen === 'phone') return phone ? 'phone' : desktop ? 'desktop' : 'none';
  if (p.screen === 'desktop') return desktop ? 'desktop' : phone ? 'phone' : 'none';
  return 'none';
};

/** A layout whose data is missing falls back to the features layout, which only needs features. */
export const resolveLayout = (p: ServiceReelProps): ServiceLayout => {
  const screen = resolveScreen(p);
  switch (p.layout) {
    case 'orbit':
    case 'clickthrough':
      return screen === 'none' ? 'features' : p.layout;
    case 'stats':
      return p.stats?.length ? 'stats' : 'features';
    case 'pricing':
      return p.plans?.length ? 'pricing' : 'features';
    case 'voice':
      return p.testimonial ? 'voice' : 'features';
    case 'problem':
    case 'beforeafter':
      return p.pains?.length ? p.layout : 'features';
    default:
      return p.layout;
  }
};

const kineticTokens = (p: ServiceReelProps) => p.hook.flatMap((l) => (/\s/.test(l.trim()) ? l.trim().split(/\s+/) : [l.trim()]));

export const serviceScenes = (p: ServiceReelProps): SceneDef[] => {
  const n = p.features.length;
  const s = (id: SceneId, beats: number, i = 0): SceneDef => ({ id, beats, i });
  const each = (id: SceneId, count: number, beats: number) => Array.from({ length: count }, (_, i) => s(id, beats, i));
  const end = s('end', 8);
  const nStats = p.stats?.length ?? 0;
  switch (resolveLayout(p)) {
    case 'orbit':
      return [s('hook', 5), s('orbit', 10), ...each('spot', n, 4), end];
    case 'clickthrough':
      return [s('hook', 5), s('demo', DEMO_BEATS * n), ...(nStats ? [s('summary', 6)] : []), end];
    case 'problem':
      return [s('pains', 8), s('turn', 4), s('solution', 4 + 2 * n), end];
    case 'beforeafter':
      return [s('hook', 5), s('compare', 14), end];
    case 'stats':
      return [s('hook', 5), ...each('stat', nStats, 4), s('summary', 6), end];
    case 'pricing':
      return [s('hook', 5), s('plans', 11), ...(p.offer ? [s('offer', 4)] : []), end];
    case 'voice':
      return [s('quote', 12), nStats ? s('summary', 6) : s('intro', 5), end];
    case 'steps': {
      const k = p.steps?.length ?? Math.max(2, n);
      return [s('hook', 5), s('steps', STEP_BEATS * k + 1), end];
    }
    case 'kinetic': {
      const t = kineticTokens(p).length;
      return [s('words', Math.ceil(t * (t > 8 ? 0.5 : 1)) + 1), s('slam', 4), ...each('flash', n, 2.5), end];
    }
    default:
      return [s('intro', 5), ...each('feature', n, 5), s('recap', 5), end];
  }
};

export const serviceReelDuration = (p: ServiceReelProps, fps: number) =>
  Math.round(serviceScenes(p).reduce((a, x) => a + x.beats, 0) * beatFrames(p.bpm, fps));

const enterFor = (id: SceneId, index: number): Enter => {
  if (index === 0 || id === 'flash' || id === 'slam') return 'cut';
  if (id === 'turn' || id === 'offer') return 'circle';
  if (id === 'end') return 'up';
  return (['up', 'left', 'circle'] as const)[index % 3];
};

/* ───────────────────────── theme ───────────────────────── */

type Theme = {
  dark: boolean;
  bg: string;
  ink: string;
  sub: string;
  faint: string;
  hi: string;
  onHi: string;
  panel: string;
  panelInk: string;
  panelSub: string;
  panelLine: string;
  shadow: string;
  btn: string;
  btnInk: string;
  accent: string;
  accent2: string;
  muted: string;
  mutedInk: string;
};

const luminance = (c: string) => {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return 0.3;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (c: string) => (luminance(c) > 0.42 ? '#111216' : '#FFFFFF');
/** `c` at opacity `a`, for any CSS colour. */
const mix = (c: string, a: number) => `color-mix(in srgb, ${c} ${Math.round(a * 100)}%, transparent)`;

const themeFor = (p: ServiceReelProps): Theme => {
  const accent = p.accent;
  const accent2 = p.accent2 ?? p.accent;
  if (p.style === 'noir')
    return {
      dark: true,
      bg: '#08080B',
      ink: '#F5F5F7',
      sub: 'rgba(245,245,247,0.6)',
      faint: 'rgba(255,255,255,0.08)',
      hi: accent,
      onHi: onColor(accent),
      panel: 'linear-gradient(160deg, #1C1C23 0%, #121217 100%)',
      panelInk: '#F5F5F7',
      panelSub: 'rgba(245,245,247,0.58)',
      panelLine: 'rgba(255,255,255,0.10)',
      shadow: '0 40px 100px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.35)',
      btn: accent,
      btnInk: onColor(accent),
      accent,
      accent2,
      muted: '#17171C',
      mutedInk: 'rgba(245,245,247,0.5)',
    };
  if (p.style === 'vivid') {
    const ink = onColor(accent);
    const hi = p.accent2 ?? (ink === '#FFFFFF' ? '#FFE45C' : '#111216');
    return {
      dark: false,
      bg: accent,
      ink,
      sub: mix(ink, 0.74),
      faint: mix(ink, 0.14),
      hi,
      onHi: onColor(hi),
      panel: '#FFFFFF',
      panelInk: '#111216',
      panelSub: 'rgba(17,18,22,0.56)',
      panelLine: 'rgba(17,18,22,0.08)',
      shadow: '0 40px 90px rgba(0,0,0,0.24), 0 8px 24px rgba(0,0,0,0.12)',
      btn: ink,
      btnInk: ink === '#FFFFFF' ? accent : '#FFFFFF',
      accent,
      accent2: hi,
      muted: '#2B2B31',
      mutedInk: 'rgba(255,255,255,0.55)',
    };
  }
  return {
    dark: false,
    bg: '#F3F1EC',
    ink: '#111216',
    sub: 'rgba(17,18,22,0.56)',
    faint: 'rgba(17,18,22,0.07)',
    hi: accent,
    onHi: onColor(accent),
    panel: '#FFFFFF',
    panelInk: '#111216',
    panelSub: 'rgba(17,18,22,0.56)',
    panelLine: 'rgba(17,18,22,0.07)',
    shadow: '0 40px 90px rgba(24,26,40,0.14), 0 8px 24px rgba(24,26,40,0.08)',
    btn: accent,
    btnInk: onColor(accent),
    accent,
    accent2,
    muted: '#E2E0DB',
    mutedInk: 'rgba(17,18,22,0.5)',
  };
};

/* ───────────────────────── labels ───────────────────────── */

type Labels = { before: string; after: string; pricing: string; popular: string; meet: string; limited: string; note: string };
const LABELS: Record<Lang, Labels> = {
  en: {
    before: 'Before',
    after: 'After',
    pricing: 'Pricing',
    popular: 'Most popular',
    meet: 'Meet',
    limited: 'Limited time',
    note: 'Details in our profile',
  },
  ja: {
    before: 'ビフォー',
    after: 'アフター',
    pricing: '料金プラン',
    popular: '人気No.1',
    meet: 'ご紹介します',
    limited: '期間限定',
    note: '詳しくはプロフィールから',
  },
  fr: {
    before: 'Avant',
    after: 'Après',
    pricing: 'Tarifs',
    popular: 'Le plus choisi',
    meet: 'Découvrez',
    limited: 'Offre limitée',
    note: 'Plus d’infos sur notre profil',
  },
  id: {
    before: 'Sebelum',
    after: 'Sesudah',
    pricing: 'Harga',
    popular: 'Paling populer',
    meet: 'Kenalkan',
    limited: 'Waktu terbatas',
    note: 'Info lengkap di profil kami',
  },
  zh: {
    before: '之前',
    after: '之后',
    pricing: '价格方案',
    popular: '最受欢迎',
    meet: '隆重介绍',
    limited: '限时优惠',
    note: '详情请看主页',
  },
  es: {
    before: 'Antes',
    after: 'Después',
    pricing: 'Precios',
    popular: 'Más popular',
    meet: 'Conoce',
    limited: 'Tiempo limitado',
    note: 'Más info en nuestro perfil',
  },
  ta: {
    before: 'முன்பு',
    after: 'பின்பு',
    pricing: 'கட்டணங்கள்',
    popular: 'மிகப் பிரபலம்',
    meet: 'அறிமுகம்',
    limited: 'குறுகிய காலம்',
    note: 'விவரங்கள் எங்கள் சுயவிவரத்தில்',
  },
};

/* ───────────────────────── context ───────────────────────── */

type Focus = { x: number; y: number; zoom: number };
type Feat = { title: string; body?: string; focus: Focus; photo?: string };
type Ctx = {
  p: ServiceReelProps;
  t: Theme;
  beat: number;
  screen: ServiceScreen;
  photos: string[];
  feats: Feat[];
  sfx: boolean;
  l: Labels;
};
type SP = { c: Ctx; len: number; i: number };

const DEFAULT_FOCUS: Focus[] = [
  { x: 0.32, y: 0.3, zoom: 1.8 },
  { x: 0.7, y: 0.45, zoom: 1.9 },
  { x: 0.5, y: 0.7, zoom: 1.8 },
];

const W = 1080;
const H = 1920;
const M = 80; // side margin

/* ───────────────────────── text fitting ───────────────────────── */

type Tok = { text: string; start: number; space: boolean };
const WIDE = /[ᄀ-ᇿ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/;
const charW = (ch: string) =>
  WIDE.test(ch)
    ? 1
    : ch === ' '
      ? 0.27
      : /[iljI.,:;'!|]/.test(ch)
        ? 0.3
        : /[mwMW@%]/.test(ch)
          ? 0.9
          : /[A-Z0-9$€£¥#&?]/.test(ch)
            ? 0.68
            : 0.57;
const FACTOR = { display: 1, sans: 0.96, serif: 0.8 } as const;
type Face = keyof typeof FACTOR;
const textW = (s: string, face: Face) => Array.from(s).reduce((a, ch) => a + charW(ch) * (WIDE.test(ch) ? 1 : FACTOR[face]), 0);

const tokenize = (text: string): Tok[] => {
  const out: Tok[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const word = m[0];
    if (!WIDE.test(word)) {
      out.push({ text: word, start: m.index, space: out.length > 0 });
      continue;
    }
    // CJK breaks anywhere; keep Latin runs and trailing punctuation glued to their neighbour
    const parts = word.match(/[A-Za-z0-9$%.,+\-/']+|[^A-Za-z0-9$%.,+\-/'][、。，．！？!?」』）)ー]*/g) ?? [word];
    let off = m.index;
    parts.forEach((pt, j) => {
      out.push({ text: pt, start: off, space: j === 0 && out.length > 0 });
      off += pt.length;
    });
  }
  return out;
};

const lineW = (toks: Tok[], face: Face) => toks.reduce((a, t, i) => a + textW(t.text, face) + (i > 0 && t.space ? 0.27 : 0), 0);

/** Cost (in em) of breaking a line before `tok`: free at spaces and after punctuation, cheap where Japanese kana meets kanji. */
const breakCost = (prev: Tok, tok: Tok) => {
  if (tok.space || /[、。，．！？!?」』）)]$/.test(prev.text)) return 0;
  if (/[\u3040-\u309f]$/.test(prev.text) && /^[\u4e00-\u9fff\u30a0-\u30ff]/.test(tok.text)) return 0.7;
  return 3.5;
};

/** Splits tokens into `n` lines minimising the widest one, preferring natural break points. */
const balance = (toks: Tok[], n: number, face: Face): Tok[][] => {
  if (n <= 1 || toks.length <= 1) return [toks];
  let best: Tok[][] = [toks];
  let bestW = Infinity;
  const rec = (from: number, left: number, acc: Tok[][]) => {
    if (left === 1) {
      const lines = [...acc, toks.slice(from)];
      let w = Math.max(...lines.map((l) => lineW(l, face)));
      for (let j = 1; j < lines.length; j++) w += breakCost(lines[j - 1][lines[j - 1].length - 1], lines[j][0]);
      if (w < bestW) {
        bestW = w;
        best = lines;
      }
      return;
    }
    for (let k = from + 1; k <= toks.length - left + 1; k++) rec(k, left - 1, [...acc, toks.slice(from, k)]);
  };
  rec(0, Math.min(n, toks.length), []);
  return best;
};

/** Picks the line count and font size that fill `maxW` best without exceeding `max`. */
const layoutText = (text: string, maxW: number, max: number, maxLines = 2, face: Face = 'display', min = 22) => {
  const toks = tokenize(text);
  let pick = {
    lines: [toks],
    size: Math.max(min, Math.min(max, (maxW * 0.95) / Math.max(0.01, lineW(toks, face)))),
  };
  for (let n = 2; n <= Math.min(maxLines, toks.length); n++) {
    const lines = balance(toks, n, face);
    const size = Math.max(min, Math.min(max, (maxW * 0.95) / Math.max(...lines.map((l) => lineW(l, face)))));
    if (size > pick.size * 1.1) pick = { lines, size };
  }
  return pick;
};

const FONT: Record<Face, string> = {
  display: fonts.display,
  sans: fonts.sansJP,
  serif: fonts.serif,
};

/** Headline whose words rise out of a mask one after another. */
const Words: React.FC<{
  text: string;
  size: number;
  maxW: number;
  maxLines?: number;
  color: string;
  face?: Face;
  weight?: number;
  delay?: number;
  stagger?: number;
  dur?: number;
  em?: string;
  emColor?: string;
  emInk?: string;
  swipe?: boolean;
  align?: 'left' | 'center' | 'right';
  lh?: number;
  italic?: boolean;
  /** 0→1 colour wash for read-along quotes: words before this fraction take `color`, later ones `dimColor`. */
  read?: number;
  dimColor?: string;
}> = ({
  text,
  size,
  maxW,
  maxLines = 2,
  color,
  face = 'display',
  weight = 800,
  delay = 0,
  stagger = 2.5,
  dur = 16,
  em,
  emColor,
  emInk = '#fff',
  swipe = false,
  align = 'left',
  lh = 1.04,
  italic = false,
  read,
  dimColor,
}) => {
  const frame = useCurrentFrame();
  const lay = layoutText(text, maxW, size, maxLines, face);
  const emAt = em ? text.toLowerCase().indexOf(em.toLowerCase()) : -1;
  const total = lay.lines.reduce((a, l) => a + l.length, 0);
  let k = 0;
  return (
    <div
      style={{
        fontFamily: FONT[face],
        fontWeight: weight,
        fontStyle: italic ? 'italic' : 'normal',
        fontSize: lay.size,
        lineHeight: lh,
        letterSpacing: face === 'display' ? '-0.025em' : face === 'serif' ? '-0.01em' : '-0.01em',
        color,
        textAlign: align,
      }}
    >
      {lay.lines.map((raw, li) => {
        // adjacent emphasised words share one highlight block
        const hit = (tok: Tok) => emAt >= 0 && tok.start < emAt + em!.length && tok.start + tok.text.length > emAt;
        const line = raw.reduce<Tok[]>((acc, tok) => {
          const prev = acc[acc.length - 1];
          if (prev && swipe && hit(prev) && hit(tok))
            acc[acc.length - 1] = {
              ...prev,
              text: prev.text + (tok.space ? ' ' : '') + tok.text,
            };
          else acc.push(tok);
          return acc;
        }, []);
        return (
          <div key={li} style={{ whiteSpace: 'nowrap' }}>
            {line.map((tok, ti) => {
              const idx = k++;
              const d = delay + idx * stagger;
              const s = progress(frame, d, d + dur, easeOutExpo);
              const isEm = hit(tok);
              const sw = swipe && isEm ? progress(frame, d + 6, d + 16, easeOutExpo) : 0;
              const lit = read === undefined ? 1 : interpolate(read * total - idx, [0, 1], [0, 1], clamp);
              const tone = isEm && !swipe ? emColor : read === undefined ? undefined : lit > 0.5 ? color : dimColor;
              return (
                <React.Fragment key={ti}>
                  {ti > 0 && tok.space ? ' ' : null}
                  <span
                    style={{
                      display: 'inline-block',
                      overflow: 'hidden',
                      verticalAlign: 'top',
                      padding: '0.08em 0.06em 0.12em',
                      margin: '-0.08em -0.06em -0.12em',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        position: 'relative',
                        transform: `translateY(${(1 - s) * 112}%)`,
                        color: swipe && isEm && sw > 0.45 ? emInk : tone,
                        padding: swipe && isEm ? '0 0.12em' : undefined,
                      }}
                    >
                      {swipe && isEm ? (
                        <span
                          style={{
                            position: 'absolute',
                            inset: '0.1em 0 0.02em 0',
                            background: emColor,
                            borderRadius: '0.12em',
                            transform: `scaleX(${sw})`,
                            transformOrigin: 'left',
                          }}
                        />
                      ) : null}
                      <span style={{ position: 'relative' }}>{tok.text}</span>
                    </span>
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/** Single-line label that shrinks to fit. */
const Fit: React.FC<{
  text: string;
  maxW: number;
  max: number;
  face?: Face;
  style?: React.CSSProperties;
}> = ({ text, maxW, max, face = 'display', style }) => {
  const size = Math.min(max, (maxW * 0.95) / Math.max(0.01, textW(text, face)));
  return (
    <div
      style={{
        fontFamily: FONT[face],
        fontWeight: 800,
        fontSize: size,
        letterSpacing: face === 'display' ? '-0.03em' : 0,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/* ───────────────────────── shared pieces ───────────────────────── */

const Backdrop: React.FC<{ t: Theme; seed?: number; base?: string }> = ({ t, seed = 0, base }) => {
  const frame = useCurrentFrame();
  const a = frame / 70 + seed * 1.7;
  const x1 = 22 + Math.sin(a) * 10;
  const y1 = 18 + Math.cos(a * 0.8) * 6;
  const x2 = 80 + Math.cos(a * 0.9) * 10;
  const y2 = 78 + Math.sin(a * 0.7) * 6;
  const bg = base ?? t.bg;
  const layers =
    bg !== t.bg
      ? []
      : t.dark
        ? [
            `radial-gradient(60% 38% at ${x1}% ${y1}%, ${mix(t.accent, 0.42)} 0%, transparent 70%)`,
            `radial-gradient(55% 34% at ${x2}% ${y2}%, ${mix(t.accent2, 0.28)} 0%, transparent 70%)`,
          ]
        : t.bg === t.accent
          ? [
              `radial-gradient(70% 45% at ${x1}% ${y1}%, rgba(255,255,255,0.22) 0%, transparent 70%)`,
              `radial-gradient(70% 45% at ${x2}% ${y2}%, rgba(0,0,0,0.22) 0%, transparent 70%)`,
            ]
          : [
              `radial-gradient(60% 36% at ${x1}% ${y1}%, ${mix(t.accent, 0.2)} 0%, transparent 70%)`,
              `radial-gradient(60% 36% at ${x2}% ${y2}%, ${mix(t.accent2, 0.16)} 0%, transparent 70%)`,
            ];
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill style={{ backgroundImage: layers.join(',') || undefined }} />
      {t.dark && bg === t.bg ? (
        <AbsoluteFill
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '90px 90px',
            backgroundPosition: `0 ${frame * 0.5}px`,
            maskImage: 'radial-gradient(70% 55% at 50% 45%, #000 0%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(70% 55% at 50% 45%, #000 0%, transparent 100%)',
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const Mark: React.FC<{ c: Ctx; size: number; tile?: boolean }> = ({ c, size, tile = true }) => {
  const { p, t } = c;
  const inner = p.logo ? (
    <Img
      src={asset(p.logo)}
      style={{
        width: size * (tile ? 0.72 : 1),
        height: size * (tile ? 0.72 : 1),
        objectFit: 'contain',
      }}
    />
  ) : (
    <div
      style={{
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: size * 0.5,
        color: t.onHi,
        letterSpacing: '-0.04em',
      }}
    >
      {Array.from(p.name)[0]?.toUpperCase()}
    </div>
  );
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        display: 'grid',
        placeItems: 'center',
        background: p.logo ? '#FFFFFF' : `linear-gradient(140deg, ${t.hi}, ${t.accent2 === t.hi ? mix(t.hi, 0.75) : t.accent2})`,
        boxShadow: tile ? '0 20px 50px rgba(0,0,0,0.18)' : undefined,
        flexShrink: 0,
      }}
    >
      {inner}
    </div>
  );
};

/** Small brand lock-up top-left, identical on every scene so it reads as persistent through cuts. */
const Bug: React.FC<{ c: Ctx; color?: string }> = ({ c, color }) => (
  <div
    style={{
      position: 'absolute',
      top: 150,
      left: M,
      display: 'flex',
      alignItems: 'center',
      gap: 18,
    }}
  >
    <Mark c={c} size={60} tile={false} />
    <div
      style={{
        fontFamily: fonts.display,
        fontWeight: 800,
        fontSize: 34,
        letterSpacing: '-0.02em',
        color: color ?? c.t.ink,
      }}
    >
      {c.p.name}
    </div>
  </div>
);

const Kicker: React.FC<{
  text: string;
  color: string;
  dot?: string;
  style?: React.CSSProperties;
}> = ({ text, color, dot, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 16,
      fontFamily: fonts.display,
      fontWeight: 800,
      fontSize: 28,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color,
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {dot ? <span style={{ width: 14, height: 14, borderRadius: 7, background: dot }} /> : null}
    {text}
  </div>
);

const Pill: React.FC<{
  text: string;
  bg: string;
  color: string;
  style?: React.CSSProperties;
}> = ({ text, bg, color, style }) => (
  <div
    style={{
      display: 'inline-block',
      padding: '14px 28px',
      borderRadius: 999,
      background: bg,
      color,
      fontFamily: fonts.display,
      fontWeight: 800,
      fontSize: 26,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      whiteSpace: 'nowrap',
      ...style,
    }}
  >
    {text}
  </div>
);

const Check: React.FC<{
  size: number;
  bg: string;
  color: string;
  t?: number;
  cross?: boolean;
}> = ({ size, bg, color, t = 1, cross }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      background: bg,
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
    }}
  >
    <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
      {cross ? (
        <path
          d="M6 6 L18 18 M18 6 L6 18"
          stroke={color}
          strokeWidth={3.4}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={40}
          strokeDashoffset={40 * (1 - t)}
        />
      ) : (
        <path
          d="M4.5 12.5 L10 18 L19.5 6.5"
          stroke={color}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          strokeDasharray={30}
          strokeDashoffset={30 * (1 - t)}
        />
      )}
    </svg>
  </div>
);

const Star: React.FC<{
  size: number;
  fill: number;
  color: string;
  empty: string;
}> = ({ size, fill, color, empty }) => {
  const id = `st${Math.round(random(`${size}${fill}${color}`) * 1e9)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id={id}>
          <stop offset={fill} stopColor={color} />
          <stop offset={fill} stopColor={empty} />
        </linearGradient>
      </defs>
      <path d="M12 2.4l2.95 6.1 6.7.9-4.9 4.65 1.2 6.6L12 17.5l-5.95 3.15 1.2-6.6L2.35 9.4l6.7-.9z" fill={`url(#${id})`} />
    </svg>
  );
};

const TouchDot: React.FC<{
  x: number;
  y: number;
  press: number;
  ripple: number;
  color: string;
}> = ({ x, y, press, ripple, color }) => (
  <div style={{ position: 'absolute', left: x, top: y }}>
    {ripple > 0 && ripple < 1 ? (
      <div
        style={{
          position: 'absolute',
          left: -100 * ripple,
          top: -100 * ripple,
          width: 200 * ripple,
          height: 200 * ripple,
          borderRadius: '50%',
          border: `5px solid ${color}`,
          opacity: 1 - ripple,
        }}
      />
    ) : null}
    <div
      style={{
        position: 'absolute',
        left: -38,
        top: -38,
        width: 76,
        height: 76,
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.55)',
        border: '3px solid rgba(255,255,255,0.95)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        transform: `scale(${1 - press * 0.25})`,
      }}
    />
  </div>
);

const fmt = (v: number, decimals = 0) =>
  v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/** Counts the number inside a price like "$29" or "¥3,980" up from zero. */
const countPrice = (price: string, t: number) => {
  const m = /^(\D*)([\d,]+(?:\.\d+)?)(.*)$/.exec(price);
  if (!m) return price;
  const num = Number(m[2].replace(/,/g, ''));
  const decimals = (m[2].split('.')[1] ?? '').length;
  const shown = (num * t).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: m[2].includes(','),
  });
  return `${m[1]}${shown}${m[3]}`;
};

/* ───────────────────────── visuals ───────────────────────── */

type Kind = 'phone' | 'desktop' | 'both' | 'photo' | 'brand';
const kindOf = (c: Ctx): Kind => (c.screen !== 'none' ? c.screen : c.photos.length ? 'photo' : 'brand');
const photoAt = (c: Ctx, i: number) => c.feats[i]?.photo ?? c.photos[i % Math.max(1, c.photos.length)];
const vh = (kind: Kind, w: number) =>
  kind === 'phone'
    ? w * 2.16
    : kind === 'desktop'
      ? w / 1.6 + Math.round(w * 0.055)
      : kind === 'both'
        ? w * 0.95
        : kind === 'photo'
          ? w * 1.25
          : w;
/** Width that makes a visual of `kind` at most `maxW` wide and `maxH` tall. */
const fitW = (kind: Kind, maxW: number, maxH: number) => Math.min(maxW, maxH / (vh(kind, 1000) / 1000));

const Visual: React.FC<{
  c: Ctx;
  kind: Kind;
  w: number;
  focus?: Focus;
  zoom?: number;
  photo?: string;
  drift?: number;
}> = ({ c, kind, w, focus, zoom = 1, photo, drift = 0 }) => {
  const { p, t } = c;
  const fx = focus?.x ?? 0.5;
  const fy = focus?.y ?? 0.5;
  if (kind === 'desktop' && p.desktop)
    return <BrowserFrame src={asset(p.desktop)} width={w} url={p.url} dark={t.dark} zoom={zoom} focusX={fx} focusY={fy} />;
  if (kind === 'phone' && p.phone) return <PhoneFrame src={asset(p.phone)} width={w} zoom={zoom} focusX={fx} focusY={fy} />;
  if (kind === 'both' && p.phone && p.desktop)
    return (
      <div
        style={{
          position: 'relative',
          width: w,
          height: w * 0.95,
          transformStyle: 'preserve-3d',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0 }}>
          <BrowserFrame src={asset(p.desktop)} width={w * 0.86} url={p.url} dark={t.dark} zoom={zoom} focusX={fx} focusY={fy} />
        </div>
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: w * 0.3,
            transform: 'translateZ(140px)',
          }}
        >
          <PhoneFrame src={asset(p.phone)} width={w * 0.3} />
        </div>
      </div>
    );
  if (kind === 'photo' && (photo ?? c.photos[0]))
    return (
      <div
        style={{
          position: 'relative',
          width: w,
          height: w * 1.25,
          borderRadius: w * 0.05,
          overflow: 'hidden',
          boxShadow: t.shadow,
        }}
      >
        <Img
          src={asset(photo ?? c.photos[0])}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${1.04 + drift * 0.08 + (zoom - 1) * 0.5})`,
            transformOrigin: `${fx * 100}% ${fy * 100}%`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: w * 0.05,
            boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.14)',
          }}
        />
      </div>
    );
  return <BrandTile c={c} w={w} />;
};

/** No screen, no photo: the brand itself becomes the object on stage. */
const BrandTile: React.FC<{ c: Ctx; w: number }> = ({ c, w }) => {
  const frame = useCurrentFrame();
  const { p, t } = c;
  const a = 120 + Math.sin(frame / 30) * 20;
  return (
    <div
      style={{
        position: 'relative',
        width: w,
        height: w,
        borderRadius: w * 0.22,
        overflow: 'hidden',
        background: `linear-gradient(${a}deg, ${t.hi} 0%, ${t.accent2 === t.hi ? mix(t.hi, 0.7) : t.accent2} 100%)`,
        boxShadow: `${t.shadow}, inset 0 0 0 2px rgba(255,255,255,0.25)`,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.35) ${45 + Math.sin(frame / 25) * 10}%, transparent 60%)`,
        }}
      />
      {p.logo ? (
        <div
          style={{
            width: w * 0.5,
            height: w * 0.5,
            borderRadius: w * 0.13,
            background: '#fff',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Img src={asset(p.logo)} style={{ width: w * 0.38, height: w * 0.38, objectFit: 'contain' }} />
        </div>
      ) : (
        <Fit text={p.name} maxW={w * 0.78} max={w * 0.3} style={{ color: t.onHi, position: 'relative' }} />
      )}
    </div>
  );
};

/* ───────────────────────── scene wrapper ───────────────────────── */

const Scene: React.FC<{
  len: number;
  ov: number;
  enter: Enter;
  children: React.ReactNode;
}> = ({ len, ov, enter, children }) => {
  const frame = useCurrentFrame();
  const inT = enter === 'cut' ? 1 : progress(frame, 0, ov, easeInOut);
  const out = progress(frame, len, len + ov, easeInOut);
  const clip =
    enter === 'up'
      ? `inset(${(1 - inT) * 100}% 0 0 0 round ${60 * (1 - inT)}px)`
      : enter === 'left'
        ? `inset(0 0 0 ${(1 - inT) * 100}% round ${60 * (1 - inT)}px)`
        : enter === 'circle'
          ? `circle(${inT * 125}% at 50% 52%)`
          : undefined;
  const shift = enter === 'up' ? `translateY(${(1 - inT) * 160}px)` : enter === 'left' ? `translateX(${(1 - inT) * 160}px)` : '';
  return (
    <AbsoluteFill style={{ clipPath: inT < 1 ? clip : undefined, overflow: 'hidden' }}>
      <AbsoluteFill style={{ transform: `${shift} scale(${1 - out * 0.07})` }}>{children}</AbsoluteFill>
      {out > 0 ? <AbsoluteFill style={{ background: '#000', opacity: out * 0.45 }} /> : null}
    </AbsoluteFill>
  );
};

/* ───────────────────────── root ───────────────────────── */

const SCENES: Record<SceneId, React.FC<SP>> = {
  hook: (x) => <HookScene {...x} />,
  orbit: (x) => <OrbitScene {...x} />,
  spot: (x) => <SpotScene {...x} />,
  demo: (x) => <DemoScene {...x} />,
  summary: (x) => <SummaryScene {...x} />,
  pains: (x) => <PainsScene {...x} />,
  turn: (x) => <TurnScene {...x} />,
  solution: (x) => <SolutionScene {...x} />,
  compare: (x) => <CompareScene {...x} />,
  stat: (x) => <StatScene {...x} />,
  intro: (x) => <IntroScene {...x} />,
  feature: (x) => <FeatureScene {...x} />,
  recap: (x) => <RecapScene {...x} />,
  plans: (x) => <PlansScene {...x} />,
  offer: (x) => <OfferScene {...x} />,
  quote: (x) => <QuoteScene {...x} />,
  steps: (x) => <StepsScene {...x} />,
  words: (x) => <WordsScene {...x} />,
  slam: (x) => <SlamScene {...x} />,
  flash: (x) => <FlashScene {...x} />,
  end: (x) => <EndScene {...x} />,
};

export const ServiceReel: React.FC<ServiceReelProps> = (p) => {
  useFonts(p);
  const { fps } = useVideoConfig();
  const beat = beatFrames(p.bpm, fps);
  const screen = resolveScreen(p);
  const c: Ctx = {
    p,
    t: themeFor(p),
    beat,
    screen,
    photos: p.photos ?? [],
    feats: p.features.map((f, i) => ({
      ...f,
      focus: f.focus ?? DEFAULT_FOCUS[i % 3],
    })),
    sfx: p.sfx !== false,
    l: LABELS[p.lang ?? 'en'],
  };
  const scenes = serviceScenes(p);
  const starts: number[] = [];
  scenes.reduce((acc, s) => {
    starts.push(Math.round(acc * beat));
    return acc + s.beats;
  }, 0);
  const total = serviceReelDuration(p, fps);
  const ov = Math.min(10, Math.round(beat * 0.6));
  return (
    <AbsoluteFill lang={p.lang} style={{ background: c.t.bg, ...cjkVars(p.lang) }}>
      {scenes.map((s, k) => {
        const len = (starts[k + 1] ?? total) - starts[k];
        const next = scenes[k + 1];
        const tail = next && enterFor(next.id, k + 1) !== 'cut' ? ov : 0;
        const Comp = SCENES[s.id];
        return (
          <Sequence key={k} from={starts[k]} durationInFrames={len + tail}>
            <Scene len={len} ov={ov} enter={enterFor(s.id, k)}>
              <Comp c={c} len={len} i={s.i} />
            </Scene>
          </Sequence>
        );
      })}
      <Grain opacity={c.t.dark ? 0.08 : 0.055} />
      {c.sfx
        ? scenes.slice(1).map((s, k) =>
            enterFor(s.id, k + 1) === 'cut' ? null : (
              <Sequence key={`w${k}`} from={Math.max(0, starts[k + 1] - 4)} durationInFrames={24}>
                <Audio src={staticFile('sfx/whoosh.wav')} volume={0.18} />
              </Sequence>
            ),
          )
        : null}
      {p.music ? <Audio src={asset(p.music)} volume={(f) => interpolate(f, [0, 10, total - 30, total], [0, 1, 1, 0], clamp)} /> : null}
    </AbsoluteFill>
  );
};

const Tap: React.FC<{ c: Ctx; at: number }> = ({ c, at }) =>
  c.sfx ? (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={10}>
      <Audio src={staticFile('sfx/tap.wav')} volume={0.5} />
    </Sequence>
  ) : null;

/* ───────────────────────── scenes ───────────────────────── */

const HookScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const kick = progress(frame, 0, 12);
  const maxW = W - M * 2;
  // one size for every line, so the block reads as a single typographic unit
  const single = Math.min(...p.hook.map((l) => layoutText(l, maxW, kindOf(c) === 'brand' ? 150 : 132, 1).size));
  const lines = single >= 92 ? 1 : 2;
  const size = lines === 1 ? single : Math.min(...p.hook.map((l) => layoutText(l, maxW, 150, 2).size));
  const rule = progress(frame, beat * (p.hook.length - 0.2), beat * (p.hook.length + 1), easeOutExpo);
  // with something to show, the copy moves up and the product or place rises into the lower half
  const kind = kindOf(c);
  const stage = kind !== 'brand';
  const rise = pop(frame, fps, Math.round(beat * 1.2), 18);
  const vw = kind === 'phone' ? 580 : kind === 'photo' ? 860 : 1000;
  return (
    <AbsoluteFill>
      <Backdrop t={t} />
      {stage ? (
        <div
          style={{
            position: 'absolute',
            left: W / 2 - vw / 2,
            top: 1060 + (1 - rise) * 900 - frame * 0.6,
            transform: `perspective(2400px) rotateX(${8 + (1 - rise) * 16}deg) rotateZ(${-3 + (1 - rise) * 6}deg)`,
            transformOrigin: '50% 0%',
          }}
        >
          <Visual c={c} kind={kind} w={vw} photo={c.photos[0]} drift={frame / 150} />
        </div>
      ) : null}
      <Bug c={c} />
      <AbsoluteFill
        style={{
          justifyContent: stage ? 'flex-start' : 'center',
          padding: `0 ${M}px`,
          paddingTop: stage ? 300 : 0,
          paddingBottom: 80,
        }}
      >
        <div
          style={{
            opacity: kick,
            transform: `translateY(${(1 - kick) * 20}px)`,
            marginBottom: 44,
          }}
        >
          <Kicker text={p.category ?? p.name} color={t.sub} dot={t.hi} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: size * 0.06 }}>
          {p.hook.map((line, i) => (
            <Words
              key={i}
              text={line}
              size={size}
              maxW={maxW}
              color={t.ink}
              delay={Math.round(i * beat) + 3}
              em={p.hookEmphasis}
              emColor={t.hi}
              emInk={t.onHi}
              swipe
              maxLines={lines}
            />
          ))}
        </div>
        <div
          style={{
            marginTop: 60,
            height: 8,
            width: 180 * rule,
            borderRadius: 4,
            background: t.hi,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const EndScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const logo = pop(frame, fps, 2, 11);
  const nameT = progress(frame, 4, 22, easeOutExpo);
  const btn = pop(frame, fps, Math.round(beat * 1.5), 12);
  const note = progress(frame, beat * 2.2, beat * 3, easeOutExpo);
  const clickAt = Math.round(beat * 3.6);
  const press = interpolate(frame, [clickAt - 3, clickAt, clickAt + 6], [0, 1, 0], clamp);
  const ripple = interpolate(frame, [clickAt, clickAt + 18], [0, 1], clamp);
  const cursorT = progress(frame, beat * 2.4, clickAt - 1, easeInOut);
  const shimmer = interpolate(frame % 50, [0, 50], [-60, 160]);
  const bob = Math.abs(Math.sin((frame / beat) * Math.PI)) * 10;
  const offerT = pop(frame, fps, Math.round(beat * 1), 9);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={3} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(50% 30% at 50% 40%, ${mix(t.hi, t.dark ? 0.3 : 0.18)} 0%, transparent 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 140,
        }}
      >
        <div style={{ position: 'relative', transform: `scale(${logo})` }}>
          <Mark c={c} size={200} />
          {p.offer ? (
            <div
              style={{
                position: 'absolute',
                left: 150,
                top: -40,
                transform: `rotate(${-8 + (1 - offerT) * 30}deg) scale(${offerT})`,
                transformOrigin: 'left bottom',
              }}
            >
              <Pill
                text={p.offer}
                bg={t.dark || t.bg === t.accent ? t.hi : t.ink}
                color={t.dark || t.bg === t.accent ? t.onHi : t.bg}
                style={{
                  fontSize: 24,
                  letterSpacing: '0.06em',
                  boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
                }}
              />
            </div>
          ) : null}
        </div>
        <div
          style={{
            marginTop: 48,
            opacity: nameT,
            transform: `translateY(${(1 - nameT) * 40}px)`,
          }}
        >
          <Fit text={p.name} maxW={900} max={140} style={{ color: t.ink, textAlign: 'center' }} />
        </div>
        <div style={{ marginTop: 26, maxWidth: 860, opacity: nameT }}>
          <Words
            text={p.tagline}
            size={46}
            maxW={860}
            maxLines={2}
            color={t.sub}
            weight={600}
            align="center"
            delay={8}
            stagger={1.5}
            lh={1.25}
          />
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 80,
            padding: '38px 84px',
            borderRadius: 999,
            overflow: 'hidden',
            background: t.btn,
            color: t.btnInk,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: Math.min(54, 760 / Math.max(1, textW(p.cta, 'display'))),
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            transform: `scale(${btn * (1 - press * 0.06)})`,
            boxShadow: `0 30px 70px ${mix(t.btn, 0.45)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 26,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(110deg, transparent ${shimmer - 18}%, rgba(255,255,255,0.4) ${shimmer}%, transparent ${shimmer + 18}%)`,
            }}
          />
          <span style={{ position: 'relative' }}>{p.cta}</span>
          <span style={{ position: 'relative', fontSize: '0.9em' }}>→</span>
        </div>
        <div
          style={{
            marginTop: 54,
            opacity: note,
            transform: `translateY(${(1 - note) * 20}px)`,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: '16px 30px 16px 18px',
            borderRadius: 999,
            border: `2px solid ${t.faint}`,
            background: mix(t.ink, 0.04),
            fontFamily: fonts.sansJP,
            fontWeight: 700,
            fontSize: 34,
            color: t.ink,
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              background: t.hi,
              color: t.onHi,
              display: 'grid',
              placeItems: 'center',
              fontSize: 30,
              transform: `translateY(${-bob * 0.5}px)`,
            }}
          >
            ↑
          </div>
          {p.ctaNote ?? c.l.note}
        </div>
        {p.url ? (
          <div
            style={{
              marginTop: 26,
              opacity: note,
              fontFamily: fonts.display,
              fontWeight: 600,
              fontSize: 30,
              color: t.sub,
              letterSpacing: '0.02em',
            }}
          >
            {p.url}
          </div>
        ) : null}
      </AbsoluteFill>
      <Cursor
        x={interpolate(cursorT, [0, 1], [920, 700])}
        y={interpolate(cursorT, [0, 1], [1780, 1080])}
        press={press}
        ripple={ripple}
        color={t.hi}
      />
      <Tap c={c} at={clickAt} />
      {c.sfx ? (
        <Sequence from={4} durationInFrames={50}>
          <Audio src={staticFile('sfx/chime.wav')} volume={0.28} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

/* orbit: one continuous 3D shot around the product with feature cards floating in depth */
const OrbitScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const kind = kindOf(c);
  const rise = pop(frame, fps, 0, 18);
  const ang = interpolate(frame, [0, len], [-30, 24], {
    ...clamp,
    easing: easeInOut,
  });
  const tiltX = 8 + (1 - rise) * 40;
  const w = kind === 'phone' ? 470 : kind === 'both' ? 860 : kind === 'desktop' ? 900 : kind === 'photo' ? 620 : 560;
  const h = vh(kind, w);
  const cy = 1080;
  const titleT = progress(frame, 2, 20, easeOutExpo);
  const sheen = interpolate(ang, [-30, 24], [-40, 140]);
  const spots = [
    { x: -150, y: -h * 0.36, z: 200 },
    { x: 150, y: -h * 0.02, z: 260 },
    { x: -140, y: h * 0.32, z: 230 },
  ];
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={1} />
      <Bug c={c} />
      <div
        style={{
          position: 'absolute',
          top: 250,
          left: M,
          right: M,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            opacity: titleT,
            transform: `translateY(${(1 - titleT) * 30}px)`,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <Fit text={p.name} maxW={W - M * 2} max={128} style={{ color: t.ink }} />
        </div>
        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
          <Words text={p.tagline} size={42} maxW={860} color={t.sub} weight={600} align="center" delay={8} stagger={1.5} lh={1.25} />
        </div>
      </div>
      {/* floor shadow */}
      <div
        style={{
          position: 'absolute',
          left: W / 2 - w * 0.45,
          top: cy + h / 2 + 40,
          width: w * 0.9,
          height: 80,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.5)',
          filter: 'blur(40px)',
          opacity: rise * (t.dark ? 0.8 : 0.35),
        }}
      />
      <AbsoluteFill style={{ perspective: 2400, perspectiveOrigin: `50% ${cy}px` }}>
        <div
          style={{
            position: 'absolute',
            left: W / 2,
            top: cy + (1 - rise) * 1100 + Math.sin(frame / 24) * 10,
            transformStyle: 'preserve-3d',
            transform: `rotateX(${tiltX}deg) rotateY(${ang}deg)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -w / 2,
              top: -h / 2,
              transformStyle: 'preserve-3d',
            }}
          >
            <Visual c={c} kind={kind} w={w} drift={frame / len} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: w * 0.06,
                pointerEvents: 'none',
                background: `linear-gradient(105deg, transparent ${sheen - 25}%, rgba(255,255,255,0.22) ${sheen}%, transparent ${sheen + 25}%)`,
                mixBlendMode: 'screen',
                transform: 'translateZ(2px)',
              }}
            />
          </div>
          {c.feats.slice(0, 3).map((f, i) => {
            const s = pop(frame, fps, Math.round(beat * (2.5 + i * 1.25)), 12);
            const sp = spots[i];
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: sp.x,
                  top: sp.y,
                  transform: `translate(-50%, -50%) translateZ(${sp.z}px) rotateY(${-ang * 0.4}deg) scale(${s})`,
                  opacity: Math.min(1, s * 1.5),
                }}
              >
                <OrbitChip c={c} index={i} text={f.title} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const OrbitChip: React.FC<{ c: Ctx; index: number; text: string }> = ({ c, index, text }) => {
  const { t } = c;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '22px 30px 22px 22px',
        borderRadius: 30,
        background: t.panel,
        border: `1.5px solid ${t.panelLine}`,
        boxShadow: t.shadow,
        maxWidth: 440,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          background: index === 1 ? t.accent2 : t.accent,
          color: onColor(index === 1 ? t.accent2 : t.accent),
          display: 'grid',
          placeItems: 'center',
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 26,
          flexShrink: 0,
        }}
      >
        {String(index + 1).padStart(2, '0')}
      </div>
      <div
        style={{
          fontFamily: fonts.sansJP,
          fontWeight: 700,
          fontSize: Math.min(34, 330 / Math.max(1, textW(text, 'sans'))),
          whiteSpace: 'nowrap',
          color: t.panelInk,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Counter: React.FC<{ c: Ctx; i: number; n: number; color?: string }> = ({ c, i, n, color }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 18,
      fontFamily: fonts.display,
      fontWeight: 800,
      fontSize: 30,
      letterSpacing: '0.1em',
    }}
  >
    <span style={{ color: c.t.hi }}>{String(i + 1).padStart(2, '0')}</span>
    <span
      style={{
        width: 60,
        height: 3,
        background: color ?? c.t.faint,
        borderRadius: 2,
      }}
    />
    <span style={{ color: color ?? c.t.sub }}>{String(n).padStart(2, '0')}</span>
  </div>
);

/* orbit spotlight: the device swings to face us and the camera pushes into one feature */
const SpotScene: React.FC<SP> = ({ c, i, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, beat } = c;
  const f = c.feats[i];
  const kind = kindOf(c);
  const side = i % 2 ? 1 : -1;
  const swing = progress(frame, 0, beat * 2, easeOutExpo);
  const zoomT = progress(frame, beat * 1, beat * 3.2, easeInOut);
  const w = kind === 'phone' ? 520 : kind === 'both' ? 940 : kind === 'desktop' ? 980 : kind === 'photo' ? 700 : 600;
  const h = vh(kind, w);
  const top = kind === 'phone' ? 640 : 1160 - h / 2;
  const enter = pop(frame, fps, 0, 16);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={i + 2} />
      <Bug c={c} />
      <div style={{ position: 'absolute', top: 250, left: M, right: M }}>
        <Counter c={c} i={i} n={c.feats.length} />
        <div style={{ marginTop: 26 }}>
          <Words text={f.title} size={96} maxW={W - M * 2} color={t.ink} delay={3} />
        </div>
        {f.body ? (
          <div style={{ marginTop: 20, maxWidth: 880 }}>
            <Words
              text={f.body}
              size={38}
              maxW={880}
              maxLines={2}
              face="sans"
              weight={500}
              color={t.sub}
              delay={10}
              stagger={1}
              lh={1.35}
            />
          </div>
        ) : null}
      </div>
      <AbsoluteFill style={{ perspective: 2400 }}>
        <div
          style={{
            position: 'absolute',
            left: W / 2 - w / 2,
            top: top + (1 - enter) * 700,
            transformStyle: 'preserve-3d',
            transform: `rotateY(${side * 26 * (1 - swing) + side * 5}deg) rotateX(${6 - swing * 3}deg) scale(${1 + zoomT * 0.04})`,
          }}
        >
          <Visual c={c} kind={kind} w={w} focus={f.focus} zoom={1 + (f.focus.zoom - 1) * zoomT} photo={photoAt(c, i)} drift={frame / len} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* click-through demo: one continuous screen recording feel with a cursor (desktop) or finger (phone) */
const DemoScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, beat } = c;
  const per = Math.round(beat * DEMO_BEATS);
  const k = Math.min(c.feats.length - 1, Math.floor(frame / per));
  const fk = frame - k * per;
  const f = c.feats[k];
  const kindAt = (j: number): Kind => (c.screen === 'both' ? (j % 2 === 0 ? 'desktop' : 'phone') : (c.screen as Kind));
  const kind = kindAt(k);
  const swapped = k === 0 || kindAt(k - 1) !== kind;
  const enter = swapped ? pop(fk, fps, 0, 16) : 1;
  const phone = kind === 'phone';
  const w = phone ? 540 : 980;
  const h = vh(kind, w);
  const left = W / 2 - w / 2;
  const top = phone ? 640 : 700;
  const clickAt = Math.round(beat * 2);
  const zoomT = progress(fk, clickAt + 4, beat * 3.4, easeInOut) * (1 - progress(fk, beat * 4.4, per, easeInOut));
  const zoom = 1 + (f.focus.zoom - 1) * zoomT;
  // focus stays put while zooming, so the pointer can aim straight at it
  const bar = phone ? 0 : Math.round(w * 0.055);
  const bezel = phone ? w * 0.035 : 0;
  const px = (ff: Focus) => left + bezel + (w - bezel * 2) * ff.x;
  const py = (ff: Focus) => top + bar + bezel + (h - bar - bezel * 2) * ff.y;
  const prev = k > 0 && !swapped ? c.feats[k - 1].focus : null;
  const moveT = progress(fk, beat * 0.4, clickAt - 2, easeInOut);
  const fromX = prev ? px(prev) : phone ? 860 : 900;
  const fromY = prev ? py(prev) : 1800;
  const cx = interpolate(moveT, [0, 1], [fromX, px(f.focus)]);
  const cy = interpolate(moveT, [0, 1], [fromY, py(f.focus)]) + (1 - enter) * 700;
  const press = interpolate(fk, [clickAt - 3, clickAt, clickAt + 5], [0, 1, 0], clamp);
  const ripple = interpolate(fk, [clickAt, clickAt + 16], [0, 1], clamp);
  const ring = progress(fk, clickAt + 2, clickAt + 14, easeOutExpo) * (1 - progress(fk, beat * 4.2, beat * 4.6));
  const capT = progress(fk, 0, 14, easeOutExpo);
  const rw = (phone ? 340 : 460) * (0.8 + ring * 0.2);
  const rh = (phone ? 180 : 220) * (0.8 + ring * 0.2);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={4} />
      <Bug c={c} />
      <div key={k} style={{ position: 'absolute', top: 250, left: M, right: M }}>
        <div style={{ opacity: capT }}>
          <Counter c={c} i={k} n={c.feats.length} />
        </div>
        <div style={{ marginTop: 24 }}>
          <Sequence from={k * per} layout="none">
            <Words text={f.title} size={84} maxW={W - M * 2} color={t.ink} delay={2} />
          </Sequence>
        </div>
      </div>
      {!phone ? (
        <div style={{ position: 'absolute', left: M, right: M, top: top + h + 90 }}>
          {f.body ? (
            <div
              style={{
                opacity: progress(fk, 8, 20),
                fontFamily: fonts.sansJP,
                fontWeight: 500,
                fontSize: 40,
                lineHeight: 1.35,
                color: t.sub,
                minHeight: 110,
              }}
            >
              {f.body}
            </div>
          ) : null}
          <div style={{ marginTop: 40, display: 'flex', gap: 14 }}>
            {c.feats.map((_, j) => (
              <div
                key={j}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 4,
                  background: t.faint,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 4,
                    background: t.hi,
                    width: `${(j < k ? 1 : j > k ? 0 : fk / per) * 100}%`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <AbsoluteFill style={{ perspective: 2600 }}>
        <div
          style={{
            position: 'absolute',
            left,
            top: top + (1 - enter) * 900,
            opacity: Math.min(1, enter * 1.4),
            transform: `rotateX(${3 + Math.sin(frame / 30) * 1.2}deg)`,
          }}
        >
          <Visual c={c} kind={kind} w={w} focus={f.focus} zoom={zoom} />
        </div>
      </AbsoluteFill>
      {ring > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(px(f.focus), left + rw / 2 + 10), left + w - rw / 2 - 10) - rw / 2,
            top: Math.min(Math.max(py(f.focus), top + bar + rh / 2 + 10), top + h - rh / 2 - 10) - rh / 2,
            width: rw,
            height: rh,
            borderRadius: 28,
            border: `5px solid ${t.hi}`,
            boxShadow: `0 0 50px ${mix(t.hi, 0.55)}, inset 0 0 30px ${mix(t.hi, 0.25)}`,
            opacity: ring,
          }}
        />
      ) : null}
      {phone ? (
        <TouchDot x={cx} y={cy} press={press} ripple={ripple} color={t.hi} />
      ) : (
        <Cursor x={cx} y={cy} press={press} ripple={ripple} color={t.hi} />
      )}
      {c.feats.map((_, j) => (
        <Tap key={j} c={c} at={j * per + clickAt} />
      ))}
    </AbsoluteFill>
  );
};

/* results: the product shrinks to the top and the numbers line up beneath it */
const SummaryScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const stats = p.stats ?? [];
  const kind = kindOf(c);
  // stat rows sit on the bottom of the safe area; the product takes all the room above them
  const rowH = 200;
  const rowsH = stats.length * rowH + Math.max(0, stats.length - 1) * 24;
  const rowTop = 1600 - rowsH;
  const visTop = 260;
  const visH = rowTop - 60 - visTop;
  const w = fitW(kind, kind === 'phone' ? 520 : 940, visH);
  const h = vh(kind, w);
  const enter = pop(frame, fps, 0, 16);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={5} />
      <Bug c={c} />
      <div
        style={{
          position: 'absolute',
          left: W / 2 - w / 2,
          top: visTop + (visH - h) / 2 + (1 - enter) * 400,
          transform: `perspective(2400px) rotateX(${8 * (1 - enter) + 4}deg) scale(${0.96 + (frame / len) * 0.04})`,
          opacity: enter,
        }}
      >
        <Visual c={c} kind={kind} w={w} photo={c.photos[0]} drift={frame / len} />
      </div>
      <div style={{ position: 'absolute', top: rowTop, left: M, right: M, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {stats.map((s, i) => {
          const start = Math.round(beat * (1 + i * 0.7));
          const e = pop(frame, fps, start, 14);
          const n = progress(frame, start, start + beat * 2.4, easeOutExpo);
          const decimals = s.decimals ?? (Number.isInteger(s.value) ? 0 : 1);
          const num = `${s.prefix ?? ''}${fmt(s.value * n, decimals)}`;
          const full = `${s.prefix ?? ''}${fmt(s.value, decimals)}${s.suffix ?? ''}`;
          return (
            <div
              key={i}
              style={{
                height: rowH,
                display: 'flex',
                alignItems: 'center',
                gap: 36,
                padding: '0 44px',
                borderRadius: 40,
                background: t.panel,
                border: `1.5px solid ${t.panelLine}`,
                boxShadow: t.shadow,
                opacity: e,
                transform: `translateY(${(1 - e) * 80}px)`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', width: 400, flexShrink: 0, whiteSpace: 'nowrap' }}>
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: Math.min(136, 380 / Math.max(1, textW(full, 'display'))),
                    letterSpacing: '-0.045em',
                    lineHeight: 1,
                    color: i === 1 ? t.accent2 : t.accent,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {num}
                </span>
                <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 60, color: t.panelInk, marginLeft: 6 }}>
                  {s.suffix}
                </span>
              </div>
              <div style={{ fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 40, lineHeight: 1.3, color: t.panelInk }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* problem → solution, part 1: pains stack up like unwanted notifications, then get struck through */
const PainsScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const pains = p.pains ?? [];
  const strike = progress(frame, beat * 5.6, beat * 6.4, easeOutExpo);
  const fade = progress(frame, beat * 6.6, beat * 7.6, easeInOut);
  const shake = frame > beat * 5 && frame < beat * 5.6 ? Math.sin(frame * 2.4) * 8 : 0;
  const single = Math.min(...p.hook.map((l) => layoutText(l, W - M * 2, 120, 1).size));
  const headLines = single >= 84 ? 1 : 2;
  const headSize = headLines === 1 ? single : Math.min(...p.hook.map((l) => layoutText(l, W - M * 2, 120, 2).size));
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={6} />
      <Bug c={c} />
      <div style={{ position: 'absolute', top: 290, left: M, right: M }}>
        {p.hook.map((l, i) => (
          <Words
            key={i}
            text={l}
            size={headSize}
            maxW={W - M * 2}
            color={t.ink}
            delay={2 + i * Math.round(beat * 0.6)}
            em={p.hookEmphasis}
            emColor={t.hi}
            emInk={t.onHi}
            swipe
            maxLines={headLines}
          />
        ))}
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1000,
          left: M,
          right: M,
          transform: `translateX(${shake}px)`,
        }}
      >
        {pains.map((pain, i) => {
          const s = pop(frame, fps, Math.round(beat * (1.6 + i * 1.1)), 13);
          const tilt = (random(`pt${i}`) - 0.5) * 4;
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 26,
                marginBottom: 26,
                padding: '30px 34px',
                borderRadius: 30,
                background: t.panel,
                border: `1.5px solid ${t.panelLine}`,
                boxShadow: t.shadow,
                transform: `translateX(${(1 - s) * 900}px) rotate(${tilt * (1 - fade)}deg) scale(${1 - fade * 0.06})`,
                opacity: Math.min(1, s * 1.4) * (1 - fade * 0.55),
                filter: `grayscale(${fade})`,
              }}
            >
              <Check size={64} bg="#FF4D4F" color="#fff" cross t={progress(frame, beat * (1.8 + i * 1.1), beat * (2.4 + i * 1.1))} />
              <div
                style={{
                  position: 'relative',
                  fontFamily: fonts.sansJP,
                  fontWeight: 700,
                  fontSize: 40,
                  lineHeight: 1.25,
                  color: t.panelInk,
                }}
              >
                {pain}
                <div
                  style={{
                    position: 'absolute',
                    left: -6,
                    right: -6,
                    top: '52%',
                    height: 6,
                    borderRadius: 3,
                    background: t.panelInk,
                    transform: `scaleX(${strike})`,
                    transformOrigin: 'left',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/* problem → solution, part 2: the brand slams in on a colour burst */
const TurnScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const bg = t.bg === t.accent ? '#111216' : t.accent;
  const ink = onColor(bg);
  const slam = pop(frame, fps, Math.round(beat * 0.6), 9);
  const ring = progress(frame, beat * 0.7, beat * 2, easeOutExpo);
  const sub = progress(frame, beat * 1.6, beat * 2.4, easeOutExpo);
  const meet = progress(frame, 0, beat * 0.6, easeOutExpo);
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 40% at 50% 46%, rgba(255,255,255,0.22), transparent 70%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: W / 2 - 600 * ring,
          top: 880 - 600 * ring,
          width: 1200 * ring,
          height: 1200 * ring,
          borderRadius: '50%',
          border: `${14 * (1 - ring)}px solid ${mix(ink, 0.7)}`,
          opacity: 1 - ring,
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginTop: -120,
        }}
      >
        <Kicker
          text={c.l.meet}
          color={mix(ink, 0.75)}
          style={{
            opacity: meet,
            transform: `translateY(${(1 - meet) * 20}px)`,
            marginBottom: 40,
          }}
        />
        <div
          style={{
            transform: `scale(${2.2 - slam * 1.2})`,
            opacity: Math.min(1, slam * 2),
            filter: `blur(${(1 - slam) * 10}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Mark c={c} size={180} />
          <div style={{ marginTop: 40 }}>
            <Fit text={p.name} maxW={900} max={150} style={{ color: ink }} />
          </div>
        </div>
        <div
          style={{
            marginTop: 34,
            opacity: sub,
            transform: `translateY(${(1 - sub) * 24}px)`,
            maxWidth: 880,
          }}
        >
          <Words
            text={p.tagline}
            size={46}
            maxW={880}
            color={mix(ink, 0.82)}
            weight={600}
            align="center"
            delay={Math.round(beat * 1.6)}
            stagger={1.5}
            lh={1.25}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CheckRows: React.FC<{
  c: Ctx;
  start: number;
  gap: number;
  size?: number;
  panel?: boolean;
}> = ({ c, start, gap, size = 46, panel = true }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t } = c;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {c.feats.map((f, i) => {
        const at = Math.round(start + i * gap);
        const s = pop(frame, fps, at, 14);
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 26,
              padding: panel ? '26px 32px' : '6px 0',
              borderRadius: 30,
              background: panel ? t.panel : undefined,
              border: panel ? `1.5px solid ${t.panelLine}` : undefined,
              boxShadow: panel ? t.shadow : undefined,
              opacity: Math.min(1, s * 1.4),
              transform: `translateY(${(1 - s) * 60}px)`,
            }}
          >
            <Check size={60} bg={panel ? t.accent : t.hi} color={onColor(panel ? t.accent : t.hi)} t={progress(frame, at + 3, at + 14)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div
                style={{
                  fontFamily: fonts.sansJP,
                  fontWeight: 800,
                  fontSize: size,
                  lineHeight: 1.2,
                  color: panel ? t.panelInk : t.ink,
                }}
              >
                {f.title}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* problem → solution, part 3: the product, and every pain answered with a check */
const SolutionScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, beat } = c;
  const kind = kindOf(c);
  const rows = c.feats.length;
  const listH = rows * 132 + (rows - 1) * 20;
  const visTop = 260;
  const visH = 1560 - listH - 60 - visTop;
  const w = fitW(kind, kind === 'phone' ? 420 : 900, visH);
  const h = vh(kind, w);
  const enter = pop(frame, fps, 0, 16);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={7} />
      <Bug c={c} />
      <div
        style={{
          position: 'absolute',
          left: W / 2 - w / 2,
          top: visTop + (visH - h) / 2 + (1 - enter) * 500,
          transform: `perspective(2400px) rotateX(${4 + (1 - enter) * 20}deg) rotateY(${interpolate(frame, [0, len], [-6, 6])}deg)`,
        }}
      >
        <Visual c={c} kind={kind} w={w} photo={c.photos[0]} drift={frame / len} />
      </div>
      <div style={{ position: 'absolute', left: M, right: M, top: 1560 - listH }}>
        <CheckRows c={c} start={beat * 1.5} gap={beat * 1.2} />
      </div>
    </AbsoluteFill>
  );
};

/* before / after: scattered paper mess, then a slider wipes it into the clean product */
const CompareScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const pains = p.pains ?? [];
  const x = interpolate(
    frame,
    [beat * 4.6, beat * 6, beat * 6.4, beat * 6.8, beat * 7.2, beat * 8.6],
    [W, W / 2, W / 2 + 50, W / 2 - 30, W / 2, 0],
    { ...clamp, easing: easeInOut },
  );
  const afterT = beat * 8;
  const kind = kindOf(c);
  const rows = c.feats.length;
  const listH = rows * 92 + (rows - 1) * 20;
  const visTop = 330;
  const visH = 1580 - listH - 70 - visTop;
  const w = fitW(kind, kind === 'phone' ? 440 : 920, visH);
  const h = vh(kind, w);
  const visIn = pop(frame, fps, Math.round(afterT - beat), 16);
  const jitter = frame > beat * 3.6 && frame < beat * 4.6 ? 1 : 0;
  const notes = [
    { x: 60, y: 420, r: -6 },
    { x: 330, y: 820, r: 5 },
    { x: 90, y: 1220, r: -3 },
  ];
  return (
    <AbsoluteFill>
      {/* BEFORE */}
      <AbsoluteFill style={{ background: t.muted }}>
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(${t.dark || t.bg === t.accent ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} 2px, transparent 2.5px)`,
            backgroundSize: '40px 40px',
          }}
        />
        <Pill
          text={c.l.before}
          bg={t.dark || t.bg === t.accent ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
          color={t.dark || t.bg === t.accent ? '#fff' : '#111216'}
          style={{ position: 'absolute', top: 160, left: M }}
        />
        {pains.map((pain, i) => {
          const n = notes[i];
          const s = pop(frame, fps, Math.round(beat * (0.4 + i * 1.1)), 11);
          const j = jitter ? Math.sin(frame * 1.7 + i * 2) * 3 : 0;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: n.x,
                top: n.y,
                width: 660,
                padding: '50px 48px 56px',
                background: '#FFFDF6',
                borderRadius: 10,
                boxShadow: '0 30px 60px rgba(0,0,0,0.22), 0 4px 10px rgba(0,0,0,0.12)',
                transform: `rotate(${n.r + j}deg) scale(${s})`,
                opacity: Math.min(1, s * 1.5),
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: -18,
                  left: 270,
                  width: 120,
                  height: 38,
                  background: 'rgba(230,225,205,0.85)',
                  transform: `rotate(${-n.r * 0.6}deg)`,
                }}
              />
              <div style={{ display: 'flex', gap: 22, alignItems: 'flex-start' }}>
                <Check size={62} bg="#FF4D4F" color="#fff" cross t={progress(frame, beat * (0.6 + i * 1.1), beat * (1.2 + i * 1.1))} />
                <div
                  style={{
                    fontFamily: fonts.sansJP,
                    fontWeight: 700,
                    fontSize: 50,
                    lineHeight: 1.3,
                    color: '#2A2A2E',
                  }}
                >
                  {pain}
                </div>
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
      {/* AFTER */}
      <AbsoluteFill style={{ clipPath: `inset(0 0 0 ${x}px)` }}>
        <Backdrop t={t} seed={8} />
        <Pill text={c.l.after} bg={t.hi} color={t.onHi} style={{ position: 'absolute', top: 160, right: M }} />
        <div
          style={{
            position: 'absolute',
            left: W / 2 - w / 2,
            top: visTop + (visH - h) / 2 + (1 - visIn) * 200,
            transform: `perspective(2400px) rotateX(4deg) rotateY(${interpolate(frame, [0, len], [8, -4])}deg)`,
          }}
        >
          <Visual c={c} kind={kind} w={w} photo={c.photos[0]} drift={frame / len} />
        </div>
        <div style={{ position: 'absolute', left: M, right: M, top: 1580 - listH }}>
          <CheckRows c={c} start={afterT} gap={beat * 0.9} size={42} panel={false} />
        </div>
      </AbsoluteFill>
      {/* slider */}
      {x > 0 && x < W ? (
        <div
          style={{
            position: 'absolute',
            left: x - 3,
            top: 0,
            bottom: 0,
            width: 6,
            background: '#fff',
            boxShadow: '0 0 30px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -52,
              top: 900,
              width: 110,
              height: 110,
              borderRadius: 55,
              background: '#fff',
              boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 40,
              color: '#111216',
            }}
          >
            ‹ ›
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/* one big number per beat-run, each drawn with its own chart */
const StatScene: React.FC<SP> = ({ c, i }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const s = (p.stats ?? [])[i];
  const count = progress(frame, 2, beat * 2.6, easeOutExpo);
  const decimals = s.decimals ?? (Number.isInteger(s.value) ? 0 : 1);
  const num = `${s.prefix ?? ''}${fmt(s.value * count, decimals)}`;
  const full = `${s.prefix ?? ''}${fmt(s.value, decimals)}${s.suffix ?? ''}`;
  const variant = i % 3;
  const labelT = progress(frame, 4, 18, easeOutExpo);
  const label = (
    <div
      style={{
        opacity: labelT,
        transform: `translateY(${(1 - labelT) * 20}px)`,
      }}
    >
      <Words
        text={s.label}
        size={54}
        maxW={W - M * 2}
        color={t.ink}
        weight={700}
        face="sans"
        delay={4}
        stagger={1.5}
        align={variant === 0 ? 'center' : 'left'}
        lh={1.2}
      />
    </div>
  );
  const numSize = (maxW: number, max: number) => Math.min(max, (maxW * 0.95) / Math.max(0.01, textW(full, 'display') * 0.96));
  const Big = ({ maxW, max }: { maxW: number; max: number }) => {
    const size = numSize(maxW, max);
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          whiteSpace: 'nowrap',
          fontFamily: fonts.display,
          fontWeight: 800,
          letterSpacing: '-0.05em',
          lineHeight: 0.9,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span style={{ fontSize: size, color: t.ink }}>{num}</span>
        <span style={{ fontSize: size * 0.5, color: t.hi, marginLeft: size * 0.04 }}>{s.suffix}</span>
      </div>
    );
  };
  if (variant === 0) {
    const pct = s.suffix?.trim() === '%' ? Math.min(1, s.value / 100) : 0.82;
    const r = 340;
    const circ = 2 * Math.PI * r;
    const spin = interpolate(frame, [0, beat * 4], [-90, -80]);
    return (
      <AbsoluteFill>
        <Backdrop t={t} seed={9} />
        <Bug c={c} />
        <svg width={W} height={W} style={{ position: 'absolute', top: 400, left: 0 }} viewBox={`0 0 ${W} ${W}`}>
          <circle cx={W / 2} cy={W / 2} r={r} stroke={t.faint} strokeWidth={34} fill="none" />
          <circle
            cx={W / 2}
            cy={W / 2}
            r={r}
            stroke={t.hi}
            strokeWidth={34}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct * count)}
            transform={`rotate(${spin} ${W / 2} ${W / 2})`}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            top: 400,
            left: 0,
            width: W,
            height: W,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <Big maxW={540} max={260} />
        </div>
        <div style={{ position: 'absolute', top: 1520 - 60, left: M, right: M }}>{label}</div>
      </AbsoluteFill>
    );
  }
  if (variant === 1) {
    const bars = [0.32, 0.42, 0.38, 0.55, 0.62, 0.74, 1];
    return (
      <AbsoluteFill>
        <Backdrop t={t} seed={10} />
        <Bug c={c} />
        <div style={{ position: 'absolute', top: 300, left: M, right: M }}>
          {label}
          <div style={{ marginTop: 40 }}>
            <Big maxW={W - M * 2} max={300} />
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: M,
            right: M,
            bottom: 360,
            height: 640,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 22,
          }}
        >
          {bars.map((b, j) => {
            const g = pop(frame, fps, 4 + j * 2.5, 16);
            const last = j === bars.length - 1;
            return (
              <div
                key={j}
                style={{
                  flex: 1,
                  height: `${b * 100 * g}%`,
                  borderRadius: 18,
                  background: last ? `linear-gradient(180deg, ${t.hi}, ${mix(t.hi, 0.7)})` : t.faint,
                  boxShadow: last ? `0 20px 60px ${mix(t.hi, 0.5)}` : undefined,
                }}
              />
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  const pts = [0.1, 0.18, 0.15, 0.32, 0.3, 0.52, 0.6, 0.86];
  const cw = W - M * 2;
  const ch = 560;
  const path = pts.map((v, j) => `${j ? 'L' : 'M'}${(j / (pts.length - 1)) * cw},${ch - v * ch}`).join(' ');
  const draw = progress(frame, 4, beat * 3, easeInOut);
  const end = pts.length - 1;
  const dotX = cw;
  const dotY = ch - pts[end] * ch;
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={11} />
      <Bug c={c} />
      <div style={{ position: 'absolute', top: 300, left: M, right: M }}>
        {label}
        <div style={{ marginTop: 40 }}>
          <Big maxW={W - M * 2} max={300} />
        </div>
      </div>
      <svg
        width={cw + 40}
        height={ch + 40}
        style={{
          position: 'absolute',
          left: M,
          bottom: 360,
          overflow: 'visible',
        }}
      >
        <defs>
          <linearGradient id="svcArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={t.hi} stopOpacity={0.35} />
            <stop offset="1" stopColor={t.hi} stopOpacity={0} />
          </linearGradient>
          <clipPath id="svcDraw">
            <rect x={0} y={-40} width={(cw + 40) * draw} height={ch + 80} />
          </clipPath>
        </defs>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={0} x2={cw} y1={ch - g * ch} y2={ch - g * ch} stroke={t.faint} strokeWidth={2} />
        ))}
        <g clipPath="url(#svcDraw)">
          <path d={`${path} L${cw},${ch} L0,${ch} Z`} fill="url(#svcArea)" />
          <path d={path} stroke={t.hi} strokeWidth={12} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {draw > 0.98 ? (
          <>
            <circle cx={dotX} cy={dotY} r={22 + Math.sin(frame / 4) * 3} fill={t.hi} />
            <circle
              cx={dotX}
              cy={dotY}
              r={44 * progress(frame % 30, 0, 30)}
              fill="none"
              stroke={t.hi}
              strokeWidth={4}
              opacity={1 - progress(frame % 30, 0, 30)}
            />
          </>
        ) : null}
      </svg>
    </AbsoluteFill>
  );
};

/* brand reveal: logo, name, tagline, and the product rising into frame */
const IntroScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const kind = kindOf(c);
  const logo = pop(frame, fps, 0, 11);
  const nameT = progress(frame, 3, 20, easeOutExpo);
  const rise = pop(frame, fps, Math.round(beat * 1.2), 18);
  const w = kind === 'phone' ? 560 : kind === 'both' ? 980 : kind === 'desktop' ? 1000 : kind === 'photo' ? 820 : 600;
  const top = 1000;
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={12} />
      <div
        style={{
          position: 'absolute',
          top: 280,
          left: M,
          right: M,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        <div style={{ transform: `scale(${logo})` }}>
          <Mark c={c} size={150} />
        </div>
        <div
          style={{
            marginTop: 40,
            opacity: nameT,
            transform: `translateY(${(1 - nameT) * 30}px)`,
          }}
        >
          <Fit text={p.name} maxW={W - M * 2} max={150} style={{ color: t.ink }} />
        </div>
        <div style={{ marginTop: 26 }}>
          <Words text={p.tagline} size={48} maxW={880} color={t.sub} weight={600} align="center" delay={8} stagger={1.5} lh={1.25} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: W / 2 - w / 2,
          top: top + (1 - rise) * 900,
          transform: `perspective(2400px) rotateX(${10 * (1 - rise) + 6}deg) scale(${0.98 + (frame / len) * 0.04})`,
          transformOrigin: '50% 0%',
        }}
      >
        <Visual c={c} kind={kind} w={w} photo={c.photos[0]} drift={frame / len} />
      </div>
    </AbsoluteFill>
  );
};

/* features: editorial spread per point — giant outlined index, headline, product cropped by the frame edge */
const FeatureScene: React.FC<SP> = ({ c, i, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, beat } = c;
  const f = c.feats[i];
  const kind = kindOf(c);
  const side = i % 2 ? 1 : -1;
  const num = progress(frame, 0, beat * 1.5, easeOutExpo);
  const enter = pop(frame, fps, Math.round(beat * 0.6), 17);
  const zoomT = progress(frame, beat * 1.6, beat * 4.4, easeInOut);
  const w = kind === 'phone' ? 520 : kind === 'both' ? 1000 : kind === 'desktop' ? 1060 : kind === 'photo' ? 820 : 560;
  const top = kind === 'photo' ? 900 : kind === 'phone' ? 880 : 1000;
  const x = W / 2 - w / 2 + side * (kind === 'desktop' || kind === 'both' ? 120 : 70);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={13 + i} />
      <Bug c={c} />
      <div
        style={{
          position: 'absolute',
          top: 150,
          right: M - 10,
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 300,
          lineHeight: 1,
          letterSpacing: '-0.06em',
          color: 'transparent',
          WebkitTextStroke: `3px ${mix(t.hi, 0.85)}`,
          opacity: num,
          transform: `translateX(${(1 - num) * 120}px)`,
        }}
      >
        {String(i + 1).padStart(2, '0')}
      </div>
      <div style={{ position: 'absolute', top: 390, left: M, right: M }}>
        <Words text={c.feats[i].title} size={104} maxW={W - M * 2} maxLines={3} color={t.ink} delay={3} />
        {f.body ? (
          <div style={{ marginTop: 26, maxWidth: 860 }}>
            <Words
              text={f.body}
              size={38}
              maxW={860}
              maxLines={2}
              face="sans"
              weight={500}
              color={t.sub}
              delay={10}
              stagger={1}
              lh={1.35}
            />
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          left: x + (1 - enter) * side * -600,
          top: top + (1 - enter) * 200,
          opacity: Math.min(1, enter * 1.5),
          transform: `perspective(2400px) rotateY(${side * -8 * (1 - zoomT * 0.5)}deg) rotateX(4deg)`,
        }}
      >
        <Visual
          c={c}
          kind={kind}
          w={w}
          focus={f.focus}
          zoom={1 + (f.focus.zoom - 1) * zoomT * 0.8}
          photo={photoAt(c, i)}
          drift={frame / len}
        />
      </div>
      <div style={{ position: 'absolute', left: M, top: 300 }}>
        <Counter c={c} i={i} n={c.feats.length} />
      </div>
    </AbsoluteFill>
  );
};

const RecapScene: React.FC<SP> = ({ c }) => {
  const { p, t, beat } = c;
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={16} />
      <Bug c={c} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          padding: `0 ${M}px`,
          paddingBottom: 100,
        }}
      >
        <Words text={p.tagline} size={96} maxW={W - M * 2} maxLines={3} color={t.ink} delay={2} />
        <div style={{ marginTop: 70 }}>
          <CheckRows c={c} start={beat * 0.8} gap={beat * 0.7} size={44} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/* pricing: plans stack in, prices count up, the featured plan gets tapped */
const PlansScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const plans = p.plans ?? [];
  const n = plans.length;
  const cardH = n === 3 ? 300 : n === 2 ? 380 : 780;
  const gap = 34;
  // the stack is centred in the space under the headline, so one or two plans never leave the bottom bare
  const top = 640 + (940 - (n * cardH + (n - 1) * gap)) / 2;
  const featured = Math.max(
    0,
    plans.findIndex((x) => x.featured),
  );
  const tapAt = Math.round(beat * 6);
  const press = interpolate(frame, [tapAt - 3, tapAt, tapAt + 6], [0, 1, 0], clamp);
  const ripple = interpolate(frame, [tapAt, tapAt + 16], [0, 1], clamp);
  const sel = progress(frame, tapAt, tapAt + 10, easeOutExpo);
  const tapT = progress(frame, beat * 4.6, tapAt - 1, easeInOut);
  const fy = top + featured * (cardH + gap) + cardH / 2;
  const featBg = t.bg === t.accent ? '#111216' : t.accent;
  const featInk = onColor(featBg);
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={17} />
      <Bug c={c} />
      <div style={{ position: 'absolute', top: 290, left: M, right: M }}>
        <Kicker text={c.l.pricing} color={t.sub} dot={t.hi} style={{ opacity: progress(frame, 0, 10) }} />
        <div style={{ marginTop: 26 }}>
          <Words text={p.tagline} size={80} maxW={W - M * 2} maxLines={2} color={t.ink} delay={2} />
        </div>
      </div>
      {plans.map((pl, i) => {
        const at = Math.round(beat * (1 + i * 0.75));
        const s = pop(frame, fps, at, 15);
        const isF = i === featured && plans.some((x) => x.featured);
        const priceT = progress(frame, at + 4, at + beat * 2.2, easeOutExpo);
        const bg = isF ? featBg : t.panel;
        const ink = isF ? featInk : t.panelInk;
        const subInk = isF ? mix(featInk, 0.72) : t.panelSub;
        const scale = isF ? 1 + sel * 0.035 - press * 0.03 : 1 - sel * 0.01;
        const priceSize = Math.min(cardH * 0.36, 360 / Math.max(1, textW(pl.price, 'display')));
        if (n === 1)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: M,
                right: M,
                top,
                height: cardH,
                borderRadius: 48,
                background: featBg,
                boxShadow: `0 50px 110px ${mix(featBg, 0.5)}`,
                padding: '64px 64px 70px',
                display: 'flex',
                flexDirection: 'column',
                color: featInk,
                transform: `translateY(${(1 - s) * 900}px) scale(${1 + sel * 0.02 - press * 0.03})`,
                opacity: Math.min(1, s * 1.4),
              }}
            >
              <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 56, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
                {pl.name}
              </div>
              <div style={{ marginTop: 30, display: 'flex', alignItems: 'baseline', gap: 18, whiteSpace: 'nowrap' }}>
                <span
                  style={{
                    fontFamily: fonts.display,
                    fontWeight: 800,
                    fontSize: Math.min(230, 700 / Math.max(1, textW(pl.price, 'display'))),
                    letterSpacing: '-0.05em',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {countPrice(pl.price, priceT)}
                </span>
                {pl.period ? (
                  <span style={{ fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 40, color: mix(featInk, 0.75) }}>{pl.period}</span>
                ) : null}
              </div>
              <div
                style={{
                  marginTop: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 22,
                  paddingTop: 40,
                  borderTop: `2px solid ${mix(featInk, 0.2)}`,
                }}
              >
                {pl.perks.map((pk, j) => {
                  const ps = pop(frame, fps, at + 10 + j * 4, 14);
                  return (
                    <div
                      key={j}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 20,
                        fontFamily: fonts.sansJP,
                        fontWeight: 700,
                        fontSize: Math.min(42, 760 / Math.max(1, textW(pk, 'sans'))),
                        whiteSpace: 'nowrap',
                        opacity: ps,
                        transform: `translateX(${(1 - ps) * 40}px)`,
                      }}
                    >
                      <Check size={50} bg={mix(featInk, 0.18)} color={featInk} t={ps} />
                      {pk}
                    </div>
                  );
                })}
              </div>
              {pl.featured ? (
                <Pill
                  text={c.l.popular}
                  bg={t.hi === featBg ? '#FFFFFF' : t.hi}
                  color={t.hi === featBg ? featBg : t.onHi}
                  style={{
                    position: 'absolute',
                    top: -24,
                    right: 50,
                    fontSize: 24,
                    padding: '12px 24px',
                    transform: `scale(${pop(frame, fps, at + 8, 10)})`,
                  }}
                />
              ) : null}
            </div>
          );
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: M,
              right: M,
              top: top + i * (cardH + gap),
              height: cardH,
              borderRadius: 40,
              background: bg,
              border: isF ? 'none' : `1.5px solid ${t.panelLine}`,
              boxShadow: isF
                ? `0 40px 90px ${mix(featBg, 0.5)}, 0 0 0 ${6 * sel}px ${mix(t.hi === featBg ? '#ffffff' : t.hi, 0.9)}`
                : t.shadow,
              padding: '40px 46px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'stretch',
              transform: `translateX(${(1 - s) * 1000}px) scale(${scale})`,
              opacity: Math.min(1, s * 1.4) * (isF ? 1 : 1 - sel * 0.25),
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.display,
                  fontWeight: 800,
                  fontSize: 46,
                  letterSpacing: '-0.02em',
                  color: ink,
                  whiteSpace: 'nowrap',
                }}
              >
                {pl.name}
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: n === 3 ? 8 : 14,
                }}
              >
                {pl.perks.slice(0, n === 3 ? 2 : 3).map((pk, j) => (
                  <div
                    key={j}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      fontFamily: fonts.sansJP,
                      fontWeight: 600,
                      fontSize: 30,
                      color: subInk,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <Check size={34} bg={isF ? mix(featInk, 0.18) : mix(t.accent, 0.14)} color={isF ? featInk : t.accent} />
                    {pk}
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
              }}
            >
              <div
                style={{
                  fontFamily: fonts.display,
                  fontWeight: 800,
                  fontSize: priceSize,
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                  color: ink,
                  whiteSpace: 'nowrap',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {countPrice(pl.price, priceT)}
              </div>
              {pl.period ? (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: fonts.display,
                    fontWeight: 600,
                    fontSize: 28,
                    color: subInk,
                  }}
                >
                  {pl.period}
                </div>
              ) : null}
            </div>
            {isF ? (
              <Pill
                text={c.l.popular}
                bg={t.hi === featBg ? '#FFFFFF' : t.hi}
                color={t.hi === featBg ? featBg : t.onHi}
                style={{
                  position: 'absolute',
                  top: -22,
                  right: 40,
                  fontSize: 22,
                  padding: '10px 22px',
                  transform: `scale(${pop(frame, fps, at + 8, 10)})`,
                }}
              />
            ) : null}
          </div>
        );
      })}
      {plans.some((x) => x.featured) && tapT > 0 ? (
        <>
          <TouchDot
            x={interpolate(tapT, [0, 1], [900, 720])}
            y={interpolate(tapT, [0, 1], [1820, fy])}
            press={press}
            ripple={ripple}
            color={t.hi}
          />
          <Tap c={c} at={tapAt} />
        </>
      ) : null}
    </AbsoluteFill>
  );
};

/* campaign sticker */
const OfferScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const bg = t.dark ? '#000000' : t.bg === t.accent ? '#111216' : t.ink;
  const s = pop(frame, fps, 3, 8);
  const rot = interpolate(frame, [0, beat * 4], [-14, 6]);
  const pts = Array.from({ length: 48 }, (_, k) => {
    const a = (k / 48) * Math.PI * 2;
    const r = k % 2 ? 380 : 420;
    return `${Math.cos(a) * r},${Math.sin(a) * r}`;
  }).join(' ');
  const lay = layoutText(p.offer ?? '', 560, 110, 3);
  const kick = progress(frame, beat * 1, beat * 1.8, easeOutExpo);
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 40% at 50% 48%, ${mix(t.hi, 0.35)}, transparent 70%)`,
        }}
      />
      {Array.from({ length: 18 }, (_, k) => {
        const a = random(`cf${k}`) * Math.PI * 2;
        const d = 300 + random(`cd${k}`) * 520 * progress(frame, 3, 30, easeOutExpo);
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: W / 2 + Math.cos(a) * d,
              top: 900 + Math.sin(a) * d,
              width: 18,
              height: k % 3 ? 18 : 40,
              borderRadius: k % 2 ? 9 : 4,
              background: k % 2 ? t.hi : t.accent2,
              transform: `rotate(${k * 37 + frame * 4}deg)`,
              opacity: s,
            }}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: W / 2,
          top: 900,
          transform: `translate(-50%, -50%) scale(${s}) rotate(${rot}deg)`,
        }}
      >
        <svg width={860} height={860} viewBox="-430 -430 860 860" style={{ display: 'block' }}>
          <polygon points={pts} fill={t.hi} />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: lay.size,
              lineHeight: 1.0,
              letterSpacing: '-0.03em',
              color: t.onHi,
            }}
          >
            {lay.lines.map((l, k) => (
              <div key={k} style={{ whiteSpace: 'nowrap' }}>
                {l.map((x, j) => (j > 0 && x.space ? ' ' : '') + x.text).join('')}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 1420,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          opacity: kick,
        }}
      >
        <Kicker text={c.l.limited} color="rgba(255,255,255,0.8)" dot={t.hi} />
      </div>
    </AbsoluteFill>
  );
};

/* customer voice: stars fill, the quote reads itself in, the person signs it */
const QuoteScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, beat, p } = c;
  const q = p.testimonial!;
  const rating = q.rating ?? 5;
  const read = progress(frame, beat * 2, beat * 8.5, (x) => x);
  const mark = pop(frame, fps, 2, 12);
  const who = pop(frame, fps, Math.round(beat * 7.5), 14);
  const kind = kindOf(c);
  // the place or person fills the top of the frame and fades into the quote below it
  const hero = c.photos[0] ?? q.avatar;
  const device = !hero && kind !== 'brand';
  const cjk = WIDE.test(q.quote);
  const heroIn = progress(frame, 0, 20, easeOutExpo);
  const quoteBlock = (
    <>
      <div style={{ display: 'flex', gap: 10 }}>
        {Array.from({ length: 5 }, (_, k) => (
          <div key={k} style={{ transform: `scale(${pop(frame, fps, 4 + k * 3, 10)})` }}>
            <Star
              size={60}
              fill={Math.max(0, Math.min(1, rating - k))}
              color={t.dark ? '#FFC53D' : t.bg === t.accent ? t.hi : '#F5A623'}
              empty={t.faint}
            />
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 24,
          height: 110,
          fontFamily: fonts.serif,
          fontWeight: 600,
          fontSize: 240,
          lineHeight: 1,
          color: t.hi,
          transform: `scale(${mark})`,
          transformOrigin: 'left top',
        }}
      >
        “
      </div>
      <Words
        text={q.quote}
        size={cjk ? 104 : 112}
        maxW={W - M * 2}
        maxLines={hero || device ? 4 : 7}
        face="serif"
        weight={600}
        italic={!cjk}
        color={t.ink}
        dimColor={mix(t.ink, 0.22)}
        read={read}
        delay={beat * 0.8}
        stagger={0.6}
        lh={cjk ? 1.3 : 1.1}
      />
      <div
        style={{
          marginTop: 56,
          paddingTop: 40,
          borderTop: `3px solid ${t.faint}`,
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          opacity: who,
          transform: `translateY(${(1 - who) * 40}px)`,
        }}
      >
        {q.avatar ? (
          <Img
            src={asset(q.avatar)}
            style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover', boxShadow: `0 0 0 5px ${t.bg}, 0 0 0 8px ${t.hi}` }}
          />
        ) : (
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              background: t.hi,
              color: t.onHi,
              display: 'grid',
              placeItems: 'center',
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 52,
            }}
          >
            {Array.from(q.name)[0]}
          </div>
        )}
        <div>
          <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 44, color: t.ink }}>{q.name}</div>
          {q.role ? (
            <div style={{ marginTop: 6, fontFamily: fonts.sansJP, fontWeight: 500, fontSize: 32, color: t.sub }}>{q.role}</div>
          ) : null}
        </div>
      </div>
    </>
  );
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={18} />
      {hero ? (
        <AbsoluteFill style={{ height: 1240, opacity: heroIn, overflow: 'hidden' }}>
          <Img
            src={asset(hero)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.12 - (frame / len) * 0.08})` }}
          />
          <AbsoluteFill
            style={{
              background: `linear-gradient(180deg, ${mix(t.bg, 0.75)} 0%, ${mix(t.bg, 0)} 22%, ${mix(t.bg, 0)} 45%, ${t.bg} 100%)`,
            }}
          />
        </AbsoluteFill>
      ) : device ? (
        <div style={{ position: 'absolute', left: W / 2 - fitW(kind, 900, 440) / 2, top: 260, opacity: heroIn }}>
          <Visual c={c} kind={kind} w={fitW(kind, 900, 440)} drift={frame / len} />
        </div>
      ) : null}
      <Bug c={c} />
      {hero || device ? (
        <div style={{ position: 'absolute', left: M, right: M, bottom: 300 }}>{quoteBlock}</div>
      ) : (
        <AbsoluteFill style={{ justifyContent: 'center', padding: `0 ${M}px`, paddingBottom: 120 }}>{quoteBlock}</AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

/* 1-2-3 steps: a rail fills node by node while the product re-frames for each step */
const StepsScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const steps = p.steps ?? c.feats.map((f) => ({ title: f.title, body: f.body }));
  const k = steps.length;
  const per = beat * STEP_BEATS;
  const cur = Math.min(k - 1, Math.max(0, Math.floor((frame - beat * 0.5) / per)));
  const local = frame - beat * 0.5 - cur * per;
  const kind = kindOf(c);
  const railW = W - M * 2;
  const fill = interpolate(frame, [beat * 0.5, beat * 0.5 + per * (k - 1) + beat], [0, 1], { ...clamp, easing: easeInOut });
  const w = kind === 'phone' ? 420 : kind === 'both' ? 900 : kind === 'desktop' ? 920 : kind === 'photo' ? 660 : 500;
  const visTop = kind === 'desktop' || kind === 'both' ? 940 : 800;
  return (
    <AbsoluteFill>
      <Backdrop t={t} seed={19} />
      <Bug c={c} />
      {/* rail */}
      <div
        style={{
          position: 'absolute',
          top: 290,
          left: M,
          width: railW,
          height: 70,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 33,
            left: 35,
            right: 35,
            height: 4,
            background: t.faint,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 33,
            left: 35,
            width: (railW - 70) * fill,
            height: 4,
            background: t.hi,
            borderRadius: 2,
          }}
        />
        {steps.map((_, j) => {
          const on = frame >= beat * 0.5 + j * per;
          const s = pop(frame, fps, Math.round(beat * 0.5 + j * per), 10);
          return (
            <div
              key={j}
              style={{
                position: 'absolute',
                left: (j / (k - 1)) * (railW - 70),
                top: 0,
                width: 70,
                height: 70,
                borderRadius: 35,
                background: on ? t.hi : t.bg,
                border: `4px solid ${on ? t.hi : t.faint}`,
                color: on ? t.onHi : t.sub,
                display: 'grid',
                placeItems: 'center',
                fontFamily: fonts.display,
                fontWeight: 800,
                fontSize: 30,
                transform: `scale(${on ? 0.9 + s * 0.1 : 0.9})`,
              }}
            >
              {j + 1}
            </div>
          );
        })}
      </div>
      {/* current step copy */}
      <Sequence from={Math.round(beat * 0.5 + cur * per)} layout="none" key={cur}>
        <StepCopy c={c} n={cur} title={steps[cur].title} body={steps[cur].body} />
      </Sequence>
      {/* visual re-frames per step */}
      {steps.map((_, j) => {
        const vis =
          interpolate(frame, [beat * 0.5 + j * per - 6, beat * 0.5 + j * per + 6], [0, 1], clamp) *
          (j === k - 1 ? 1 : interpolate(frame, [beat * 0.5 + (j + 1) * per - 6, beat * 0.5 + (j + 1) * per + 6], [1, 0], clamp));
        if (vis <= 0 && !(j === 0 && frame < beat)) return null;
        const f = c.feats[j % c.feats.length];
        const zoomT = j === cur ? progress(local, 4, per * 0.8, easeInOut) : 1;
        const enter = j === 0 ? pop(frame, fps, 0, 16) : 1;
        return (
          <div
            key={j}
            style={{
              position: 'absolute',
              left: W / 2 - w / 2,
              top: visTop + (1 - enter) * 700,
              opacity: j === 0 && frame < beat ? 1 : vis,
              transform: `perspective(2400px) rotateX(5deg) translateY(${(1 - vis) * 40}px)`,
            }}
          >
            <Visual
              c={c}
              kind={kind}
              w={w}
              focus={f.focus}
              zoom={kind === 'photo' ? 1 + zoomT * 0.3 : 1 + (f.focus.zoom - 1) * zoomT * 0.7}
              photo={photoAt(c, j)}
              drift={zoomT}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const StepCopy: React.FC<{
  c: Ctx;
  n: number;
  title: string;
  body?: string;
}> = ({ c, n, title, body }) => {
  const frame = useCurrentFrame();
  const { t } = c;
  const num = progress(frame, 0, 14, easeOutExpo);
  return (
    <div
      style={{
        position: 'absolute',
        top: 420,
        left: M,
        right: M,
        display: 'flex',
        gap: 36,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 300,
          lineHeight: 0.82,
          letterSpacing: '-0.06em',
          color: t.hi,
          transform: `translateY(${(1 - num) * 80}px)`,
          opacity: num,
          width: 200,
          flexShrink: 0,
        }}
      >
        {n + 1}
      </div>
      <div style={{ flex: 1, paddingTop: 14 }}>
        <Words text={title} size={84} maxW={680} maxLines={3} color={t.ink} delay={2} />
        {body ? (
          <div style={{ marginTop: 18 }}>
            <Words text={body} size={36} maxW={680} maxLines={3} face="sans" weight={500} color={t.sub} delay={8} stagger={1} lh={1.35} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

/* kinetic: one word per beat on alternating colour fields */
const WordsScene: React.FC<SP> = ({ c, len }) => {
  const frame = useCurrentFrame();
  const { p, t, beat } = c;
  const toks = kineticTokens(p);
  const per = toks.length > 8 ? beat * 0.5 : beat;
  const k = Math.min(toks.length - 1, Math.floor(frame / per));
  const fk = frame - k * per;
  const last = k === toks.length - 1;
  const fields = [
    { bg: t.bg, ink: t.ink },
    { bg: t.hi, ink: t.onHi },
    {
      bg: t.bg === t.accent ? '#111216' : t.ink,
      ink: t.bg === t.accent ? '#FFFFFF' : t.bg,
    },
  ];
  const fd = fields[k % 3];
  const word = toks[k];
  const isEm = !!p.hookEmphasis && p.hookEmphasis.toLowerCase().includes(word.toLowerCase().replace(/[.,!?]/g, ''));
  const lay = layoutText(word, W - M * 2, last ? 300 : 340, 2);
  const punch = 1 + 0.18 * (1 - progress(fk, 0, 8, easeOutExpo));
  const align = (['center', 'left', 'right'] as const)[k % 3];
  const tail = last ? progress(frame, k * per + per, len, easeInOut) : 0;
  const kind = kindOf(c);
  const photo = kind === 'photo' ? photoAt(c, k) : undefined;
  // each cut re-frames the photo somewhere new, so one picture still reads as many shots
  const ox = 20 + random(`kx${k}`) * 60;
  const oy = 20 + random(`ky${k}`) * 60;
  const push = 1.25 + (frame - k * per) * 0.004;
  return (
    <AbsoluteFill style={{ background: fd.bg, overflow: 'hidden' }}>
      {fd.bg === t.bg ? <Backdrop t={t} seed={k} /> : null}
      {photo ? (
        <Img
          src={asset(photo)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${push})`,
            transformOrigin: `${ox}% ${oy}%`,
            filter: 'grayscale(1) contrast(1.25)',
            mixBlendMode: 'luminosity',
            opacity: luminance(fd.bg) > 0.5 ? 0.22 : 0.42,
          }}
        />
      ) : kind !== 'brand' ? (
        <div
          style={{
            position: 'absolute',
            left: W / 2,
            top: 960,
            transform: `translate(-50%, -50%) rotate(${k % 2 ? 10 : -10}deg) scale(1.5)`,
            opacity: 0.14,
          }}
        >
          <Visual c={c} kind={kind} w={kind === 'phone' ? 520 : 900} />
        </div>
      ) : null}
      <AbsoluteFill style={{ transform: 'rotate(-9deg) scale(1.3)', opacity: 1 }}>
        {Array.from({ length: 9 }, (_, r) => (
          <div
            key={r}
            style={{
              position: 'absolute',
              top: r * 250 - 120,
              left: (r % 2 ? -1 : 1) * ((frame * 5 + r * 260) % 900) - 900,
              whiteSpace: 'nowrap',
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: 200,
              letterSpacing: '-0.04em',
              color: 'transparent',
              WebkitTextStroke: `2px ${mix(fd.ink, 0.13)}`,
            }}
          >
            {`${p.name}  ·  `.repeat(8)}
          </div>
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `radial-gradient(70% 45% at 50% 50%, ${mix(fd.bg, 0.55)} 0%, transparent 100%)` }} />
      <div style={{ position: 'absolute', top: 160, left: M, right: M, display: 'flex', justifyContent: 'space-between' }}>
        <Kicker text={p.category ?? p.name} color={mix(fd.ink, 0.8)} dot={fd.bg === t.hi ? fd.ink : t.hi} />
        <Kicker text={`${String(k + 1).padStart(2, '0')}/${String(toks.length).padStart(2, '0')}`} color={mix(fd.ink, 0.8)} />
      </div>
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          padding: `0 ${M}px`,
          alignItems: align === 'center' ? 'center' : align === 'left' ? 'flex-start' : 'flex-end',
        }}
      >
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: lay.size,
            lineHeight: 0.95,
            letterSpacing: '-0.045em',
            color: isEm && fd.bg !== t.hi ? t.hi : fd.ink,
            textAlign: align,
            transform: `scale(${punch * (1 + tail * 0.08)}) rotate(${(k % 2 ? 1 : -1) * 2 * (1 - progress(fk, 0, 8))}deg)`,
          }}
        >
          {lay.lines.map((l, j) => (
            <div key={j} style={{ whiteSpace: 'nowrap' }}>
              {l.map((x, m) => (m > 0 && x.space ? ' ' : '') + x.text).join('')}
            </div>
          ))}
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          bottom: 380,
          left: M,
          right: M,
          display: 'flex',
          gap: 10,
        }}
      >
        {toks.map((_, j) => (
          <div
            key={j}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: j <= k ? fd.ink : mix(fd.ink, 0.2),
            }}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/* kinetic: the logo slams in with a shockwave and a camera shake */
const SlamScene: React.FC<SP> = ({ c }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { p, t, beat } = c;
  const bg = t.bg === t.accent ? '#111216' : t.dark ? '#000' : t.ink;
  const ink = onColor(bg);
  const s = pop(frame, fps, 0, 10);
  const flash = interpolate(frame, [0, 3, 8], [0.9, 0.5, 0], clamp);
  const shake = Math.max(0, 1 - frame / 14);
  const sx = Math.sin(frame * 3.1) * 16 * shake;
  const sy = Math.cos(frame * 2.7) * 16 * shake;
  const rings = [0, 4].map((d) => progress(frame, 2 + d, 26 + d, easeOutExpo));
  const sub = progress(frame, beat * 1.4, beat * 2.2, easeOutExpo);
  return (
    <AbsoluteFill style={{ background: bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(55% 35% at 50% 46%, ${mix(t.hi, 0.4)}, transparent 70%)`,
        }}
      />
      {rings.map((r, k) => (
        <div
          key={k}
          style={{
            position: 'absolute',
            left: W / 2 - 700 * r,
            top: 860 - 700 * r,
            width: 1400 * r,
            height: 1400 * r,
            borderRadius: '50%',
            border: `${16 * (1 - r)}px solid ${k ? t.accent2 : t.hi}`,
            opacity: 1 - r,
          }}
        />
      ))}
      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 140,
          transform: `translate(${sx}px, ${sy}px)`,
        }}
      >
        <div
          style={{
            transform: `scale(${3 - s * 2})`,
            opacity: Math.min(1, s * 3),
            filter: `blur(${(1 - s) * 16}px)`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <Mark c={c} size={200} />
          <div style={{ marginTop: 40 }}>
            <Fit text={p.name} maxW={W - M * 2} max={170} style={{ color: ink }} />
          </div>
        </div>
        <div style={{ marginTop: 34, opacity: sub, maxWidth: 880 }}>
          <Words
            text={p.tagline}
            size={48}
            maxW={880}
            color={mix(ink, 0.75)}
            weight={600}
            align="center"
            delay={Math.round(beat * 1.4)}
            stagger={1.5}
            lh={1.25}
          />
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: '#fff', opacity: flash }} />
    </AbsoluteFill>
  );
};

/* kinetic: each feature as a hard-cut full-bleed card */
const FlashScene: React.FC<SP> = ({ c, i, len }) => {
  const frame = useCurrentFrame();
  const { p, t } = c;
  const f = c.feats[i];
  const kind = kindOf(c);
  const push = interpolate(frame, [0, len], [1.08, 1.0]);
  const fields = [t.hi, t.bg === t.accent ? '#111216' : t.ink, t.accent2];
  const field = fields[i % 3];
  const ink = onColor(field);
  const titleW = W - M * 2;
  return (
    <AbsoluteFill style={{ background: kind === 'photo' ? '#000' : field }}>
      {kind === 'photo' ? (
        <>
          <Img
            src={asset(photoAt(c, i))}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${push})`,
            }}
          />
          <AbsoluteFill
            style={{
              background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.78) 82%)',
            }}
          />
        </>
      ) : kind === 'brand' ? null : (
        <div
          style={{
            position: 'absolute',
            left: W / 2,
            top: 760,
            transform: `translate(-50%, -50%) scale(${push}) rotate(${i % 2 ? 4 : -4}deg)`,
          }}
        >
          <Visual c={c} kind={kind} w={kind === 'phone' ? 500 : 940} focus={f.focus} zoom={1.15} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: M,
          right: M,
          bottom: kind === 'photo' ? 380 : 360,
        }}
      >
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: 220,
            lineHeight: 0.8,
            letterSpacing: '-0.06em',
            color: kind === 'photo' ? p.accent : ink,
            opacity: 0.9,
            marginBottom: 20,
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </div>
        <Words
          text={f.title}
          size={kind === 'brand' ? 140 : 112}
          maxW={titleW}
          maxLines={3}
          color={kind === 'photo' ? '#fff' : ink}
          delay={0}
          stagger={2}
          dur={10}
        />
      </div>
    </AbsoluteFill>
  );
};
