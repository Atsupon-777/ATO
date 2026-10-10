/**
 * Turns a word-timed transcript (ElevenLabs Scribe format) into an edit:
 * which parts of the source to keep (silences and fillers cut) and where each word lands
 * on the output timeline. Pure functions, so the server and the editor UI can share them.
 */

export type Word = { text: string; start: number; end: number };
export type Segment = { start: number; end: number; outStart: number };
export type PlacedWord = Word & { index: number; outStart: number; outEnd: number; emphasis: boolean };
export type Page = { index: number; words: PlacedWord[]; outStart: number; outEnd: number };

const norm = (s: string) => s.toLowerCase().replace(/[.,!?、。！？「」"']/g, '');

export const isFiller = (w: Word, fillers: string[]) => fillers.map(norm).includes(norm(w.text));

/** Keep ranges around speech; gaps longer than `minGap` seconds are cut out. */
export function keepSegments(
  words: Word[],
  opts: { enabled: boolean; minGap: number; pad: number; fillers: string[]; sourceDuration: number },
): Segment[] {
  if (!opts.enabled) return [{ start: 0, end: opts.sourceDuration, outStart: 0 }];
  const spoken = words.filter((w) => !isFiller(w, opts.fillers));
  const ranges: { start: number; end: number }[] = [];
  for (const w of spoken) {
    const s = Math.max(0, w.start - opts.pad);
    const e = Math.min(opts.sourceDuration, w.end + opts.pad);
    const last = ranges[ranges.length - 1];
    if (last && s - last.end < opts.minGap) last.end = Math.max(last.end, e);
    else ranges.push({ start: s, end: e });
  }
  let out = 0;
  return ranges.map((r) => {
    const seg = { ...r, outStart: out };
    out += r.end - r.start;
    return seg;
  });
}

export const editDuration = (segs: Segment[]) =>
  segs.length ? segs[segs.length - 1].outStart + (segs[segs.length - 1].end - segs[segs.length - 1].start) : 0;

/** Maps a source time to the output timeline (null if that moment was cut). */
export function toOutput(t: number, segs: Segment[]) {
  for (const s of segs) if (t >= s.start - 1e-6 && t <= s.end + 1e-6) return s.outStart + (t - s.start);
  return null;
}

/** Places words on the output timeline and marks emphasis phrases (case-insensitive). */
export function placeWords(words: Word[], segs: Segment[], fillers: string[], emphasis: string[]): PlacedWord[] {
  const flags = new Array(words.length).fill(false);
  const normed = words.map((w) => norm(w.text));
  for (const phrase of emphasis.map((e) => norm(e).split(/\s+/).filter(Boolean))) {
    for (let i = 0; i + phrase.length <= words.length; i++) {
      if (phrase.every((p, j) => normed[i + j] === p)) for (let j = 0; j < phrase.length; j++) flags[i + j] = true;
    }
  }
  const placed: PlacedWord[] = [];
  words.forEach((w, index) => {
    if (isFiller(w, fillers)) return;
    const a = toOutput(w.start, segs);
    const b = toOutput(w.end, segs);
    if (a === null || b === null) return;
    placed.push({ ...w, index, outStart: a, outEnd: b, emphasis: flags[index] });
  });
  return placed;
}

const latin = (s: string) => /[A-Za-z0-9]/.test(s);

/**
 * Groups words into caption pages: a new page starts after sentence-ending punctuation,
 * a pause, or when the line would exceed `maxChars`.
 */
export function paginate(words: PlacedWord[], maxChars: number): Page[] {
  const pages: Page[] = [];
  let cur: PlacedWord[] = [];
  let len = 0;
  const flush = () => {
    if (!cur.length) return;
    pages.push({ index: pages.length, words: cur, outStart: cur[0].outStart, outEnd: cur[cur.length - 1].outEnd });
    cur = [];
    len = 0;
  };
  for (const w of words) {
    const add = w.text.length + (cur.length && latin(w.text) ? 1 : 0);
    const prev = cur[cur.length - 1];
    if (prev && (len + add > maxChars || w.outStart - prev.outEnd > 0.35)) flush();
    cur.push(w);
    len += add;
    if (/[.!?。！？]$/.test(w.text)) flush();
  }
  flush();
  // hold each page until the next one starts so captions never blink off mid-sentence
  pages.forEach((p, i) => {
    const next = pages[i + 1];
    p.outEnd = next ? Math.min(next.outStart, p.outEnd + 0.6) : p.outEnd + 0.6;
  });
  return pages;
}
