// Same stills, same prompts, every video provider: to compare Gemini Omni with Kling 3.0 and Seedance 2.5.
// SPENDS MONEY on each provider. Print the price first without generating anything:
//   node scripts/video-bakeoff.ts --quote <still.jpg>... [--seconds 8] [--providers gemini,kling,seedance]
// Then generate:
//   NODE_USE_ENV_PROXY=1 node scripts/video-bakeoff.ts --out bakeoff <still.jpg>... --prompt "slow push in on the bottle"
// Output: <out>/<still>.<provider>.mp4 and <out>/usage.json (cost per clip).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { prices } from '../server/config.ts';
import { estimateUsd, HF_MODELS, type HfModel } from '../server/higgsfield.ts';
import { Usage } from '../server/usage.ts';
import { imageToVideo, VIDEO_PROVIDERS, type VideoProvider } from '../server/video.ts';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args.splice(i, 2)[1] : undefined;
};
const quote = args.includes('--quote') && !!args.splice(args.indexOf('--quote'), 1);
const out = flag('out') ?? 'bakeoff';
const seconds = Number(flag('seconds') ?? 8) as 4 | 6 | 8;
const prompt = flag('prompt') ?? 'Slow cinematic push-in, soft natural light moving across the scene. One continuous shot, real-world physics, nothing morphs.';
const providers = (flag('providers')?.split(',') ?? [...VIDEO_PROVIDERS]).filter((p): p is VideoProvider => (VIDEO_PROVIDERS as readonly string[]).includes(p));
const stills = args;
if (!stills.length) throw new Error('give one or more still images');

if (quote) {
  let total = 0;
  for (const p of providers) {
    const usd =
      p === 'gemini'
        ? seconds * (prices.omni.perSecond[process.env.REELS_VIDEO_RES === '1080p' ? '1080p' : '720p'] ?? 0.1)
        : ((await estimateUsd(p as HfModel, { image_url: 'https://example.com/a.jpg', prompt, duration: seconds, ...(p === 'seedance' ? { resolution: '720p', generate_audio: false } : { sound: 'off' }) })) ??
          seconds * (p === 'seedance' ? prices.higgsfield.seedance['720p']! : prices.higgsfield[p as Exclude<HfModel, 'seedance'>]));
    total += usd * stills.length;
    console.log(`${p.padEnd(10)} ${HF_MODELS[p as HfModel] ?? 'gemini omni'}: $${usd.toFixed(3)} per ${seconds}s clip × ${stills.length} = $${(usd * stills.length).toFixed(2)}`);
  }
  console.log(`total ≈ $${total.toFixed(2)}`);
  process.exit(0);
}

mkdirSync(out, { recursive: true });
const usage = new Usage();
process.env.VIDEO_FALLBACK = '0'; // a bake-off must show each provider's own result
for (const still of stills)
  await Promise.all(
    providers.map(async (provider) => {
      const file = path.join(out, `${path.parse(still).name}.${provider}.mp4`);
      if (existsSync(file)) return;
      const t = Date.now();
      await imageToVideo({ image: still, prompt, out: file, seconds, usage, step: `${path.basename(still)} ${provider}`, provider }).then(
        () => console.log(`${file} (${((Date.now() - t) / 1000).toFixed(0)} s)`),
        (e) => console.error(`${file}: ${(e as Error).message}`),
      );
    }),
  );
writeFileSync(path.join(out, 'usage.json'), JSON.stringify(usage.toJSON(), null, 2));
console.log(JSON.stringify(usage.toJSON()));
