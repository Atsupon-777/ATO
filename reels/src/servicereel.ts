// ServiceReel prop schema: a service-introduction reel whose look is picked from
// presentation layout × screen type × style (see src/templates/servicereel-catalog.ts).
// Kept free of React/Remotion imports so the server can validate AI output against it.
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { langs } from './lang.ts';

export const serviceLayoutIds = [
  'orbit',
  'clickthrough',
  'problem',
  'beforeafter',
  'stats',
  'features',
  'pricing',
  'voice',
  'steps',
  'kinetic',
] as const;
export const serviceScreenIds = ['phone', 'desktop', 'both', 'none'] as const;
export const serviceStyleIds = ['clean', 'noir', 'vivid'] as const;

export type ServiceLayout = (typeof serviceLayoutIds)[number];
export type ServiceScreen = (typeof serviceScreenIds)[number];
export type ServiceStyle = (typeof serviceStyleIds)[number];

/** Where in a screenshot a feature lives (0–1), and how far to zoom into it. */
const focus = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  zoom: z.number().min(1).max(3),
});

export const serviceReelSchema = z.object({
  layout: z.enum(serviceLayoutIds),
  /** Which screenshots to show. Falls back to whatever is supplied (phone → desktop → photos → none). */
  screen: z.enum(serviceScreenIds),
  style: z.enum(serviceStyleIds),

  name: z.string().max(24),
  tagline: z.string().max(48),
  /** Small label above the hook, e.g. "Hair salon · Shibuya". */
  category: z.string().max(32).optional(),
  logo: z.string().optional(),
  url: z.string().max(40).optional(),
  /** Screenshots: a tall phone capture and/or a 16:10 desktop capture. */
  phone: z.string().optional(),
  desktop: z.string().optional(),
  /** Photos of the place, product or people; used where there is no screen. */
  photos: z.array(z.string()).max(4).optional(),

  /** One to three short hook lines; `hookEmphasis` (a word in them) gets the accent. */
  hook: z.array(z.string().max(26)).min(1).max(3),
  hookEmphasis: z.string().max(20).optional(),
  /** Pain points for problem → solution and before/after. */
  pains: z.array(z.string().max(40)).max(3).optional(),
  features: z
    .array(
      z.object({
        title: z.string().max(30),
        body: z.string().max(80).optional(),
        focus: focus.optional(),
        /** Photo for this point (no-screen layouts); defaults to photos[i]. */
        photo: z.string().optional(),
      }),
    )
    .min(1)
    .max(3),
  stats: z
    .array(
      z.object({
        value: z.number(),
        decimals: z.number().int().min(0).max(2).optional(),
        prefix: z.string().max(3).optional(),
        suffix: z.string().max(6).optional(),
        label: z.string().max(30),
      }),
    )
    .max(3)
    .optional(),
  testimonial: z
    .object({
      quote: z.string().max(130),
      name: z.string().max(28),
      role: z.string().max(36).optional(),
      rating: z.number().min(1).max(5).optional(),
      avatar: z.string().optional(),
    })
    .optional(),
  plans: z
    .array(
      z.object({
        name: z.string().max(16),
        price: z.string().max(10),
        period: z.string().max(10).optional(),
        perks: z.array(z.string().max(24)).max(3),
        featured: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(3)
    .optional(),
  /** Three how-it-works steps; defaults to the features. */
  steps: z
    .array(
      z.object({
        title: z.string().max(26),
        body: z.string().max(64).optional(),
      }),
    )
    .min(2)
    .max(3)
    .optional(),
  /** Campaign sticker, e.g. "First month free". */
  offer: z.string().max(28).optional(),
  cta: z.string().max(26),
  /** The end card's pointer to the profile link, e.g. "Details in our profile". */
  ctaNote: z.string().max(34).optional(),

  accent: zColor(),
  accent2: zColor().optional(),
  bpm: z.number().min(90).max(160),
  music: z.string().optional(),
  /** Soft whooshes on cuts and taps on clicks. */
  sfx: z.boolean().optional(),
  lang: z.enum(langs).optional(),
});

export type ServiceReelProps = z.infer<typeof serviceReelSchema>;
