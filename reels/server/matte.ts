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
