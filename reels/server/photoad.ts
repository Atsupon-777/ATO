// One product photo → a short ad where the product itself moves (PhotoAdFilm), end to end:
// plan (Gemini, JSON) → a pack-shot keyframe in the ad's world (Nano Banana, the photo as the product reference)
// → the other keyframes with the photo + pack shot (+ the model) as references, so the bottle, label, set and
// person stay the same → one image-to-video shot per keyframe (Gemini Omni: liquid physics, hands, skin) and a
// Lyria music bed at the same time → matched cuts (liquid → skin), small type, an end card over the pack shot.
// Every file is reused when a job is re-run, so one shot can be redone by deleting its file.
import { execFile } from 'node:child_process';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import path from 'node:path';
import { z } from 'zod';
import { photoAdBeats, photoAdSchema, type PhotoAdProps } from '../src/schemas.ts';
import { copyLanguage, fit, isCJK, type Lang } from '../src/lang.ts';
import { askJson, editImage, generateMusic, imageToVideo } from './gemini.ts';
import { goalLine } from './goals.ts';
import { calmTrim, jumpsOf } from './experience.ts';
import { publicDir } from './paths.ts';
import { renderLocal } from './render.ts';
import { Usage } from './usage.ts';

type Beat = (typeof photoAdBeats)[number];

const KEEP_PRODUCT =
  'The product must be exactly the one in the reference photo: identical bottle shape, proportions, glass finish (frosted or clear) and its colour tint, cap, liquid colour, label size and position, and the same label text and typography letter for letter. Do not redesign it, do not add or change any lettering.';
const NO_TEXT = 'No added text, captions, logos or watermarks; the only lettering in the frame is the product label itself.';
const NEGATIVE =
  'label text changing, warped or melting letters, deformed bottle, bottle changing shape, extra bottles, morphing, extra fingers, distorted hands, warped face, plastic skin, liquid flowing upward, liquid appearing from nowhere, hard cuts, scene changes, camera zoom only, still image, flicker, subtitles, watermark';

/** Seconds on screen, playback rate, where to start in the clip, the generated clip length, and how the shot comes in. */
const TIMING: Record<Beat, { seconds: number; rate: number; trim: number; clipSeconds: 4 | 6 | 8; enter: 'cut' | 'dissolve' }> = {
  splash: { seconds: 3.2, rate: 0.9, trim: 0.5, clipSeconds: 6, enter: 'cut' },
  texture: { seconds: 2.4, rate: 0.9, trim: 0.8, clipSeconds: 6, enter: 'cut' },
  bridge: { seconds: 2.6, rate: 0.9, trim: 0, clipSeconds: 6, enter: 'cut' },
  ritual: { seconds: 4, rate: 1, trim: 0.1, clipSeconds: 6, enter: 'dissolve' },
  pack: { seconds: 6, rate: 1, trim: 0.2, clipSeconds: 8, enter: 'dissolve' },
};

