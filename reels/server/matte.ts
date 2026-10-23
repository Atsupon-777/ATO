import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Usage } from './usage.ts';

const run = promisify(execFile);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'matte.py');

/**
 * Person matte for a talking video, as a transparent WebM aligned frame for frame with the source.
 * Runs locally (no API cost). Effects such as couch wall, cover story or doodle boil use it to put
 * graphics behind the speaker or trace their outline.
 */
export async function matte(input: string, out: string, usage: Usage, opts: { model?: string; height?: number; feather?: number } = {}) {
  const args = [script, input, out];
  if (opts.model) args.push('--model', opts.model);
  if (opts.height) args.push('--height', String(opts.height));
  if (opts.feather !== undefined) args.push('--feather', String(opts.feather));
  const { stdout } = await run(process.env.PYTHON ?? 'python3', args, { maxBuffer: 1 << 24, timeout: 60 * 60 * 1000 });
  const info = JSON.parse(stdout.trim().split('\n').pop()!) as { out: string; frames: number; model: string };
  usage.add({ step: 'matte', model: `${info.model} (local)`, units: `${info.frames} frames`, usd: 0 });
  return info;
}

/**
 * Where the speaker's face sits in the reel's 9:16 frame, read from the matte (no API cost): the top of the
 * person mask is the top of the head, its width there gives the head size, and the face centre is half a
 * head below. Medians over a few frames. Undefined when the matte holds no person.
 */
export async function measureSubject(matteFile: string, focusX = 0.5): Promise<{ x: number; y: number; h: number } | undefined> {
  try {
    const { stdout: dims } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', matteFile]);
    const [mw, mh] = dims.trim().split(',').map(Number);
    if (!mw || !mh) return undefined;
    const rows = 64;
    const cols = Math.max(8, Math.round((rows * mw) / mh));
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-c:v', 'libvpx-vp9', '-i', matteFile, '-vf', `fps=2,scale=${cols}:${rows}`, '-frames:v', '40', '-pix_fmt', 'rgba', '-f', 'rawvideo', '-'], {
      encoding: 'buffer',
      maxBuffer: 1 << 26,
    });
    const buf = stdout as unknown as Buffer;
    const size = cols * rows * 4;
    const xs: number[] = [];
    const ys: number[] = [];
    const hs: number[] = [];
    for (let f = 0; f + size <= buf.length; f += size) {
      const span = (r: number) => {
        let lo = -1;
        let hi = -1;
        for (let c = 0; c < cols; c++) if (buf[f + (r * cols + c) * 4 + 3] > 128) (lo < 0 && (lo = c), (hi = c));
        return hi - lo + 1 >= 2 ? [lo, hi] : null;
      };
      let top = -1;
      for (let r = 0; r < rows && top < 0; r++) if (span(r)) top = r;
      if (top < 0 || top > rows * 0.7) continue;
      const head = [1, 2, 3, 4, 5].map((k) => span(Math.min(rows - 1, top + k))).filter(Boolean) as number[][];
      if (!head.length) continue;
      const w = head.map(([a, b]) => b - a + 1).sort((a, b) => a - b)[Math.floor(head.length / 2)];
      const cx = head.reduce((n, [a, b]) => n + (a + b + 1) / 2, 0) / head.length;
      // head height ≈ 1.3 × head width, in frame fractions (columns and rows have different pixel sizes)
      const hFrac = (1.3 * (w / cols) * mw) / mh;
      xs.push(cx / cols);
      ys.push(top / rows + hFrac / 2);
      hs.push(hFrac);
    }
    if (!xs.length) return undefined;
    const med = (a: number[]) => [...a].sort((p, q) => p - q)[Math.floor(a.length / 2)];
    let x = med(xs);
    let y = med(ys);
    let h = med(hs);
    // the reel covers 9:16 with the footage: map from matte frame to reel frame
    const a = mw / mh;
    if (a > 9 / 16) {
      const fw = 9 / 16 / a;
      x = (x - focusX * (1 - fw)) / fw;
    } else if (a < 9 / 16) {
      const fh = a / (9 / 16);
      y = (y - (1 - fh) / 2) / fh;
      h /= fh;
    }
    const c = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
    return { x: c(x), y: c(y), h: c(h) };
  } catch (e) {
    console.warn(`measureSubject: ${(e as Error).message}`);
    return undefined;
  }
}
