import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Overlay } from '../schemas';
import { fonts } from '../lib/fonts';

/** Sticker artwork in a 100x100 box, filled with the overlay colour. */
export const STICKER_PATHS: Record<NonNullable<Overlay['sticker']>, string> = {
  heart: 'M50 88S12 64 12 36a20 20 0 0 1 38-9 20 20 0 0 1 38 9c0 28-38 52-38 52z',
  star: 'M50 6l12.4 27.6L92 36.6 69.8 57l6.2 30L50 72.4 24 87l6.2-30L8 36.6l29.6-3z',
  sparkle: 'M50 4c4 26 20 42 46 46-26 4-42 20-46 46-4-26-20-42-46-46 26-4 42-20 46-46z',
  arrow: 'M10 40h50V18l34 32-34 32V60H10z',
  burst: 'M50 2l9 20 21-9-6 22 22 5-19 12 14 18-23-1-3 23-15-17-15 17-3-23-23 1 14-18L4 40l22-5-6-22 21 9z',
  check: 'M50 4a46 46 0 1 0 0 92 46 46 0 0 0 0-92zm-8 66L20 48l8-8 14 14 30-30 8 8z',
  fire: 'M52 4c6 20-14 28-14 46 0 8 5 14 12 16-4-6-2-14 6-20 2 10 12 14 12 26 0 12-10 22-22 22-16 0-30-12-30-30 0-30 30-40 36-60z',
  new: 'M8 30h84v40H8z',
};

const TEXT_DARK = new Set(['#ffffff', '#fff', '#dfff4f', '#f5f3ee', '#ffe14d']);

const OverlayItem: React.FC<{ o: Overlay; accent: string }> = ({ o, accent }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const start = Math.round((o.from ?? 0) * fps);
  const end = o.to === undefined ? Infinity : Math.round(o.to * fps);
  if (frame < start || frame > end) return null;
  const pop = spring({ frame: frame - start, fps, config: { damping: 12, mass: 0.6 } });
  const color = o.color ?? accent;
  const scale = (o.scale ?? 1) * pop;
  const box: React.CSSProperties = {
    position: 'absolute',
    left: `${o.x * 100}%`,
    top: `${o.y * 100}%`,
    transform: `translate(-50%, -50%) scale(${scale})`,
  };
  if (o.kind === 'text') {
    const dark = TEXT_DARK.has(color.toLowerCase());
    return (
      <div
        style={{
          ...box,
          maxWidth: width * 0.86,
          padding: '14px 30px',
          borderRadius: 18,
          background: color,
          color: dark ? '#0a0a0b' : '#ffffff',
          fontFamily: fonts.display,
          fontWeight: 800,
          fontSize: 64,
          lineHeight: 1.15,
          textAlign: 'center',
          boxShadow: '0 12px 40px rgba(0,0,0,0.35)',
        }}
      >
        {o.text}
      </div>
    );
  }
  const id = o.sticker ?? 'star';
  return (
    <div style={{ ...box, width: 220, height: 220, filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.35))' }}>
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <path d={STICKER_PATHS[id]} fill={color} stroke="#fff" strokeWidth={4} strokeLinejoin="round" />
        {id === 'new' ? (
          <text x="50" y="58" textAnchor="middle" fontSize="26" fontWeight={800} fontFamily={fonts.display} fill={TEXT_DARK.has(color.toLowerCase()) ? '#0a0a0b' : '#fff'}>
            NEW
          </text>
        ) : null}
      </svg>
    </div>
  );
};

/** Premium-edit layer: stickers and telops the user placed, over every beat. */
export const Overlays: React.FC<{ items?: Overlay[]; accent: string }> = ({ items, accent }) =>
  items?.length ? (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {items.map((o, i) => (
        <OverlayItem key={i} o={o} accent={accent} />
      ))}
    </div>
  ) : null;
