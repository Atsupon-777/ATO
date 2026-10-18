// Photo → product reel, end to end:
// cut-out (local BiRefNet) → studio shot (Nano Banana) → plan and copy (Gemini, JSON) →
// optional motion clip (Veo) → ProductShine props, validated → render.
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { productShineSchema, type FilmShot, type ProductFilmProps, type ProductShineProps } from '../src/schemas.ts';
import { copyLanguage, fit, isCJK, type Lang } from '../src/lang.ts';
import { cutout } from './cutout.ts';
import { askJson, editImage, generateMusic, imageToVideo } from './gemini.ts';
import { renderTemplate } from './render.ts';
import { Usage } from './usage.ts';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export const STYLES = {
  luxury: {
    scene: 'on a polished black marble pedestal in a dark studio, deep shadows, subtle warm haze',
    light: 'a single warm golden rim light from behind-left plus a soft key light, crisp specular highlights on metal and glass',
    palette: { accent: '#D8B57A', glow: '#FFC98A', base: '#070605' },
  },
  clean: {
    scene: 'on a seamless warm-white backdrop with a soft curved floor, minimal and airy',
    light: 'large soft window light from the left, gentle contact shadow, clean reflections',
    palette: { accent: '#1F2A44', glow: '#FFFFFF', base: '#EDEAE4' },
  },
  cosmetic: {
    scene: 'on a pale pink acrylic block with a splash of clear water and droplets frozen in the air',
    light: 'bright high-key beauty lighting, glossy highlights, fresh and dewy feel',
    palette: { accent: '#E8A5B4', glow: '#FFE3EA', base: '#1A1214' },
  },
  omakase: {
    scene: 'on a pale hinoki-wood counter of a quiet, dark, high-end sushi restaurant, a dark stone plate, blurred warm lanterns far behind',
    light: 'a single soft overhead spotlight like a sushi counter downlight, glistening highlights on the fish and rice, deep calm shadows',
    palette: { accent: '#C9A46A', glow: '#FFD9A0', base: '#0A0806' },
  },
  natural: {
    scene: 'on a light oak surface with soft leaf shadows and a blurred green background',
    light: 'warm morning sunlight with dappled shadows, natural and calm',
    palette: { accent: '#C9B27C', glow: '#FFE7B0', base: '#0E120C' },
  },
} as const;
export type Style = keyof typeof STYLES;

const KEEP_PRODUCT =
  'Keep the product exactly as it is in the reference photo: identical shape, proportions, colours, materials, logo, printed text and every detail. Do not redesign, add, remove or move any part of the product, and do not change any lettering.';

const planSchema = z.object({
  tagline: z.string().describe('tagline in the target language, poetic but concrete, max 18 characters'),
  details: z
    .array(
      z.object({
        x: z.number().describe('0-1 horizontal position of the detail in IMAGE 2 (studio shot)'),
        y: z.number().describe('0-1 vertical position of the detail in IMAGE 2'),
        zoom: z.number().describe('2.0-3.2, how close to frame the detail'),
        kicker: z.string().describe('short English label, 2-3 words'),
        title: z.string().describe('headline for this detail in the target language, max 10 characters'),
      }),
    )
    .describe('exactly 3 visually distinct close-up details, each a real visible feature'),
  glints: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .describe('2-3 points (0-1) on IMAGE 3 (cut-out) where metal, glass or gloss would catch a sparkle'),
  story: z
    .array(
      z.object({
        role: z.enum(['hook', 'origin', 'ritual']).describe('hook: a sensory macro that stops the scroll; origin: where it comes from or how it is made; ritual: the moment it is used or enjoyed'),
        imagePrompt: z
          .string()
          .describe('English prompt for a photorealistic 9:16 cinematic still of this scene, in the same colour world as the product. Concrete subject, lens and light (for example "macro 100mm, backlit by low morning sun"). The packaging may appear only if the scene naturally holds it; never invent a different package, logo or text'),
        motionPrompt: z
          .string()
          .describe('English prompt for an 8s image-to-video shot of that still: one slow, graceful camera move plus one natural motion (powder falling in slow motion, steam curling, mist drifting over leaves, liquid swirling, hands moving calmly)'),
        line: z.string().describe('one line of narration in the target language, quiet and emotional, max 16 characters; the three lines read as one short story leading to the product'),
        kicker: z.string().describe('short English label, 1-3 words'),
      }),
    )
    .describe('exactly 3 scenes in the order hook, origin, ritual: the world of the product before it is revealed. Only things that are true for this kind of product; no claims beyond the facts'),
  revealPrompt: z
    .string()
    .describe('English prompt for an 8s image-to-video shot of IMAGE 2 that is the emotional climax of a short film: the product revealed slowly and gracefully, for example a slow arc around it as a beam of light sweeps across the package, with light that glides across the product surface itself and gentle depth-of-field changes. Never add smoke, steam, glowing orbs, light blobs or new light sources in the frame (food is shown as served, not hot). The product itself stays rigid and unchanged'),
  musicPrompt: z
    .string()
    .describe('English prompt for a 30s instrumental music bed for this film: genre and instruments that suit the product and its culture, tempo 70-90 BPM, starting intimate and sparse, swelling warmly at about 12 seconds where the product is revealed, then resolving softly. No vocals'),
  motionPrompt: z
    .string()
    .describe('English prompt for an 8s image-to-video shot of IMAGE 2 for a fast-paced Instagram ad: an energetic, continuous camera move (for example a fast dolly-in that arcs around the product, a crane move or a parallax slide past foreground elements), moving light and shadows, and atmospheric motion that suits the product (drifting leaves, steam, mist, sparkles) that never covers it. The product itself stays rigid and unchanged'),
});

