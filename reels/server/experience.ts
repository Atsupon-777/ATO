// An experience, tour or place → a wordless short film (ExperienceFilm), end to end:
// plan and copy (Gemini, JSON) → one key still that sets the cast and the place (Nano Banana) → the other stills
// with the key still as reference → Veo shots for every beat (the client's own photos can be first frames, their
// own videos play as they are) and a Lyria music bed at the same time → ExperienceFilm props, validated → render.
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';
import { experienceBeats, experienceFilmSchema, type ExperienceFilmProps } from '../src/schemas.ts';
import { copyLanguage, fit, isCJK, type Lang } from '../src/lang.ts';
import { askJson, editImage, generateMusic, imageToVideo } from './gemini.ts';
import { goalLine } from './goals.ts';
import { publicDir } from './paths.ts';
import { renderTemplate } from './render.ts';
import { Usage } from './usage.ts';

const run = promisify(execFile);

/** Colour worlds the planner picks from: grade over the shots, end-card palette. */
export const LOOKS = {
  golden: { grade: 'warm', palette: { accent: '#E2B66E', glow: '#FFD49A', base: '#0B0907', ink: '#F7F0E4' }, note: 'golden morning or evening light, warm and nostalgic' },
  verdant: { grade: 'verdant', palette: { accent: '#C9B27C', glow: '#FFE7B0', base: '#0B110C', ink: '#F3F0E6' }, note: 'green, forests, gardens, tea fields, mountains' },
  ocean: { grade: 'cool', palette: { accent: '#8FD3E8', glow: '#CFF4FF', base: '#06121A', ink: '#EEF7FA' }, note: 'sea, diving, rivers, snow, cool blue air' },
  night: { grade: 'noir', palette: { accent: '#D9A55B', glow: '#FFC07A', base: '#08070A', ink: '#F4EEE6' }, note: 'night, lanterns, bars, onsen at dusk, candlelight' },
  airy: { grade: 'neutral', palette: { accent: '#B8925A', glow: '#FFFFFF', base: '#14110E', ink: '#FBF8F2' }, note: 'bright, clean, modern, white interiors, daylight' },
} as const;
export type Look = keyof typeof LOOKS;

const NO_TEXT = 'No readable text, signs, logos, captions or watermarks anywhere in the frame.';
const NEGATIVE =
  'hard cuts, scene changes, smoke or steam appearing from nowhere, morphing, warped faces, distorted hands, extra limbs, extra fingers, deformed bicycle, bent wheels, extra wheels, melting objects, changing text, readable signs, subtitles, watermark, flicker, low quality';

