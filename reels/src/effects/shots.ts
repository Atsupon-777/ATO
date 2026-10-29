// Shot direction for talking-head reels: how each beat frames the speaker (punch-in close-up, medium, wide,
// rule-of-thirds), how the frame moves, where the punch-in on the key word lands, and which beats leave
// the speaker for a full-screen line of text, a picture (b-roll) or a split screen while the voice carries
// on underneath. Pure data and math (no React), so the planner, the editor and the template share it.
import type { EffectId } from '../schemas.ts';
import type { Transition } from './axes.ts';

export const framings = ['wide', 'medium', 'close', 'thirdsL', 'thirdsR'] as const;
export const shotMoves = ['hold', 'push', 'pull', 'drift'] as const;
export const layouts = ['speaker', 'text', 'broll', 'split'] as const;
export type Framing = (typeof framings)[number];
export type ShotMove = (typeof shotMoves)[number];
export type Layout = (typeof layouts)[number];

export type Shot = { framing?: Framing; move?: ShotMove; punch?: number; layout?: Layout; image?: string };
/** Where the speaker's face sits in the 9:16 frame (0..1), and how tall the head is. */
export type SubjectBox = { x: number; y: number; h: number };
/** No matte to measure: a talking head is usually centred with the face a third of the way down. */
export const DEFAULT_SUBJECT: SubjectBox = { x: 0.5, y: 0.36, h: 0.2 };

/** Zoom and where the face should land for each framing. Wide is the shot as recorded. */
export const FRAMING: Record<Framing, { s: number; x: number; y: number }> = {
  wide: { s: 1, x: 0.5, y: 0.36 },
  medium: { s: 1.24, x: 0.5, y: 0.34 },
  close: { s: 1.6, x: 0.5, y: 0.37 },
  thirdsL: { s: 1.38, x: 0.37, y: 0.35 },
  thirdsR: { s: 1.38, x: 0.63, y: 0.35 },
};

/** Most a speaker beat enlarges the footage (1.6× of a 1080×1920 recording is still ~675 px of real detail across), */
export const MAX_ZOOM = 1.6;
/** and the most its framing and move may take before the punch-in. */
const MAX_FRAMING = 1.45;

/** Scenes that fill the frame with graphics and keep the speaker in a small window (no speaker on screen). */
export const GRAPHIC_SCENES: EffectId[] = ['uiLayers', 'isoGrid', 'lineIcons', 'flatBoard'];
/** Scenes whose own layout moves or boxes the footage; they keep the recorded framing. */
export const UNFRAMED_SCENES: EffectId[] = [...GRAPHIC_SCENES, 'pullBack', 'uiWorld', 'phoneMockup', 'greenScreen', 'paperCut', 'frameBreak'];
/** Scenes that put graphics behind the person: tight framings would hide them, so they stay wide or medium. */
const BEHIND_SCENES: EffectId[] = ['checklist', 'orbit', 'couchWall', 'headlineWall', 'chartGrow', 'coverStory', 'glassType', 'doodleBoil', 'kineticType', 'notifications', 'tiles', 'sourceCard', 'object3d', 'particles3d', 'textReveal'];

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/**
 * The transform (origin top-left, 1080×1920 px) that puts the speaker where the framing wants them at
 * `frame` of a beat `dur` frames long. Never uncovers an edge: the zoomed frame always fills the screen.
 */
