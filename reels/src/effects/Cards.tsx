// Card scenes from the 5-pass edit (@zeeuiux): phone notifications stacking up, icon tiles that get ticked,
// and a "source" card that names a study and counts its number up. They stay above or below the face
// (`place`) and sit behind the speaker when there is a matte.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { clamp, easeOutExpo, pop, progress } from '../lib/timing';
import { itemTimes } from './cues';
import { KEY_GRADIENT } from './Keyword';
import { Caption, Sandwich, type EffectProps } from './layers';

type Place = 'top' | 'bottom';
type CardProps = { items: string[]; text?: string; value?: number; place?: Place; seconds: number; label?: string };

const glass: React.CSSProperties = {
  background: 'rgba(32, 26, 38, 0.72)',
  backdropFilter: 'blur(26px)',
  border: '1.5px solid rgba(255,255,255,0.14)',
  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
  color: '#fff',
};

const lead = (s: string) => {
  const m = s.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u);
  return m ? { icon: m[1], label: m[2] } : { icon: null, label: s };
};

/** Phone notifications drop in one by one and stack; the newest sits on top. */
export const NotificationStack: React.FC<CardProps> = ({ items, text, place = 'top', seconds, label = 'now' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const list = items.length ? items : ['47 tabs still open', 'One more what-if', 'Did you reply yet?'];
  const times = itemTimes(0, seconds, list.length).map((t) => t * fps);
  const top = place === 'top' ? 170 : 1180;
  const keyAt = (times[times.length - 1] ?? 0) + 8;
  const k = pop(frame, fps, keyAt, 15);
  return (
    <AbsoluteFill>
      {list.map((it, i) => {
        const p = pop(frame, fps, times[i], 13);
        if (frame < times[i]) return null;
        const newer = times.filter((t, j) => j > i && frame >= t).length;
        const { icon, label: msg } = lead(it);
        return (
          <div
            key={i}
            style={{
              ...glass,
              position: 'absolute',
              left: 70,
              right: 70,
              top: top + newer * 158,
              padding: '26px 30px',
              borderRadius: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              fontFamily: fonts.display,
              transform: `translateY(${(1 - p) * -90}px) scale(${1 - newer * 0.04})`,
              opacity: Math.min(1, p * 1.4) * (1 - newer * 0.25),
              zIndex: 10 + i,
            }}
          >
            <div style={{ width: 74, height: 74, borderRadius: 18, background: KEY_GRADIENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, flexShrink: 0 }}>
              {icon ?? '●'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, fontWeight: 600, opacity: 0.6, letterSpacing: '0.04em' }}>
                <span>{list.length > 1 ? `${i + 1} / ${list.length}` : ''}</span>
                <span>{label}</span>
              </div>
              <div style={{ fontSize: 38, fontWeight: 600, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg}</div>
            </div>
          </div>
        );
      })}
      {text ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: top + 40 + list.length * 158,
            textAlign: 'center',
            fontFamily: fonts.serif,
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 120,
            color: 'transparent',
            backgroundImage: KEY_GRADIENT,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            opacity: k,
            transform: `scale(${0.9 + 0.1 * k})`,
          }}
        >
          {text}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Rounded icon tiles in a row; each lands, then gets a tick. Items may start with an emoji for the icon. */
export const IconTiles: React.FC<CardProps> = ({ items, text, place = 'bottom', seconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const list = (items.length ? items : ['🚶 Walk', '🧹 Clean', '🚿 Shower']).slice(0, 4);
  const times = itemTimes(0, seconds, list.length).map((t) => t * fps);
  const w = list.length > 3 ? 210 : 260;
  const top = place === 'top' ? 230 : 1150;
  return (
    <AbsoluteFill>
      {text ? (
        <div
          style={{
            position: 'absolute',
            top: top - 90,
            width: '100%',
            textAlign: 'center',
            fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace',
            fontSize: 28,
            letterSpacing: '0.24em',
            color: 'rgba(255,255,255,0.75)',
            opacity: progress(frame, 0, 8),
          }}
        >
          {text.toUpperCase()}
        </div>
      ) : null}
      <div style={{ position: 'absolute', top, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 34 }}>
        {list.map((it, i) => {
          const p = pop(frame, fps, times[i], 12);
          const tick = pop(frame, fps, times[i] + 0.35 * fps, 10);
          const { icon, label } = lead(it);
          return (
            <div key={i} style={{ width: w, opacity: frame >= times[i] ? 1 : 0, transform: `translateY(${(1 - p) * 60}px) scale(${0.7 + 0.3 * p})` }}>
              <div style={{ ...glass, position: 'relative', height: w, borderRadius: w * 0.26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: w * 0.42 }}>
                {icon ?? <span style={{ fontFamily: fonts.serif, fontStyle: 'italic', color: 'transparent', backgroundImage: KEY_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text' }}>{label.slice(0, 1)}</span>}
                <div
                  style={{
                    position: 'absolute',
                    right: -14,
                    top: -14,
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: KEY_GRADIENT,
                    color: '#1A1220',
                    fontSize: 36,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${frame >= times[i] + 0.35 * fps ? tick : 0})`,
                    boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
                  }}
                >
                  ✓
                </div>
              </div>
              <div style={{ marginTop: 18, textAlign: 'center', fontFamily: fonts.display, fontWeight: 600, fontSize: 36, color: '#fff', textShadow: '0 2px 14px rgba(0,0,0,0.5)' }}>{label}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/** A "source" card: kicker label, the name the speaker said, and their number counting up. */
export const SourceCard: React.FC<CardProps> = ({ items, text, value, place = 'bottom', seconds, label = 'SOURCE' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, fps, 0, 15);
  const n = value ?? undefined;
  const c = n === undefined ? 0 : n * progress(frame, 6, Math.min(seconds * fps * 0.7, 40), easeOutExpo);
  const out = interpolate(frame, [seconds * fps - 6, seconds * fps], [1, 0], clamp);
  const top = place === 'top' ? 200 : 1180;
  return (
    <AbsoluteFill>
      <div
        style={{
          ...glass,
          position: 'absolute',
          left: 90,
          right: 90,
          top,
          padding: '34px 40px',
          borderRadius: 34,
          fontFamily: fonts.display,
          opacity: p * out,
          transform: `translateY(${(1 - p) * 50}px)`,
        }}
      >
        <div style={{ fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace', fontSize: 24, letterSpacing: '0.28em', opacity: 0.65 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginTop: 14 }}>
          <div style={{ fontSize: 46, fontWeight: 700, lineHeight: 1.15 }}>{text ?? 'Harvard Medical School'}</div>
          {n !== undefined ? (
            <div style={{ fontFamily: fonts.serif, fontStyle: 'italic', fontSize: 120, lineHeight: 0.9, color: 'transparent', backgroundImage: KEY_GRADIENT, WebkitBackgroundClip: 'text', backgroundClip: 'text', flexShrink: 0 }}>
              {Number.isInteger(n) ? Math.round(c) : c.toFixed(1)}
              {items[0] ?? ''}
            </div>
          ) : null}
        </div>
        {items[1] ? <div style={{ fontSize: 30, opacity: 0.7, marginTop: 10 }}>{items[1]}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

export const CARD_COMPONENTS = { notifications: NotificationStack, tiles: IconTiles, sourceCard: SourceCard } as const;

// As EffectsReel scenes: the card sits between the wall and the speaker, captions below.
const asScene =
  (Card: React.FC<CardProps>, place: Place): React.FC<EffectProps> =>
  ({ seg }) => {
    const { durationInFrames, fps } = useVideoConfig();
    return (
      <AbsoluteFill>
        <Sandwich behind={<Card items={seg.items} text={seg.text} value={seg.values[0]} place={place} seconds={durationInFrames / fps} />} />
        <Caption text={seg.caption} emphasis={seg.emphasis} y={place === 'top' ? 0.74 : 0.5} />
      </AbsoluteFill>
    );
  };

export const Notifications = asScene(NotificationStack, 'top');
export const Tiles = asScene(IconTiles, 'bottom');
export const Source = asScene(SourceCard, 'bottom');
