// Template prop schemas. Kept free of React/Remotion imports so the server pipeline (plain Node)
// can validate AI output against exactly what the templates accept.
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { accents, cameraMoves, captionStyles, fontChoices, grades, textures, transitions } from './effects/axes.ts';

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export const productShineSchema = z.object({
  brand: z.string().max(16),
  productName: z.string().max(24),
  tagline: z.string().max(22),
  /** The original photo, used for macro detail shots. */
  photo: z.string(),
  /** Transparent PNG of the product, trimmed to its bounds. */
  cutout: z.string(),
  /** Cut-out width / height, so layout does not need to load the image first. */
  cutoutAspect: z.number().positive(),
  /** Points on the cut-out (0–1) where metal or glass should catch a glint. */
  glints: z.array(point).max(4),
  details: z
    .array(
      point.extend({
        zoom: z.number().min(1).max(4),
        kicker: z.string().max(24),
        title: z.string().max(14),
      }),
    )
    .length(3),
  cta: z.string().max(16),
  handle: z.string().max(30),
  bpm: z.number().min(80).max(160),
  music: z.string().optional(),
  /** Optional AI motion clip (e.g. Veo image-to-video, 9:16) shown between the hero and the details. */
  clip: z.string().optional(),
  palette: z.object({ accent: zColor(), glow: zColor(), base: zColor() }),
});

export type ProductShineProps = z.infer<typeof productShineSchema>;

const focus = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(4) });

export const saasPromoSchema = z.object({
  name: z.string().max(20),
  logo: z.string().optional(),
  url: z.string().max(40),
  /** Three short hook lines; the word in `hookEmphasis` gets the accent swipe. */
  hook: z.array(z.string().max(12)).length(3),
  hookEmphasis: z.string().max(10),
  desktop: z.string(),
  mobile: z.string().optional(),
  chips: z.array(z.string().max(14)).max(4),
  features: z
    .array(
      z.object({
        kicker: z.string().max(16),
        title: z.string().max(16),
        device: z.enum(['desktop', 'mobile']),
        focus,
      }),
    )
    .length(3),
  stats: z.array(z.object({ value: z.number(), suffix: z.string().max(6), label: z.string().max(14) })).length(3),
  cta: z.string().max(14),
  bpm: z.number().min(90).max(160),
  music: z.string().optional(),
  palette: z.object({ bg: zColor(), ink: zColor(), accent: zColor(), accent2: zColor(), panel: zColor() }),
});

export type SaaSPromoProps = z.infer<typeof saasPromoSchema>;

export const talkCaptionsSchema = z.object({
  video: z.string(),
  sourceDuration: z.number().positive(),
  /** cover: crop to 9:16 around focusX. fit-blur: whole frame over a blurred fill (for 16:9 sources). */
  layout: z.enum(['cover', 'fit-blur']),
  focusX: z.number().min(0).max(1),
  /** Word-level transcript, e.g. from ElevenLabs Scribe (`words` with start/end in seconds). */
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
  cutSilence: z.object({ enabled: z.boolean(), minGap: z.number().min(0.1).max(2), pad: z.number().min(0).max(0.5) }),
  fillers: z.array(z.string()),
  captions: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    fontSize: z.number().min(40).max(160),
    maxChars: z.number().min(6).max(40),
    color: zColor(),
    highlight: zColor(),
    stroke: zColor(),
    box: z.boolean(),
    uppercase: z.boolean(),
  }),
  /** Per-caption edits from the editor: move, rewrite or delete one caption page. */
  overrides: z
    .array(
      z.object({
        page: z.number().int().min(0),
        hidden: z.boolean().optional(),
        text: z.string().optional(),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
  emphasis: z.array(z.string()),
  title: z.string().max(30).optional(),
  titleY: z.number().min(0).max(1),
  accent: zColor(),
});

export type TalkCaptionsProps = z.infer<typeof talkCaptionsSchema>;

/** Effects from the "17 video effects" catalog (notes/video-effects.md). */
export const effectIds = [
  'orbit',
  'couchWall',
  'uiWorld',
  'frameBreak',
  'digitalZoom',
  'phoneMockup',
  'checklist',
  'headlineWall',
  'zoomThrough',
  'chartGrow',
  'pullBack',
  'greenScreen',
  'paperCut',
  'doodleBoil',
  'vertigo',
  'coverStory',
  'glassType',
  'kineticType',
  'infographic',
] as const;

/** Per-beat look on top of the scene effect: one pick per axis plus any accents (src/effects/axes.ts). */
export const beatStyleSchema = z.object({
  caption: z.enum(captionStyles).optional(),
  camera: z.enum(cameraMoves).optional(),
  transition: z.enum(transitions).optional(),
  grade: z.enum(grades).optional(),
  texture: z.enum(textures).optional(),
  accents: z.array(z.enum(accents)).max(accents.length).optional(),
  font: z.enum(fontChoices).optional(),
  /** Accent colour for this beat; falls back to the reel palette. */
  color: zColor().optional(),
});

export const effectSegmentSchema = z.object({
  effect: z.enum(effectIds),
  /** Source range in seconds. */
  start: z.number().min(0),
  end: z.number().positive(),
  /** Spoken line shown word by word; words listed in `emphasis` get the accent colour. */
  caption: z.string().max(60).optional(),
  emphasis: z.array(z.string()).default([]),
  /** Main text of the effect: cover title, glass word, chart badge, paper-cut letters, accent script line. */
  text: z.string().max(40).optional(),
  /** Short lines: checklist items, wall headlines, editor steps, phone chat messages. */
  items: z.array(z.string().max(60)).max(12).default([]),
  /** Images for cards (orbit, couch wall, ui world thumbnails). Falls back to stills of the footage. */
  images: z.array(z.string()).max(12).default([]),
  /** Chart values (chart grow), 2–8 points. */
  values: z.array(z.number()).max(8).default([]),
  style: beatStyleSchema.optional(),
});

export const effectsReelSchema = z.object({
  /** Talking footage. */
  video: z.string(),
  /** Same footage with only the person kept, as a transparent WebM (server/matte.ts). Optional. */
  matte: z.string().optional(),
  focusX: z.number().min(0).max(1),
  segments: z.array(effectSegmentSchema).min(1),
  /** Show the "01/17" counter pill in the corner. */
  counter: z.boolean().default(false),
  palette: z.object({ accent: zColor(), ink: zColor(), paper: zColor() }),
  music: z.string().optional(),
  /** Mix the beats were planned with (src/effects/recipes.ts); informational for the editor. */
  recipe: z.string().optional(),
});

export type EffectSegment = z.infer<typeof effectSegmentSchema>;
export type BeatStyle = z.infer<typeof beatStyleSchema>;
export type EffectsReelProps = z.infer<typeof effectsReelSchema>;
export type EffectId = (typeof effectIds)[number];
