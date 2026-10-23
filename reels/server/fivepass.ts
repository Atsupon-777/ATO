// 5-pass edit (@zeeuiux method). A talking video is finished in five passes, run one at a time; after each
// the editor shows a preview and waits for the director's note, which can redo just that pass:
//   1 transcribe  → words (Gemini, snapped to the audio)        2 cut out → soft-edged person matte (local)
//   3 captions    → 1-3 words, one big key word (Gemini)         4 motion  → one scene per idea, on its word (Gemini)
//   5 sound       → whoosh / tap / chime cues; export at -14 LUFS (loudnorm.ts)
// Every pass rewrites only its own part of the props, and each result is kept as fivepass/p<N>-v<k>.json.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { fivePassSchema, type FivePassProps } from '../src/schemas.ts';
import { cardSceneTypes, sceneTaps } from '../src/effects/cues.ts';
import { LANG_NAMES, fit, langs, type Lang } from '../src/lang.ts';
import { askJson } from './gemini.ts';
import { EFFECT_GUIDE } from './effects.ts';
import { matte } from './matte.ts';
import { buildTalkProps } from './talk.ts';
import { Usage } from './usage.ts';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

/** Scenes pass 4 may use: the three card types plus full-screen effects that suit a talking reel. */
export const FIVE_PASS_SCENES = [...cardSceneTypes, 'kineticType', 'digitalZoom', 'glassType', 'coverStory', 'chartGrow', 'infographic'] as const;

export type PassResult = { props: FivePassProps; usage: ReturnType<Usage['toJSON']>; version: number };

const jobDir = (jobId: string) => path.join(publicDir, 'jobs', jobId);
const propsFile = (jobId: string) => path.join(jobDir(jobId), 'fivepass.json');

export async function loadFivePass(jobId: string): Promise<FivePassProps> {
  return fivePassSchema.parse(JSON.parse(await readFile(propsFile(jobId), 'utf8')));
}

/** Saves the current props and a numbered copy of this pass's result (for "go back to v1"). */
async function save(jobId: string, props: FivePassProps, pass: number) {
  const hist = path.join(jobDir(jobId), 'fivepass');
  await mkdir(hist, { recursive: true });
  const version = props.notes.filter((n) => n.pass === pass).length + 1;
  await writeFile(path.join(hist, `p${pass}-v${version}.json`), JSON.stringify(props, null, 2));
  await writeFile(propsFile(jobId), JSON.stringify(props, null, 2));
  return version;
}

/** Restores a pass's earlier version (and everything after it is rebuilt from there by re-running). */
export async function restoreVersion(jobId: string, pass: number, version: number) {
  const p = fivePassSchema.parse(JSON.parse(await readFile(path.join(jobDir(jobId), 'fivepass', `p${pass}-v${version}.json`), 'utf8')));
  await writeFile(propsFile(jobId), JSON.stringify(p, null, 2));
  return p;
}

const notesFor = (props: FivePassProps, pass: number) => props.notes.filter((n) => n.pass === pass).map((n) => n.text);
const directorLines = (notes: string[]) =>
  notes.length ? ['', 'Director notes on earlier versions of this pass (follow them, newest last):', ...notes.map((n) => `- ${n}`)] : [];

// ---------- pass 1: transcript ----------

export async function pass1(brief: { video: string; jobId?: string; lang?: Lang }): Promise<PassResult & { jobId: string }> {
  const talk = await buildTalkProps({ video: brief.video, jobId: brief.jobId });
  const usage = new Usage();
  for (const l of talk.usage.lines) usage.add(l as never);
  const spokenLang = (langs as readonly string[]).find((l) => talk.language.startsWith(l)) as Lang | undefined;
  const props = fivePassSchema.parse({
    video: talk.props.video,
    focusX: 0.5,
    duration: talk.props.sourceDuration,
    pass: 1,
    words: talk.props.words,
    style: 'midnight',
    lang: brief.lang ?? spokenLang,
    notes: [],
  });
  // remember the spoken language next to the props: pass 3 translates when the reel language differs
  await writeFile(path.join(talk.dir, 'spoken-lang.txt'), talk.language);
  const version = await save(talk.jobId, props, 1);
  return { props, usage: usage.toJSON(), version, jobId: talk.jobId };
}

// ---------- pass 2: soft-edged cut-out ----------

export async function pass2(jobId: string, note?: string): Promise<PassResult> {
  const props = await loadFivePass(jobId);
  if (note) props.notes.push({ pass: 2, version: notesFor(props, 2).length + 1, text: note });
  const usage = new Usage();
  // every note on the cut-out softens the edge a little more; the outline accent is never used here
  const feather = 2.5 + 1.5 * notesFor(props, 2).length;
  const out = path.join(jobDir(jobId), 'matte.webm');
  await matte(path.join(publicDir, props.video), out, usage, { feather });
  props.matte = `jobs/${jobId}/matte.webm`;
  props.pass = Math.max(props.pass, 2);
  const version = await save(jobId, props, 2);
  return { props, usage: usage.toJSON(), version };
}

