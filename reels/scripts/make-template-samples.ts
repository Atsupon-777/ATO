// Real renders for the photo and service template gallery. Each template is its motion's / layout's sample
// props (props/photo-<motion>.json, props/service-<layout>.json) set to that template's photo count, screen and
// style, so every card shows what that exact template makes.
//   REMOTION_BROWSER=... node scripts/make-template-samples.ts [photo|service|all] [--redo] [id...]
// Output: public/showcase/tpl-<id>.mp4 + .jpg (and a copy in /mnt/project-files/reels-tests/templates).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { photoStyles, photoTemplates } from '../src/templates/photoreel-catalog.ts';
import { serviceTemplates } from '../src/templates/servicereel-catalog.ts';

const run = promisify(execFile);
const args = process.argv.slice(2);
const kind = ['photo', 'service', 'all'].includes(args[0]) ? args[0] : 'all';
const redo = args.includes('--redo');
const only = args.filter((a) => a.startsWith('photo-') || a.startsWith('svc-'));
const showcaseDir = path.resolve('public/showcase');
const keep = '/mnt/project-files/reels-tests/templates';
const tmp = path.resolve('out/samples');
await mkdir(tmp, { recursive: true });

// Varied genres, so neighbouring cards in the grid never look alike.
const bank = ['travel', 'ramen', 'fashion', 'cafe', 'beauty', 'interior', 'sushi', 'florist', 'cat', 'sneaker', 'fitness', 'matcha', 'puppy', 'serum', 'blonde', 'creator'].map(
  (n) => `samples/photos/${n}.jpg`,
);

type Job = { id: string; comp: string; props: Record<string, unknown> };
const jobs: Job[] = [];
if (kind !== 'service')
  for (const [i, t] of photoTemplates.entries()) {
    const base = JSON.parse(await readFile(`props/photo-${t.motion}.json`, 'utf8'));
    const st = photoStyles.find((s) => s.id === t.style)!;
    const photos = [...base.photos];
    // more photos than the sample has: continue from the bank, starting at a different place per template
    for (let k = 0; photos.length < t.count; k++) photos.push({ src: bank[(i * 3 + k) % bank.length] });
    jobs.push({
      id: t.id,
      comp: 'PhotoReel',
      props: { ...base, photos: photos.slice(0, t.count), style: t.style, palette: t.style === base.style ? base.palette : st.palette, font: t.style === base.style ? base.font : st.font },
    });
  }
if (kind !== 'photo')
  for (const t of serviceTemplates) {
    const base = JSON.parse(await readFile(`props/service-${t.layout}.json`, 'utf8'));
    jobs.push({ id: t.id, comp: 'ServiceReel', props: { ...base, screen: t.screen, style: t.style } });
  }
const todo = jobs.filter((j) => (!only.length || only.includes(j.id)) && (redo || !existsSync(path.join(showcaseDir, `tpl-${j.id}.mp4`))));
console.log(`${todo.length} templates to render`);

const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const indexFile = path.join(showcaseDir, 'index.json');
const index = new Set<string>(JSON.parse(await readFile(indexFile, 'utf8')));
await mkdir(keep, { recursive: true }).catch(() => {});
for (const [n, j] of todo.entries()) {
  const t0 = Date.now();
  try {
    const composition = await selectComposition({ serveUrl, id: j.comp, inputProps: j.props, browserExecutable: process.env.REMOTION_BROWSER ?? null });
    const raw = path.join(tmp, `${j.id}.mp4`);
    await renderMedia({ serveUrl, composition, inputProps: j.props, codec: 'h264', crf: 20, scale: 2 / 3, outputLocation: raw, browserExecutable: process.env.REMOTION_BROWSER ?? null, chromiumOptions: { gl: 'angle' } });
    const out = path.join(showcaseDir, `tpl-${j.id}.mp4`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-14:TP=-1', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(4, composition.durationInFrames / 60)), '-i', out, '-frames:v', '1', '-q:v', '4', out.replace(/\.mp4$/, '.jpg')]);
    for (const ext of ['.mp4', '.jpg']) await copyFile(out.replace(/\.mp4$/, ext), path.join(keep, `tpl-${j.id}${ext}`)).catch(() => {});
    index.add(`tpl-${j.id}`);
    await writeFile(indexFile, JSON.stringify([...index].sort()));
    console.log(`${n + 1}/${todo.length} ${j.id} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    console.error(`${j.id} failed: ${(e as Error).message}`);
  }
}
