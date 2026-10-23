// A service-introduction reel from a template (src/templates/servicereel-catalog.ts): the user gives a name,
// a description, facts and any screenshots or photos; Gemini writes the copy for the template's layout.
// Numbers come only from the facts the user typed, so the reel never invents results.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { serviceReelSchema, type ServiceReelProps } from '../src/servicereel.ts';
import { serviceTemplates } from '../src/templates/servicereel-catalog.ts';
import { copyLanguage, fit, type Lang } from '../src/lang.ts';
import { askJson, generateMusic } from './gemini.ts';
import { goalLine } from './goals.ts';
import { publicDir } from './paths.ts';
import { Usage } from './usage.ts';

const hex = z.string().describe('#RRGGBB');
const planSchema = z.object({
  tagline: z.string().describe('one-line promise, max 24 characters in the target language'),
  category: z.string().describe('small label like "Hair salon · Shibuya", max 16 characters'),
  hook: z.array(z.string()).describe('1-3 short hook lines, max 13 characters each, read together as one question or claim'),
  hookEmphasis: z.string().describe('one word that appears verbatim in the hook, to highlight'),
  pains: z.array(z.string()).describe('3 pain points the customer has before, max 20 characters each'),
  features: z
    .array(
      z.object({
        title: z.string().describe('max 15 characters'),
        body: z.string().describe('max 40 characters'),
        x: z.number().describe('0-1 horizontal centre of this feature in the first screenshot, 0.5 if none'),
        y: z.number().describe('0-1 vertical centre, 0.5 if none'),
        zoom: z.number().describe('1.2-2.4'),
      }),
    )
    .describe('exactly 3 features or selling points'),
  stats: z
    .array(z.object({ value: z.number(), suffix: z.string().describe('unit, max 3 characters'), label: z.string().describe('max 15 characters') }))
    .describe('up to 3 numbers taken ONLY from the facts text; empty if the facts contain no numbers'),
  testimonial: z
    .object({ quote: z.string().describe('max 65 characters'), name: z.string(), role: z.string() })
    .nullable()
    .describe('ONLY if the facts contain a real customer quote; otherwise null'),
  plans: z
    .array(z.object({ name: z.string(), price: z.string().describe('as written in the facts, e.g. ¥3,980'), period: z.string(), perks: z.array(z.string()), featured: z.boolean() }))
    .describe('price plans ONLY from the facts; empty if none'),
  steps: z.array(z.object({ title: z.string().describe('max 13 characters'), body: z.string().describe('max 32 characters') })).describe('3 how-it-works steps'),
  offer: z.string().describe('campaign sticker from the facts (e.g. first month free), max 14 characters, empty if none'),
  cta: z.string().describe('call to action, max 13 characters'),
  ctaNote: z.string().describe('pointer to the profile link, e.g. 詳しくはプロフィールから, max 17 characters'),
  accent: hex,
  accent2: hex,
  musicMood: z.string().describe('a few English words for the background music mood'),
});

export type ServiceBrief = {
  template: string;
  name: string;
  url?: string;
  description: string;
  facts: string;
  phone?: string;
  desktop?: string;
  photos?: string[];
  logo?: string;
  lang?: Lang;
  /** What the reel is for (server/goals.ts), picked on the home screen. */
  goal?: string;
  jobId?: string;
  onStep?: (step: number, total: number, label: string) => void;
};

