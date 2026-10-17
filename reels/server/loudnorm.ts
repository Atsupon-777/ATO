// Two-pass EBU R128 loudness normalisation for a finished MP4: measures, then applies a linear gain to
// hit the target (-14 LUFS is what Instagram/TikTok/YouTube play back at). The video stream is copied.
import { execFile } from 'node:child_process';
import { rename } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function loudnorm(file: string, target = -14, truePeak = -1) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', `loudnorm=I=${target}:TP=${truePeak}:LRA=11:print_format=json`, '-f', 'null', '-'], {
    maxBuffer: 32 << 20,
  });
  const m = JSON.parse(stderr.slice(stderr.lastIndexOf('{'), stderr.lastIndexOf('}') + 1));
  // nothing to normalise in a silent file
  if (!Number.isFinite(Number(m.input_i)) || Number(m.input_i) < -60) return { before: Number(m.input_i), target, skipped: true };
  const tmp = file.replace(/\.mp4$/, '') + '.norm.mp4';
  const af = `loudnorm=I=${target}:TP=${truePeak}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-c:v', 'copy', '-af', af, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', tmp], { maxBuffer: 32 << 20 });
  await rename(tmp, file);
  return { before: Number(m.input_i), target };
}

/** Integrated loudness of a file in LUFS. */
export async function measureLufs(file: string) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { maxBuffer: 32 << 20 });
  const all = [...stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)];
  return Number(all[all.length - 1]?.[1]);
}
