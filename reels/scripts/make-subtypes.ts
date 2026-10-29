// Renders the gallery's sub-type samples: one short clip per caption style, camera move,
// transition, grade and texture, so every sub-type card shows what that option really outputs.
//   node scripts/make-subtypes.ts <outDir> [ja|en]
// Writes <outDir>/subtypes-<lang>.mp4 and <outDir>/subtypes-<lang>.json (clip key → start, duration),
// which scripts/make-showcase.py slices into public/showcase/<key>[.<lang>].mp4.
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { cameraMoves, captionStyles, grades, textures, transitions } from '../src/effects/axes.ts';
import type { EffectSegment, EffectsReelProps } from '../src/schemas.ts';

const [outDir = 'out', lang = 'ja'] = process.argv.slice(2);
const LINES: Record<string, [string, string][]> = {
  ja: [['毎日のリールを3分で', 'リール'], ['見た人が止まる動画', '止まる'], ['写真1枚から完成', '1枚'], ['いま一番売れてる', '一番'], ['結論から言います', '結論'], ['知らないと損する話', '損'], ['朝のルーティン', 'ルーティン'], ['新作が届きました', '新作']],
  en: [['Your daily reel in 3 minutes', 'reel'], ['Stop the scroll', 'scroll'], ['One photo and done', 'photo'], ['Best seller right now', 'Best'], ['Here is the secret', 'secret'], ['Do not miss this', 'miss'], ['My morning routine', 'routine'], ['The new drop is here', 'new']],
};
const CARDS: Record<string, string[]> = {
  ja: ['新作コレクション', '撮影の裏側', 'リールを伸ばす5つのコツ', 'お客さまの声', '今週のおすすめ', '限定セール'],
  en: ['New collection', 'Behind the scenes', '5 tips for better reels', 'Customer stories', 'Pick of the week', 'Limited sale'],
};
const lines = LINES[lang] ?? LINES.en;
const cards = CARDS[lang] ?? CARDS.en;

const segs: EffectSegment[] = [];
const clips: Record<string, { start: number; dur: number }> = {};
let t = 0; // source time (a long silent black clip)
let out = 0; // output time
const add = (seg: Omit<EffectSegment, 'start' | 'end' | 'emphasis' | 'items' | 'images' | 'values'> & Partial<EffectSegment>, dur: number) => {
  const [caption, word] = lines[segs.length % lines.length];
  segs.push({ emphasis: [word], items: [], images: [], values: [], caption, ...seg, start: t, end: t + dur } as EffectSegment);
  t += dur;
  out += dur;
};
const clip = (key: string, start: number) => (clips[key] = { start: Math.round(start * 30) / 30, dur: Math.round((out - start) * 30) / 30 });

for (const c of captionStyles) {
  const s = out;
  add({ effect: 'digitalZoom', style: { caption: c, camera: 'still', transition: 'cut' } }, 3);
  clip(`cap-${c}`, s);
}
for (const m of cameraMoves) {
  const s = out;
  add({ effect: 'couchWall', items: cards, style: { caption: 'pop', camera: m, transition: 'cut' } }, 3.2);
  clip(`cam-${m}`, s);
}
for (const x of transitions) {
  const s = out;
  add({ effect: 'paperCut', text: lang === 'ja' ? '新作' : 'NEW', style: { caption: 'pop', camera: 'still', transition: 'cut' } }, 1.4);
  add({ effect: 'uiWorld', style: { caption: 'pop', camera: 'still', transition: x } }, 1.8);
  clip(`tr-${x}`, s);
}
for (const g of grades) {
  const s = out;
  add({ effect: 'paperCut', text: lang === 'ja' ? '春の新色' : 'SPRING', style: { caption: 'pop', camera: 'push', transition: 'cut', grade: g } }, 2.6);
  clip(`gr-${g}`, s);
}
for (const x of textures.filter((x) => x !== 'none')) {
  const s = out;
  add({ effect: 'glassType', text: lang === 'ja' ? '質感' : 'TEXTURE', style: { caption: 'pop', camera: 'push', transition: 'cut', texture: x } }, 2.6);
  clip(`tx-${x}`, s);
}

const black = path.resolve('public/samples/black-long.mp4');
if (!existsSync(black))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=black:s=1080x1920:r=30:d=${Math.ceil(t) + 2}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '35', '-pix_fmt', 'yuv420p', '-g', '30', black]);
const props: EffectsReelProps = {
  video: 'samples/black-long.mp4',
  focusX: 0.5,
  counter: false,
  palette: { accent: '#E9F06B', ink: '#16161A', paper: '#F4F1E8' },
  segments: segs,
};
const propsFile = path.join(outDir, `subtypes-${lang}.props.json`);
writeFileSync(propsFile, JSON.stringify(props));
writeFileSync(path.join(outDir, `subtypes-${lang}.json`), JSON.stringify(clips, null, 1));
console.log(segs.length, 'segments', Object.keys(clips).length, 'clips', t.toFixed(1), 's');
execFileSync('node', ['scripts/render.mjs', 'EffectsReel', propsFile, path.join(outDir, `subtypes-${lang}.mp4`)], { stdio: 'inherit' });
