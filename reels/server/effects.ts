// Talking video → EffectsReel props: transcribe (talk.ts), cut the person out (matte.ts), then let Gemini
// split the talk into short beats and dress each with a scene effect plus a caption style, camera move,
// transition and accents from the chosen mix (src/effects/recipes.ts), with the text it needs.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { effectIds, effectsReelSchema, type EffectId, type EffectSegment, type EffectsReelProps } from '../src/schemas.ts';
import { LANG_NAMES, fit, langs, type Lang } from '../src/lang.ts';
import { recipeAxes, recipeById, rollStyles } from '../src/effects/recipes.ts';
import { askJson, generateMusic } from './gemini.ts';
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
  notifications: 'phone notification cards stack up at the top, then the key word appears big; items = 2-4 short notification lines (may start with an emoji), text = 1 key word. Good for overthinking, mental noise, too many tasks.',
  tiles: 'rounded icon tiles in a row get ticked one by one; items = 2-4 short examples the speaker lists, each starting with a fitting emoji ("🚶 Walk"), text = optional small label. Good when the speaker gives concrete examples.',
  sourceCard: 'a SOURCE card shows the institution or study the speaker names and counts their number up; text = the name exactly as said (never invent one), values = [the number], items = [unit like "x" or "%", optional short detail]. Only when a source is actually named.',
  object3d: 'real 3D: a glossy object turns in the light above the speaker with small spheres orbiting it; text = 1-2 word keyword set big under it. Good for introducing a product, a concept or "the new way".',
  particles3d: 'real 3D: thousands of particles swirl as a galaxy while the camera flies into its core, the key word glows in the middle; text = 1-2 words. Good for a big idea, a vision, scale, "the future".',
  textReveal: 'premium text reveal: the line rises out of masks row by row, letter by letter (web-agency style), the first emphasis word pops in an accent pill; text = the line (max 6 words, else the caption is used), items = [optional small kicker above]. Good for a hook or a statement.',
  uiLayers: 'website windows slide in and stack in perspective on a design board: a landing page with the headline, a dark hero with a huge word, the speaker inside a third window; text = 1-4 word headline, items = up to 3 nav labels. Good for talking about a website, a brand or a design.',
  isoGrid: 'isometric voxel wave: a grid of cubes rises in a ripple and breathes while the text types on in big monospace letters; text = 1-3 words. Full-frame graphic with the speaker in a small circle. Good for tech, AI, building something.',
  lineIcons: 'line icons draw themselves stroke by stroke and fill with colour, each with a label; text = title, items = 2-4 short labels (steps, benefits, features). Full-frame graphic with the speaker in a small circle. Good for a list of points.',
  flatBoard: 'flat illustration board: four numbered coloured columns rise with people rows, hand-drawn plant, glasses and pencil, label underneath; text = 1-2 word label, items = up to 4 short column titles. Full-frame graphic with the speaker in a small circle. Good for a process, a team, a framework or steps.',
};


/** Cuts a caption to `n` characters at a word boundary when there is one. */
const clip = (t: string, n: number) => {
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return sp > n * 0.5 ? cut.slice(0, sp) : cut;
};

/** Planner instruction for which language captions and on-screen text are written in. */
export const langRule = (spoken: string, lang?: Lang) =>
  !lang || spoken.startsWith(lang)
    ? `Write caption, emphasis, text and items in the transcript's language (${spoken}).`
    : `The speaker talks in ${spoken}, but the reel is for a ${LANG_NAMES[lang].english} audience: write caption as a natural, short ${LANG_NAMES[lang].english} subtitle of what is said in that beat (a translation, not a transcript), and write emphasis, text and items in ${LANG_NAMES[lang].english} too. Every emphasis word must appear in its caption.`;

