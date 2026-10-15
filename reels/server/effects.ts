// Talking video → EffectsReel props: transcribe (talk.ts), cut the person out (matte.ts), then let Gemini
// split the talk into short beats and pick one of the 17 effects for each beat, with the text it needs.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { effectIds, effectsReelSchema, type EffectSegment, type EffectsReelProps } from '../src/schemas.ts';
import { askJson } from './gemini.ts';
import { matte } from './matte.ts';
import { buildTalkProps } from './talk.ts';
import { Usage } from './usage.ts';

/** What each effect is for, so the planner can match it to what is being said (see notes/video-effects.md). */
export const EFFECT_GUIDE: Record<(typeof effectIds)[number], string> = {
  orbit: 'social post cards circle the speaker; text = a 1-3 word accent phrase in gold script. Good for an opening hook.',
  couchWall: 'cards fill the wall behind the speaker; items = 4-6 short post titles. Good for "everyone is doing X" / proof.',
  uiWorld: 'top half becomes the app: clips drop in, a command is typed; text = app name, items = [command, label]. Good for "just drop your files".',
  frameBreak: 'the shot shrinks into a social post and the speaker breaks out of the frame; text = account name. Good for "this video was made with…".',
  digitalZoom: 'sudden punch-in on the key word; emphasis = the key word. Good for a strong statement.',
  phoneMockup: 'a phone beside the speaker shows an assistant chat with an Approve button; text = assistant name, items = 2 messages.',
  checklist: 'glass card with 2-4 steps that get checked; text = card title, items = the steps. Good for "all you need to do is…".',
  headlineWall: 'newspaper clippings and notes pile up on the wall; text = big headline, items = 3 short headlines. Good for news / trends.',
  zoomThrough: 'the camera flies through the cut with a radial blur. Good for a transition between two ideas.',
  chartGrow: 'a glowing line chart grows behind the speaker; text = badge (1 word), values = 7 numbers rising. Good for growth / results.',
  pullBack: 'the shot pulls back into an editor with a task list and a counter to 100%; items = 3-5 steps done. Good for "it does the work for you".',
  greenScreen: 'background replaced by an app screen (focus timer + tasks); items = 3 tasks + one serif line. Good for focus / productivity.',
  paperCut: 'paper collage, speaker as a sticker, ransom-note letters; text = a number or short word (max 5 chars) like "100%". Good for a big number.',
  doodleBoil: 'hand-drawn white outline around the speaker and doodles; items = doodles from heart, clapper, star. Good for playful / creative lines.',
  vertigo: 'dolly zoom: background stretches, speaker stays. Good for a dramatic realisation.',
  coverStory: 'magazine-cover serif title behind the speaker\'s head; text = 1 word title, items = [issue line]. Good for introducing a topic.',
  glassType: 'extruded glass letters on the wall behind the speaker; text = 1 word (max 8 letters). Good for a keyword.',
};

const planSchema = z.object({
  segments: z
    .array(
      z.object({
        effect: z.enum(effectIds),
        start: z.number(),
        end: z.number(),
        caption: z.string(),
        emphasis: z.array(z.string()),
        text: z.string().optional(),
        items: z.array(z.string()),
        values: z.array(z.number()),
      }),
    )
    .min(1),
});

/** Plain fallback when no plan is available: one beat per ~2 s of speech, effects in catalog order. */
export function autoSegments(words: { text: string; start: number; end: number }[], duration: number): EffectSegment[] {
  const segs: EffectSegment[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (!cur.length) return;
    const effect = effectIds[segs.length % effectIds.length];
    segs.push({ effect, start: cur[0].start, end: cur[cur.length - 1].end, caption: cur.map((w) => w.text).join(' ').slice(0, 60), emphasis: [], items: [], images: [], values: [] });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (w.end - cur[0].start >= 2) flush();
  }
  flush();
  return closeGaps(segs, duration);
}

/** Segments play back to back, so make them contiguous over the speech and keep each at least 0.8 s. */
function closeGaps(segs: EffectSegment[], duration: number) {
  const sorted = [...segs].sort((a, b) => a.start - b.start);
  return sorted
    .map((s, i) => {
      const next = sorted[i + 1];
      const start = Math.max(0, i === 0 ? s.start - 0.15 : s.start);
      const end = Math.min(duration, next ? next.start : s.end + 0.3);
      return { ...s, start: Math.round(start * 100) / 100, end: Math.round(Math.max(end, start + 0.8) * 100) / 100 };
    })
    .filter((s) => s.end > s.start);
}

export async function buildEffectsProps(brief: { video: string; jobId?: string; onStep?: (n: number, total: number, label: string) => void }) {
  const total = 4;
  const talk = await buildTalkProps({ video: brief.video, jobId: brief.jobId, onStep: (n, _t, label) => brief.onStep?.(n, total, label) });
  const usage = new Usage();
  for (const l of talk.usage.lines) usage.add(l as never);

  brief.onStep?.(3, total, 'matte');
  const source = path.join(talk.dir, 'source.mp4');
  const matteFile = path.join(talk.dir, 'matte.webm');
  await matte(source, matteFile, usage);

  brief.onStep?.(4, total, 'plan effects');
  const words = talk.props.words;
  const duration = talk.props.sourceDuration;
  let segments: EffectSegment[];
  try {
    const raw = await askJson({
      images: [],
      usage,
      step: 'plan effects',
      temperature: 0.7,
      jsonSchema: z.toJSONSchema(planSchema),
      prompt: [
        'You are editing a short vertical talking-head reel. Split the transcript into 5-10 consecutive beats of 1.2-3.5 seconds',
        'and give each beat exactly one visual effect that fits what is said. Use each effect at most once and vary them.',
        'start/end are seconds from the transcript; beats must be in order and not overlap. caption = the words spoken in that beat',
        `(max 60 characters). Write text and items in the transcript's language (${talk.language}). Leave values empty unless the effect is chartGrow.`,
        '',
        'Effects:',
        ...Object.entries(EFFECT_GUIDE).map(([k, v]) => `- ${k}: ${v}`),
        '',
        'Transcript (start-end: word):',
        ...words.map((w) => `${w.start.toFixed(2)}-${w.end.toFixed(2)}: ${w.text}`),
      ].join('\n'),
    });
    const plan = planSchema.parse(raw);
    segments = closeGaps(
      plan.segments.map((s) => ({
        ...s,
        caption: s.caption.slice(0, 60),
        text: s.text?.slice(0, 40) || undefined,
        items: s.items.slice(0, 12).map((x) => x.slice(0, 60)),
        values: s.values.slice(0, 8),
        images: [],
      })),
      duration,
    );
  } catch (e) {
    console.error('effect plan failed, using the default order', e);
    segments = autoSegments(words, duration);
  }

  const props: EffectsReelProps = effectsReelSchema.parse({
    video: talk.props.video,
    matte: `jobs/${talk.jobId}/matte.webm`,
    focusX: 0.5,
    segments,
    counter: false,
    palette: { accent: '#E9F06B', ink: '#16161A', paper: '#F4F1E8' },
  });
  await writeFile(path.join(talk.dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(talk.dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId: talk.jobId, props, usage: usage.toJSON(), title: talk.props.title };
}
