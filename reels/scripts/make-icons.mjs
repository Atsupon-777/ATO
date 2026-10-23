// Draws the app icon (three frames fanned out, the chosen one lit) and writes every size the web app,
// iPhone and Android builds use: header mark, favicon, home-screen icons, launcher icons and splash screens.
//   node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GROUND = '#0A0A0B';
const LIT = '#DFFF4F';

/** The mark in a 200x200 box: two outlined frames behind, the lit one in front with a play triangle. */
const mark = (back = '#5A5A63', stroke = 9) => `
  <rect x="28" y="46" width="62" height="112" rx="16" fill="none" stroke="${back}" stroke-width="${stroke}" transform="rotate(-14 59 102)"/>
  <rect x="110" y="46" width="62" height="112" rx="16" fill="none" stroke="${back}" stroke-width="${stroke}" transform="rotate(14 141 102)"/>
  <rect x="64" y="30" width="72" height="136" rx="18" fill="${LIT}"/>
  <path d="M92 80v44l32-22z" fill="${GROUND}"/>`;
/** The mark scaled around the middle of the box. */
const placed = (scale, back, stroke) => `<g transform="translate(100 100) scale(${scale}) translate(-100 -98)">${mark(back, stroke)}</g>`;
const svg = (body, w = 200, h = 200) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;

const rounded = (stroke = 9) => svg(`<rect width="200" height="200" rx="46" fill="${GROUND}"/>${placed(0.74, undefined, stroke)}`);
const square = (scale = 0.74) => svg(`<rect width="200" height="200" fill="${GROUND}"/>${placed(scale)}`);
const circle = () => svg(`<circle cx="100" cy="100" r="100" fill="${GROUND}"/>${placed(0.66)}`);
const foreground = () => svg(placed(0.86));
const solid = () => svg(`<rect width="200" height="200" fill="${GROUND}"/>`);
/** Splash: the mark alone on the ground, about a third of the short side. */
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.34;
  return svg(`<rect width="${w}" height="${h}" fill="${GROUND}"/><g transform="translate(${(w - s) / 2} ${(h - s) / 2}) scale(${s / 200})">${mark()}</g>`, w, h);
};

const b = await chromium.launch();
const page = await b.newPage();
const png = async (markup, w, h, file, opaque = false) => {
  await page.setViewportSize({ width: w, height: h });
  const inner = markup.replace(/width="\d+(\.\d+)?" height="\d+(\.\d+)?"/, `width="${w}" height="${h}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${inner}</body></html>`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  // The App Store refuses icons with an alpha channel.
  if (opaque) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-pix_fmt', 'rgb24', file + '.tmp.png']), execFileSync('mv', [file + '.tmp.png', file]);
};
const size = (f) => {
  const d = readFileSync(f);
  return [d.readUInt32BE(16), d.readUInt32BE(20)];
};

// Web: header mark and favicon (SVG), home-screen icons (PNG).
writeFileSync(path.join(root, 'app/web/icons/icon.svg'), rounded() + '\n');
writeFileSync(path.join(root, 'app/web/pwa/favicon.svg'), rounded(12) + '\n');
const pwa = path.join(root, 'app/web/pwa');
await png(rounded(12), 32, 32, `${pwa}/favicon-32.png`);
await png(square(), 180, 180, `${pwa}/apple-touch-icon.png`, true);
await png(rounded(), 192, 192, `${pwa}/icon-192.png`);
await png(rounded(), 512, 512, `${pwa}/icon-512.png`);
await png(square(0.6), 512, 512, `${pwa}/icon-maskable-512.png`, true);

// iPhone: one 1024 icon, splash screens.
const ios = path.join(root, 'ios/App/App/Assets.xcassets');
await png(square(), 1024, 1024, `${ios}/AppIcon.appiconset/AppIcon-512@2x.png`, true);
for (const f of readdirSync(`${ios}/Splash.imageset`).filter((f) => f.endsWith('.png'))) {
  const [w, h] = size(`${ios}/Splash.imageset/${f}`);
  await png(splash(w, h), w, h, `${ios}/Splash.imageset/${f}`, true);
}

// Android: launcher icons per density, adaptive foreground/background, splash screens.
const res = path.join(root, 'android/app/src/main/res');
for (const d of readdirSync(res).filter((d) => d.startsWith('mipmap-') && !d.includes('anydpi'))) {
  const [w] = size(`${res}/${d}/ic_launcher.png`);
  await png(rounded(), w, w, `${res}/${d}/ic_launcher.png`);
  await png(circle(), w, w, `${res}/${d}/ic_launcher_round.png`);
  await png(foreground(), w, w, `${res}/${d}/ic_launcher_foreground.png`);
  await png(solid(), w, w, `${res}/${d}/ic_launcher_background.png`);
}
for (const d of readdirSync(res).filter((d) => d.startsWith('drawable') && statSync(`${res}/${d}`).isDirectory())) {
  const f = `${res}/${d}/splash.png`;
  try {
    const [w, h] = size(f);
    await png(splash(w, h), w, h, f);
  } catch {}
}
const bg = `${res}/values/ic_launcher_background.xml`;
writeFileSync(bg, readFileSync(bg, 'utf8').replace(/#[0-9A-Fa-f]{6}/, GROUND));
await b.close();
console.log('icons written');
