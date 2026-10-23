// Two-pass EBU R128 loudness normalisation for a finished MP4: measures, then applies a linear gain to
// hit the target (-14 LUFS is what Instagram/TikTok/YouTube play back at). The video stream is copied.
import { execFile } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** loudnorm's first pass over `file`; undefined when there is nothing to normalise (silence). */
async function measure(file: string, target: number, truePeak: number) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', `loudnorm=I=${target}:TP=${truePeak}:LRA=11:print_format=json`, '-f', 'null', '-'], {
    maxBuffer: 32 << 20,
  });
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  const before = Number(m.input_i);
  const af = `loudnorm=I=${target}:TP=${truePeak}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  return { before, af: Number.isFinite(before) && before >= -60 ? af : undefined };
}

export async function loudnorm(file: string, target = -14, truePeak = -1) {
  const { before, af } = await measure(file, target, truePeak);
  if (!af) return { before, target, skipped: true };
  const tmp = file.replace(/\.mp4$/, '') + '.norm.mp4';
  await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c:v', 'copy', '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '256k', tmp], { maxBuffer: 32 << 20 });
  await rename(tmp, file);
  return { before, target };
}

/**
 * Puts a render's picture (`video`, no sound) and its PCM mix (`wav`, see render.ts audioTo) together with
 * the single AAC encode the voice gets, normalised to -14 LUFS: 256 kbps, or 320 kbps for 高音質. The video
 * stream is copied. Replaces `video` and removes `wav`.
 */
export async function finish(video: string, wav: string, opts: { hq?: boolean; target?: number; truePeak?: number } = {}) {
  const target = opts.target ?? -14;
  // a failed measurement only skips normalisation; the sound still goes in
  const { before, af } = await measure(wav, target, opts.truePeak ?? -1).catch(() => ({ before: NaN, af: undefined }));
  const tmp = video.replace(/\.mp4$/, '') + '.mux.mp4';
  try {
    await run('ffmpeg', [
      '-v', 'error', '-y', '-i', video, '-i', wav, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy',
      ...(af ? ['-af', af] : []),
      '-ar', '48000', '-c:a', 'aac', '-b:a', opts.hq ? '320k' : '256k', '-movflags', '+faststart', tmp,
    ], { maxBuffer: 32 << 20 });
    await rename(tmp, video);
  } finally {
    await rm(tmp, { force: true });
    await rm(wav, { force: true });
  }
  return { before, target, skipped: !af };
}

/** Integrated loudness of a file in LUFS. */
export async function measureLufs(file: string) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { maxBuffer: 32 << 20 });
  const all = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  return Number(all[all.length - 1]?.[1]);
}