/** What each style axis option looks like, so the planner can pick by meaning. */
export const STYLE_GUIDE = {
  caption: 'pop=bold word pop, blur=sharpen from blur, spaced=small tracked caps, upper=bold caps, script=gold italic serif, outline=hollow letters, box=words on black tags, highlighter=marker swipe on key words, typewriter=types on, stack=one word per line with huge key word, bounce=words drop and bounce, neon=glowing letters, keyword=1-3 words at a time in small sans with the one emphasised word big gradient italic serif',
  camera: 'still, push=slow push in, pull=slow pull out, drift=sideways drift, punch=punch-in on the beat, shake=impact shake, tilt=dutch tilt settles, spinIn=rotates in, handheld=subtle wobble, rack=blur into focus, dollyIn=camera travels toward the speaker (stronger than push, with depth), panLeft/panRight=camera turns sideways, tiltUp/tiltDown=camera tilts vertically, tracking=camera moves sideways with the speaker while the wall slides past, crane=camera rises and looks down, orbitCam=camera circles the speaker in 3D, dollyZoom=Hitchcock zoom, wall stretches while the speaker keeps size (dramatic)',
  transition: 'how the beat arrives: cut, zoomBlur, whipLeft, whipUp, flash, glitch, slide, dip=from black, iris=circle wipe, split=halves close, spin, blurDissolve',
  accents: 'extra overlays, any number: sparkles, outline=boiling outline around the person, arrows=hand-drawn arrows, underline=marker under key words, emoji=emoji pops after the line, beatFlash=white flash on the beat, letterbox=cinema bars, progress=progress bar, stickers=round stickers, glow=glow around the person, echo=fading copies of the key word stack above it (keyword captions only)',
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

/** Where words are spoken, on the reel's own clock (segments play back to back), merged across short gaps. */
export function speechOnReel(words: { start: number; end: number }[], segments: { start: number; end: number }[]) {
  const out: [number, number][] = [];
  let at = 0;
  for (const s of segments) {
    for (const w of words) {
      const a = Math.max(w.start, s.start);
      const b = Math.min(w.end, s.end);
      if (b <= a) continue;
      const ra = Math.round((at + a - s.start) * 100) / 100;
      const rb = Math.round((at + b - s.start) * 100) / 100;
      const last = out[out.length - 1];
      if (last && ra - last[1] < 0.35) last[1] = rb;
      else out.push([ra, rb]);
    }
    at += s.end - s.start;
  }
  return out.slice(0, 400);
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
  /** Language to write captions and on-screen text in; defaults to the spoken language. */
  lang?: Lang;
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
  const props = await planEffectsReel({
    jobId: talk.jobId,
    dir: talk.dir,
    video: talk.props.video,
    words: talk.props.words,
    duration: talk.props.sourceDuration,
    language: talk.language,
    recipe: brief.recipe,
    prefer: brief.prefer,
    lang: brief.lang,
    usage,
  });
  await writeFile(path.join(talk.dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(talk.dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId: talk.jobId, props, usage: usage.toJSON(), title: talk.props.title };
}

/**
 * Plans one reel over an already transcribed and matted talk: beats, scenes and looks from the mix, plus a
 * music bed. Reused for the gallery samples, where one talk is dressed in every template.
 */
export async function planEffectsReel(t: {
  jobId: string;
  dir: string;
  video: string;
  words: { text: string; start: number; end: number }[];
  duration: number;
  language: string;
  recipe?: string;
  prefer?: EffectId[];
  lang?: Lang;
  usage: Usage;
  /** Reuse this music file instead of making one. */
  music?: string;
}): Promise<EffectsReelProps> {
  const brief = t;
  const usage = t.usage;
  const talk = { jobId: t.jobId, dir: t.dir, language: t.language, props: { video: t.video, words: t.words, sourceDuration: t.duration } };
  const words = talk.props.words;
  const duration = talk.props.sourceDuration;
  const recipe = recipeById(brief.recipe);
  const ax = recipeAxes(recipe);
  // The music bed is made while the plan is written; a failure only means no music.
  const music = t.music !== undefined ? Promise.resolve(t.music) : generateMusic({
    prompt: `Instrumental background music for a ${Math.round(duration)}-second vertical social video. Mood: ${recipe.mood ?? recipe.desc}. No vocals, loopable, modern production, leaves room for a voice over it.`,
    out: path.join(talk.dir, 'music'),
    usage,
    step: 'music',
  }).then(
    (f) => `jobs/${talk.jobId}/${path.basename(f)}`,
    (e) => (console.warn(`music: ${(e as Error).message}`), undefined),
  );
  // Effects picked in the gallery are always allowed, even outside the mix.
  for (const e of brief.prefer ?? []) if (!ax.scenes.includes(e)) ax.scenes.push(e);
  const planSchema = planSchemaFor(ax);
  const outLang: Lang = brief.lang ?? ((langs as readonly string[]).find((l) => talk.language.startsWith(l)) as Lang | undefined) ?? 'en';
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
        `Split the transcript into ${recipe.beats ?? '6-12'} consecutive beats of ${recipe.beat ?? '1-3.5 seconds'}. For each beat pick one scene effect that fits what is said,`,
        'and dress it with a caption style, a camera move, a transition in and 0-3 accents. Mix freely: vary scenes, never use the same',
        'scene or the same transition twice in a row, put the strongest effects on the key moments (hook, numbers, punchline) and',
        'calmer ones (camera move + caption only, e.g. digitalZoom or vertigo) in between. Pick one look (grade, texture, font, colour)',
        'for the whole reel so it feels like one video.',
        `Mix: ${recipe.name} — ${recipe.desc}`,
        'start/end are seconds from the transcript; beats must be in order and not overlap. caption = the words spoken in that beat',
        `(max ${fit(outLang, 60)} characters). ${langRule(talk.language, brief.lang)} Leave values empty unless the effect is chartGrow, infographic or sourceCard.`,
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
        caption: clip(s.caption, fit(outLang, 60)),
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
    music: await music,
    speech: speechOnReel(words, segments),
    video: talk.props.video,
    matte: `jobs/${talk.jobId}/matte.webm`,
    focusX: 0.5,
    segments,
    counter: false,
    palette: { accent: segments[0]?.style?.color ?? '#E9F06B', ink: '#16161A', paper: '#F4F1E8' },
    recipe: recipe.id,
    lang: brief.lang ?? (langs as readonly string[]).find((l) => talk.language.startsWith(l)) as Lang | undefined,
  });
  return props;
}
