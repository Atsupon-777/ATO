// A photo reel from a template (src/templates/photoreel-catalog.ts): 1-10 photos and a line about them;
// Gemini orders the photos, writes the title and captions, and picks where each camera move should aim.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { photoReelSchema, type PhotoReelProps } from '../src/photoreel.ts';
import { photoMotions, photoStyles, photoTemplates } from '../src/templates/photoreel-catalog.ts';
import { copyLanguage, fit, type Lang } from '../src/lang.ts';
import { askJson, generateMusic } from './gemini.ts';
import { publicDir } from './paths.ts';
import { Usage } from './usage.ts';

const planSchema = z.object({
  title: z.string().describe('the reel title, max 20 characters, stylish and specific'),
  subtitle: z.string().describe('one line under the title, max 30 characters'),
  order: z.array(z.number()).describe('the photo numbers (1-based) in the best story order; every photo exactly once'),
  photos: z
    .array(z.object({ n: z.number().describe('photo number, 1-based'), caption: z.string().describe('max 18 characters'), x: z.number().describe('0-1 horizontal centre of the subject'), y: z.number().describe('0-1 vertical centre of the subject') }))
    .describe('one entry per photo'),
  cta: z.string().describe('closing call to action, max 16 characters'),
  accent: z.string().describe('#RRGGBB accent colour taken from the photos, readable on the style background'),
  musicMood: z.string().describe('a few English words for the background music mood'),
});

export type PhotoBrief = {
  template: string;
  photos: string[];
  description: string;
  handle?: string;
  lang?: Lang;
  jobId?: string;
  onStep?: (step: number, total: number, label: string) => void;
};

export async function buildPhotoProps(brief: PhotoBrief) {
  const tpl = photoTemplates.find((t) => t.id === brief.template) ?? photoTemplates[0];
  const motion = photoMotions.find((m) => m.id === tpl.motion)!;
  const style = photoStyles.find((s) => s.id === tpl.style)!;
  const lang = brief.lang ?? 'ja';
  const usage = new Usage();
  const jobId = brief.jobId ?? `job-${Date.now().toString(36)}`;
  const dir = path.join(publicDir, 'jobs', jobId);
  const rel = (f: string) => `jobs/${jobId}/${f}`;
  await mkdir(dir, { recursive: true });
  if (!brief.photos.length) throw new Error('写真を1枚以上アップロードしてください');
  const files = await Promise.all(
    brief.photos.slice(0, 10).map(async (src, i) => {
      const f = `photo-${i + 1}${path.extname(src) || '.jpg'}`;
      await copyFile(src, path.join(dir, f));
      return f;
    }),
  );

  brief.onStep?.(1, 2, 'copy');
  const raw = await askJson({
    images: files.map((f) => path.join(dir, f)),
    jsonSchema: z.toJSONSchema(planSchema),
    usage,
    step: 'plan',
    prompt: [
      `You are the creative director of an Instagram photo reel made from these ${files.length} photos (numbered in the order given).`,
      `Look: ${motion.en} motion (${motion.desc}), ${style.en} type (${style.desc}).`,
      `What the owner says about them: ${brief.description || '(nothing; read it from the photos)'}`,
      `Write short, natural, scroll-stopping copy. ${copyLanguage(lang)} Keep every length limit.`,
    ].join('\n'),
  });
  const plan = planSchema.parse(raw);

  brief.onStep?.(2, 2, 'music');
  const bpm = tpl.motion === 'beatcut' ? 124 : tpl.motion === 'cinematic' || tpl.motion === 'polaroid' || tpl.motion === 'filmstrip' ? 88 : 108;
  const music = await generateMusic({
    prompt: `Instrumental background music for a short photo slideshow reel. Mood: ${plan.musicMood}. ${bpm} BPM, clear beat, no vocals, modern production.`,
    out: path.join(dir, 'music'),
    usage,
    step: 'music',
  }).then(
    (f) => rel(path.basename(f)),
    () => undefined,
  );

  const seen = new Set<number>();
  const order = [...plan.order, ...files.map((_, i) => i + 1)].filter((n) => n >= 1 && n <= files.length && !seen.has(n) && seen.add(n));
  const cut = (s: string, n: number) => s.slice(0, fit(lang, n));
  const props: PhotoReelProps = photoReelSchema.parse({
    photos: order.map((n) => {
      const p = plan.photos.find((x) => x.n === n);
      return { src: rel(files[n - 1]), caption: p ? cut(p.caption, 18) : undefined, focus: p ? { x: clamp01(p.x), y: clamp01(p.y) } : undefined };
    }),
    title: cut(plan.title, 20),
    subtitle: cut(plan.subtitle, 30),
    cta: cut(plan.cta, 16),
    handle: brief.handle?.slice(0, 30) || undefined,
    motion: tpl.motion,
    style: tpl.style,
    palette: { ...style.palette, accent: /^#[0-9a-f]{6}$/i.test(plan.accent) ? plan.accent : style.palette.accent },
    // Japanese and Chinese titles read better in Mincho than in a Latin serif.
    font: style.font === 'serif' && (lang === 'ja' || lang === 'zh') ? 'mincho' : style.font,
    bpm,
    music,
    lang,
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId, dir, props, usage: usage.toJSON() };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
