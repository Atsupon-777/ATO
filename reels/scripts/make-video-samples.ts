// Real renders for the video template gallery: each template is planned by the same AI planner the app uses,
// over one of the talking-head sources (scripts/make-talkers.ts), then rendered and encoded as its showcase sample.
//   NODE_USE_ENV_PROXY=1 node scripts/make-video-samples.ts [first|all|<template id>...]
//   first = one per edit type (normal tempo, styles rotating); all = every template not rendered yet.
// Output: public/showcase/tpl-<id>.mp4 + .jpg, and showcase/index.json updated.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { editTypes, videoStyles, videoTemplates } from '../src/effects/video-catalog.ts';
import { planEffectsReel } from '../server/effects.ts';
import { generateMusic } from '../server/gemini.ts';
import { matte } from '../server/matte.ts';
import { buildTalkProps } from '../server/talk.ts';
import { Usage } from '../server/usage.ts';
import { publicDir } from '../server/paths.ts';

const run = promisify(execFile);
const arg = process.argv.slice(2);
const showcaseDir = path.join(publicDir, 'showcase');
const tmp = path.join(publicDir, '..', 'out', 'samples');
await mkdir(tmp, { recursive: true });

const pick =
  arg[0] === 'all'
    ? videoTemplates
    : arg.length && arg[0] !== 'first'
      ? videoTemplates.filter((v) => arg.includes(v.id))
      : editTypes.map((t, i) => videoTemplates.find((v) => v.type === t.id && v.tempo === 'normal' && v.style === videoStyles[i % videoStyles.length].id)!);
const todo = pick.filter((v) => arg.length > 1 || !existsSync(path.join(showcaseDir, `tpl-${v.id}.mp4`)));
console.log(`${todo.length} templates to render`);

// One transcribed, matted talk per source, kept in public/jobs/sample-<name> so reruns skip the work.
const usage = new Usage();
const sources = (await readdir(path.join(publicDir, 'samples/talkers'))).filter((f) => f.endsWith('.mp4')).sort();
if (!sources.length) throw new Error('no talkers: run scripts/make-talkers.ts first');
const talks = [];
for (const f of sources) {
  const jobId = `sample-${path.basename(f, '.mp4')}`;
  const cache = path.join(publicDir, 'jobs', jobId, 'talk.json');
  if (!existsSync(cache)) {
    const t = await buildTalkProps({ video: path.join(publicDir, 'samples/talkers', f), jobId, lang: 'en' } as never);
    await matte(path.join(t.dir, 'source.mp4'), path.join(t.dir, 'matte.webm'), usage);
    await writeFile(cache, JSON.stringify({ jobId, dir: t.dir, video: t.props.video, words: t.props.words, duration: t.props.sourceDuration, language: t.language }));
  }
  talks.push(JSON.parse(await readFile(cache, 'utf8')));
}

// Music is shared by templates with the same style and tempo (it only depends on those).
const music = new Map<string, Promise<string | undefined>>();
// Lyria fails now and then; a second try usually works. An empty music path means the sample has none.
const musicFor = (talk: (typeof talks)[number], recipe: { id: string; mood?: string }, key: string) => {
  if (!music.has(key))
    music.set(
      key,
      generateMusic({
        prompt: `Instrumental background music for a short vertical social video. Mood: ${recipe.mood}. No vocals, loopable, modern production, leaves room for a voice over it.`,
        out: path.join(publicDir, 'jobs', 'sample-music', key),
        usage,
        step: 'music',
      })
        .catch(() =>
          generateMusic({
            prompt: `Instrumental background music for a short vertical social video. Mood: ${recipe.mood}. No vocals, loopable, modern production.`,
            out: path.join(publicDir, 'jobs', 'sample-music', key),
            usage,
            step: 'music',
          }),
        )
        .then(
        (f) => `jobs/sample-music/${path.basename(f)}`,
        () => undefined,
      ),
    );
  return music.get(key)!;
};
await mkdir(path.join(publicDir, 'jobs', 'sample-music'), { recursive: true });

// Music first: the bundle copies public/ (so jobs/sample-* reach staticFile), and it is made once.
const { recipeById } = await import('../src/effects/recipes.ts');
await Promise.all(todo.map((v, n) => musicFor(talks[n % talks.length], recipeById(v.id), `${v.style}-${v.tempo}`)));
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const index = new Set<string>(JSON.parse(await readFile(path.join(showcaseDir, 'index.json'), 'utf8')));
for (const [n, v] of todo.entries()) {
  const talk = talks[n % talks.length];
  const recipe = recipeById(v.id);
  const t0 = Date.now();
  try {
    const props = await planEffectsReel({ ...talk, recipe: v.id, lang: 'en', usage, music: (await musicFor(talk, recipe, `${v.style}-${v.tempo}`)) ?? '' });
    const inputProps = props as unknown as Record<string, unknown>;
    const composition = await selectComposition({ serveUrl, id: 'EffectsReel', inputProps, browserExecutable: process.env.REMOTION_BROWSER ?? null });
    const raw = path.join(tmp, `${v.id}.mp4`);
    await renderMedia({ serveUrl, composition, inputProps, codec: 'h264', crf: 20, scale: 2 / 3, outputLocation: raw, browserExecutable: process.env.REMOTION_BROWSER ?? null, chromiumOptions: { gl: 'angle' } });
    const out = path.join(showcaseDir, `tpl-${v.id}.mp4`);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-af', 'loudnorm=I=-14:TP=-1', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out]);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(3, composition.durationInFrames / 60)), '-i', out, '-frames:v', '1', '-q:v', '4', out.replace(/\.mp4$/, '.jpg')]);
    // keep a copy in the project folder: deploys rebuild public/showcase from there (scripts/make-showcase.py)
    for (const ext of ['.mp4', '.jpg']) await copyFile(out.replace(/\.mp4$/, ext), path.join('/mnt/project-files/reels-tests/templates', `tpl-${v.id}${ext}`)).catch(() => {});
    index.add(`tpl-${v.id}`);
    await writeFile(path.join(showcaseDir, 'index.json'), JSON.stringify([...index].sort()));
    console.log(`${n + 1}/${todo.length} ${v.id} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  } catch (e) {
    console.error(`${v.id} failed: ${(e as Error).message}`);
  }
}
console.log(JSON.stringify(usage.toJSON()));
