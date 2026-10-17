// Effects that place graphics between the wall and the speaker (need a matte to read as "behind").
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { evolvePath, getLength, getPointAtLength } from '@remotion/paths';
import { asset } from '../lib/assets';
import { fonts } from '../lib/fonts';
import { clamp, easeOutExpo, pop, progress } from '../lib/timing';
import { Caption, Footage, Sandwich, ScriptLine, Subject, rand, useSource, type EffectProps } from './layers';

/** A small social-post card: an image if given, otherwise a mock post built from a line of text. */
export const PostCard: React.FC<{ image?: string; line?: string; views?: string; width: number; dark?: boolean }> = ({
  image,
  line,
  views,
  width,
  dark,
}) => {
  const h = width * 1.6;
  return (
    <div
      style={{
        width,
        height: image ? h : undefined,
        borderRadius: width * 0.08,
        overflow: 'hidden',
        background: dark ? '#17181C' : '#FBFAF7',
        boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
        border: '3px solid rgba(255,255,255,0.85)',
        position: 'relative',
      }}
    >
      {image ? (
        <Img src={asset(image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <div style={{ padding: width * 0.09 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: width * 0.05, marginBottom: width * 0.06 }}>
            <div style={{ width: width * 0.14, height: width * 0.14, borderRadius: '50%', background: '#C9B79C' }} />
            <div style={{ height: width * 0.04, width: '45%', borderRadius: 9, background: dark ? '#3A3B42' : '#DAD6CE' }} />
          </div>
          <div
            style={{
              fontFamily: fonts.display,
              fontWeight: 800,
              fontSize: width * 0.1,
              lineHeight: 1.15,
              color: dark ? '#fff' : '#18181B',
            }}
          >
            {line}
          </div>
        </div>
      )}
      {views ? (
        <div
          style={{
            position: 'absolute',
            left: width * 0.07,
            bottom: width * 0.06,
            fontFamily: fonts.display,
            fontWeight: 800,
            fontSize: width * 0.085,
            color: '#fff',
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          ▷ {views}
        </div>
      ) : null}
    </div>
  );
};

const cardContent = (seg: EffectProps['seg'], i: number) => ({
  image: seg.images.length ? seg.images[i % seg.images.length] : undefined,
  line: seg.items.length ? seg.items[i % seg.items.length] : undefined,
});

/** 01 orbit: post cards circle the speaker in 3D; the far half passes behind them. */
export const Orbit: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const n = 6;
  const open = progress(frame, 0, 14, easeOutExpo);
  const cards = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + frame * 0.035;
    const x = Math.cos(a) * 400 * open;
    const z = Math.sin(a);
    const y = 1080 + Math.sin(a * 2 + i) * 60;
    return { i, x, z, y, scale: 0.75 + 0.3 * (z + 1) * 0.5 };
  });
  const draw = (c: (typeof cards)[number]) => (
    <div
      key={c.i}
      style={{
        position: 'absolute',
        left: 540 + c.x - 110,
        top: c.y - 175,
        transform: `scale(${c.scale * open}) rotateY(${-c.x / 18}deg)`,
        filter: `brightness(${0.7 + 0.3 * (c.z + 1) * 0.5})`,
        zIndex: Math.round(c.z * 100),
      }}
    >
      <PostCard width={220} views={`${(rand(c.i) * 900 + 100).toFixed(0)}K`} {...cardContent(seg, c.i)} />
    </div>
  );
  return (
    <AbsoluteFill style={{ perspective: 1400 }}>
      <Footage />
      <AbsoluteFill>{cards.filter((c) => c.z < 0).map(draw)}</AbsoluteFill>
      <Subject />
      <AbsoluteFill>{cards.filter((c) => c.z >= 0).map(draw)}</AbsoluteFill>
      {seg.text ? <ScriptLine kicker={seg.caption} text={seg.text} y={0.22} delay={6} /> : <Caption text={seg.caption} emphasis={seg.emphasis} />}
    </AbsoluteFill>
  );
};

/** 02 couch wall: cards slap onto the wall behind the speaker one after another until it is full. */
export const CouchWall: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = 12;
  const behind = (
    <AbsoluteFill>
      {Array.from({ length: n }, (_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const s = pop(frame, fps, i * 3, 11);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 40 + col * 340 + (rand(i) - 0.5) * 60,
              top: 120 + row * 300 + (rand(i + 9) - 0.5) * 70,
              transform: `scale(${s}) rotate(${(rand(i + 3) - 0.5) * 10}deg)`,
              opacity: Math.min(1, s * 2),
            }}
          >
            <PostCard
              width={300}
              dark={i % 2 === 0}
              views={i % 3 === 0 ? `${(rand(i + 1) * 9).toFixed(1)}M` : `${(rand(i + 2) * 800 + 50).toFixed(0)}K`}
              {...cardContent(seg, i)}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={behind} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.6} />
    </AbsoluteFill>
  );
};

