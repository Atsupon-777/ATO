// Keeps motion reels from feeling samey: no style twice in one reel, no two neighbours from the same
// family, and styles this account saw recently are picked last. The AI planner proposes candidates per
// beat; this file makes the final choice deterministically so it can be tested.
import type { MotionSceneId } from './MotionReel';

/** Visual family of each style: neighbours from one family read as a repeat even when the style differs. */
export const STYLE_FAMILY: Record<MotionSceneId, 'type' | 'data' | 'ui' | 'place' | 'craft' | 'brand'> = {
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