const planSchema = z.object({
  product: z.string().describe('what the product is, in English, concretely (e.g. "a hydrating facial toner in a 150 ml frosted glass bottle with a white cap, clear pale-pink liquid")'),
  texture: z.string().describe('the product\'s own substance and how it really moves, in English (e.g. "thin, water-clear liquid with a faint pink tint that splashes and beads like water")'),
  world: z
    .string()
    .describe('English description of ONE premium beauty-ad set used in every shot: background colour and material, surface, light (e.g. "a seamless pale blush backdrop, a wet frosted-glass surface, soft diffused morning light from the left, delicate caustics"). Chosen to suit the product\'s colours'),
  model: z
    .string()
    .describe('English description of the one adult woman (or man, if the product suggests it) who uses the product: age range, skin, hair, styling (e.g. "a Japanese woman in her late 20s, natural dewy skin with visible pores, dark hair pulled back, bare shoulders, no jewellery")'),
  shots: z
    .array(
      z.object({
        beat: z.enum(photoAdBeats),
        imagePrompt: z.string().describe('English prompt for the 9:16 photorealistic first frame of this shot: subject, framing, lens, light. Describe the frame at the very START of the motion'),
        motionPrompt: z.string().describe('English prompt for the image-to-video shot: what physically moves and how, with real-world physics, plus at most one slow camera move. One continuous take'),
        line: z.string().describe('one short line of copy in the target language, max 12 characters; empty for the pack shot'),
        kicker: z.string().describe('tiny English label, 1-2 words, e.g. "Pure hydration"; empty for the pack shot'),
      }),
    )
    .describe(
      [
        'exactly 5 shots in this order:',
        'splash = the hero liquid moment that stops the scroll: the real product (cap off) standing still while its substance pours down from above into it, overflows and runs down the outside, splashing on the surface below, in high-speed slow motion; liquid always moves with gravity (never upward on its own); only the liquid moves;',
        'texture = an extreme macro of the substance alone (no bottle): drops, ripples, a ribbon of liquid; it must END with a single drop falling down out of the bottom of the frame (the matched cut);',
        'bridge = the drop (or a stream from the bottle above) lands on skin: the model\'s cheek or her fingertips / palm in macro, beading and spreading; it STARTS with the drop entering from the top of the frame;',
        'ritual = the model really applies it: the first frame shows a little of the product pooled in her cupped palms (or on her fingertips) just below her chin; she then lifts her hands and presses her palms gently onto her cheeks, eyes closing, a calm smile, dewy glow. Medium close-up, face three-quarter, plain set behind her, no bottle or props in this frame (the lower third stays calm), hands simple and slow;',
        'pack = the end pack shot: the real bottle standing upright in the set, label facing camera and sharp, in the lower-middle of the frame with calm empty space above for type; fine droplets on the glass, light gliding across, a few drops falling into a shallow pool around its base.',
      ].join(' '),
    ),
  name: z.string().describe('product name for the end card in the target language or as printed on the label, max 14 characters'),
  tagline: z.string().describe('one quiet line for the end card in the target language, max 16 characters'),
  cta: z.string().describe('call to action in the target language, max 10 characters, e.g. プロフィールから'),
  musicPrompt: z.string().describe('English prompt for a 20s instrumental music bed: airy, premium beauty-ad, soft piano / glassy plucks / warm pads, 80-95 BPM, a gentle lift where the person appears (about 8s), resolving softly. No vocals'),
});
type Plan = z.infer<typeof planSchema>;

export type PhotoAdBrief = {
  /** The one product photo (local path). */
  photo: string;
  brand: string;
  /** What it is, in the client's words. Optional: the planner reads the photo. */
  description?: string;
  /** Facts the copy may use. Nothing else is claimed. */
  facts?: string;
  cta?: string;
  handle?: string;
  /** What the reel is for (server/goals.ts), picked on the home screen: shapes the lines, tagline and CTA. */
  goal?: string;
  lang?: Lang;
  jobId?: string;
  onStep?: (step: number, total: number, label: string) => void;
  /** Stop after this stage: 'stills' to check keyframes before paying for video, 'props' to skip the render. */
  until?: 'stills' | 'props';
};

const exists = (f: string) => access(f).then(() => true, () => false);
const run = promisify(execFile);

/** Dark type on a light film, white on a dark one: the mean brightness (0-255) of the top 40% of the pack shot, where the end card sits. */
/** Mean edge density (0-255) of a horizontal band of an image, from `y0` to `y1` (fractions of the height): how busy it is. */
async function busy(image: string, y0: number, y1: number) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', image, '-vf', `scale=270:-1,crop=iw:ih*${y1 - y0}:0:ih*${y0},edgedetect,signalstats,metadata=print:key=lavfi.signalstats.YAVG`, '-f', 'null', '-']);
  return Number(/YAVG=([\d.]+)/.exec(stderr)?.[1] ?? 0);
}

async function inkFor(image: string) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', image, '-vf', 'crop=iw:ih*0.4:0:0,scale=64:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-']);
  const y = Number(/YAVG=([\d.]+)/.exec(stderr)?.[1] ?? 100);
  return y > 150 ? '#2B241F' : '#FFFFFF';
}