/** 08 headline wall: newspaper clippings, notes and a search bar pile up on the wall; the last one is the big headline. */
export const HeadlineWall: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const lines = seg.items.length ? seg.items : ['AI edits everyone’s videos now', 'POV: AI edits your reel', 'Your next video editor is AI'];
  const n = 11;
  const kinds = ['news', 'note', 'post', 'search'] as const;
  const behind = (
    <AbsoluteFill>
      {Array.from({ length: n }, (_, i) => {
        const kind = kinds[i % kinds.length];
        const s = pop(frame, fps, i * 3, 12);
        const left = 30 + rand(i + 1) * 720;
        const top = 90 + (i % 6) * 150 + rand(i + 5) * 60;
        const line = lines[i % lines.length];
        const style: React.CSSProperties = {
          position: 'absolute',
          left,
          top,
          width: kind === 'search' ? 330 : 260,
          transform: `scale(${s}) rotate(${(rand(i + 7) - 0.5) * 12}deg)`,
          opacity: Math.min(1, s * 2),
          boxShadow: '0 10px 24px rgba(0,0,0,0.35)',
          padding: 18,
          borderRadius: kind === 'search' ? 40 : 4,
          background: kind === 'news' ? '#F3EEE2' : kind === 'note' ? '#FFFDF6' : kind === 'post' ? '#1A1A1D' : '#fff',
          color: kind === 'post' ? '#fff' : '#1A1A1A',
          fontFamily: kind === 'news' || kind === 'note' ? fonts.serif : fonts.display,
          fontWeight: kind === 'news' ? 600 : 700,
          fontStyle: kind === 'note' ? 'italic' : 'normal',
          fontSize: kind === 'search' ? 26 : 32,
          lineHeight: 1.1,
        };
        return (
          <div key={i} style={style}>
            {kind === 'news' ? <div style={{ fontSize: 14, letterSpacing: '0.2em', borderBottom: '2px solid #222', marginBottom: 8 }}>CREATOR DIGEST</div> : null}
            {kind === 'search' ? `🔍 ${line.toLowerCase()}` : line}
          </div>
        );
      })}
      {(() => {
        const s = pop(frame, fps, n * 3 + 2, 10);
        return (
          <div
            style={{
              position: 'absolute',
              left: 70,
              top: 360,
              width: 470,
              padding: 30,
              background: '#FFFDF6',
              fontFamily: fonts.serif,
              fontWeight: 600,
              fontSize: 64,
              lineHeight: 1,
              color: '#141414',
              transform: `scale(${s}) rotate(-4deg)`,
              boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
            }}
          >
            {seg.text ?? lines[0]}
          </div>
        );
      })()}
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={behind} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.72} />
    </AbsoluteFill>
  );
};

