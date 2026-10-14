// Screenshots + a short description → SaaSPromo props. Gemini writes the copy and picks focus points;
// numbers come only from the facts the user typed, so the reel never invents results.
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { saasPromoSchema, type SaaSPromoProps } from '../src/schemas.ts';
import { askJson } from './gemini.ts';
import { Usage } from './usage.ts';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

const hex = z.string().describe('#RRGGBB');
const planSchema = z.object({
  hook: z.array(z.string()).describe('exactly 3 short Japanese lines (max 12 characters each) that read as one question or claim aimed at the target customer'),
  hookEmphasis: z.string().describe('one word (max 10 characters) that appears verbatim in the hook lines, to highlight'),
  chips: z.array(z.string()).describe('2-4 short Japanese feature tags, max 14 characters each'),
  features: z
    .array(
      z.object({
        kicker: z.string().describe('short English label, 1-3 words'),
        title: z.string().describe('Japanese headline, max 16 characters'),
        device: z.enum(['desktop', 'mobile']).describe('which screenshot shows this feature (mobile only if a mobile screenshot was given)'),
        x: z.number().describe('0-1 horizontal centre of the feature in that screenshot'),
        y: z.number().describe('0-1 vertical centre of the feature in that screenshot'),
        zoom: z.number().describe('1.4-2.6, how close to frame it'),
      }),
    )
    .describe('exactly 3 features, each clearly visible in a screenshot'),
  stats: z
    .array(z.object({ value: z.number(), suffix: z.string().describe('unit, max 6 characters, e.g. 万回, %, 社'), label: z.string().describe('max 14 characters') }))
    .describe('up to 3 numbers taken ONLY from the facts text. Empty array if the facts contain no numbers.'),
  cta: z.string().describe('Japanese call to action, max 14 characters'),
  palette: z.object({ bg: hex, ink: hex, accent: hex, accent2: hex, panel: hex }).describe('brand colours read from the screenshots; bg and ink must contrast strongly'),
});

export type SaasBrief = {
  name: string;
  url: string;
  description: string;
  /** Numbers the reel may show, e.g. "導入社数 120社, 作業時間 70%削減". */
  facts: string;
  desktop: string;
  mobile?: string;
  logo?: string;
  jobId?: string;
  onStep?: (step: number, total: number, label: string) => void;
};

export async function buildSaasProps(brief: SaasBrief) {
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
  const desktop = (await put(brief.desktop, 'desktop'))!;
  const mobile = await put(brief.mobile, 'mobile');
  const logo = await put(brief.logo, 'logo');

  brief.onStep?.(1, 2, 'copy and layout');
  const images = [path.join(dir, desktop), ...(mobile ? [path.join(dir, mobile)] : [])];
  const raw = await askJson({
    images,
    jsonSchema: z.toJSONSchema(planSchema),
    usage,
    step: 'plan',
    prompt: [
      `You are the creative director of a 20-second Instagram reel promoting the web service "${brief.name}" (${brief.url}).`,
      `IMAGE 1 is the desktop screenshot${mobile ? ', IMAGE 2 the mobile screenshot' : ' (there is no mobile screenshot, so every feature uses device "desktop")'}.`,
      `What it does: ${brief.description || '(read it from the screenshots)'}`,
      `Facts you may use for numbers (never invent numbers): ${brief.facts || '(none)'}`,
      'Write punchy, natural Japanese copy. Keep every length limit.',
    ].join('\n'),
  });
  const plan = planSchema.parse(raw);

  brief.onStep?.(2, 2, 'build props');
  const stats = plan.stats.slice(0, 3);
  // The template needs three stats; empty ones are flagged in the editor for the user to fill.
  while (stats.length < 3) stats.push({ value: 0, suffix: '', label: '' });
  const hook = [...plan.hook, '', '', ''].slice(0, 3).map((h) => h.slice(0, 12));
  const props: SaaSPromoProps = saasPromoSchema.parse({
    name: brief.name.slice(0, 20),
    ...(logo ? { logo: rel(logo) } : {}),
    url: brief.url.slice(0, 40),
    hook,
    hookEmphasis: hook.join('').includes(plan.hookEmphasis) ? plan.hookEmphasis.slice(0, 10) : '',
    desktop: rel(desktop),
    ...(mobile ? { mobile: rel(mobile) } : {}),
    chips: plan.chips.slice(0, 4).map((c) => c.slice(0, 14)),
    features: plan.features.slice(0, 3).map((f) => ({
      kicker: f.kicker.slice(0, 16),
      title: f.title.slice(0, 16),
      device: mobile ? f.device : 'desktop',
      focus: { x: clamp01(f.x), y: clamp01(f.y), zoom: Math.min(2.6, Math.max(1.2, f.zoom)) },
    })),
    stats: stats.map((s) => ({ value: s.value, suffix: s.suffix.slice(0, 6), label: s.label.slice(0, 14) })),
    cta: plan.cta.slice(0, 14),
    bpm: 128,
    palette: plan.palette,
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId, dir, props, usage: usage.toJSON() };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