export async function buildPhotoAd(brief: PhotoAdBrief) {
  const lang = brief.lang ?? 'ja';
  const usage = new Usage();
  const TOTAL = 4;
  const started = Date.now();
  const step = (n: number, label: string) => {
    console.log(`${n}/${TOTAL} ${label} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
    brief.onStep?.(n, TOTAL, label);
  };
  const jobId = brief.jobId ?? `job-${Date.now().toString(36)}`;
  const dir = path.join(publicDir, 'jobs', jobId);
  const rel = (f: string) => `jobs/${jobId}/${f}`;
  await mkdir(dir, { recursive: true });
  const original = path.join(dir, `original${path.extname(brief.photo) || '.jpg'}`);
  if (path.resolve(brief.photo) !== original && !(await exists(original))) await copyFile(brief.photo, original);

  step(1, 'plan');
  const planFile = path.join(dir, 'plan.json');
  const plan: Plan = planSchema.parse(
    (await exists(planFile))
      ? JSON.parse(await readFile(planFile, 'utf8'))
      : await askJson({
          images: [original],
          jsonSchema: z.toJSONSchema(planSchema),
          usage,
          step: 'plan',
          temperature: 0.6,
          prompt: [
            'You direct a 15-second premium beauty / product ad for Instagram Reels and TikTok, made from this ONE ordinary photo of the product.',
            'It must look like a real commercial shoot, not a slideshow: the product\'s substance really moves (pours, drips, splashes, spreads), then a real person uses it, then the pack shot.',
            `Brand: ${brief.brand}. ${brief.description ? `Product: ${brief.description}.` : ''}`,
            `Facts you may use in copy (claim nothing else: no effects, numbers, awards or ingredients that are not listed): ${brief.facts || '(none)'}`,
            goalLine(brief.goal),
            copyLanguage(lang),
            'Keep every shot simple enough for a video model to render cleanly: one subject, one motion, plain set, nothing tiny or intricate. Never ask for text in the image.',
          ].join('\n'),
        }),
  );
  await writeFile(planFile, JSON.stringify(plan, null, 2));
  const shots = photoAdBeats.map((b, i) => plan.shots.find((s) => s.beat === b) ?? { ...plan.shots[i % plan.shots.length], beat: b });

  step(2, 'keyframes');
  const world = `The set: ${plan.world}.`;
  const look = 'Vertical 9:16, photorealistic high-end beauty commercial still, shot on a cinema camera, natural skin texture, crisp detail, soft film grade. ' + NO_TEXT;
  const still = (beat: Beat, input: string[], lines: string[]) => {
    const out = path.join(dir, `${beat}.png`);
    return exists(out).then((ok) =>
      ok ? out : editImage({ input, out, prompt: [...lines, world, look].join('\n'), usage, step: `keyframe ${beat}` }),
    );
  };
  const S = Object.fromEntries(shots.map((s) => [s.beat, s])) as Record<Beat, (typeof shots)[number]>;
  // The pack shot fixes the product in the ad's world; every product shot after it takes it as a reference.
  const pack = await still('pack', [original], [
    `Reference: a phone photo of ${plan.product} by ${brief.brand}. Re-shoot exactly this product as the closing pack shot of its TV commercial: ${S.pack.imagePrompt}`,
    KEEP_PRODUCT,
  ]);
  // The ritual still sets the person; the skin macro takes her as a reference.
  const [splash, texture, ritual] = await Promise.all([
    still('splash', [original, pack], [
      `Image 1 is the product (${plan.product}), image 2 is the ad's pack shot. A high-speed beauty-commercial frame: ${S.splash.imagePrompt}`,
      KEEP_PRODUCT,
      `The substance: ${plan.texture}.`,
    ]),
    still('texture', [pack], [`Same commercial as the reference, colour world and light. Extreme macro of the product's substance alone, no bottle: ${S.texture.imagePrompt}`, `The substance: ${plan.texture}.`]),
    still('ritual', [pack], [
      `Same commercial as the reference: use it only for the set, colours and light. The bottle is NOT in this shot. ${S.ritual.imagePrompt}`,
      `The model: ${plan.model}. Bare shoulders, a simple strapless top or towel wrap below the frame edge, nothing on her arms. Real skin with pores and fine texture, natural hands with five fingers each, relaxed.`,
    ]),
  ]);
  const bridge = await still('bridge', [ritual, pack], [
    `Same commercial, same woman as image 1 (same skin tone), same light as image 2. Macro: ${S.bridge.imagePrompt}`,
    `The substance: ${plan.texture}. Real skin texture, natural hands with five fingers.`,
  ]);
  const stills: Record<Beat, string> = { splash, texture, bridge, ritual, pack };
  if (brief.until === 'stills') {
    await writeFile(path.join(dir, 'usage-stills.json'), JSON.stringify(usage, null, 2));
    return { jobId, dir, out: null, props: null, usage: usage.toJSON(), seconds: (Date.now() - started) / 1000 };
  }

  step(3, 'motion (Omni) and music');
  const music = (async () => {
    for (const f of ['music.mp3', 'music.wav']) if (await exists(path.join(dir, f))) return rel(f);
    try {
      return rel(path.basename(await generateMusic({ prompt: plan.musicPrompt, out: path.join(dir, 'music'), usage, step: 'music' })));
    } catch (e) {
      console.warn(`music: ${(e as Error).message}; the film plays without a music bed`);
      return undefined;
    }
  })();
  const physics: Record<Beat, string> = {
    splash: 'Shot at 1000 fps on a high-speed camera: real fluid physics, the liquid has weight, surface tension and refraction, droplets break off and fall with gravity. The bottle and its label stay perfectly rigid and readable; only the liquid moves.',
    texture: 'Shot at 1000 fps, macro lens: real fluid physics, gravity, surface tension. The shot ends with one drop falling down out of the bottom of the frame.',
    bridge: 'Shot at 500 fps, macro lens: a small drop of thin, watery liquid (not a gel ball, not a glass bead) falls from above into frame, hits the skin, splashes slightly and flattens, spreading into a thin wet sheen with real surface tension; a few tiny droplets bead on the skin. Skin stays real, with pores; fingers keep their shape.',
    ritual: 'Real time, natural and calm: she raises her cupped hands and presses the liquid onto her cheeks with her palms, then holds them there softly; her hands move slowly and gently, fingers keep their shape, the face stays the same person, her clothing and hair stay exactly as they are, the skin catches a soft dewy sheen. No talking.',
    pack: 'The bottle stays perfectly still and rigid with its label sharp and unchanged; fine droplets slide slowly down the glass, a few drops fall into the shallow water at its base making small ripples, soft light glides across the glass. Very slow, subtle camera push.',
  };
  const clips = await Promise.all(
    photoAdBeats.map(async (beat) => {
      const file = `${beat}.mp4`;
      const t = TIMING[beat];
      if (!(await exists(path.join(dir, file))))
        await imageToVideo({
          image: stills[beat],
          out: path.join(dir, file),
          seconds: t.clipSeconds,
          prompt: `${S[beat].motionPrompt}\n${physics[beat]}\nOne continuous shot, no cuts, nothing appears that is not physically there.`,
          negativePrompt: NEGATIVE,
          usage,
          step: `clip ${beat}`,
        });
      const { jumps, duration } = await jumpsOf(path.join(dir, file)).catch(() => ({ jumps: [] as number[], duration: t.clipSeconds }));
      if (jumps.length) console.log(`${beat}: cut at ${jumps.map((j) => j.toFixed(2)).join(', ')}s`);
      // the macro ends on the falling drop (the matched cut into the skin shot), so it plays its last seconds
      const want = beat === 'texture' ? Math.max(0, duration - t.seconds * t.rate - 0.25) : t.trim;
      // the line goes in the calmer band of the frame (top or lower third); never across a face, so the shots
      // with the person keep it in the lower third
      const [top, bottom] = await Promise.all([busy(stills[beat], 0.1, 0.3), busy(stills[beat], 0.62, 0.82)]);
      const person = beat === 'bridge' || beat === 'ritual';
      return { src: rel(file), trim: calmTrim(want, t.seconds * t.rate, jumps, duration), place: !person && top < bottom * 0.8 ? ('top' as const) : ('bottom' as const) };
    }),
  );
  const musicFile = await music;

  step(4, brief.until === 'props' ? 'build props' : 'render');
  const props: PhotoAdProps = photoAdSchema.parse({
    brand: brief.brand.slice(0, 24),
    name: plan.name.slice(0, fit(lang, 16)),
    tagline: plan.tagline.slice(0, fit(lang, 20)),
    cta: (brief.cta || plan.cta).slice(0, 24),
    handle: (brief.handle ?? '').slice(0, 30),
    lang,
    shots: photoAdBeats.map((beat, i) => ({
      src: clips[i].src,
      beat,
      seconds: TIMING[beat].seconds,
      trimStart: Math.round(clips[i].trim * 100) / 100,
      rate: TIMING[beat].rate,
      enter: TIMING[beat].enter,
      line: beat === 'pack' ? '' : S[beat].line.slice(0, fit(lang, 14)),
      kicker: beat === 'pack' ? '' : S[beat].kicker.slice(0, 24),
      place: clips[i].place,
    })),
    ...(musicFile ? { music: musicFile } : {}),
    musicVolume: 0.8,
    sfxVolume: 0.35,
    serif: !isCJK(lang),
    ink: await inkFor(stills.pack),
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  if (brief.until === 'props') return { jobId, dir, out: null, props, usage: usage.toJSON(), seconds: (Date.now() - started) / 1000 };
  const out = path.join(dir, 'reel.mp4');
  const render = await renderLocal('PhotoAdFilm', props, out);
  return { jobId, dir, out, props, usage: usage.toJSON(), render, seconds: (Date.now() - started) / 1000 };
}
