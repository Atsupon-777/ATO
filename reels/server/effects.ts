// Talking video → EffectsReel props: transcribe (talk.ts), cut the person out (matte.ts), then let Gemini
// split the talk into short beats and dress each with a scene effect plus a caption style, camera move,
// transition and accents from the chosen mix (src/effects/recipes.ts), with the text it needs.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { effectIds, effectsReelSchema, type EffectId, type EffectSegment, type EffectsReelProps } from '../src/schemas.ts';
import { recipeAxes, recipeById, rollStyles } from '../src/effects/recipes.ts';
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
  kineticType: 'kinetic typography: the line itself slams in word by word, huge, stacking like a poster (behind the speaker if matted); text = up to 8 words (else the caption is used), emphasis = words in accent colour. Good for a punchline or hook.',
  infographic: 'animated infographic: a ring counts up to values[0] percent, then labelled bars grow; text = title, caption = what the percentage means, items = bar labels (2-4), values = [percent, bar values...]. Good for stats, comparisons, results.',
};

/** What each style axis option looks like, so the planner can pick by meaning. */
export const STYLE_GUIDE = {
  caption: 'pop=bold word pop, blur=sharpen from blur, spaced=small tracked caps, upper=bold caps, script=gold italic serif, outline=hollow letters, box=words on black tags, highlighter=marker swipe on key words, typewriter=types on, stack=one word per line with huge key word, bounce=words drop and bounce, neon=glowing letters',
  camera: 'still, push=slow push in, pull=slow pull out, drift=sideways drift, punch=punch-in on the beat, shake=impact shake, tilt=dutch tilt settles, spinIn=rotates in, handheld=subtle wobble, rack=blur into focus, dollyIn=camera travels toward the speaker (stronger than push, with depth), panLeft/panRight=camera turns sideways, tiltUp/tiltDown=camera tilts vertically, tracking=camera moves sideways with the speaker while the wall slides past, crane=camera rises and looks down, orbitCam=camera circles the speaker in 3D, dollyZoom=Hitchcock zoom, wall stretches while the speaker keeps size (dramatic)',
  transition: 'how the beat arrives: cut, zoomBlur, whipLeft, whipUp, flash, glitch, slide, dip=from black, iris=circle wipe, split=halves close, spin, blurDissolve',
  accents: 'extra overlays, any number: sparkles, outline=boiling outline around the person, arrows=hand-drawn arrows, underline=marker under key words, emoji=emoji pops after the line, beatFlash=white flash on the beat, letterbox=cinema bars, progress=progress bar, stickers=round stickers, glow=glow around the person',
};

/** The plan's JSON shape, with every axis limited to what the chosen mix allows. */
const planSchemaFor = (ax: ReturnType<typeof recipeAxes>) =>
  z.object({
    look: z.object({
      grade: z.enum(ax.grades as [string, ...string[]]),
      texture: z.enum(ax.textures as [string, ...string[]]),
      font: z.enum(ax.fonts as [string, ...string[]]),
      color: z.enum(ax.colors as [string, ...string[]]),
    }),
    segments: z
      .array(
        z.object({
          effect: z.enum(ax.scenes as [string, ...string[]]),
          start: z.number(),
          end: z.number(),
          caption: z.string(),
          emphasis: z.array(z.string()),
          text: z.string().optional(),
          items: z.array(z.string()),
          values: z.array(z.number()),
          caption_style: z.enum(ax.captions as [string, ...string[]]),
          camera: z.enum(ax.cameras as [string, ...string[]]),
          transition: z.enum(ax.transitions as [string, ...string[]]),
          accents: z.array(z.enum(ax.accents as [string, ...string[]])),
        }),
      )
      .min(1),
  });

