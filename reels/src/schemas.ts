// Template prop schemas. Kept free of React/Remotion imports so the server pipeline (plain Node)
// can validate AI output against exactly what the templates accept.
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { accents, cameraMoves, captionStyles, fontChoices, grades, textures, transitions } from './effects/axes.ts';
import { langs } from './lang.ts';
import { framings, layouts, shotMoves } from './effects/shots.ts';

const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

/** One shot of a cinematic product film: an AI video clip (or a still) with an optional line of copy. */
export const filmShotSchema = z.object({
  /** Video clip (mp4) or still image. Stills get a slow push-in. */
  src: z.string(),
  /** hook = sensory opener, craft = how it is made / used, mood = atmosphere, hero = the product, moment = a person enjoying it. */
  kind: z.enum(['hook', 'craft', 'mood', 'hero', 'moment']),
  /** Seconds on screen. */
  seconds: z.number().min(1).max(8),
  /** Where in the clip to start (seconds) and how fast to play it (0.5 = slow motion). */
  trimStart: z.number().min(0).max(8),
  rate: z.number().min(0.25).max(2),
  /** Volume of the clip's own sound (Veo makes ambient sound: whisking, pouring, birds). */
  audio: z.number().min(0).max(1),
  /** Line of copy shown over the shot (empty: none). */
  line: z.string().max(40),
  /** Small English kicker above the line. */
  kicker: z.string().max(28),
  /** Vertical framing of a 9:16 crop (0 top, 1 bottom). */
  focusY: z.number().min(0).max(1),
});

export const productFilmSchema = z.object({
  brand: z.string().max(16),
  productName: z.string().max(24),
  tagline: z.string().max(40),
  lang: z.enum(langs).optional(),
  /** Japanese and Chinese copy can run vertically (tategaki). */
  vertical: z.boolean(),
  shots: z.array(filmShotSchema).min(2).max(8),
  /** Transparent PNG of the product for the end card, and its width / height. */
  cutout: z.string(),
  cutoutAspect: z.number().positive(),
  cta: z.string().max(30),
  handle: z.string().max(30),
  /** Music bed (e.g. Lyria). Plays under the clips' own sound. */
  music: z.string().optional(),
  musicVolume: z.number().min(0).max(1),
  /** Colour grade over every shot. */
  grade: z.enum(['warm', 'cool', 'neutral', 'verdant', 'noir']),
  palette: z.object({ accent: zColor(), glow: zColor(), base: zColor(), ink: zColor() }),
});

export type FilmShot = z.infer<typeof filmShotSchema>;
export type ProductFilmProps = z.infer<typeof productFilmSchema>;

export const productShineSchema = z.object({
  brand: z.string().max(16),
  productName: z.string().max(24),
  tagline: z.string().max(40),
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
        title: z.string().max(26),
      }),
    )
    .length(3),
  cta: z.string().max(30),
  handle: z.string().max(30),
  bpm: z.number().min(80).max(160),
  music: z.string().optional(),
  /** Optional AI motion clip (e.g. Veo image-to-video, 9:16) shown between the hero and the details. */
  clip: z.string().optional(),
  /**
   * Story mode: AI-shot scenes of the product's world (ingredient, place, ritual) that open the reel like a short
   * film, each with one line of narration, before the product is revealed with `clip`.
   */
  story: z
    .array(z.object({ clip: z.string(), image: z.string(), line: z.string().max(40), kicker: z.string().max(24) }))
    .min(2)
    .max(4)
    .optional(),
  /**
   * Story-mode reels are rendered as a short film (templates/ProductFilm) built from the story scenes and `clip`.
   * Brand, name, tagline, CTA and handle always come from the fields above, so the editor still changes them.
   */
  film: productFilmSchema.optional(),
  palette: z.object({ accent: zColor(), glow: zColor(), base: zColor() }),
});

export type ProductShineProps = z.infer<typeof productShineSchema>;

const focus = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), zoom: z.number().min(1).max(4) });

export const saasPromoSchema = z.object({
  name: z.string().max(20),
  logo: z.string().optional(),
  url: z.string().max(40),
  /** Three short hook lines; the word in `hookEmphasis` gets the accent swipe. */
  hook: z.array(z.string().max(22)).length(3),
  hookEmphasis: z.string().max(18),
  desktop: z.string(),
  mobile: z.string().optional(),
  chips: z.array(z.string().max(26)).max(4),
  features: z
    .array(
      z.object({
        kicker: z.string().max(16),
        title: z.string().max(29),
        device: z.enum(['desktop', 'mobile']),
        focus,
      }),
    )
    .length(3),
  stats: z.array(z.object({ value: z.number(), suffix: z.string().max(11), label: z.string().max(26) })).length(3),
  cta: z.string().max(26),
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
  title: z.string().max(54).optional(),
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
  'notifications',
  'tiles',
  'sourceCard',
  'object3d',
  'particles3d',
  'textReveal',
  'uiLayers',
  'isoGrid',
  'lineIcons',
  'flatBoard',
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
  /** Where the caption sits; unset keeps the spot the effect lays out for it. */
  captionPos: z.enum(['top', 'middle', 'bottom']).optional(),
  /** Accent colour for this beat; falls back to the reel palette. */
  color: zColor().optional(),
});

