import { continueRender, delayRender, staticFile } from 'remotion';

// Fonts are self-hosted from public/fonts (run `npm run fonts` once), so a render never depends on
// Google's servers. All families are SIL Open Font License and may be embedded in commercial video.
export const fonts = {
  sansJP: '"Noto Sans JP", sans-serif',
  minchoJP: '"Shippori Mincho", serif',
  serif: '"Cormorant Garamond", "Shippori Mincho", serif',
  display: '"Plus Jakarta Sans", "Noto Sans JP", sans-serif',
};

const FACES = [
  '400 40px "Noto Sans JP"',
  '700 40px "Noto Sans JP"',
  '900 40px "Noto Sans JP"',
  '500 40px "Shippori Mincho"',
  '800 40px "Shippori Mincho"',
  '500 40px "Cormorant Garamond"',
  '600 40px "Cormorant Garamond"',
  '600 40px "Plus Jakarta Sans"',
  '800 40px "Plus Jakarta Sans"',
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