export function framingTransform(shot: Shot | undefined, subject: SubjectBox | undefined, frame: number, dur: number, fps: number) {
  if (!shot || (!shot.framing && shot.punch === undefined)) return undefined;
  const sub = subject ?? DEFAULT_SUBJECT;
  const f = FRAMING[shot.framing ?? 'wide'];
  const t = smooth(frame / Math.max(1, dur - 1));
  // a speaker already filmed close (big head) gets gentler zooms, so a close-up never crops to the nose
  const k = Math.min(1.1, Math.max(0.35, 0.22 / Math.max(0.05, sub.h)));
  let s = 1 + (f.s - 1) * k;
  let tx = f.x;
  let ty = f.y;
  switch (shot.move) {
    case 'push':
      s *= 1 + 0.09 * t;
      break;
    case 'pull':
      s *= 1.1 - 0.1 * t;
      break;
    case 'drift':
      s *= 1.04;
      tx += (t - 0.5) * 0.05;
      break;
    default:
      break;
  }
  // Every step of zoom enlarges the recorded pixels: framing + move stop at MAX_FRAMING, and the punch-in
  // takes whatever is left up to MAX_ZOOM (at least +10%), so a close-up never blows the footage up 2×.
  s = Math.min(s, MAX_FRAMING);
  // the punch-in: a hard, fast zoom on the key word that holds to the end of the beat
  if (shot.punch !== undefined) {
    const at = shot.punch * fps;
    const k = smooth((frame - at) / 4);
    s *= 1 + Math.min(0.2, MAX_ZOOM / s - 1) * k;
    ty += 0.02 * k;
  }
  const W = 1080;
  const H = 1920;
  const clampTo = (v: number, lo: number) => Math.min(0, Math.max(lo, v));
  const dx = clampTo(tx * W - sub.x * W * s, W - W * s);
  const dy = clampTo(ty * H - sub.y * H * s, H - H * s);
  if (s === 1 && dx === 0 && dy === 0) return undefined;
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(4)})`;
}

/** Whether a beat shows the speaker full-frame (framings apply) or leaves them (text, picture, graphics). */
export const showsSpeaker = (seg: { effect: EffectId; shot?: Shot }) =>
  (seg.shot?.layout ?? 'speaker') === 'speaker' && !GRAPHIC_SCENES.includes(seg.effect);

/** Small seeded PRNG so the same job always gets the same direction. */
const mulberry = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const STOP = new Set(
  'the a an and or but so to of in on at for with is are was were be been it this that these those i you we they he she my your our their me us them not no do does did have has had just really very can will would should about from what how why when then than there here like get got make made want'.split(' '),
);
/** The word a picture or a punch-in should be about: the planner's emphasis, else the longest content word. */
export const keywordOf = (caption: string | undefined, emphasis: string[] = []) => {
  if (emphasis[0]) return emphasis[0];
  const words = (caption ?? '').split(/[\s、。,.!?！？]+/).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter((w) => w && !STOP.has(w.toLowerCase()));
  return words.sort((a, b) => [...b].length - [...a].length)[0];
};

export type DirectInput = {
  effect: EffectId;
  start: number;
  end: number;
  caption?: string;
  emphasis?: string[];
  /** Planner hints; the director keeps them when they fit the rules. */
  framing?: Framing;
  layout?: Layout;
  picture?: string;
};

/**
 * Directs every beat like a short-form editor would: the hook (first 2 s) is always the speaker; the framing
 * changes on every cut (never the same twice in a row); roughly a quarter to a third of the beats leave the
 * speaker for a full-screen line, a picture or a split screen, never two in a row; key words get a punch-in
 * at the moment they are said. Returns one shot per beat plus, for picture beats, what to picture.
 */
export function directShots(
  segs: DirectInput[],
  words: { text: string; start: number; end: number }[],
  opts: { seed?: number; pictures?: number } = {},
): { shot: Shot; picture?: string; transition?: Transition }[] {
  const rnd = mulberry(opts.seed ?? 1);
  const n = segs.length;
  let budget = opts.pictures ?? 3;
  // reel clock: where each beat starts once beats play back to back
  const at: number[] = [];
  segs.reduce((t, s, i) => ((at[i] = t), t + (s.end - s.start)), 0);
  const graphic = (i: number) => GRAPHIC_SCENES.includes(segs[i].effect);
  const hook = (i: number) => at[i] < 2 || i === 0;
  // how many beats leave the speaker: ~28% (20-35%), counting graphics scenes the planner already chose
  const maxAway = Math.max(n >= 3 ? 1 : 0, Math.floor(n * 0.35));
  const want = Math.min(maxAway, Math.max(n >= 3 ? 1 : 0, Math.round(n * 0.28)));
  const away = new Set<number>();
  for (let i = 0; i < n; i++) if (graphic(i) && !hook(i)) away.add(i);
  const free = (i: number) => !hook(i) && !away.has(i - 1) && !away.has(i + 1) && !away.has(i);
  // planner's picks first, then evenly spread candidates (beats with something concrete to show)
  for (let i = 0; i < n && away.size < want; i++) if (segs[i].layout && segs[i].layout !== 'speaker' && free(i)) away.add(i);
  const order = [...Array(n).keys()].filter((i) => !hook(i)).sort((a, b) => {
    const score = (i: number) => (segs[i].picture ? 2 : 0) + (keywordOf(segs[i].caption, segs[i].emphasis) ? 1 : 0) + rnd() * 1.5 + (i === n - 1 ? -1 : 0);
    return score(b) - score(a);
  });
  for (const i of order) {
    if (away.size >= want) break;
    if (free(i)) away.add(i);
  }
  // graphics the planner put inside the hook or back to back stay, but count as the speaker for spacing
  const out: { shot: Shot; picture?: string; transition?: Transition }[] = [];
  const whips: Transition[] = ['whipLeft', 'zoomBlur', 'whipUp', 'cut'];
  const awayKinds: Layout[] = ['broll', 'text', 'split'];
  let kindAt = Math.floor(rnd() * 3);
  let lastFraming: Framing | undefined;
  let lastMove: ShotMove | undefined;
  let lastLayout: Layout | undefined;
  for (let i = 0; i < n; i++) {
    const s = segs[i];
    if (away.has(i) && !graphic(i)) {
      let layout: Layout = s.layout && s.layout !== 'speaker' ? s.layout : awayKinds[kindAt++ % 3];
      if (layout === lastLayout) layout = awayKinds[kindAt++ % 3];
      const picture = s.picture || keywordOf(s.caption, s.emphasis);
      if ((layout === 'broll' || layout === 'split') && (!picture || budget <= 0)) layout = 'text';
      if (layout !== 'text') budget--;
      lastLayout = layout;
      // split keeps the speaker in the top half, framed on the face
      out.push({ shot: { layout, move: 'push' }, picture: layout === 'text' ? undefined : picture, transition: whips[Math.floor(rnd() * whips.length)] });
      continue;
    }
    if (graphic(i)) {
      out.push({ shot: {} });
      continue;
    }
    // speaker beat: pick a framing that differs from the last one on screen
    const tight = BEHIND_SCENES.includes(s.effect) ? (['wide', 'medium'] as Framing[]) : UNFRAMED_SCENES.includes(s.effect) ? (['wide'] as Framing[]) : [...framings];
    let pool = tight.filter((f) => f !== lastFraming);
    if (!pool.length) pool = tight;
    // the hook opens tight on the face; a planner hint wins when it fits
    let framing: Framing =
      s.framing && pool.includes(s.framing) ? s.framing : i === 0 && pool.includes('close') ? 'close' : pool[Math.floor(rnd() * pool.length)];
    // after a close-up, prefer opening up (wide / thirds) so the rhythm breathes
    if (lastFraming === 'close' && framing === 'medium' && pool.includes('wide') && rnd() < 0.5) framing = 'wide';
    const moves: ShotMove[] = framing === 'wide' ? ['push', 'pull', 'hold'] : framing === 'close' ? ['push', 'hold', 'pull'] : ['push', 'drift', 'pull', 'hold'];
    const mpool = moves.filter((m) => m !== lastMove);
    const move = mpool[Math.floor(rnd() * mpool.length)];
    // punch-in on the key word, at the moment it is said (not on scenes that zoom by themselves)
    let punch: number | undefined;
    const dur = s.end - s.start;
    if (!UNFRAMED_SCENES.includes(s.effect) && s.effect !== 'digitalZoom' && s.effect !== 'zoomThrough' && s.effect !== 'vertigo' && dur > 1 && framing !== 'close') {
      const key = (s.emphasis?.[0] ?? (rnd() < 0.5 ? keywordOf(s.caption) : undefined))?.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const w = key ? words.find((x) => x.start >= s.start && x.start < s.end - 0.25 && x.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').includes(key)) : undefined;
      if (w && w.start - s.start > 0.2) punch = Math.round((w.start - s.start) * 100) / 100;
    }
    lastFraming = framing;
    lastMove = move;
    lastLayout = 'speaker';
    // a jump in framing between two speaker shots reads best as a hard cut
    const prevSpeaker = i > 0 && out[i - 1] && (out[i - 1].shot.layout ?? 'speaker') === 'speaker' && !graphic(i - 1);
    out.push({ shot: { framing, move, punch, layout: 'speaker' }, transition: prevSpeaker && rnd() < 0.5 ? 'cut' : undefined });
  }
  return out;
}

/**
 * Beat lengths for the plain fallback: short and long cuts alternate (0.9-1.4 s punches between 2-3 s
 * holds) so the rhythm is not a metronome.
 */
export function rhythm(seed = 1) {
  const rnd = mulberry(seed * 31 + 5);
  const pat = [2.2, 1.1, 1.6, 2.8, 1.0, 1.9, 1.3, 2.5];
  const off = Math.floor(rnd() * pat.length);
  return (i: number) => pat[(i + off) % pat.length] * (0.9 + rnd() * 0.2);
}

/** Japanese labels for the editor (framings, layouts). */
export const FRAMING_LABEL: Record<Framing, string> = { wide: '引き', medium: 'ミディアム', close: '寄り', thirdsL: '左に寄せる', thirdsR: '右に寄せる' };
export const LAYOUT_LABEL: Record<Layout, string> = { speaker: '話す人', text: '全画面テキスト', broll: '画像に切り替え', split: '上下に分割' };
