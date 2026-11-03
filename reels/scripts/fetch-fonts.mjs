// Downloads the Google Fonts this project uses into public/fonts and writes public/fonts/fonts.css,
// so renders never depend on fonts.googleapis.com being reachable. All families are SIL OFL.
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const FAMILIES = [
  'Noto+Sans+JP:wght@400;700;900',
  'Shippori+Mincho:wght@500;800',
  'Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600',
  'Plus+Jakarta+Sans:wght@600;800',
  // motion-graphics tone and manner: 丸ゴシック and 手描き風 (src/motion/theme.ts)
  'M+PLUS+Rounded+1c:wght@500;800',
  'Klee+One:wght@600',
  // Chinese and Tamil captions/copy (the app and videos support ja, en, fr, id, zh, es, ta).
  'Noto+Sans+SC:wght@400;700;900',
  'Noto+Sans+Tamil:wght@400;700;900',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const get = (url, out) => execFileSync('curl', ['-sSfL', '-A', UA, ...(out ? ['-o', out] : []), url], { maxBuffer: 1 << 26 });

await mkdir('public/fonts', { recursive: true });
let css = '';
for (const fam of FAMILIES) {
  const src = get(`https://fonts.googleapis.com/css2?family=${fam}&display=block`).toString();
  const urls = [...new Set(src.match(/https:\/\/fonts\.gstatic\.com\/[^)]+/g))];
  let local = src;
  for (const u of urls) {
    // some faces come from /l/font?kit=…: keep the name a plain file name (no ? or =) so it is served as a file
    const name = u.split('/').slice(-3).join('-').replace(/[?=&]/g, '_');
    get(u, `public/fonts/${name}`);
    local = local.replaceAll(u, `./${name}`);
  }
  css += local;
  console.log(fam, urls.length, 'files');
}
await writeFile('public/fonts/fonts.css', css);