/** Plain fallback when no plan is available: one beat per ~2 s of speech, effects in catalog order. */
export function autoSegments(words: { text: string; start: number; end: number }[], duration: number, recipe = recipeById('all'), seed = 1): EffectSegment[] {
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
  // give every beat a scene and a look from the mix
  const looks = rollStyles(recipe, segs.length, seed, { hasMatte: true });
  return closeGaps(
    segs.map((sg, i) => ({ ...sg, effect: looks[i].scene, style: looks[i].style })),
    duration,
  );
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

export async function buildEffectsProps(brief: {
  video: string;
  jobId?: string;
  /** Effects the user picked in the gallery; the planner leans on these. */
  prefer?: EffectId[];
  /** Mix to plan with (src/effects/recipes.ts); defaults to おまかせミックス. */
  recipe?: string;
  onStep?: (n: number, total: number, label: string) => void;
}) {
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
  const recipe = recipeById(brief.recipe);
  const ax = recipeAxes(recipe);
  // Effects picked in the gallery are always allowed, even outside the mix.
  for (const e of brief.prefer ?? []) if (!ax.scenes.includes(e)) ax.scenes.push(e);
  const planSchema = planSchemaFor(ax);
  let segments: EffectSegment[];
  try {
    const raw = await askJson({
      images: [],
      usage,
      step: 'plan effects',
      temperature: 0.8,
      jsonSchema: z.toJSONSchema(planSchema),
      prompt: [
        'You are editing a short vertical talking-head reel, the way a professional editor mixes many effects in one video.',
        'Split the transcript into 6-12 consecutive beats of 1-3.5 seconds. For each beat pick one scene effect that fits what is said,',
        'and dress it with a caption style, a camera move, a transition in and 0-3 accents. Mix freely: vary scenes, never use the same',
        'scene or the same transition twice in a row, put the strongest effects on the key moments (hook, numbers, punchline) and',
        'calmer ones (camera move + caption only, e.g. digitalZoom or vertigo) in between. Pick one look (grade, texture, font, colour)',
        'for the whole reel so it feels like one video.',
        `Mix: ${recipe.name} — ${recipe.desc}`,
        'start/end are seconds from the transcript; beats must be in order and not overlap. caption = the words spoken in that beat',
        `(max 60 characters). Write text and items in the transcript's language (${talk.language}). Leave values empty unless the effect is chartGrow.`,
        ...(brief.prefer?.length
          ? [`The user chose these effects: ${brief.prefer.join(', ')}. Use every one of them at a moment where it fits.`]
          : []),
        '',
        'Scene effects:',
        ...ax.scenes.map((k) => `- ${k}: ${EFFECT_GUIDE[k]}`),
        '',
        ...Object.entries(STYLE_GUIDE).map(([k, v]) => `${k}: ${v}`),
        '',
        'Transcript (start-end: word):',
        ...words.map((w) => `${w.start.toFixed(2)}-${w.end.toFixed(2)}: ${w.text}`),
      ].join('\n'),
    });
    const plan = planSchema.parse(raw);
    segments = closeGaps(
      plan.segments.map((s) => ({
        effect: s.effect as EffectId,
        start: s.start,
        end: s.end,
        caption: s.caption.slice(0, 60),
        emphasis: s.emphasis,
        text: s.text?.slice(0, 40) || undefined,
        items: s.items.slice(0, 12).map((x) => x.slice(0, 60)),
        values: s.values.slice(0, 8),
        images: [],
        style: {
          caption: s.caption_style,
          camera: s.camera,
          transition: s.transition,
          accents: [...new Set(s.accents)].slice(0, 3),
          ...plan.look,
        },
      })) as EffectSegment[],
      duration,
    );
  } catch (e) {
    console.error('effect plan failed, using a random mix', e);
    segments = autoSegments(words, duration, recipe, Date.now() % 100000);
  }

  const props: EffectsReelProps = effectsReelSchema.parse({
    video: talk.props.video,
    matte: `jobs/${talk.jobId}/matte.webm`,
    focusX: 0.5,
    segments,
    counter: false,
    palette: { accent: segments[0]?.style?.color ?? '#E9F06B', ink: '#16161A', paper: '#F4F1E8' },
    recipe: recipe.id,
  });
  await writeFile(path.join(talk.dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(talk.dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId: talk.jobId, props, usage: usage.toJSON(), title: talk.props.title };
}
