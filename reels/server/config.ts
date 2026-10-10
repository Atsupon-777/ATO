// Model choices and unit prices live here so they can be changed without touching the pipeline.
// Prices are USD list prices checked on 2026-10-10 and are used only for the per-job cost ledger.

const env = (name: string, fallback: string) => process.env[name] || fallback;

export const models = {
  /** Vision + planning (structured JSON). */
  text: env('REELS_TEXT_MODEL', 'gemini-3.8-flash'),
  /** Product photo editing. Nano Banana 2.1. */
  image: env('REELS_IMAGE_MODEL', 'gemini-nano-banana-2.1'),
  /** Image-to-video. */
  video: env('REELS_VIDEO_MODEL', 'veo-3.1-fast-generate-preview'),
};

export const prices = {
  /** per output image, by size */
  image: { '1K': 0.0336, '2K': 0.0504, '4K': 0.113 } as Record<string, number>,
  /** per second of video without audio, by model family and resolution */
  video: {
    fast: { '720p': 0.08, '1080p': 0.1 },
    lite: { '720p': 0.03, '1080p': 0.05 },
    standard: { '720p': 0.2, '1080p': 0.2 },
  } as Record<string, Record<string, number>>,
  /** per million tokens, input / output (estimate for the default text model) */
  text: { input: Number(env('REELS_TEXT_PRICE_IN', '0.5')), output: Number(env('REELS_TEXT_PRICE_OUT', '3')) },
};

export const videoFamily = (model: string) => (model.includes('lite') ? 'lite' : model.includes('fast') ? 'fast' : 'standard');

export const requireKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set. Add it to the environment (never commit it).');
  return key;
};
