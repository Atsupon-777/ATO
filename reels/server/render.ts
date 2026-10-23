import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { mkdtemp, readdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let serveUrl: Promise<string> | null = null;

/**
 * The bundle copies its public folder, so it gets only the static assets templates load with staticFile()
 * (fonts, samples, sfx). Users' jobs and uploads reach the renderer as URLs instead.
 */
async function staticPublic() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'reels-public-'));
  const skip = new Set(['jobs', 'uploads', 'showcase']);
  for (const e of await readdir(path.join(root, 'public'))) if (!skip.has(e)) await symlink(path.join(root, 'public', e), path.join(dir, e));
  return dir;
}

export type RenderOptions = {
  /** 高画質・高音質: near-lossless frames and a lower CRF with a slower preset. */
  hq?: boolean;
  /** Frame rate to render at instead of the composition's (60 for 60 fps footage). Timing stays in seconds. */
  fps?: number;
  /**
   * Write the mixed audio here as 16-bit PCM WAV instead of into the MP4, so the one AAC encode happens
   * after loudness normalisation (server/loudnorm.ts finish()) and the voice is not encoded twice.
   */
  audioTo?: string;
};

/**
 * Picture settings. Remotion's API defaults (JPEG frames at quality 80, no colour tags, BT.601 matrix,
 * full-range yuvj420p) soften fine detail and shift colours; these keep the export as close to the footage
 * as an H.264 file for Instagram / TikTok can be: BT.709 limited range, yuv420p, High profile.
 */
export const videoSettings = (hq = false) =>
  ({
    imageFormat: hq ? 'png' : 'jpeg',
    jpegQuality: 100,
    crf: hq ? 14 : 17,
    x264Preset: hq ? 'slow' : 'medium',
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
  }) as const;

/** Bundles once per process, then renders any template with the given props. */
export async function renderTemplate(
  id: string,
  inputProps: Record<string, unknown>,
  out: string,
  onProgress?: (progress: number) => void,
  opts: RenderOptions = {},
) {
  serveUrl ??= staticPublic().then((publicDir) => bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir }));
  const url = await serveUrl;
  const browserExecutable = process.env.REMOTION_BROWSER ?? null;
  let composition = await selectComposition({ serveUrl: url, id, inputProps, browserExecutable });
  if (opts.fps && opts.fps !== composition.fps) {
    // Templates time everything in seconds via useVideoConfig().fps, so only the frame count changes.
    composition = { ...composition, fps: opts.fps, durationInFrames: Math.max(1, Math.round((composition.durationInFrames * opts.fps) / composition.fps)) };
  }
  const started = Date.now();
  await renderMedia({
    serveUrl: url,
    composition,
    inputProps,
    codec: 'h264',
    ...videoSettings(opts.hq),
    ...(opts.audioTo ? { audioCodec: 'pcm-16' as const, separateAudioTo: opts.audioTo } : { audioBitrate: '320k' }),
    outputLocation: out,
    browserExecutable,
    // the 3D scenes (src/effects/Three.tsx) need WebGL in headless Chrome
    chromiumOptions: { gl: 'angle' },
    onProgress: ({ progress }) => {
      if (onProgress) onProgress(progress);
      else process.stdout.write(`\r  render ${id} ${(progress * 100).toFixed(0)}%`);
    },
  });
  process.stdout.write('\n');
  return { out, frames: composition.durationInFrames, fps: composition.fps, seconds: (Date.now() - started) / 1000 };
}
