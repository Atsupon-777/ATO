// "Headline" scene: a newspaper page swings into view over a dark stack of papers, the headline sets
// line by line, the body follows, and a highlighter sweeps across the sentence that matters.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { useLook } from './theme';
import { E, k, lin, mix, rand } from './kit';

export type HeadlineProps = {
  /** The paper's name (a made-up masthead for the brand, never a real newspaper). */
  masthead: string;
  kicker?: string;
  headline: string;
  /** Body text; the part equal to `highlight` gets the marker. */
  body: string;
  highlight?: string;
  byline?: string;
  date?: string;
  accent?: string;
};

const PAPER = '#f4efe4';
const INK = '#1b1a17';

export const Headline: React.FC<HeadlineProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const L = useLook();
  const t = (s: number) => s * fps;
  const marker = p.accent ?? L?.accent ?? '#e9ff52';
  const swing = k(f, 0, t(0.9), E.outExpo);
  const drift = lin(f, 0, D);
  const lines = p.headline.split('\n').length > 1 ? p.headline.split('\n') : wrap(p.headline, /[぀-鿿]/.test(p.headline) ? 11 : 22);
  const headAt = (i: number) => t(0.45) + i * t(0.22);
  const bodyAt = headAt(lines.length) + t(0.15);
  const hl = p.highlight && p.body.includes(p.highlight) ? p.highlight : '';
  const [before, after] = hl ? p.body.split(hl, 2) : [p.body, ''];
  const sweepStart = bodyAt + t(0.7);
  const sweep = E.inOutCubic(lin(f, sweepStart, sweepStart + t(0.8)));
  const cjk = /[぀-鿿]/.test(p.headline);
  // the longest line fills the 784 px column: CJK glyphs are about 1.02 em, Latin letters about 0.5 em
  const longest = Math.max(...lines.map((l) => [...l].reduce((n, ch) => n + (/[　-鿿＀-￯]/.test(ch) ? 1.02 : 0.5), 0)));
  const headSize = Math.min(cjk ? 72 : 80, 780 / Math.max(1, longest));
  return (
    <AbsoluteFill style={{ background: L?.bg ?? '#121110', overflow: 'hidden' }}>
      {/* the stack of papers behind, out of focus */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: -120 + rand(i) * 700,
            top: -100 + rand(i + 9) * 1700,
            width: 620,
            height: 820,
            background: '#2a2824',
            transform: `rotate(${-25 + rand(i + 3) * 50}deg)`,
            filter: 'blur(14px)',
            opacity: 0.8,
          }}
        />
      ))}
      <AbsoluteFill style={{ perspective: 2200 }}>
        <div
          style={{
            position: 'absolute',
            left: 90,
            top: 330,
            width: 900,
            minHeight: 1180,
            padding: '56px 58px',
            boxSizing: 'border-box',
            background: PAPER,
            color: INK,
            boxShadow: '0 60px 120px rgba(0,0,0,.6)',
            transformOrigin: '50% 60%',
            transform: `translateY(${(1 - swing) * 900}px) rotateX(${(1 - swing) * 38}deg) rotateZ(${mix(-9, -3.5, swing) + drift * 1.2}deg) scale(${1 + drift * 0.05})`,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: fonts.serif, fontSize: 22, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>
            <span>{p.date ?? ''}</span>
            <span>Business edition</span>
          </div>
          <div style={{ fontFamily: fonts.serif, fontWeight: 600, fontSize: 84, textAlign: 'center', letterSpacing: '-0.01em', margin: '10px 0 6px', lineHeight: 1 }}>{p.masthead}</div>
          <div style={{ borderTop: `3px solid ${INK}`, borderBottom: `1px solid ${INK}`, height: 6, margin: '8px 0 26px' }} />
          {p.kicker ? (
            <div style={{ fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 24, color: '#b2351f', letterSpacing: '0.12em', marginBottom: 14, opacity: lin(f, t(0.35), t(0.6)) }}>{p.kicker}</div>
          ) : null}
          <div style={{ fontFamily: L && L.head !== fonts.sansJP ? L.head : cjk ? fonts.minchoJP : fonts.serif, fontWeight: cjk ? 800 : 600, fontSize: headSize, lineHeight: 1.12, letterSpacing: cjk ? '0.02em' : '-0.015em', whiteSpace: 'nowrap' }}>
            {lines.map((l, i) => {
              const a = k(f, headAt(i), headAt(i) + t(0.4), E.outExpo);
              return (
                <div key={i} style={{ overflow: 'hidden' }}>
                  <div style={{ transform: `translateY(${(1 - a) * 100}%)`, opacity: a }}>{l}</div>
                </div>
              );
            })}
          </div>
          {p.byline ? (
            <div style={{ fontFamily: fonts.sansJP, fontSize: 22, opacity: 0.6 * lin(f, bodyAt - t(0.1), bodyAt + t(0.2)), margin: '24px 0 18px' }}>{p.byline}</div>
          ) : (
            <div style={{ height: 30 }} />
          )}
          <div
            style={{
              fontFamily: cjk ? fonts.minchoJP : fonts.serif,
              fontWeight: 500,
              fontSize: cjk ? 34 : 38,
              lineHeight: 1.6,
              opacity: lin(f, bodyAt, bodyAt + t(0.35)),
              transform: `translateY(${(1 - k(f, bodyAt, bodyAt + t(0.5))) * 24}px)`,
            }}
          >
            <span style={{ float: 'left', fontSize: cjk ? 96 : 118, lineHeight: 0.85, marginRight: 12, marginTop: 6, fontWeight: 600 }}>{[...before][0]}</span>
            {[...before].slice(1).join('')}
            {hl ? (
              <span
                style={{
                  backgroundImage: `linear-gradient(${marker}, ${marker})`,
                  backgroundRepeat: 'no-repeat',
                  backgroundSize: `${sweep * 100}% 78%`,
                  backgroundPosition: '0 70%',
                  boxDecorationBreak: 'clone',
                  WebkitBoxDecorationBreak: 'clone',
                }}
              >
                {hl}
              </span>
            ) : null}
            {after}
          </div>
          {/* the rest of the page: two columns of text set too small to read, so the eye stays on the story */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 34, marginTop: 34, opacity: 0.85 * lin(f, bodyAt + t(0.2), bodyAt + t(0.6)) }}>
            {[0, 1].map((c) => (
              <div key={c} style={{ display: 'grid', gap: 13 }}>
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} style={{ height: 9, borderRadius: 2, background: 'rgba(27,26,23,.2)', width: `${i === 8 ? 40 + rand(c * 20 + i) * 30 : 88 + rand(c * 20 + i) * 12}%` }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Breaks a headline into lines of at most `n` characters (CJK) or words (Latin). */
function wrap(s: string, n: number): string[] {
  if (/[぀-鿿]/.test(s)) {
    const out: string[] = [];
    for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
    return out;
  }
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(/\s+/)) {
    if ((cur + ' ' + w).trim().length > n && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}
