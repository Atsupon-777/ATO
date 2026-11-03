// Picks who makes each image-to-video clip: Gemini Omni (Google) or Higgsfield (Kling 3.0 / Seedance 2.5).
//
//   VIDEO_PROVIDER=gemini      Gemini Omni (default, what production has used since Oct 2026)
//   VIDEO_PROVIDER=kling       Kling 3.0 Standard via Higgsfield
//   VIDEO_PROVIDER=kling-pro   Kling 3.0 Pro via Higgsfield
//   VIDEO_PROVIDER=seedance    Seedance 2.5 via Higgsfield (much dearer per second: see config.ts)
//
// A call can override the env with `provider`. When a Higgsfield clip fails for a reason other than
// moderation, it falls back to Gemini Omni so the customer's film still finishes (VIDEO_FALLBACK=0 turns that off).
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { imageToVideo as geminiImageToVideo } from './gemini.ts';
import { HF_MODELS, higgsfieldImageToVideo, type HfModel } from './higgsfield.ts';
import type { Usage } from './usage.ts';

export const VIDEO_PROVIDERS = ['gemini', ...(Object.keys(HF_MODELS) as HfModel[])] as const;
export type VideoProvider = (typeof VIDEO_PROVIDERS)[number];

const isProvider = (v: string | undefined): v is VideoProvider => !!v && (VIDEO_PROVIDERS as readonly string[]).includes(v);

export const defaultVideoProvider = (): VideoProvider => {
  const v = process.env.VIDEO_PROVIDER?.trim().toLowerCase();
  if (v && !isProvider(v)) console.warn(`VIDEO_PROVIDER=${v} is not one of ${VIDEO_PROVIDERS.join(', ')}; using gemini`);
  return isProvider(v) ? v : 'gemini';
};

export async function imageToVideo(opts: {
  image: string;
  prompt: string;
  out: string;
  seconds?: 4 | 6 | 8;
  resolution?: '720p' | '1080p';
  negativePrompt?: string;
  usage: Usage;
  step: string;
  pollMs?: number;
  provider?: VideoProvider;
}): Promise<string> {
  const { provider = defaultVideoProvider(), ...rest } = opts;
  // what was asked of which model, next to the clip, so a take can be traced back to its prompt
  await writeFile(
    `${opts.out}.prompt.json`,
    JSON.stringify({ provider, image: path.basename(opts.image), seconds: opts.seconds ?? 8, prompt: opts.prompt, negativePrompt: opts.negativePrompt }, null, 2),
  ).catch(() => {});
  if (provider === 'gemini') return geminiImageToVideo(rest);
  try {
    return await higgsfieldImageToVideo({ ...rest, model: provider, seconds: rest.seconds ?? 8 });
  } catch (e) {
    if (process.env.VIDEO_FALLBACK === '0' || /content moderation/.test(String(e))) throw e;
    console.warn(`${opts.step}: ${provider} failed, falling back to Gemini Omni: ${(e as Error).message}`);
    return geminiImageToVideo(rest);
  }
}