export const stickerIds = ['heart', 'star', 'sparkle', 'arrow', 'burst', 'check', 'fire', 'new'] as const;
/** One premium-edit layer: a sticker or a line of text. x / y are the centre, 0..1 of the frame. */
export const overlaySchema = z.object({
  kind: z.enum(['sticker', 'text']),
  sticker: z.enum(stickerIds).optional(),
  text: z.string().max(40).optional(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  /** 1 = default size. */
  scale: z.number().min(0.4).max(3).default(1),
  color: zColor().optional(),
  /** Seconds into the reel; unset shows it the whole time. */
  from: z.number().min(0).optional(),
  to: z.number().min(0).optional(),
});

export const effectSegmentSchema = z.object({
  effect: z.enum(effectIds),
  /** Source range in seconds. */
  start: z.number().min(0),
  end: z.number().positive(),
  /** Spoken line shown word by word; words listed in `emphasis` get the accent colour. */
  caption: z.string().max(120).optional(),
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
  /**
   * How the beat is shot (src/effects/shots.ts): framing of the speaker, its move, a punch-in on the key word
   * (seconds into the beat), or a layout without the speaker (full-screen text, a picture, a split screen).
   * Unset (older jobs): the recorded framing, as before.
   */
  shot: z
    .object({
      framing: z.enum(framings).optional(),
      move: z.enum(shotMoves).optional(),
      punch: z.number().min(0).optional(),
      layout: z.enum(layouts).optional(),
      /** The picture for broll / split beats (made once per job from the spoken keyword). */
      image: z.string().optional(),
    })
    .optional(),
});

export const effectsReelSchema = z.object({
  /** Talking footage. */
  video: z.string(),
  /** Same footage with only the person kept, as a transparent WebM (server/matte.ts). Optional. */
  matte: z.string().optional(),
  focusX: z.number().min(0).max(1),
  /** Where the speaker's face is in the 9:16 frame (measured from the matte), for framings and punch-ins. */
  subject: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), h: z.number().min(0).max(1) }).optional(),
  segments: z.array(effectSegmentSchema).min(1),
  /** Show the "01/17" counter pill in the corner. */
  counter: z.boolean().default(false),
  palette: z.object({ accent: zColor(), ink: zColor(), paper: zColor() }),
  music: z.string().optional(),
  /** Mix the beats were planned with (src/effects/recipes.ts); informational for the editor. */
  recipe: z.string().optional(),
  /** Language of captions and on-screen text; picks Chinese glyph shapes for zh. */
  lang: z.enum(langs).optional(),
  /** Footage brightness (1 = as shot). Applied on top of the grade, to the person and the wall alike. */
  brightness: z.number().min(0.5).max(1.5).optional(),
  /** Caption height for the whole reel (0 top, 1 bottom); when set it wins over each beat's captionPos. */
  captionY: z.number().min(0.05).max(0.9).optional(),
  /** Premium edit: stickers and hand-written telops laid over the whole reel, placed by the user. */
  overlays: z.array(overlaySchema).max(12).optional(),
  /** Loudness of the speaker (1 = as recorded, normalised) and of the music bed. */
  voiceVolume: z.number().min(0).max(1.5).optional(),
  musicVolume: z.number().min(0).max(1).optional(),
  /** Lower the music while someone speaks (ducking) so both stay audible. On unless set to false. */
  duck: z.boolean().optional(),
  /** Seconds on the reel's own timeline where someone is speaking; drives ducking. */
  speech: z.array(z.tuple([z.number(), z.number()])).max(400).optional(),
});

export type Overlay = z.infer<typeof overlaySchema>;
export type EffectSegment = z.infer<typeof effectSegmentSchema>;
export type BeatStyle = z.infer<typeof beatStyleSchema>;
export type EffectsReelProps = z.infer<typeof effectsReelSchema>;
export type EffectId = (typeof effectIds)[number];

/**
 * 5-pass edit (@zeeuiux method): one talking video finished in five passes, each filling more of these
 * props. All timing comes from `words` (pass 1). Times are seconds in the source video.
 */
export const fivePassSchema = z.object({
  video: z.string(),
  /** Person cut-out with soft edges (pass 2). */
  matte: z.string().optional(),
  focusX: z.number().min(0).max(1),
  /** Length of the source in seconds. */
  duration: z.number().positive(),
  /** How far the edit has got (1-5); the preview shows only what that pass has added. */
  pass: z.number().int().min(1).max(5),
  /** Pass 1: every spoken word with its time. */
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
  /** Pass 3: 1-3 words at a time; `key` is the one big word, `echo` stacks fading copies of it. */
  captions: z.array(z.object({ start: z.number(), end: z.number(), text: z.string(), key: z.string().optional(), echo: z.boolean().default(false) })).default([]),
  /** Pass 4: one scene per idea, starting on the word that triggers it. */
  scenes: z
    .array(
      z.object({
        type: z.enum(effectIds),
        trigger: z.string().optional(),
        start: z.number(),
        end: z.number(),
        items: z.array(z.string()).max(6).default([]),
        text: z.string().optional(),
        value: z.number().optional(),
        place: z.enum(['top', 'bottom']).default('top'),
      }),
    )
    .default([]),
  /** Pass 5: cue sounds. */
  sfx: z.array(z.object({ kind: z.enum(['whoosh', 'tap', 'chime']), at: z.number() })).default([]),
  style: z.enum(['midnight']).default('midnight'),
  lang: z.enum(langs).optional(),
  /** Director notes per pass and version, kept so a pass can be redone or rolled back. */
  notes: z.array(z.object({ pass: z.number().int(), version: z.number().int(), text: z.string() })).default([]),
});
export type FivePassProps = z.infer<typeof fivePassSchema>;
