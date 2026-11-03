// Keeps motion reels from feeling samey: no style twice in one reel, no two neighbours from the same
// family, and styles this account saw recently are picked last. The AI planner proposes candidates per
// beat; this file makes the final choice deterministically so it can be tested.
import type { MotionSceneId } from './MotionReel';
import { cameraIds, enterIds, type CameraId, type EnterId } from './shot';

/** Visual family of each style: neighbours from one family read as a repeat even when the style differs. */
export const STYLE_FAMILY: Record<MotionSceneId, 'type' | 'data' | 'ui' | 'place' | 'craft' | 'brand' | 'proof' | 'photo' | 'product'> = {
  headline: 'type',
  inkWash: 'craft',
  paperDesk: 'craft',
  statChart: 'data',
  kpiTiles: 'data',
  timeline: 'data',
  chat: 'ui',
  pricing: 'ui',
  cursorDemo: 'ui',
  teardown: 'ui',
  mapRoute: 'place',
  globeZoom: 'place',
  logoReveal: 'brand',
  logoLine: 'brand',
  kineticType: 'type',
  reviewStars: 'proof',
  compareTable: 'data',
  phoneStack: 'ui',
  bars3d: 'data',
  donut: 'data',
  rankingRace: 'data',
  flapBoard: 'type',
  typewriter: 'type',
  pinDrop: 'place',
  searchFind: 'ui',
  progressRing: 'data',
  versus: 'data',
  beforeAfter: 'ui',
  scrollPage: 'ui',
  verticalCopy: 'craft',
  goldLine: 'brand',
  washiSeal: 'brand',
  brushText: 'craft',
  ukiyoWave: 'craft',
  watercolor: 'photo',
  chalkboard: 'craft',
  whiteboard: 'craft',
  photo25d: 'photo',
  photoWall: 'photo',
  collage: 'craft',
  polaroids: 'photo',
  textMask: 'type',
  splitScreen: 'photo',
};

/** How many of an account's recent reels count as "recent" when ranking styles. */
export const HISTORY_REELS = 5;

export type Beat = {
  /** Styles that can tell this beat, best first (from the planner). */
  candidates: MotionSceneId[];
};

/**
 * Picks one style per beat.
 * history: styles used in this account's recent reels, newest reel first (one array per reel).
 * Rules, strongest first: never reuse a style within the reel; never put two of one family side by side
 * (unless a beat has no other option); among what's left, prefer styles not seen in recent reels, then
 * the planner's order.
 */
export const pickStyles = (beats: Beat[], history: MotionSceneId[][] = []): MotionSceneId[] => {
  const recency = new Map<MotionSceneId, number>();
  history.slice(0, HISTORY_REELS).forEach((reel, age) => {
    for (const id of reel) if (!recency.has(id)) recency.set(id, HISTORY_REELS - age); // newer = bigger penalty
  });
  const used = new Set<MotionSceneId>();
  const out: MotionSceneId[] = [];
  for (const beat of beats) {
    const prev = out.length ? STYLE_FAMILY[out[out.length - 1]] : null;
    const fresh = beat.candidates.filter((c) => !used.has(c));
    const pool = fresh.length ? fresh : beat.candidates;
    const ranked = pool
      .map((id, order) => ({ id, score: (STYLE_FAMILY[id] === prev ? 100 : 0) + (recency.get(id) ?? 0) * 10 + order }))
      .sort((a, b) => a.score - b.score);
    const pick = ranked[0].id;
    used.add(pick);
    out.push(pick);
  }
  return out;
};

/** A stable number per account + reel, so in-style variations (entrance, camera, layout) differ between reels. */
export const variantSeed = (accountId: string, reelIndex: number) => {
  let h = 2166136261;
  for (const ch of `${accountId}:${reelIndex}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 1000;
};

/**
 * Entrance + camera for each scene: deterministic from the seed, never the same entrance or camera move
 * twice in a row, and every entrance used once before any repeats within a reel.
 */
export const pickShots = (count: number, seed: number): { enter: EnterId; camera: CameraId }[] => {
  const rnd = mulberry(seed + 1);
  const deck = <T,>(ids: readonly T[]) => {
    let pool: T[] = [];
    let last: T | undefined;
    return () => {
      if (!pool.length) pool = shuffle([...ids], rnd);
      if (pool[0] === last && pool.length > 1) pool.push(pool.shift()!);
      last = pool.shift()!;
      return last;
    };
  };
  const nextEnter = deck(enterIds.filter((e) => e !== 'cut'));
  const nextCam = deck(cameraIds);
  return Array.from({ length: count }, () => ({ enter: nextEnter(), camera: nextCam() }));
};

const mulberry = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = <T,>(xs: T[], rnd: () => number) => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
};

/** Layout options inside a style (prop name + ids). Styles not listed have one layout so far. */
export const STYLE_LAYOUTS: Partial<Record<MotionSceneId, { prop: string; ids: readonly string[] }>> = {
  kpiTiles: { prop: 'layout', ids: ['grid', 'stack', 'hero'] },
  pricing: { prop: 'layout', ids: ['list', 'columns'] },
  timeline: { prop: 'layout', ids: ['rail', 'zigzag'] },
  logoReveal: { prop: 'intro', ids: ['shards', 'rings', 'split'] },
  typewriter: { prop: 'terminal', ids: ['', 'yes'] },
};

/** The layout prop for one style in one reel, e.g. { layout: 'hero' }; empty when the style has one layout. */
export const pickLayout = (style: MotionSceneId, seed: number): Record<string, string> => {
  const l = STYLE_LAYOUTS[style];
  return l ? { [l.prop]: l.ids[Math.floor(mulberry(seed * 31 + style.length)() * l.ids.length)] } : {};
};
