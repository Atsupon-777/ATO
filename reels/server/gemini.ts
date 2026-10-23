import { GoogleGenAI } from '@google/genai';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { models, prices, requireKey, videoFamily } from './config.ts';
import type { Usage } from './usage.ts';

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: requireKey() }));

const mimeOf = (file: string) => {
  const ext = path.extname(file).toLowerCase();
  return ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
};

const inlineImage = async (file: string) => ({
  inlineData: { mimeType: mimeOf(file), data: (await readFile(file)).toString('base64') },
});

/**
 * Asks the text model a question about one or more images and returns JSON that matches `jsonSchema`.
 * The caller validates the result with zod; this only asks for the shape.
 */
export async function askJson(opts: {
  images: string[];
  /** Other media (e.g. audio) sent inline with an explicit MIME type. */
  media?: { file: string; mimeType: string }[];
  temperature?: number;
  prompt: string;
  jsonSchema: unknown;
  usage: Usage;
  step: string;
}): Promise<unknown> {
  const media = await Promise.all(
    (opts.media ?? []).map(async (m) => ({ inlineData: { mimeType: m.mimeType, data: (await readFile(m.file)).toString('base64') } })),
  );
  const parts = [...(await Promise.all(opts.images.map(inlineImage))), ...media, { text: opts.prompt }];
  const res = await ai().models.generateContent({
    model: models.text,
    contents: [{ role: 'user', parts }],
    config: { responseMimeType: 'application/json', responseJsonSchema: opts.jsonSchema, temperature: opts.temperature ?? 0.6 },
  });
  const u = res.usageMetadata;
  const inTok = u?.promptTokenCount ?? 0;
  const outTok = (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0);
  opts.usage.add({
    step: opts.step,
    model: models.text,
    units: `${inTok} in / ${outTok} out tokens`,
    usd: (inTok * prices.text.input + outTok * prices.text.output) / 1e6,
  });
  const text = res.text;
  if (!text) throw new Error(`${opts.step}: empty response from ${models.text}`);
  return JSON.parse(text);
}

/** Edits a photo with Nano Banana and writes the first returned image to `out`. */
export async function editImage(opts: {
  input: string[];
  prompt: string;
  out: string;
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  usage: Usage;
  step: string;
}): Promise<string> {
  const size = opts.imageSize ?? '2K';
  const parts = [...(await Promise.all(opts.input.map(inlineImage))), { text: opts.prompt }];
  const res = await ai().models.generateContent({
    model: models.image,
    contents: [{ role: 'user', parts }],
    config: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: opts.aspectRatio ?? '9:16', imageSize: size },
    },
  });
  const img = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
  if (!img?.data) {
    const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? 'no image returned';
    throw new Error(`${opts.step}: ${models.image} returned no image (${reason})`);
  }
  await writeFile(opts.out, Buffer.from(img.data, 'base64'));
  opts.usage.add({ step: opts.step, model: models.image, units: `1 image ${size}`, usd: prices.image[size] ?? prices.image['2K'] });
  return opts.out;
}

/** Image-to-video with Veo. Polls until done and downloads the MP4 to `out`. */
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
}): Promise<string> {
  const seconds = opts.seconds ?? 8;
  // Google retired the Veo 3.1 previews on the Gemini API (404 "no longer available"); Gemini Omni makes the clips now.
  if (!models.video.startsWith('veo')) return omniOnce({ ...opts, seconds });
  // Veo allows 1080p only for 8-second clips. The Gemini Developer API always returns audio
  // (generateAudio is Vertex-only); the template plays the clip muted.
  const resolution = seconds === 8 ? (opts.resolution ?? '1080p') : '720p';
  try {
    return await veoOnce({ ...opts, seconds, resolution });
  } catch (e) {
    // Veo has stretches where 1080p jobs all end in "internal server issue" (code 13) while 720p works.
    if (resolution === '1080p' && /code":13|internal server/.test(String(e))) return veoOnce({ ...opts, seconds, resolution: '720p' });
    throw e;
  }
}

async function veoOnce(opts: Parameters<typeof imageToVideo>[0] & { seconds: number; resolution: '720p' | '1080p' }): Promise<string> {
  const { seconds, resolution } = opts;
  let op = await ai().models.generateVideos({
    model: models.video,
    prompt: opts.prompt,
    image: { imageBytes: (await readFile(opts.image)).toString('base64'), mimeType: mimeOf(opts.image) },
    config: {
      aspectRatio: '9:16',
      durationSeconds: seconds,
      resolution,
      personGeneration: 'allow_adult',
      negativePrompt:
        opts.negativePrompt ??
        'warped logo, changing text, deformed product, extra parts, morphing, flicker, low quality, watermark',
    },
  });
  const started = Date.now();
  while (!op.done) {
    if (Date.now() - started > 10 * 60_000) throw new Error(`${opts.step}: Veo did not finish within 10 minutes`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 10_000));
    op = await ai().operations.getVideosOperation({ operation: op });
  }
  if (op.error) throw new Error(`${opts.step}: Veo failed: ${JSON.stringify(op.error)}`);
  const video = op.response?.generatedVideos?.[0]?.video;
  if (!video) {
    const why = op.response?.raiMediaFilteredReasons?.join('; ') || 'no video returned';
    throw new Error(`${opts.step}: ${why}`);
  }
  await ai().files.download({ file: video, downloadPath: opts.out });
  const family = videoFamily(models.video);
  opts.usage.add({
    step: opts.step,
    model: models.video,
    units: `${seconds}s ${resolution}, no audio`,
    usd: seconds * (prices.video[family]?.[resolution] ?? 0.1),
  });
  return opts.out;
}