// ---------- pass 3: keyword captions ----------

const captionPlan = z.object({
  chunks: z.array(
    z.object({
      first: z.number().int().describe('index of the first word in this chunk'),
      last: z.number().int().describe('index of the last word in this chunk'),
      text: z.string().describe('what the chunk shows on screen'),
      key: z.string().optional().describe('the one big word, copied exactly from text; omit for most chunks'),
      echo: z.boolean().describe('stack fading copies of the key word (2-3 times per reel, strongest moments only)'),
    }),
  ),
});

/** Plain fallback: up to 3 words a chunk (2 phrases in Japanese/Chinese), the longest word of every third chunk as the key. */
export function autoCaptions(words: FivePassProps['words']): FivePassProps['captions'] {
  const out: FivePassProps['captions'] = [];
  const cjk = /[\u3040-\u9fff]/.test(words.map((w) => w.text).join(''));
  const n = cjk ? 2 : 3;
  for (let i = 0; i < words.length; i += n) {
    const g = words.slice(i, i + n);
    const text = g.map((w) => w.text).join(cjk ? '' : ' ');
    const key = out.length % 3 === 1 ? [...g].sort((a, b) => b.text.length - a.text.length)[0].text.replace(/[、。,.!?！？]/g, '') : undefined;
    out.push({ start: g[0].start, end: g[g.length - 1].end, text, key, echo: false });
  }
  return closeCaptions(out);
}

function closeCaptions(c: FivePassProps['captions']) {
  return c.map((x, i) => ({ ...x, end: c[i + 1] ? Math.max(x.end, c[i + 1].start) : x.end + 0.3 }));
}

export async function pass3(jobId: string, note?: string): Promise<PassResult> {
  const props = await loadFivePass(jobId);
  if (note) props.notes.push({ pass: 3, version: notesFor(props, 3).length + 1, text: note });
  const usage = new Usage();
  const spokenCode = await readFile(path.join(jobDir(jobId), 'spoken-lang.txt'), 'utf8').catch(() => props.lang ?? 'en');
  const target = props.lang;
  const translate = Boolean(target && !spokenCode.startsWith(target));
  const words = props.words;
  try {
    const plan = captionPlan.parse(
      await askJson({
        images: [],
        usage,
        step: 'pass 3 captions',
        temperature: 0.4,
        jsonSchema: z.toJSONSchema(captionPlan),
        prompt: [
          'You are captioning a vertical talking-head reel in the "keyword" style: captions appear the moment they are said, 1-3 words at a time.',
          'Group the numbered words below into consecutive chunks that cover every word in order (no gaps, no overlaps).',
          translate
            ? `The reel is for a ${LANG_NAMES[target!].english} audience: chunks follow meaning (a short phrase each, about ${fit(target!, 8)} characters), and text is a natural ${LANG_NAMES[target!].english} subtitle of those words.`
            : 'Each chunk holds 1-3 words and text is those words exactly as spoken (drop fillers like um/えー if they are their own chunk).',
          'At most one key word per chunk, and only in about one chunk in three: the word that carries the idea (a number, a feeling, the turn of the sentence). key must be copied exactly from text.',
          'Set echo on 2-3 of the strongest keys only.',
          ...directorLines(notesFor(props, 3)),
          '',
          ...words.map((w, i) => `${i}: ${w.text}`),
        ].join('\n'),
      }),
    );
    const caps = plan.chunks
      .filter((c) => c.first >= 0 && c.last < words.length && c.first <= c.last)
      .sort((a, b) => a.first - b.first)
      .map((c) => ({
        start: words[c.first].start,
        end: words[c.last].end,
        text: c.text,
        key: c.key && c.text.toLowerCase().includes(c.key.toLowerCase()) ? c.key : undefined,
        echo: Boolean(c.key) && c.echo,
      }));
    props.captions = closeCaptions(caps);
  } catch (e) {
    console.error('caption plan failed, using plain chunks', e);
    props.captions = autoCaptions(words);
  }
  props.pass = Math.max(props.pass, 3);
  const version = await save(jobId, props, 3);
  return { props, usage: usage.toJSON(), version };
}

// ---------- pass 4: motion scenes ----------

const scenePlan = z.object({
  scenes: z.array(
    z.object({
      type: z.enum(FIVE_PASS_SCENES),
      trigger: z.number().int().describe('index of the word that starts the scene'),
      until: z.number().int().describe('index of the last word the scene stays for'),
      items: z.array(z.string()),
      text: z.string().optional(),
      value: z.number().optional(),
      place: z.enum(['top', 'bottom']),
    }),
  ),
});

