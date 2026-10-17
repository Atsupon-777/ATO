// Usage: node scripts/render-batch.mjs <jobs.json>   jobs: [{ id, props, out }]
// Like render.mjs, but bundles once for many renders (the language samples).
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const jobs = JSON.parse(await readFile(process.argv[2], 'utf8'));
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
for (const j of jobs) {
  const inputProps = JSON.parse(await readFile(j.props, 'utf8'));
  const composition = await selectComposition({ serveUrl, id: j.id, inputProps, browserExecutable });
  const t = Date.now();
  await renderMedia({ serveUrl, composition, inputProps, codec: 'h264', crf: 20, outputLocation: j.out, browserExecutable });
  console.log(`${j.out} in ${((Date.now() - t) / 1000).toFixed(0)}s`);
}