/**
 * Image-to-video with Gemini Omni (Interactions API, run in the background and polled). 720p unless
 * REELS_VIDEO_RES=1080p: at 9:16 the film is graded and upscaled anyway, and 1080p costs half as much again.
 */
async function omniOnce(opts: Parameters<typeof imageToVideo>[0] & { seconds: number }): Promise<string> {
  const resolution = process.env.REELS_VIDEO_RES === '1080p' ? '1080p' : '720p';
  const avoid = opts.negativePrompt ?? 'warped logo, changing text, deformed product, extra parts, morphing, flicker';
  const params = {
    model: models.video,
    background: true,
    input: [
      { type: 'image', data: (await readFile(opts.image)).toString('base64'), mime_type: mimeOf(opts.image) },
      { type: 'text', text: `${opts.prompt}\nThe video starts exactly on this image. Avoid: ${avoid}. No speech, no music.` },
    ],
    generation_config: { video_config: { task: 'image_to_video' } },
    response_format: { type: 'video', aspect_ratio: '9:16', duration: `${opts.seconds}s`, resolution, delivery: 'inline' },
  };
  let it: any = await (ai().interactions.create as (p: unknown) => Promise<unknown>)(params);
  const started = Date.now();
  while (!['completed', 'failed', 'cancelled', 'incomplete', 'budget_exceeded'].includes(it.status)) {
    if (Date.now() - started > 12 * 60_000) throw new Error(`${opts.step}: ${models.video} did not finish within 12 minutes`);
    await new Promise((r) => setTimeout(r, opts.pollMs ?? 10_000));
    it = await ai().interactions.get(it.id);
  }
  if (it.status !== 'completed') throw new Error(`${opts.step}: ${models.video} ${it.status}: ${JSON.stringify(it.error ?? it.steps?.at?.(-1) ?? '').slice(0, 400)}`);
  // the clip is the first video block anywhere in the result (output_video, or inside the steps)
  const find = (v: any): any => {
    if (!v || typeof v !== 'object') return undefined;
    if (v.type === 'video' && (v.data || v.uri)) return v;
    for (const x of Array.isArray(v) ? v : Object.values(v)) {
      const f = find(x);
      if (f) return f;
    }
  };
  const video = it.output_video?.data || it.output_video?.uri ? it.output_video : find(it.steps ?? it.outputs ?? it);
  if (!video) throw new Error(`${opts.step}: ${models.video} returned no video`);
  if (video.data) await writeFile(opts.out, Buffer.from(video.data, 'base64'));
  else {
    const r = await fetch(video.uri, { headers: { 'x-goog-api-key': requireKey() } });
    if (!r.ok) throw new Error(`${opts.step}: download failed (${r.status})`);
    await writeFile(opts.out, Buffer.from(await r.arrayBuffer()));
  }
  const u = it.usage ?? {};
  const outTok = Number(u.total_output_tokens ?? 0);
  const inTok = Number(u.total_input_tokens ?? 0);
  opts.usage.add({
    step: opts.step,
    model: models.video,
    units: `${opts.seconds}s ${resolution}${outTok ? `, ${inTok} in / ${outTok} out tokens` : ''}`,
    usd: outTok ? (inTok * prices.omni.input + outTok * prices.omni.videoOut) / 1e6 : opts.seconds * (prices.omni.perSecond[resolution] ?? 0.1),
  });
  return opts.out;
}

/**
 * Instrumental music with Lyria. Writes `out` plus the extension of the returned audio type and returns that path.
 */
export async function generateMusic(opts: { prompt: string; out: string; usage: Usage; step: string }): Promise<string> {
  const res = await ai().models.generateContent({
    model: models.music,
    contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
    config: { responseModalities: ['AUDIO'] },
  });
  const audio = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/'))?.inlineData;
  if (!audio?.data) {
    const reason = res.candidates?.[0]?.finishReason ?? res.promptFeedback?.blockReason ?? 'no audio returned';
    throw new Error(`${opts.step}: ${models.music} returned no audio (${reason})`);
  }
  const ext = audio.mimeType?.includes('wav') ? '.wav' : '.mp3';
  const file = opts.out + ext;
  await writeFile(file, Buffer.from(audio.data, 'base64'));
  opts.usage.add({ step: opts.step, model: models.music, units: '1 clip', usd: prices.music });
  return file;
}

/** Lists the models this key can use, to confirm the configured ids exist. */
export async function listModels() {
  const names: string[] = [];
  const pager = await ai().models.list();
  for await (const m of pager) if (m.name) names.push(m.name.replace(/^models\//, ''));
  return names;
}
