import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let serveUrl: Promise<string> | null = null;

/** Bundles once per process, then renders any template with the given props. */
export async function renderTemplate(id: string, inputProps: Record<string, unknown>, out: string) {
  serveUrl ??= bundle({ entryPoint: path.join(root, 'src/index.ts'), publicDir: path.join(root, 'public') });
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
    onProgress: ({ progress }) => process.stdout.write(`\r  render ${id} ${(progress * 100).toFixed(0)}%`),
  });
  process.stdout.write('\n');
  return { out, frames: composition.durationInFrames, seconds: (Date.now() - started) / 1000 };
}
