// Talking-head sources for the gallery samples: one still per person, animated by Veo with the line they say.
//   NODE_USE_ENV_PROXY=1 node scripts/make-talkers.ts
// Output: public/samples/talkers/<name>.mp4 (9:16, 8 s, with speech).
import { existsSync } from 'node:fs';
import { imageToVideo } from '../server/gemini.ts';
import { Usage } from '../server/usage.ts';

const talkers = [
  { name: 'blonde', line: 'Okay, three things I wish I knew before moving to Tokyo. Number one will honestly surprise you.' },
  { name: 'creator', line: 'I edited this whole reel without touching a single timeline. Let me show you how.' },
  { name: 'fitness', line: 'Five minutes a day. That is all it took to completely change my mornings.' },
  { name: 'beauty', line: 'This serum changed my skin in two weeks, and it costs less than your coffee.' },
];

const usage = new Usage();
// Veo answers "high demand" now and then, so each clip is retried with a growing wait.
const retry = async <T,>(f: () => Promise<T>, tries = 6): Promise<T> => {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (e) {
      if (i >= tries - 1 || !/high demand|UNAVAILABLE|internal server|code":1[34]|429/.test(String(e))) throw e;
      await new Promise((r) => setTimeout(r, 20000 * (i + 1)));
    }
  }
};

for (const t of talkers) {
    const out = `public/samples/talkers/${t.name}.mp4`;
    if (existsSync(out)) continue;
    await retry(() => imageToVideo({
      image: `public/samples/photos/${t.name}.jpg`,
      prompt: `Selfie-style vertical video for Instagram. The person looks straight into the phone camera and talks naturally and confidently, with small natural head movements and hand gestures, and says in English: "${t.line}" Clear voice, no background music, the camera barely moves, same person, same outfit and place as the photo.`,
      negativePrompt: 'subtitles, captions, text, music, distorted face, extra people',
      out,
      seconds: 8,
      usage,
      step: `talker ${t.name}`,
    })).then(
      () => console.log(out),
      (e) => console.error(`${t.name}: ${(e as Error).message}`),
    );
}
console.log(JSON.stringify(usage.toJSON()));
