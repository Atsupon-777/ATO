// シーン案: from one product photo, Gemini proposes about six different worlds for the ad film (morning
// washstand, seaside, hotel, rainy window...). The person taps one, or edits its sentence, or writes their own;
// the chosen sentence then steers the film's set, light and mood (server/photoad.ts `scene`).
// One text call with the photo: cheap enough to be free, so it costs no tokens.
import { z } from 'zod';
import { LANG_NAMES, type Lang } from '../src/lang.ts';
import { askJson } from './gemini.ts';
import { goalLine } from './goals.ts';
import { Usage } from './usage.ts';

export const SCENE_COUNT = 6;

const scenesSchema = z.object({
  scenes: z
    .array(
      z.object({
        title: z.string().describe('a short name for the scene in the target language, max 10 characters, e.g. 朝の洗面台'),
        prompt: z
          .string()
          .describe('one or two plain sentences in the target language that the customer can read and edit, describing the place, light and mood around the product (max 70 characters), e.g. 白いタイルの洗面台に朝日が差し込む。水滴の付いたボトルと、白いタオル。'),
        colors: z.array(z.string()).describe('two colours that represent the scene, as #rrggbb hex codes, for the card background'),
      }),
    )
    .min(SCENE_COUNT)
    .max(SCENE_COUNT)
    .describe(`exactly ${SCENE_COUNT} scenes, never fewer`),
});
export type Scene = z.infer<typeof scenesSchema>['scenes'][number];

export async function suggestScenes(opts: { photo: string; brand?: string; description?: string; goal?: string; lang: Lang; avoid?: string[] }) {
  const usage = new Usage();
  // The model sometimes stops after two or three ideas; ask once more if so.
  for (let attempt = 0; ; attempt++) {
    const out = await askOnce(opts, usage);
    if (out.length >= SCENE_COUNT || attempt >= 1) return { scenes: out, usage };
  }
}

async function askOnce(opts: Parameters<typeof suggestScenes>[0], usage: Usage) {
  const raw = await askJson({
    images: [opts.photo],
    jsonSchema: z.toJSONSchema(scenesSchema),
    usage,
    step: 'scene ideas',
    temperature: 0.95,
    prompt: [
      `You plan short premium ad films for Instagram Reels. Look at this product photo${opts.brand ? ` (brand: ${opts.brand})` : ''}${opts.description ? ` (${opts.description})` : ''}.`,
      `Propose EXACTLY ${SCENE_COUNT} clearly different worlds to film it in. Each is one place with its own light and mood where this kind of product naturally belongs:`,
      'mix everyday (a washstand, a kitchen, a desk), nature (sea, forest, garden, snow), premium (hotel, gallery, stone), and one unexpected but fitting idea.',
      'Every scene must be easy for a video model to render cleanly: one product, a simple set, real light. No celebrities, no other brands, no text in the picture, no medical or before/after claims.',
      opts.avoid?.length ? `Do NOT repeat or closely resemble these scenes the customer already saw: ${opts.avoid.slice(0, 30).join(' / ')}.` : '',
      goalLine(opts.goal),
      `Write title and prompt in ${LANG_NAMES[opts.lang].english}.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  const scenes = z.object({ scenes: z.array(scenesSchema.shape.scenes.element) }).parse(raw).scenes;
  const hex = (c: string | undefined, fallback: string) => (c && /^#[0-9a-fA-F]{6}$/.test(c.trim()) ? c.trim() : fallback);
  return scenes.slice(0, SCENE_COUNT).map((s) => ({ title: s.title.slice(0, 16), prompt: s.prompt.slice(0, 140), colors: [hex(s.colors[0], '#6b5b73'), hex(s.colors[1], '#2a2430')] }));
}

/**
 * One picture per scene card, so the cards differ at a glance: this product, re-shot in that scene, as a 1K
 * vertical still (Nano Banana, about $0.03). The picked one is passed on to the film as a look reference.
 */
export async function previewScene(opts: { photo: string; scene: string; out: string }) {
  const { editImage } = await import('./gemini.ts');
  const usage = new Usage();
  await editImage({
    input: [opts.photo],
    out: opts.out,
    aspectRatio: '9:16',
    imageSize: '1K',
    usage,
    step: 'scene preview',
    prompt: [
      'Reference: a phone photo of a product. Re-shoot exactly this product as one still from its premium vertical ad film, set in this scene (the customer wrote it, maybe in Japanese):',
      opts.scene,
      'Keep the product exactly as photographed: same shape, colour, cap and label. Build the place, light and mood around it so the scene is obvious at a glance, product clearly visible and in focus.',
      'Photorealistic commercial photography, natural light, shallow depth of field. No people, no hands, no text, letters or logos added to the image.',
    ].join('\n'),
  });
  return usage;
}