const planSchema = z.object({
  title: z.string().describe('name of the experience for the end card in the target language, evocative and concrete, max 14 characters'),
  tagline: z.string().describe('one line for the end card in the target language, quiet and emotional, max 18 characters'),
  placeKicker: z.string().describe('the place in Latin letters for a small uppercase kicker, e.g. "Kyoto · Arashiyama", max 24 characters'),
  look: z.enum(Object.keys(LOOKS) as [Look, ...Look[]]).describe(`colour world of the film: ${Object.entries(LOOKS).map(([k, v]) => `${k} = ${v.note}`).join('; ')}`),
  cast: z
    .string()
    .describe('English description of the people who appear across the film (for example "a Japanese guide in a navy jacket and two smiling travellers in their 30s, a man and a woman, in light outdoor clothes"), so every scene shows the same people. Adults only'),
  scenes: z
    .array(
      z.object({
        beat: z.enum(experienceBeats).describe(
          'hook: one striking, beautiful moment that stops the scroll; arrival: the place itself as you arrive, wide and atmospheric; activity: the experience in motion, people enjoying it (POV or tracking); sensory: a macro detail you can almost touch, hear or taste; peak: the high point, the view or the moment everyone came for',
        ),
        media: z.number().int().describe('index of the client MEDIA image to build this scene on (its real place and people), or -1 for a scene the AI creates. Use each media at most once, and only where it fits the beat'),
        imagePrompt: z
          .string()
          .describe(
            'English prompt for a photorealistic 9:16 cinematic still of this scene. Concrete subject, lens and light (for example "35mm, low morning sun from behind, long shadows"). Real, believable, never staged-looking. Prefer people seen from behind, in profile or at a distance over faces in close-up. No readable signs or text',
          ),
        motionPrompt: z
          .string()
          .describe(
            'English prompt for an 8s image-to-video shot of that still: one slow, smooth camera move (tracking alongside, slow push-in, gentle crane, drone pull-back) plus one natural motion (riders gliding away down the lane, steam rising, water rippling, leaves falling, a hand pouring tea). One continuous take with no cuts. Simple motions the video model renders cleanly; never close-ups of pedalling feet, chains or spinning spokes, no smoke, steam, breath or mist appearing out of nothing (only what is already in the still), and no one talking to camera',
          ),
        line: z.string().describe('one line of copy in the target language, max 16 characters; when longer than 8 characters put a natural break (、) in it, since Japanese copy runs vertically and splits there; the five lines read as one short story of the day. Empty string for the peak scene is allowed when the image says it all'),
        kicker: z.string().describe('short English label, 1-3 words, e.g. "Golden hour"'),
      }),
    )
    .describe('exactly 5 scenes in the order hook, arrival, activity, sensory, peak. Only what is true for this experience; nothing promised beyond the facts'),
  chips: z.array(z.string()).describe('up to 3 very short facts for the end card in the target language, max 10 characters each, ONLY from the facts given (duration, price, group size, language, what is included). Empty if no facts are given'),
  cta: z.string().describe('call to action in the target language, max 12 characters, e.g. 空き枠を見る / Book a ride'),
  musicPrompt: z
    .string()
    .describe('English prompt for a 30s instrumental music bed for this film: genre and instruments that suit the place and the feeling of the experience, tempo 70-100 BPM, starting sparse, building gently to a warm swell at about 14 seconds (the peak), then resolving softly. No vocals'),
});
type Plan = z.infer<typeof planSchema>;

export type ExperienceBrief = {
  /** The business, e.g. Rinrin Cycling Kyoto. */
  brand: string;
  /** What the experience is, in the client's words. */
  description: string;
  /** Where it happens. */
  place: string;
  /** Facts the end card may use (duration, price, group size, language, inclusions). Nothing else is claimed. */
  facts?: string;
  /** The client's own photos and videos (local paths). */
  photos?: string[];
  videos?: string[];
  /** Booking line: a URL, a phone number or "link in bio". */
  url?: string;
  cta?: string;
  handle?: string;
  lang?: Lang;
  /** What the reel is for (server/goals.ts), picked on the home screen. */
  goal?: string;
  jobId?: string;
  onStep?: (step: number, total: number, label: string) => void;
  /** false: stop after building props, so the editor can preview and tweak before rendering. */
  render?: boolean;
};

/** Seconds on screen, playback rate and trim per beat: Veo's calm middle, a little slow motion. */
const TIMING: Record<(typeof experienceBeats)[number], { seconds: number; rate: number; trim: number; kind: 'hook' | 'mood' | 'moment' | 'craft' | 'hero' }> = {
  hook: { seconds: 3, rate: 0.8, trim: 0.4, kind: 'hook' },
  arrival: { seconds: 3.4, rate: 0.85, trim: 1, kind: 'mood' },
  activity: { seconds: 3.6, rate: 0.85, trim: 1, kind: 'moment' },
  sensory: { seconds: 3, rate: 0.75, trim: 0.8, kind: 'craft' },
  peak: { seconds: 4.4, rate: 0.85, trim: 0.8, kind: 'hero' },
};

const exists = (f: string) => access(f).then(() => true, () => false);