/** 10 chart grow: a glowing weekday line chart draws itself behind the speaker, with a badge at the peak. */
export const ChartGrow: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { accent } = useSource();
  const values = seg.values.length >= 2 ? seg.values : [2, 2.2, 2.1, 2.6, 4, 6.5, 9];
  const max = Math.max(...values);
  const left = 90;
  const right = 990;
  const top = 360;
  const bottom = 900;
  const pts = values.map((v, i) => [left + (i / (values.length - 1)) * (right - left), bottom - (v / max) * (bottom - top)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  const draw = progress(frame, 4, 34, easeOutExpo);
  const evolved = evolvePath(draw, d);
  const len = getLength(d);
  const head = getPointAtLength(d, len * draw) ?? { x: pts[0][0], y: pts[0][1] };
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const badge = pop(frame, fps, 30, 11);
  const peak = pts[pts.length - 1];
  const behind = (
    <AbsoluteFill>
      <svg width={1080} height={1920} style={{ position: 'absolute' }}>
        {pts.map((p, i) => (
          <g key={i}>
            <line x1={p[0]} x2={p[0]} y1={top - 40} y2={bottom} stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
            <text x={p[0]} y={top - 70} fill="rgba(255,255,255,0.8)" fontFamily="Plus Jakarta Sans" fontWeight={800} fontSize={34} textAnchor="middle">
              {days[i % 7]}
            </text>
          </g>
        ))}
        <path d={d} fill="none" stroke={accent} strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={evolved.strokeDasharray} strokeDashoffset={evolved.strokeDashoffset} style={{ filter: `drop-shadow(0 0 18px ${accent})` }} />
        {pts.map((p, i) => {
          const at = (i / (pts.length - 1)) * 30 + 4;
          const s = pop(frame, fps, at, 10);
          return <circle key={i} cx={p[0]} cy={p[1]} r={12 * s} fill="#fff" stroke={accent} strokeWidth={5} />;
        })}
        <circle cx={head.x} cy={head.y} r={26} fill={accent} opacity={0.35 * (1 - draw) + 0.15} />
        <line x1={peak[0] - 90} x2={peak[0] - 90} y1={peak[1] + 30} y2={bottom} stroke={accent} strokeWidth={3} strokeDasharray="8 10" opacity={badge} />
      </svg>
      <div
        style={{
          position: 'absolute',
          left: peak[0] - 330,
          top: peak[1] - 40,
          padding: '12px 30px',
          borderRadius: 40,
          background: accent,
          color: '#111',
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 48,
          transform: `scale(${badge})`,
          boxShadow: `0 0 40px ${accent}`,
        }}
      >
        {seg.text ?? 'SCALE'} ↗
      </div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={<AbsoluteFill style={{ background: 'rgba(0,0,0,0.25)' }}>{behind}</AbsoluteFill>} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.78} />
    </AbsoluteFill>
  );
};

/** 16 cover story: a huge magazine-cover serif title rises behind the speaker's head. */
export const CoverStory: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const word = (seg.text ?? 'EDIT').toUpperCase();
  const p = progress(frame, 0, 20, easeOutExpo);
  const behind = (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          marginTop: 230,
          fontFamily: fonts.serif,
          fontWeight: 600,
          fontSize: word.length <= 4 ? 330 : 1300 / word.length,
          lineHeight: 1,
          color: '#FBF7EE',
          letterSpacing: `${interpolate(p, [0, 1], [0.35, 0.04])}em`,
          transform: `translateY(${(1 - p) * 120}px)`,
          clipPath: `inset(${(1 - p) * 100}% 0 0 0)`,
          textShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        {word}
      </div>
      <div style={{ position: 'absolute', top: 140, left: 70, right: 70, display: 'flex', justifyContent: 'space-between', fontFamily: fonts.display, fontWeight: 800, fontSize: 26, letterSpacing: '0.3em', color: '#FBF7EE', opacity: progress(frame, 10, 24) }}>
        <span>ISSUE {String(seg.start | 0).padStart(2, '0')}</span>
        <span>{seg.items[0] ?? 'THE CREATOR ISSUE'}</span>
      </div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={behind} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.8} />
    </AbsoluteFill>
  );
};

/** 17 glass type: extruded glass letters stand on the wall in perspective; a highlight sweeps across them. */
export const GlassType: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const word = (seg.text ?? 'DESIGN').toUpperCase();
  const sweep = interpolate(frame, [10, 40], [-30, 130], clamp);
  const depth = Array.from({ length: 10 }, (_, i) => `${-(i + 1) * 1.2}px ${(i + 1) * 1.2}px 0 rgba(210,225,235,${0.5 - i * 0.04})`).join(', ');
  const behind = (
    <AbsoluteFill style={{ perspective: 1200 }}>
      <div
        style={{
          position: 'absolute',
          top: 300,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          transform: 'rotateY(-24deg) rotateX(6deg)',
          transformOrigin: '20% 50%',
        }}
      >
        {word.split('').map((ch, i) => {
          const s = pop(frame, fps, i * 3, 13);
          return (
            <span
              key={i}
              style={{
                fontFamily: fonts.display,
                fontWeight: 800,
                fontSize: Math.min(260, 1500 / word.length),
                lineHeight: 1,
                color: 'transparent',
                backgroundImage: `linear-gradient(105deg, rgba(255,255,255,0.15) ${sweep - 25}%, rgba(255,255,255,0.95) ${sweep}%, rgba(255,255,255,0.15) ${sweep + 25}%), linear-gradient(180deg, rgba(235,245,250,0.75), rgba(160,180,195,0.35))`,
                backgroundAttachment: 'fixed',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextStroke: '2px rgba(255,255,255,0.8)',
                textShadow: depth,
                opacity: s,
                transform: `translateY(${(1 - s) * 60}px)`,
                display: 'inline-block',
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={behind} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.72} />
    </AbsoluteFill>
  );
};
