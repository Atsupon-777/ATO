// Template prop schemas. Kept free of React/Remotion imports so the server pipeline (plain Node)
// can validate AI output against exactly what the templates accept.
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';

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
