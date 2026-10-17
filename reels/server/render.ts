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

/** Bundles once per process, then renders any template with the given props. */
export async function renderTemplate(
  id: string,
  inputProps: Record<string, unknown>,
  out: string,
  onProgress?: (progress: number) => void,
) {
  serveUrl ??= staticPublic().then((publicDir) => bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir }));
  const url = await serveUrl;
  const browserExecutable = process.env.REMOTION_BROWSER ?? null;
  const composition = await selectComposition({ serveUrl: url, id, inputProps, browserExecutable });
  const started = Date.now();
  await renderMedia({
    serveUrl: url,
    composition,
    inputProps,
    codec: 'h264',
    crf: 18,
    outputLocation: out,
    browserExecutable,
    onProgress: ({ progress }) => {
      if (onProgress) onProgress(progress);
      else process.stdout.write(`\r  render ${id} ${(progress * 100).toFixed(0)}%`);
    },
  });
  process.stdout.write('\n');
  return { out, frames: composition.durationInFrames, seconds: (Date.now() - started) / 1000 };
}
