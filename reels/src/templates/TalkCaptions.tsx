import React, { useMemo } from 'react';
import { z } from 'zod';
import { zColor } from '@remotion/zod-types';
import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { useFonts } from '../lib/useFonts';
import { asset } from '../lib/assets';
import { pop, progress } from '../lib/timing';
import { editDuration, keepSegments, paginate, placeWords } from '../lib/edit';

export const talkCaptionsSchema = z.object({
  video: z.string(),
  sourceDuration: z.number().positive(),
  /** cover: crop to 9:16 around focusX. fit-blur: whole frame over a blurred fill (for 16:9 sources). */
  layout: z.enum(['cover', 'fit-blur']),
  focusX: z.number().min(0).max(1),
  /** Word-level transcript, e.g. from ElevenLabs Scribe (`words` with start/end in seconds). */
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
  cutSilence: z.object({ enabled: z.boolean(), minGap: z.number().min(0.1).max(2), pad: z.number().min(0).max(0.5) }),
  fillers: z.array(z.string()),
  captions: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    fontSize: z.number().min(40).max(160),
    maxChars: z.number().min(6).max(40),
    color: zColor(),
    highlight: zColor(),
    stroke: zColor(),
    box: z.boolean(),
    uppercase: z.boolean(),
  }),
  /** Per-caption edits from the editor: move, rewrite or delete one caption page. */
  overrides: z
    .array(
      z.object({
        page: z.number().int().min(0),
        hidden: z.boolean().optional(),
        text: z.string().optional(),
        x: z.number().min(0).max(1).optional(),
        y: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
  emphasis: z.array(z.string()),
  title: z.string().max(30).optional(),
  titleY: z.number().min(0).max(1),
  accent: zColor(),
});

export type TalkCaptionsProps = z.infer<typeof talkCaptionsSchema>;

export const talkCaptionsDuration = (p: TalkCaptionsProps, fps: number) => {
  const segs = keepSegments(p.words, { ...p.cutSilence, fillers: p.fillers, sourceDuration: p.sourceDuration });
  return Math.max(1, Math.round(editDuration(segs) * fps));
};

export const TalkCaptions: React.FC<TalkCaptionsProps> = (p) => {
  useFonts(p);
  const { fps } = useVideoConfig();
  const segs = useMemo(
    () => keepSegments(p.words, { ...p.cutSilence, fillers: p.fillers, sourceDuration: p.sourceDuration }),
    [p.words, p.cutSilence, p.fillers, p.sourceDuration],
  );
  const pages = useMemo(
    () => paginate(placeWords(p.words, segs, p.fillers, p.emphasis), p.captions.maxChars),
    [p.words, segs, p.fillers, p.emphasis, p.captions.maxChars],
  );
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {segs.map((s, i) => {
        const from = Math.round(s.outStart * fps);
        const dur = Math.max(1, Math.round((s.outStart + s.end - s.start) * fps) - from);
        return (
          <Sequence key={i} from={from} durationInFrames={dur} premountFor={15}>
            <Shot {...p} trimBefore={Math.round(s.start * fps)} punch={i % 2 === 1} />
          </Sequence>
        );
      })}
      {p.title ? <Title text={p.title} y={p.titleY} accent={p.accent} /> : null}
      {pages.map((pg) => {
        const o = p.overrides.find((x) => x.page === pg.index);
        if (o?.hidden) return null;
        const from = Math.round(pg.outStart * fps);
        const dur = Math.max(1, Math.round(pg.outEnd * fps) - from);
        return (
          <Sequence key={pg.index} from={from} durationInFrames={dur} layout="none">
            <CaptionPage {...p} page={pg} override={o} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** One kept stretch of the source. Every other cut punches in slightly so jump cuts read as intentional. */
const Shot: React.FC<TalkCaptionsProps & { trimBefore: number; punch: boolean }> = ({ trimBefore, punch, ...p }) => {
  const scale = punch ? 1.1 : 1;
  const src = asset(p.video);
  if (p.layout === 'cover') {
    return (
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={src}
          trimBefore={trimBefore}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${p.focusX * 100}% 50%` }}
        />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: 'scale(1.3)', filter: 'blur(40px) brightness(0.55)' }}>
        <OffthreadVideo src={src} trimBefore={trimBefore} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: 'center', transform: `scale(${scale})` }}>
        <OffthreadVideo
          src={src}
          trimBefore={trimBefore}
          style={{ width: '100%', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Title: React.FC<{ text: string; y: number; accent: string }> = ({ text, y, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = pop(frame, fps, 4, 12);
  return (
    <div
      style={{
        position: 'absolute',
        top: y * 1920,
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        transform: `scale(${s}) rotate(${(1 - s) * -4}deg)`,
      }}
    >
      <div
        style={{
          background: '#fff',
          color: '#111',
          padding: '18px 40px',
          borderRadius: 18,
          fontFamily: fonts.sansJP,
          fontWeight: 900,
          fontSize: 66,
          boxShadow: `10px 10px 0 ${accent}`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

const CaptionPage: React.FC<
  TalkCaptionsProps & {
    page: ReturnType<typeof paginate>[number];
    override?: TalkCaptionsProps['overrides'][number];
  }
> = ({ page, override, ...p }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = p.captions;
  const t = page.outStart + frame / fps;
  const enter = pop(frame, fps, 0, 13);
  const x = (override?.x ?? c.x) * 1080;
  const y = (override?.y ?? c.y) * 1920;
  const strokeStyle: React.CSSProperties = {
    WebkitTextStroke: `${c.fontSize * 0.12}px ${c.stroke}`,
    paintOrder: 'stroke fill',
  };
  const base: React.CSSProperties = {
    fontFamily: fonts.sansJP,
    fontWeight: 900,
    fontSize: c.fontSize,
    lineHeight: 1.18,
    textTransform: c.uppercase ? 'uppercase' : 'none',
    ...(c.box ? {} : strokeStyle),
  };
  const content = override?.text ? (
    <span style={{ ...base, color: c.color }}>{override.text}</span>
  ) : (
    page.words.map((w, i) => {
      const active = t >= w.outStart && t < w.outEnd + 0.05;
      const spoken = t >= w.outStart;
      const wp = progress(frame, Math.round((w.outStart - page.outStart) * fps), Math.round((w.outStart - page.outStart) * fps) + 5);
      const color = w.emphasis ? p.accent : active ? c.highlight : c.color;
      return (
        <span
          key={i}
          style={{
            ...base,
            display: 'inline-block',
            margin: `0 ${c.fontSize * 0.3}px`,
            color,
            opacity: spoken ? 1 : 0.55,
            transform: `scale(${active ? 1 + 0.12 * wp : 1}) translateY(${active ? -4 * wp : 0}px)`,
            fontSize: w.emphasis ? c.fontSize * 1.15 : c.fontSize,
          }}
        >
          {w.text}
        </span>
      );
    })
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 470,
        width: 940,
        top: y,
        display: 'flex',
        justifyContent: 'center',
        transform: `translateY(-50%) scale(${0.7 + enter * 0.3})`,
        opacity: Math.min(1, enter * 1.6),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          ...(c.box ? { background: 'rgba(0,0,0,0.72)', borderRadius: 22, padding: '16px 26px' } : {}),
        }}
      >
        {content}
      </div>
    </div>
  );
};