/** A frame from the middle-ish of a video, for the planner to see. */
async function frameOf(video: string, out: string) {
  if (await exists(out)) return out;
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]);
  const at = Math.min(2, (Number(stdout.trim()) || 2) / 3);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(at), '-i', video, '-frames:v', '1', '-q:v', '3', out]);
  return out;
}

/**
 * Times (seconds) where a generated clip jumps: the video model sometimes cuts to a new angle mid-clip. A jump is a
 * frame whose scene score stands far above the clip's usual frame-to-frame change.
 */
export async function jumpsOf(video: string): Promise<{ jumps: number[]; duration: number }> {
  const { stderr } = await run(
    'ffmpeg',
    ['-hide_banner', '-i', video, '-an', '-vf', "scale=180:-1,select='gte(scene,0)',metadata=print:key=lavfi.scene_score", '-f', 'null', '-'],
    { maxBuffer: 32 << 20 },
  );
  const rows = [...stderr.matchAll(/pts_time:([\d.]+)[\s\S]*?lavfi\.scene_score=([\d.]+)/g)].map((m) => ({ t: Number(m[1]), s: Number(m[2]) }));
  const sorted = rows.map((r) => r.s).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const jumps = rows.filter((r) => r.t > 0.15 && r.s > Math.max(0.035, median * 4)).map((r) => r.t);
  return { jumps, duration: rows.at(-1)?.t ?? 8 };
}

/** Where to start a slice of `need` seconds: the planned start if no jump falls inside, else the nearest clean stretch. */
export function calmTrim(want: number, need: number, jumps: number[], duration: number) {
  const ok = (t: number) => t >= 0 && t + need <= duration && !jumps.some((j) => j > t - 0.2 && j < t + need + 0.2);
  if (ok(want)) return want;
  const options = [0, ...jumps.map((j) => j + 0.25)].flatMap((t) => [t, t + 0.3]).filter(ok);
  return options.sort((a, b) => Math.abs(a - want) - Math.abs(b - want))[0] ?? want;
}

async function sizeOf(image: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', image]);
  const [w, h] = stdout.trim().split(',').map(Number);
  return { w, h };
}

