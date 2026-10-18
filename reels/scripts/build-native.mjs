// Builds the web app into app/native/www for the iPhone / Android app (Capacitor), then `npx cap sync` copies it in.
//   API_ORIGIN=https://reels.ato-sns.com node scripts/build-native.mjs
// The app bundles this page (App Review 4.2: not a wrapper around the website) and calls the server for
// everything else: API, job media, fonts and the gallery. No keys are bundled.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'app/web');
const out = path.join(root, 'app/native/www');
const API = (process.env.API_ORIGIN || 'https://reels.ato-sns.com').replace(/\/$/, '');

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(web, 'main.tsx')],
  bundle: true,
  outfile: path.join(out, 'app.js'),
  format: 'esm',
  jsx: 'automatic',
  minify: true,
  target: ['safari16', 'chrome110'],
  define: { 'process.env.NODE_ENV': '"production"', __API_ORIGIN__: JSON.stringify(API) },
  loader: { '.json': 'json' },
  logLevel: 'warning',
});

let html = await readFile(path.join(web, 'index.html'), 'utf8');
html = html
  // Draw under the status bar; the CSS pads with env(safe-area-inset-*).
  .replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"')
  // Fonts come from the server, like the rest of the media.
  .replace('href="/fonts/fonts.css"', `href="${API}/fonts/fonts.css"`)
  // No home-screen manifest or service worker inside the app.
  .replace(/<link rel="manifest"[^>]*>\n?/, '')
  .replace(/<script>\s*\/\/ Only on the website[\s\S]*?<\/script>\n?/, '');
await writeFile(path.join(out, 'index.html'), html);
await cp(path.join(web, 'icons'), path.join(out, 'icons'), { recursive: true });
await cp(path.join(web, 'pwa/favicon.svg'), path.join(out, 'favicon.svg'));
console.log(`app/native/www built for ${API}`);
