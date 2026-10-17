import type React from 'react';
import { continueRender, delayRender, staticFile } from 'remotion';

// Fonts are self-hosted from public/fonts (run `npm run fonts` once), so a render never depends on
// Google's servers. All families are SIL Open Font License and may be embedded in commercial video.
// Han characters come from Noto Sans JP unless a reel sets `--cjk` (Chinese reels put Noto Sans SC first,
// see cjkVars); Tamil falls back to Noto Sans Tamil. Latin faces cover fr/es/id accents.
const CJK = 'var(--cjk, "Noto Sans JP", "Noto Sans SC")';
const CJK_SERIF = 'var(--cjk-serif, "Shippori Mincho", "Noto Sans SC")';
const TAMIL = '"Noto Sans Tamil"';
export const fonts = {
  sansJP: `${CJK}, ${TAMIL}, sans-serif`,
  minchoJP: `${CJK_SERIF}, ${TAMIL}, serif`,
  serif: `"Cormorant Garamond", ${CJK_SERIF}, ${TAMIL}, serif`,
  display: `"Plus Jakarta Sans", ${CJK}, ${TAMIL}, sans-serif`,
};

/** CSS variables for the root of a reel in `lang`, so shared Han glyphs take the right regional shapes. */
export const cjkVars = (lang?: string): React.CSSProperties =>
  (lang === 'zh' ? { '--cjk': '"Noto Sans SC", "Noto Sans JP"', '--cjk-serif': '"Noto Sans SC", "Shippori Mincho"' } : {}) as React.CSSProperties;

const FACES = [
  '400 40px "Noto Sans JP"',
  '700 40px "Noto Sans JP"',
  '900 40px "Noto Sans JP"',
  '500 40px "Shippori Mincho"',
  '800 40px "Shippori Mincho"',
  '500 40px "Cormorant Garamond"',
  '600 40px "Cormorant Garamond"',
  'italic 500 40px "Cormorant Garamond"',
  '600 40px "Plus Jakarta Sans"',
  '800 40px "Plus Jakarta Sans"',
  '400 40px "Noto Sans SC"',
  '700 40px "Noto Sans SC"',
  '900 40px "Noto Sans SC"',
  '400 40px "Noto Sans Tamil"',
  '700 40px "Noto Sans Tamil"',
  '900 40px "Noto Sans Tamil"',
];

let loading: Promise<void> | null = null;

/**
 * Loads the stylesheet, then the glyph subsets needed for `text` in every face, and holds the
 * render until they are ready. Call once per composition with every string the video shows.
 */
export const loadFonts = (text: string) => {
  if (typeof document === 'undefined') return;
  if (!document.getElementById('reels-fonts')) {
    const link = document.createElement('link');
    link.id = 'reels-fonts';
    link.rel = 'stylesheet';
    link.href = staticFile('fonts/fonts.css');
    document.head.appendChild(link);
  }
  const sample = `${text}0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz@.,!?%+-—/：、。「」`;
  const handle = delayRender('Loading fonts');
  const sheet = new Promise<void>((resolve) => {
    const el = document.getElementById('reels-fonts') as HTMLLinkElement;
    if (el.sheet) resolve();
    else el.addEventListener('load', () => resolve(), { once: true });
  });
  loading = (loading ?? Promise.resolve())
    .then(() => sheet)
    .then(() => Promise.all(FACES.map((f) => document.fonts.load(f, sample))))
    .then(() => undefined);
  loading.then(() => continueRender(handle)).catch(() => continueRender(handle));
};
