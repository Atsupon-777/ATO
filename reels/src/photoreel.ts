// PhotoReel prop schema. Like schemas.ts it stays free of React/Remotion imports so the server
// pipeline can validate AI output against exactly what the template accepts.
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { fontChoices } from './effects/axes.ts';
import { langs } from './lang.ts';

/** Motion ids. Catalog names and descriptions live in templates/photoreel-catalog.ts. */
export const photoMotionIds = [
  'cinematic',
  'beatcut',
  'portal',
  'push',
  'polaroid',
  'collage',
  'magazine',
  'carousel',
  'flip',
  'filmstrip',
  'thennow',
  'split',
  'scrapbook',
  'cube',
  'burn',
] as const;

/** Caption / type look: editorial = serif and hairlines, bold = heavy caps and colour blocks, minimal = quiet sans and glass. */
export const photoStyleIds = ['editorial', 'bold', 'minimal'] as const;

export const photoReelSchema = z.object({
  photos: z
    .array(
      z.object({
        src: z.string(),
        caption: z.string().max(48).optional(),
        /** Point of interest (0–1); camera moves aim here. */
        focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
      }),
    )
    .min(1)
    .max(10),
  title: z.string().max(40),
  subtitle: z.string().max(60).optional(),
  cta: z.string().max(30).optional(),
  handle: z.string().max(30).optional(),
  motion: z.enum(photoMotionIds),
  style: z.enum(photoStyleIds),
  /** bg: backdrop and scrims, ink: text, accent: rules, highlights and buttons. */
  palette: z.object({ bg: zColor(), ink: zColor(), accent: zColor() }),
  /** Title face; defaults to the style's own (serif for editorial, display for bold and minimal). */
  font: z.enum(fontChoices).optional(),
  bpm: z.number().min(70).max(170),
  music: z.string().optional(),
  lang: z.enum(langs).optional(),
});

export type PhotoReelProps = z.infer<typeof photoReelSchema>;
export type PhotoMotion = (typeof photoMotionIds)[number];
export type PhotoStyle = (typeof photoStyleIds)[number];
