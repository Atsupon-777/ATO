// "Keyword" captions from the 5-pass edit (@zeeuiux): 1-3 words at a time, timed to speech. The one key word
// of a chunk is big italic serif in a peach → pink → lavender gradient; the rest is small, light sans.
// An echo stacks fading copies of the key word above it.
import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { clamp, easeOutExpo, progress } from '../lib/timing';
import { splitWords } from './layers';

export const KEY_GRADIENT = 'linear-gradient(90deg, #F6CBA6 0%, #E7B4CF 50%, #C7B5F0 100%)';

export type Chunk = { start: number; end: number; text: string; key?: string; echo?: boolean };

/** Rough width in ems: full-width glyphs ~1, Latin ~0.5, combining marks 0. */
export const emWidth = (w: string) =>
  [...w].reduce((n, ch) => n + (/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1.02 : /\p{M}/u.test(ch) ? 0 : 0.5), 0);

const clean = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** Groups a line into chunks of up to `max` words, closing a chunk on each emphasised word. Times in frames. */
export function chunkLine(text: string, emphasis: string[], from: number, to: number, max = 3): Chunk[] {
  const words = splitWords(text);
  const em = emphasis.map(clean);
  const groups: string[][] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= max || em.includes(clean(w))) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  const step = (to - from) / Math.max(1, groups.length);
  return groups.map((g, i) => ({
    start: from + i * step,
    end: from + (i + 1) * step,
    text: g.join(/\s/.test(text) ? ' ' : ''),
    key: g.find((w) => em.includes(clean(w))),
  }));
}

/** One chunk on screen: small words around one big gradient key word. `frame` is relative to the chunk start. */
export const KeywordChunk: React.FC<{ chunk: Chunk; frame: number; y?: number; size?: number; sansFamily?: string; keyFamily?: string }> = ({
  chunk,
  frame,
  y = 0.66,
  size = 64,
  sansFamily = fonts.display,
  keyFamily = fonts.serif,
}) => {
  const { fps } = useVideoConfig();
  const len = chunk.end - chunk.start;
  const p = progress(frame, 0, 7, easeOutExpo);
  const out = interpolate(frame, [len - 4, len], [1, 0], clamp);
  // the key word is found by text, so it works the same with or without spaces between words
  const at = chunk.key ? chunk.text.toLowerCase().indexOf(chunk.key.toLowerCase()) : -1;
  // telop style: no sentence punctuation at the ends of a line
  const tidy = (s: string) => s.trim().replace(/^[、。，．,.!?！？]+|[、。，．,.]+$/g, '');
  const before = tidy(at >= 0 ? chunk.text.slice(0, at) : chunk.text);
  const after = at >= 0 ? tidy(chunk.text.slice(at + chunk.key!.length)) : '';
  const small: React.CSSProperties = {
    fontFamily: sansFamily,
    fontWeight: 500,
    fontSize: size,
    color: '#fff',
    letterSpacing: '0.01em',
    textShadow: '0 2px 18px rgba(0,0,0,0.55)',
    lineHeight: 1.15,
  };
  const key0 = at >= 0 ? chunk.text.slice(at, at + chunk.key!.length) : '';
  // as big as fits on one line (italic serif: ~1em per CJK glyph, ~0.5em per Latin letter)
  const keySize = Math.min(size * 2.6, 900 / Math.max(1, emWidth(key0)));
  const keyStyle = (o: number): React.CSSProperties => ({
    fontFamily: keyFamily,
    fontStyle: 'italic',
    fontWeight: 500,
    fontSize: keySize,
    lineHeight: 0.95,
    letterSpacing: '-0.01em',
    color: 'transparent',
    backgroundImage: KEY_GRADIENT,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    opacity: o,
    padding: '0 0.08em',
    whiteSpace: 'nowrap',
  });
  const key = key0 || null;
  return (
    <div
      style={{
        position: 'absolute',
        top: y * 1920,
        left: 60,
        right: 60,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        transform: `translateY(-50%) translateY(${(1 - p) * 24}px)`,
        opacity: p * out,
        filter: `blur(${(1 - p) * 6}px)`,
      }}
    >
      {before ? <div style={small}>{before}</div> : null}
      {key ? (
        <div style={{ position: 'relative' }}>
          {chunk.echo
            ? [2, 1].map((n) => {
                // copies rise out of the word and fade, one after the other
                const e = progress(frame, 3 + (2 - n) * 3, 14 + (2 - n) * 3, easeOutExpo);
                const fade = interpolate(frame, [12, Math.max(13, len * 0.8)], [1, 0], clamp);
                return (
                  <div key={n} style={{ ...keyStyle((0.5 / n) * e * fade), position: 'absolute', left: 0, right: 0, top: -n * keySize * 0.62 * e }}>
                    {key}
                  </div>
                );
              })
            : null}
          <div style={{ ...keyStyle(1), position: 'relative', transform: `scale(${0.92 + 0.08 * p})`, filter: 'drop-shadow(0 6px 30px rgba(231,180,207,0.25))' }}>
            {key}
          </div>
        </div>
      ) : null}
      {after ? <div style={small}>{after}</div> : null}
    </div>
  );
};

/** Plays a list of chunks; shows the one whose time covers the current frame. */
export const KeywordCaptions: React.FC<{ chunks: Chunk[]; y?: number; size?: number; sansFamily?: string; keyFamily?: string }> = ({ chunks, ...rest }) => {
  const frame = useCurrentFrame();
  const c = chunks.find((x) => frame >= x.start && frame < x.end);
  if (!c) return null;
  return <KeywordChunk chunk={c} frame={frame - c.start} {...rest} />;
};