export async function buildServiceProps(brief: ServiceBrief) {
  const tpl = serviceTemplates.find((t) => t.id === brief.template) ?? serviceTemplates[0];
  const lang = brief.lang ?? 'ja';
  const usage = new Usage();
  const jobId = brief.jobId ?? `job-${Date.now().toString(36)}`;
  const dir = path.join(publicDir, 'jobs', jobId);
  const rel = (f: string) => `jobs/${jobId}/${f}`;
  await mkdir(dir, { recursive: true });
  const put = async (src: string | undefined, name: string) => {
    if (!src) return undefined;
    const f = `${name}${path.extname(src) || '.png'}`;
    await copyFile(src, path.join(dir, f));
    return f;
  };
  const phone = await put(brief.phone, 'phone');
  const desktop = await put(brief.desktop, 'desktop');
  const logo = await put(brief.logo, 'logo');
  const photos = (await Promise.all((brief.photos ?? []).slice(0, 4).map((p, i) => put(p, `photo-${i + 1}`)))).filter(Boolean) as string[];

  brief.onStep?.(1, 2, 'copy');
  const shots = [desktop, phone, ...photos].filter(Boolean).map((f) => path.join(dir, f!));
  const raw = await askJson({
    images: shots.slice(0, 4),
    jsonSchema: z.toJSONSchema(planSchema),
    usage,
    step: 'plan',
    prompt: [
      `You are the creative director of a 15-second Instagram reel introducing "${brief.name}"${brief.url ? ` (${brief.url})` : ''}.`,
      `Presentation: ${tpl.nameEn}. The images are the screenshots and photos the owner gave${shots.length ? '' : ' (none)'}.`,
      `What it is: ${brief.description || '(read it from the images)'}`,
      `Facts you may use for numbers, prices, quotes and offers (never invent any): ${brief.facts || '(none)'}`,
      goalLine(brief.goal),
      `Write punchy, natural copy. ${copyLanguage(lang)} Keep every length limit. Pick accent colours from the brand in the images.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  const plan = planSchema.parse(raw);

  brief.onStep?.(2, 2, 'music');
  const music = await generateMusic({
    prompt: `Instrumental background music for a 15-second promo reel. Mood: ${plan.musicMood}. No vocals, modern production, 115-128 BPM.`,
    out: path.join(dir, 'music'),
    usage,
    step: 'music',
  }).then(
    (f) => rel(path.basename(f)),
    () => undefined,
  );

  const cut = (s: string, n: number) => s.slice(0, fit(lang, n));
  const hook = plan.hook.slice(0, 3).map((h) => cut(h, 13)).filter(Boolean);
  // Every field is given: Remotion would otherwise fill a missing one from the composition's sample props.
  const props: ServiceReelProps = serviceReelSchema.parse({
    layout: tpl.layout,
    screen: tpl.screen,
    style: tpl.style,
    name: brief.name.slice(0, 24),
    tagline: cut(plan.tagline, 24),
    category: cut(plan.category, 16),
    logo: logo ? rel(logo) : undefined,
    url: brief.url?.slice(0, 40) || undefined,
    phone: phone ? rel(phone) : undefined,
    desktop: desktop ? rel(desktop) : undefined,
    photos: photos.map(rel),
    hook: hook.length ? hook : [brief.name.slice(0, 13)],
    hookEmphasis: hook.join('').includes(plan.hookEmphasis) ? plan.hookEmphasis.slice(0, 20) : undefined,
    pains: plan.pains.slice(0, 3).map((p) => cut(p, 20)),
    features: plan.features.slice(0, 3).map((f) => ({
      title: cut(f.title, 15),
      body: cut(f.body, 40),
      focus: { x: clamp01(f.x), y: clamp01(f.y), zoom: Math.min(2.4, Math.max(1.2, f.zoom)) },
    })),
    stats: plan.stats.slice(0, 3).map((s) => ({ value: s.value, decimals: Number.isInteger(s.value) ? 0 : 1, suffix: s.suffix.slice(0, 6), label: cut(s.label, 15) })),
    testimonial: plan.testimonial ? { quote: cut(plan.testimonial.quote, 65), name: plan.testimonial.name.slice(0, 28), role: plan.testimonial.role.slice(0, 36), rating: 5 } : undefined,
    plans: plan.plans.length
      ? plan.plans.slice(0, 3).map((p) => ({ name: p.name.slice(0, 16), price: p.price.slice(0, 10), period: p.period.slice(0, 10), perks: p.perks.slice(0, 3).map((x) => x.slice(0, 24)), featured: p.featured }))
      : undefined,
    steps: plan.steps.length >= 2 ? plan.steps.slice(0, 3).map((s) => ({ title: cut(s.title, 13), body: cut(s.body, 32) })) : undefined,
    offer: plan.offer ? cut(plan.offer, 14) : undefined,
    cta: cut(plan.cta, 13),
    ctaNote: cut(plan.ctaNote, 17),
    accent: plan.accent,
    accent2: plan.accent2,
    bpm: 120,
    music,
    sfx: true,
    lang,
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId, dir, props, usage: usage.toJSON() };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
