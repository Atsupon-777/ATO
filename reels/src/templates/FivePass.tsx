// 5-pass edit (@zeeuiux): background video → cards and graphics → the cut-out speaker → keyword captions,
// with cue sounds on top. Each pass adds one layer, so the preview after pass N shows exactly what N did.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { FivePassProps } from '../schemas';
import { alphaVideoOk, asset } from '../lib/assets';
import { cjkVars, fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { effects } from '../effects';
import { CARD_COMPONENTS } from '../effects/Cards';
import { KEY_GRADIENT, KeywordCaptions } from '../effects/Keyword';
import { Footage, SourceContext, Subject, type Source } from '../effects/layers';

export const fivePassDuration = (p: FivePassProps, fps: number) => Math.max(1, Math.round(p.duration * fps));

const MONO = 'ui-monospace, "SFMono-Regular", Menlo, monospace';
const SFX_VOLUME = { whoosh: 0.45, tap: 0.55, chime: 0.5 } as const;
const isCard = (t: string): t is keyof typeof CARD_COMPONENTS => t in CARD_COMPONENTS;

export const FivePass: React.FC<FivePassProps> = (p) => {
  useFonts(p);
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const f = (s: number) => Math.round(s * fps);
  const scenes = p.pass >= 4 ? p.scenes : [];
  // full-screen effect scenes draw their own footage and speaker; the base layers step aside meanwhile
  const kinetic = scenes.some((s) => s.type === 'kineticType' && frame >= f(s.start) && frame < f(s.end));
  const inEffect = scenes.some((s) => !isCard(s.type) && frame >= f(s.start) && frame < f(s.end));
  const source: Source = {
    video: p.video,
    matte: p.pass >= 2 && alphaVideoOk() ? p.matte : undefined,
    focusX: p.focusX,
    trimBefore: 0,
    accent: '#E7B4CF',
    ink: '#1A1220',
    paper: '#0B0A0D',
    style: { grade: 'midnight', caption: 'keyword', font: 'serif', accents: [] },
    reelFrom: 0,
    reelTotal: fivePassDuration(p, fps),
  };
  return (
    <AbsoluteFill lang={p.lang} style={{ background: 'radial-gradient(120% 70% at 50% 25%, #2A1A33 0%, #1A1220 50%, #0B0A0D 100%)', ...cjkVars(p.lang) }}>
      <SourceContext.Provider value={source}>
        {/* pass 2 previews the cut-out on its own, so the edges can be judged */}
        {p.pass !== 2 && !inEffect ? <Footage /> : null}
        {scenes.map((s, i) => {
          const from = f(s.start);
          const dur = Math.max(1, f(s.end) - from);
          if (isCard(s.type)) {
            const Card = CARD_COMPONENTS[s.type];
            return (
              <Sequence key={i} from={from} durationInFrames={dur} layout="none">
                <Card items={s.items} text={s.text} value={s.value} place={s.place} seconds={dur / fps} />
              </Sequence>
            );
          }
          const Effect = effects[s.type];
          return (
            <Sequence key={i} from={from} durationInFrames={dur}>
              <SourceContext.Provider value={{ ...source, trimBefore: from }}>
                <Effect seg={{ effect: s.type, start: s.start, end: s.end, emphasis: [], items: s.items, images: [], values: s.value === undefined ? [] : [s.value], text: s.text }} />
              </SourceContext.Provider>
            </Sequence>
          );
        })}
        {!inEffect ? <Subject /> : null}
      </SourceContext.Provider>
      {p.pass >= 3 && !kinetic ? (
        <KeywordCaptions
          chunks={p.captions.map((c) => ({ ...c, start: f(c.start), end: f(c.end) }))}
          y={scenes.some((s) => isCard(s.type) && s.place === 'bottom' && frame >= f(s.start) && frame < f(s.end)) ? 0.5 : 0.72}
          sansFamily={fonts.display}
        />
      ) : null}
      {p.pass === 1 ? <WordTicker words={p.words} /> : null}
      <Audio src={asset(p.video)} />
      {p.pass >= 5
        ? p.sfx.map((s, i) => (
            <Sequence key={`sfx${i}`} from={Math.max(0, f(s.at))} layout="none">
              <Audio src={staticFile(`sfx/${s.kind}.wav`)} volume={SFX_VOLUME[s.kind]} />
            </Sequence>
          ))
        : null}
      {p.pass < 5 ? <PassLabel pass={p.pass} /> : null}
    </AbsoluteFill>
  );
};

/** "PASS 03 / 05" and a progress bar, shown on previews only. */
const PassLabel: React.FC<{ pass: number }> = ({ pass }) => (
  <>
    <div style={{ position: 'absolute', top: 70, left: 60, fontFamily: MONO, fontSize: 26, letterSpacing: '0.24em', color: 'rgba(255,255,255,0.7)' }}>
      PASS {String(pass).padStart(2, '0')} / 05
    </div>
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 70, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)' }}>
      <div style={{ width: `${(pass / 5) * 100}%`, height: '100%', borderRadius: 3, background: KEY_GRADIENT }} />
    </div>
  </>
);

/** Pass 1 preview: the transcript around the current word, with that word lit. */
const WordTicker: React.FC<{ words: FivePassProps['words'] }> = ({ words }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const i = Math.max(0, words.findIndex((w) => w.end >= t));
  const near = words.slice(Math.max(0, i - 4), i + 6);
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 130, display: 'flex', flexWrap: 'wrap', gap: '6px 14px', justifyContent: 'center', fontFamily: MONO, fontSize: 30 }}>
      {near.map((w, k) => {
        const on = t >= w.start && t <= w.end;
        return (
          <span key={k} style={{ color: on ? '#1A1220' : 'rgba(255,255,255,0.7)', background: on ? '#E7B4CF' : 'rgba(255,255,255,0.08)', padding: '4px 10px', borderRadius: 8 }}>
            {w.text}
            <span style={{ opacity: 0.5, fontSize: 20, marginLeft: 8 }}>{w.start.toFixed(2)}</span>
          </span>
        );
      })}
    </div>
  );
};