export async function buildExperienceFilm(brief: ExperienceBrief) {
  const lang = brief.lang ?? 'ja';
  const usage = new Usage();
  const TOTAL = 4;
  const step = (n: number, label: string) => {
    console.log(`${n}/${TOTAL} ${label}`);
    brief.onStep?.(n, TOTAL, label);
  };
  const jobId = brief.jobId ?? `job-${Date.now().toString(36)}`;
  const dir = path.join(publicDir, 'jobs', jobId);
  const rel = (f: string) => `jobs/${jobId}/${f}`;
  await mkdir(dir, { recursive: true });

  // The client's media: photos as they are, videos as one frame each for the planner.
  const photos = (brief.photos ?? []).slice(0, 6);
  const videos = (brief.videos ?? []).slice(0, 4);
  const media: { kind: 'photo' | 'video'; file: string; view: string }[] = [
    ...photos.map((f) => ({ kind: 'photo' as const, file: f, view: f })),
    ...(await Promise.all(videos.map(async (f, i) => ({ kind: 'video' as const, file: f, view: await frameOf(f, path.join(dir, `media-v${i}.jpg`)) })))),
  ];

  step(1, 'plan and copy');
  const planFile = path.join(dir, 'plan.json');
  const raw = (await exists(planFile))
    ? JSON.parse(await readFile(planFile, 'utf8'))
    : await askJson({
        images: media.map((m) => m.view),
        jsonSchema: z.toJSONSchema(planSchema),
        usage,
        step: 'plan',
        temperature: 0.7,
        prompt: [
          'You are the director of a wordless, cinematic short film (an Instagram reel, about 20 seconds, no voice) that sells an experience by making the viewer feel they are already there.',
          `Business: ${brief.brand}. Experience: ${brief.description}. Place: ${brief.place}.`,
          `Facts you may use (do not claim anything else: no numbers, awards, prices or promises that are not listed): ${brief.facts || '(none)'}`,
          media.length
            ? `The client sent ${media.length} MEDIA images (in order, index 0 first: ${media.map((m, i) => `${i} = ${m.kind === 'video' ? 'a frame of their video' : 'their photo'}`).join(', ')}). Build scenes on them where they fit, so the film shows the real place; let the AI fill the beats they do not cover, in the same look.`
            : 'There are no client photos: create every scene, true to how this kind of experience really looks in this place.',
          `${copyLanguage(lang)}`,
          goalLine(brief.goal),
          'Story: hook (a striking moment) → arrival (the place) → activity (people enjoying it, in motion) → sensory (a detail you can feel) → peak (the view or moment everyone came for). Keep the same people, clothes, equipment and time of day across every scene, and keep each scene simple enough to film cleanly.',
        ].join('\n'),
      });
  const plan: Plan = planSchema.parse(raw);
  // exactly one scene per beat, in story order
  const scenes = experienceBeats.map((b, i) => plan.scenes.find((s) => s.beat === b) ?? { ...plan.scenes[i % plan.scenes.length], beat: b });
  await writeFile(planFile, JSON.stringify(plan, null, 2));
  const look = LOOKS[plan.look] ?? LOOKS.golden;

  // Each scene gets its first frame: the client's video as is, the client's photo reframed to 9:16, or an AI still.
  step(2, 'scene stills');
  const used = new Set<number>();
  const mediaOf = (k: number) => (k >= 0 && k < media.length && !used.has(k) ? (used.add(k), media[k]) : undefined);
  const assigned = scenes.map((s) => mediaOf(s.media));
  const refs = photos.slice(0, 2);
  const look9x16 = 'Vertical 9:16, photorealistic, cinematic film still, natural colour grade, shallow depth of field. ' + NO_TEXT;
  const castLine = `The people: ${plan.cast}.`;
  const aiStill = (i: number, extra: string[]) =>
    editImage({
      input: extra,
      out: path.join(dir, `scene-${i + 1}.png`),
      prompt: [
        `A cinematic still from a short film about "${brief.description}" by ${brief.brand} in ${brief.place}: ${scenes[i].imagePrompt}`,
        castLine,
        extra.length ? 'Use the reference images for the exact place, people, clothes, equipment, light and colour; this is the same day, the same people.' : '',
        look9x16,
      ]
        .filter(Boolean)
        .join('\n'),
      usage,
      step: `scene still ${i + 1}`,
    });
  const firstFrame = async (i: number, extra: string[]): Promise<string | null> => {
    const out = path.join(dir, `scene-${i + 1}.png`);
    if (await exists(out)) return out;
    const m = assigned[i];
    if (m?.kind === 'video') return null;
    if (m?.kind === 'photo') {
      const { w, h } = await sizeOf(m.file);
      if (w / h <= 0.8) {
        // already portrait: crop to 9:16 without touching the picture
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', m.file, '-vf', "crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',scale=1080:1920", out]);
        return out;
      }
      return editImage({
        input: [m.file],
        out,
        prompt: `Recompose this real photograph into a vertical 9:16 frame for a cinematic film. Keep the real place, people and objects exactly as they are; extend the scene naturally above and below. ${NO_TEXT}`,
        usage,
        step: `reframe photo ${i + 1}`,
      });
    }
    return aiStill(i, extra);
  };
  // The activity scene (the people, in the place) is made first; the others take it as reference, so cast and place match.
  const free = scenes.map((_, i) => i).filter((i) => assigned[i]?.kind !== 'video');
  const keyIdx = free.find((i) => scenes[i].beat === 'activity') ?? free[0] ?? -1;
  const key = keyIdx >= 0 ? await firstFrame(keyIdx, refs) : null;
  const stills = await Promise.all(scenes.map((_, i) => (i === keyIdx ? key : firstFrame(i, [...refs, ...(key ? [key] : [])].slice(0, 3)))));

  // All Veo shots and the music bed at once. Files already made are reused when a job is re-run.
  step(3, 'motion clip (Veo)');
  const music = (async () => {
    for (const f of ['music.mp3', 'music.wav']) if (await exists(path.join(dir, f))) return rel(f);
    try {
      return rel(path.basename(await generateMusic({ prompt: plan.musicPrompt, out: path.join(dir, 'music'), usage, step: 'music' })));
    } catch (e) {
      console.warn(`music: ${(e as Error).message}; the film plays with the clips' own sound only`);
      return undefined;
    }
  })();
  const clips = await Promise.all(
    scenes.map(async (s, i) => {
      const m = assigned[i];
      if (m?.kind === 'video') {
        const file = `scene-${i + 1}${path.extname(m.file).toLowerCase() || '.mp4'}`;
        if (!(await exists(path.join(dir, file)))) await copyFile(m.file, path.join(dir, file));
        return { src: rel(file), own: true, trim: 0.3 };
      }
      const file = `scene-${i + 1}.mp4`;
      if (!(await exists(path.join(dir, file)))) {
        // the sensory detail is short on screen: a 6 s clip (720p) is plenty and costs less
        const seconds = s.beat === 'sensory' ? 6 : 8;
        await imageToVideo({
          image: stills[i]!,
          out: path.join(dir, file),
          seconds,
          prompt: `${s.motionPrompt} One continuous shot, no cuts. Slow, cinematic, real-world physics. Faces, hands, bicycles and objects keep their exact shape; nothing morphs. No text appears.`,
          negativePrompt: NEGATIVE,
          usage,
          step: `scene clip ${i + 1}`,
        });
      }
      // the slice the film plays must not straddle a cut the model put in the clip
      const t = TIMING[s.beat];
      const { jumps, duration } = await jumpsOf(path.join(dir, file)).catch(() => ({ jumps: [] as number[], duration: 8 }));
      if (jumps.length) console.log(`scene ${i + 1}: cut at ${jumps.map((j) => j.toFixed(2)).join(', ')}s`);
      return { src: rel(file), own: false, trim: calmTrim(t.trim, t.seconds * t.rate, jumps, duration) };
    }),
  );
  const musicFile = await music;

  step(4, brief.render === false ? 'build props' : 'render');
  const vertical = isCJK(lang);
  const props: ExperienceFilmProps = experienceFilmSchema.parse({
    brand: brief.brand.slice(0, 24),
    title: plan.title.slice(0, fit(lang, 15)),
    tagline: plan.tagline.slice(0, fit(lang, 22)),
    place: plan.placeKicker.slice(0, 32),
    lang,
    vertical,
    shots: scenes.map((s, i) => {
      const t = TIMING[s.beat];
      const own = clips[i].own;
      return {
        src: clips[i].src,
        kind: t.kind,
        beat: s.beat,
        seconds: t.seconds,
        trimStart: Math.round(clips[i].trim * 100) / 100,
        rate: own ? 1 : t.rate,
        audio: own ? 0.25 : 0.45,
        line: s.line.slice(0, fit(lang, 22)),
        kicker: i === 0 ? '' : s.kicker.slice(0, 24),
        focusY: 0.5,
      };
    }),
    chips: (plan.chips ?? []).filter(Boolean).slice(0, 3).map((c) => c.slice(0, 16)),
    cta: (brief.cta || plan.cta).slice(0, 30),
    url: (brief.url ?? '').slice(0, 40),
    handle: (brief.handle ?? '').slice(0, 30),
    ...(musicFile ? { music: musicFile } : {}),
    musicVolume: 0.8,
    grade: look.grade,
    type: vertical ? 'mincho' : 'serif',
    palette: look.palette,
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  if (brief.render === false) return { jobId, dir, out: null, props, usage: usage.toJSON(), render: null };
  const out = path.join(dir, 'reel.mp4');
  const result = await renderTemplate('ExperienceFilm', props, out);
  return { jobId, dir, out, props, usage: usage.toJSON(), render: result };
}