export async function pass4(jobId: string, note?: string): Promise<PassResult> {
  const props = await loadFivePass(jobId);
  if (note) props.notes.push({ pass: 4, version: notesFor(props, 4).length + 1, text: note });
  const usage = new Usage();
  const words = props.words;
  const said = words.map((w) => w.text).join(' ').toLowerCase();
  const lang = props.lang ?? 'en';
  const spokenCode = await readFile(path.join(jobDir(jobId), 'spoken-lang.txt'), 'utf8').catch(() => lang);
  // with translated captions the name is written in the reel's language, so it cannot be matched word for word
  const translated = !spokenCode.startsWith(lang);
  const plan = scenePlan.parse(
    await askJson({
      images: [],
      usage,
      step: 'pass 4 motion',
      temperature: 0.6,
      jsonSchema: z.toJSONSchema(scenePlan),
      prompt: [
        'You are the motion designer of a vertical talking-head reel. Read the transcript and plan one scene per idea',
        `(about one every 4-6 seconds of a ${props.duration.toFixed(0)}-second reel; leave calm gaps with captions only).`,
        'Each scene starts on the word that triggers it (trigger = that word index) and lasts until the idea ends (until). Scenes must not overlap.',
        'Cards appear above or below the face, never over it: place = top unless the speaker sits high in frame.',
        `Write items and text in ${LANG_NAMES[lang].english}. A sourceCard only names an institution or study the speaker actually says; never invent one.`,
        'A good 20-second shape: hook → notifications → tiles → another card → sourceCard, when the words support it.',
        ...directorLines(notesFor(props, 4)),
        '',
        'Scene types:',
        ...FIVE_PASS_SCENES.map((k) => `- ${k}: ${EFFECT_GUIDE[k]}`),
        '',
        'Transcript (index: start s: word):',
        ...words.map((w, i) => `${i}: ${w.start.toFixed(2)}: ${w.text}`),
      ].join('\n'),
    }),
  );
  const scenes = plan.scenes
    .filter((s) => s.trigger >= 0 && s.until < words.length && s.trigger <= s.until)
    // a source the speaker did not name is dropped rather than shown
    .filter((s) => s.type !== 'sourceCard' || !s.text || translated || said.includes(s.text.toLowerCase().split(/\s+/)[0]))
    .sort((a, b) => a.trigger - b.trigger)
    .map((s) => ({
      type: s.type,
      trigger: words[s.trigger].text,
      // on the first frame of the trigger word
      start: words[s.trigger].start,
      end: Math.max(words[s.until].end, words[s.trigger].start + 1.2),
      items: s.items.slice(0, 6),
      text: s.text,
      value: s.value,
      place: s.place,
    }));
  for (let i = 0; i < scenes.length - 1; i++) scenes[i].end = Math.min(scenes[i].end, scenes[i + 1].start);
  props.scenes = scenes;
  props.pass = Math.max(props.pass, 4);
  const version = await save(jobId, props, 4);
  return { props, usage: usage.toJSON(), version };
}

// ---------- pass 5: sound ----------

/** Cue sounds from the scenes: a whoosh on the hook and on each full-screen effect, a tap per card or tile, a chime to close. */
export function cueSounds(props: FivePassProps): FivePassProps['sfx'] {
  const round = (t: number) => Math.round(Math.max(0, t) * 100) / 100;
  const cards = cardSceneTypes as readonly string[];
  return [
    { kind: 'whoosh' as const, at: 0 },
    ...props.scenes.filter((s) => !cards.includes(s.type)).map((s) => ({ kind: 'whoosh' as const, at: round(s.start - 0.15) })),
    ...props.scenes.flatMap((s) => (cards.includes(s.type) ? sceneTaps(s.type, s.start, s.end, s.items.length).map((t) => ({ kind: 'tap' as const, at: round(t) })) : [])),
    { kind: 'chime' as const, at: round(props.duration - 1.4) },
  ].sort((a, b) => a.at - b.at);
}

export async function pass5(jobId: string, note?: string): Promise<PassResult> {
  const props = await loadFivePass(jobId);
  if (note) props.notes.push({ pass: 5, version: notesFor(props, 5).length + 1, text: note });
  props.sfx = cueSounds(props);
  props.pass = 5;
  const version = await save(jobId, props, 5);
  return { props, usage: new Usage().toJSON(), version };
}

/** Runs one pass by number (2-5 work on an existing job; 1 starts one). */
export async function runPass(pass: number, opts: { jobId: string; note?: string }) {
  if (pass === 2) return pass2(opts.jobId, opts.note);
  if (pass === 3) return pass3(opts.jobId, opts.note);
  if (pass === 4) return pass4(opts.jobId, opts.note);
  if (pass === 5) return pass5(opts.jobId, opts.note);
  throw new Error('pass 1 starts a job: call pass1({ video })');
}