export type ProductBrief = {
  /** The client's photo. Without one, the AI first creates the hero photo from `concept`. */
  photo?: string;
  /** What to show when there is no photo, e.g. "otoro nigiri made by a master sushi chef". */
  concept?: string;
  brand: string;
  productName: string;
  /** Facts the copy may use. Nothing else is claimed. */
  facts: string;
  style: Style;
  cta: string;
  handle: string;
  video: boolean;
  /** Language of the on-screen copy (default ja). */
  lang?: Lang;
  /** Cosmetics: generate an on-skin model shot and animate that instead of the product shot. */
  onSkin: boolean;
  jobId?: string;
  /** Progress callback for the web app (step number, total, label). */
  onStep?: (step: number, total: number, label: string) => void;
  /** false: stop after building props, so the editor can preview and tweak before rendering. */
  render?: boolean;
};

export async function buildProductReel(brief: ProductBrief) {
  const lang = brief.lang ?? 'ja';
  const usage = new Usage();
  const step = (n: number, label: string) => {
    console.log(`${n}/5 ${label}`);
    brief.onStep?.(n, 5, label);
  };
  const jobId = brief.jobId ?? `job-${Date.now().toString(36)}`;
  const dir = path.join(publicDir, 'jobs', jobId);
  const rel = (f: string) => `jobs/${jobId}/${f}`;
  await mkdir(dir, { recursive: true });
  const style = STYLES[brief.style];
  const exists = (f: string) => access(f).then(() => true, () => false);
  let original = path.join(dir, `original${(brief.photo && path.extname(brief.photo)) || '.jpg'}`);
  if (brief.photo) await copyFile(brief.photo, original);
  else {
    // No photo (a restaurant dish, a place, a service): the AI shoots the hero photo first and everything follows from it.
    if (!brief.concept) throw new Error('a photo or a concept is required');
    original = path.join(dir, 'original.png');
    if (!(await exists(original))) await editImage({
      input: [],
      out: original,
      prompt: [
        `A world-class commercial food and product photograph for ${brief.brand}: ${brief.concept}.`,
        `Facts: ${brief.facts || '(none)'}. Scene: ${style.scene}. Lighting: ${style.light}.`,
        'Square 1:1, the subject centred and filling about 60% of the frame, photorealistic, tack-sharp, appetising and luxurious, shallow depth of field. No text, no logo, no watermark.',
      ].join('\n'),
      aspectRatio: '1:1',
      usage,
      step: 'hero photo',
    });
  }

  step(1, 'cut-out');
  const cut = await cutout(original, path.join(dir, 'cutout.png'), usage);

  // Re-running a job reuses the studio shot, plan and clip already paid for.
  step(2, 'studio shot');
  const studioFile = path.join(dir, 'studio.png');
  const studio = (await exists(studioFile)) ? studioFile : await editImage({
    input: [original],
    out: path.join(dir, 'studio.png'),
    prompt: [
      `Create a premium commercial advertising photograph of the product in the reference photo (${brief.productName} by ${brief.brand}).`,
      KEEP_PRODUCT,
      `Scene: ${style.scene}. Lighting: ${style.light}.`,
      'Vertical 9:16 frame. Product centred, filling about 55% of the height, with calm empty space above it. Photorealistic, tack-sharp on the product, shallow depth of field behind. No added text, no watermark, nothing in front of the product.',
    ].join('\n'),
    usage,
    step: 'studio shot',
  });

  step(3, 'plan and copy');
  const planFile = path.join(dir, 'plan.json');
  // Plans saved before story mode have no story scenes; those are planned again.
  const cached = (await exists(planFile)) ? JSON.parse(await readFile(planFile, 'utf8')) : null;
  const raw = cached?.story && cached?.musicPrompt ? cached : await askJson({
    images: [original, studio, cut.file],
    jsonSchema: z.toJSONSchema(planSchema),
    usage,
    step: 'plan',
    prompt: [
      'You are the art director of a luxury product reel. IMAGE 1 is the client photo, IMAGE 2 the studio shot, IMAGE 3 the cut-out.',
      `Brand: ${brief.brand}. Product: ${brief.productName}.`,
      `Facts you may use (do not claim anything else, no numbers, awards or effects that are not listed): ${brief.facts || '(none)'}`,
      `Write natural copy for an Instagram reel. ${copyLanguage(lang)} Pick three close-up details that are clearly visible in IMAGE 2 and differ from each other.`,
      'The reel opens like a short film: three cinematic scenes of the product\'s world (a sensory hook, its origin, the ritual of using it), each with one quiet line of narration, and only then the product itself. Make the viewer feel the moment before they see the package.',
    ].join('\n'),
  });
  const plan = planSchema.parse(raw);
  await writeFile(planFile, JSON.stringify(plan, null, 2));

  let clip: string | undefined;
  let story: ProductShineProps['story'];
  let musicFile: string | undefined;
  if (brief.video) {
    // Story scenes: a still per scene (Nano Banana, the client photo as the colour and product reference),
    // then all Veo shots at once. Files already made are reused when a job is re-run.
    step(4, 'story scenes');
    const scenes = plan.story.slice(0, 3);
    const stills = await Promise.all(
      scenes.map(async (s, i) => {
        const out = path.join(dir, `story-${i + 1}.png`);
        if (await exists(out)) return out;
        return editImage({
          input: [original],
          out,
          prompt: [
            `A cinematic advertising still for ${brief.productName} by ${brief.brand}: ${s.imagePrompt}`,
            'Use the reference photo only for the colour palette, mood and, if the product appears, its exact look.',
            KEEP_PRODUCT,
            'Vertical 9:16, photorealistic, film-like grade, shallow depth of field, no added text, no watermark.',
          ].join('\n'),
          usage,
          step: `story still ${i + 1}`,
        });
      }),
    );
    const shot = async (image: string, file: string, prompt: string, label: string) => {
      if (!(await exists(path.join(dir, file)))) await imageToVideo({ image, out: path.join(dir, file), prompt, usage, step: label });
      return rel(file);
    };
    const storyClips = scenes.map((s, i) =>
      shot(stills[i], `story-${i + 1}.mp4`, `${s.motionPrompt} Slow, cinematic, natural physics, no text appears.`, `story clip ${i + 1}`),
    );
    let source = studio;
    if (brief.onSkin) {
      step(4, 'on-skin model shot');
      source = await editImage({
        input: [original],
        out: path.join(dir, 'on-skin.png'),
        prompt: [
          `A photorealistic beauty advertising close-up: an adult model gently applies the product from the reference photo (${brief.productName}) to the cheek, holding the product package in the other hand facing camera.`,
          KEEP_PRODUCT,
          'Soft high-key beauty lighting, natural skin texture, vertical 9:16, no text, no watermark.',
        ].join('\n'),
        usage,
        step: 'on-skin shot',
      });
    }
    // The music bed is written for this film and generated while Veo works.
    const music = (async () => {
      for (const f of ['music.mp3', 'music.wav']) if (await exists(path.join(dir, f))) return rel(f);
      try {
        const file = await generateMusic({ prompt: plan.musicPrompt, out: path.join(dir, 'music'), usage, step: 'music' });
        return rel(path.basename(file));
      } catch (e) {
        console.warn(`music: ${(e as Error).message}; the film plays with the clips' own sound only`);
        return undefined;
      }
    })();
    step(4, 'motion clips (Veo)');
    const [hero, ...clips] = await Promise.all([
      shot(source, 'clip.mp4', `${plan.revealPrompt} The product keeps its exact shape, logo and text throughout. No smoke, no steam, no glowing orbs.`, 'motion clip'),
      ...storyClips,
    ]);
    clip = hero;
    musicFile = (await music) ?? undefined;
    story = scenes.map((s, i) => ({
      clip: clips[i],
      image: rel(`story-${i + 1}.png`),
      line: s.line.slice(0, fit(lang, 22)),
      kicker: s.kicker.slice(0, 24),
    }));
  }

  step(5, brief.render === false ? 'build props' : 'render');
  const props: ProductShineProps = productShineSchema.parse({
    brand: brief.brand,
    productName: brief.productName,
    tagline: plan.tagline.slice(0, fit(lang, 22)),
    photo: rel('studio.png'),
    cutout: rel('cutout.png'),
    cutoutAspect: cut.aspect,
    glints: plan.glints.slice(0, 4),
    details: plan.details.slice(0, 3).map((d) => ({
      ...d,
      zoom: Math.min(3.2, Math.max(1.6, d.zoom)),
      kicker: d.kicker.slice(0, 24),
      title: d.title.slice(0, fit(lang, 14)),
    })),
    cta: brief.cta,
    handle: brief.handle,
    bpm: 128,
    palette: style.palette,
    ...(clip ? { clip } : {}),
    ...(story ? { story } : {}),
    ...(story && clip ? { film: filmProps({ story, clip, music: musicFile, brief, lang, style: brief.style, cutout: rel('cutout.png'), cutoutAspect: cut.aspect, tagline: plan.tagline }) } : {}),
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  if (brief.render === false) return { jobId, dir, out: null, props, usage: usage.toJSON(), render: null };
  const out = path.join(dir, 'reel.mp4');
  const result = await renderTemplate('ProductShine', props, out);
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId, dir, out, props, usage: usage.toJSON(), render: result };
}

const GRADE: Record<Style, ProductFilmProps['grade']> = { luxury: 'warm', clean: 'neutral', cosmetic: 'warm', omakase: 'warm', natural: 'verdant' };

/**
 * The story scenes and the reveal clip cut as a short film: hook → origin → ritual → the product → end card.
 * Veo shots are 8 s; each plays a slow-motion slice from its calmest middle part.
 */
function filmProps(o: {
  story: NonNullable<ProductShineProps['story']>;
  clip: string;
  music?: string;
  brief: ProductBrief;
  lang: Lang;
  style: Style;
  cutout: string;
  cutoutAspect: number;
  tagline: string;
}): ProductFilmProps {
  const kinds: FilmShot['kind'][] = ['hook', 'craft', 'moment'];
  const seconds = [3, 3.6, 3.6];
  const shots: FilmShot[] = o.story.map((s, i) => ({
    src: s.clip,
    kind: kinds[i] ?? 'mood',
    seconds: seconds[i] ?? 3.4,
    trimStart: i === 0 ? 0.4 : 1,
    rate: 0.8,
    audio: 0.55,
    line: s.line,
    kicker: s.kicker,
    focusY: 0.5,
  }));
  shots.push({ src: o.clip, kind: 'hero', seconds: 4.6, trimStart: 0.6, rate: 0.9, audio: 0.35, line: '', kicker: '', focusY: 0.5 });
  const palette = STYLES[o.style].palette;
  return {
    brand: o.brief.brand,
    productName: o.brief.productName,
    tagline: o.tagline,
    lang: o.lang,
    vertical: isCJK(o.lang),
    shots,
    cutout: o.cutout,
    cutoutAspect: o.cutoutAspect,
    cta: o.brief.cta,
    handle: o.brief.handle,
    ...(o.music ? { music: o.music } : {}),
    musicVolume: 0.75,
    grade: GRADE[o.style],
    palette: { ...palette, ink: o.style === 'clean' ? '#1F2A44' : '#F6EFE3' },
  };
}
