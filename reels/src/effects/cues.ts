// When the parts of a card scene appear, in seconds. Shared by the templates (to animate) and the server
// (to place tap sounds on the same frames), so picture and sound always line up. Pure, no React.

export const cardSceneTypes = ['notifications', 'tiles', 'sourceCard'] as const;
export type CardSceneType = (typeof cardSceneTypes)[number];

/** Start time of each of `n` items in a scene running from `start` to `end`: the first lands on `start`. */
export function itemTimes(start: number, end: number, n: number): number[] {
  if (n <= 0) return [];
  // items arrive over the first 60% of the scene, at most 0.7 s apart
  const gap = Math.min(0.7, ((end - start) * 0.6) / Math.max(1, n - 1));
  return Array.from({ length: n }, (_, i) => start + i * gap);
}

/** Times a scene makes a "tap": each card or tile landing, and each tick for tiles. */
export function sceneTaps(type: string, start: number, end: number, n: number): number[] {
  const t = itemTimes(start, end, type === 'sourceCard' ? 1 : n);
  if (type === 'tiles') return t.flatMap((x) => [x, x + 0.35]);
  return t;
}
