// Usage: node scripts/render.mjs <CompositionId> [props.json] [out.mp4]
// Renders a template with the given props (defaults to the composition's sample props).
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const [id, propsFile, outArg] = process.argv.slice(2);
if (!id) {
  console.error('usage: node scripts/render.mjs <CompositionId> [props.json] [out.mp4]');
  process.exit(1);
}
const inputProps = propsFile ? JSON.parse(await readFile(propsFile, 'utf8')) : undefined;
const out = outArg ?? `out/${id}.mp4`;
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const composition = await selectComposition({ serveUrl, id, inputProps, browserExecutable });
const started = Date.now();
await renderMedia({
  serveUrl,
  composition,
  inputProps,
  codec: 'h264',
  crf: 18,
  outputLocation: out,
  browserExecutable,
  onProgress: ({ progress }) => process.stdout.write(`\r${id} ${(progress * 100).toFixed(0)}%`),
});
console.log(`\n${out} (${composition.durationInFrames} frames) in ${((Date.now() - started) / 1000).toFixed(1)}s`);
