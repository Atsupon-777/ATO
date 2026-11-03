// Tone and manner for motion-graphics reels: one choice per axis, shared by every scene.
// Names follow the design vocabulary the owner uses (デザインの名前54): 色, 明るさ, 文字, 動き.
// A scene with no theme keeps its own signature look; with one, its colours and type come from here.
import { createContext, useContext } from 'react';
import { z } from 'zod';
import { fonts } from '../lib/fonts';

export const paletteIds = ['brand', 'pastel', 'dusty', 'tonal', 'complementary', 'mono'] as const;
export const modeIds = ['dark', 'light'] as const;
export const typeIds = ['gothic', 'mincho', 'rounded', 'hand'] as const;
export const paceIds = ['calm', 'normal', 'snappy'] as const;

export const motionThemeSchema = z.object({
  palette: z.enum(paletteIds).default('brand'),
  mode: z.enum(modeIds).default('dark'),
  type: z.enum(typeIds).default('gothic'),
  pace: z.enum(paceIds).default('normal'),
  /** The brand colour (#rrggbb), taken from the logo or site; drives `brand`, `tonal` and `complementary`. */
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});
export type MotionTheme = z.infer<typeof motionThemeSchema>;

/** Labels shown on the option chips (Japanese; the app translates them). */
export const THEME_LABELS = {
  palette: { brand: 'ブランドカラー', pastel: 'パステル', dusty: 'くすみ', tonal: '単色の濃淡', complementary: '補色', mono: 'モノクロ' },
  mode: { dark: 'ダークモード', light: 'ライト' },
  type: { gothic: 'ゴシック', mincho: '明朝', rounded: '丸ゴシック', hand: '手描き風' },
  pace: { calm: 'ゆったり', normal: 'ふつう', snappy: 'キビキビ' },
} as const;

/** Scene length multiplier for each pace (every scene's beats scale with its length). */
export const PACE: Record<(typeof paceIds)[number], number> = { calm: 1.25, normal: 1, snappy: 0.82 };

export type Look = {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  /** Text that sits on the accent colour. */
  onAccent: string;
  head: string;
  body: string;
  headWeight: number;
  dark: boolean;
};

const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
const toHsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
};

const TYPE: Record<(typeof typeIds)[number], { head: string; body: string; headWeight: number }> = {
  gothic: { head: fonts.sansJP, body: fonts.sansJP, headWeight: 900 },
  mincho: { head: fonts.minchoJP, body: fonts.minchoJP, headWeight: 800 },
  rounded: { head: `"M PLUS Rounded 1c", ${fonts.sansJP}`, body: `"M PLUS Rounded 1c", ${fonts.sansJP}`, headWeight: 800 },
  hand: { head: `"Klee One", ${fonts.minchoJP}`, body: fonts.sansJP, headWeight: 700 },
};

/** Resolves a theme to concrete colours and faces. */
export const lookOf = (th: MotionTheme): Look => {
  const [h, s] = toHsl(th.brandColor ?? '#4f46e5');
  const dark = th.mode === 'dark';
  const base = (() => {
    switch (th.palette) {
      case 'pastel':
        return dark
          ? { bg: hsl(h, 22, 14), surface: hsl(h, 20, 20), accent: hsl(h, 80, 82), accent2: hsl(h + 140, 70, 80) }
          : { bg: hsl(h, 60, 96), surface: '#ffffff', accent: hsl(h, 70, 72), accent2: hsl(h + 140, 65, 76) };
      case 'dusty':
        return dark
          ? { bg: hsl(h, 10, 13), surface: hsl(h, 9, 19), accent: hsl(h, 24, 66), accent2: hsl(h + 30, 18, 58) }
          : { bg: hsl(h, 14, 92), surface: hsl(h, 16, 97), accent: hsl(h, 22, 48), accent2: hsl(h + 30, 16, 60) };
      case 'tonal':
        return dark
          ? { bg: hsl(h, Math.min(s, 60), 9), surface: hsl(h, Math.min(s, 50), 15), accent: hsl(h, Math.max(s, 60), 62), accent2: hsl(h, Math.max(s, 50), 78) }
          : { bg: hsl(h, Math.min(s, 70), 95), surface: hsl(h, 60, 99), accent: hsl(h, Math.max(s, 60), 45), accent2: hsl(h, Math.max(s, 50), 70) };
      case 'complementary':
        return dark
          ? { bg: hsl(h, 30, 10), surface: hsl(h, 25, 16), accent: hsl(h, Math.max(s, 70), 60), accent2: hsl(h + 180, 80, 62) }
          : { bg: hsl(h, 40, 96), surface: '#ffffff', accent: hsl(h, Math.max(s, 70), 48), accent2: hsl(h + 180, 75, 50) };
      case 'mono':
        return dark ? { bg: '#0b0b0c', surface: '#18181a', accent: '#f2f2f2', accent2: '#8a8a8a' } : { bg: '#f4f4f2', surface: '#ffffff', accent: '#111111', accent2: '#777777' };
      default:
        return dark
          ? { bg: hsl(h, 25, 8), surface: hsl(h, 20, 14), accent: th.brandColor ?? hsl(h, 80, 62), accent2: hsl(h + 30, 70, 70) }
          : { bg: hsl(h, 30, 96), surface: '#ffffff', accent: th.brandColor ?? hsl(h, 80, 50), accent2: hsl(h + 30, 70, 55) };
    }
  })();
  const [, , al] = th.palette === 'mono' ? [0, 0, dark ? 95 : 7] : toHslLoose(base.accent);
  return {
    ...base,
    ink: dark ? '#f5f3ef' : '#15161a',
    muted: dark ? 'rgba(245,243,239,.6)' : 'rgba(21,22,26,.58)',
    onAccent: al > 62 ? '#111214' : '#ffffff',
    dark,
    ...TYPE[th.type],
  };
};

/** Lightness of an `hsl(...)` or `#rrggbb` colour (0–100). */
const toHslLoose = (c: string): [number, number, number] => {
  if (c.startsWith('#')) return toHsl(c);
  const m = /hsl\((\S+) (\S+)% (\S+)%\)/.exec(c);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 50];
};

export const MotionThemeContext = createContext<Look | null>(null);

/** The theme's look, or null when the reel keeps each scene's own look. */
export const useLook = () => useContext(MotionThemeContext);
