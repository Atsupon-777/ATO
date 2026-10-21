import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Usage } from './usage.ts';

const run = promisify(execFile);
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'cutout.py');

export type Cutout = { file: string; width: number; height: number; aspect: number; bbox: [number, number, number, number] };

/** Runs BiRefNet locally (no API cost) and returns the trimmed transparent PNG. */
export async function cutout(input: string, out: string, usage: Usage): Promise<Cutout> {
  const { stdout } = await run(process.env.PYTHON ?? 'python3', [script, input, out], { maxBuffer: 1 << 20 });
  const info = JSON.parse(stdout.trim().split('\n').pop()!);
  usage.add({ step: 'cutout', model: 'birefnet-general-lite (local)', units: '1 image', usd: 0 });
  return { file: out, ...info };
}
