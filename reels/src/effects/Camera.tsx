// Effects that move the "camera" on the footage itself.
import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { clamp, easeInExpo, easeOutExpo, pop, progress } from '../lib/timing';
import { Caption, Footage, Subject, Vignette, useSource, type EffectProps } from './layers';

/** 05 digital zoom: a sudden punch-in on the key word, with a frame of motion blur. */
export const DigitalZoom: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const at = Math.round(durationInFrames * 0.35);
  const z = progress(frame, at, at + 6, easeOutExpo);
  const blur = frame >= at && frame < at + 4 ? 6 : 0;
  return (
    <AbsoluteFill>
      <Footage style={{ transform: `scale(${1 + 0.35 * z})`, transformOrigin: '50% 38%', filter: `blur(${blur}px)` }} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.6} />
    </AbsoluteFill>
  );
};

/**
 * 09 zoom-through cut: the shot arrives out of a radial zoom blur and leaves into one,
 * so two zoom-through segments back to back read as flying through the cut.
 */
export const ZoomThrough: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const arrive = 1 - progress(frame, 0, 8, easeOutExpo);
  const leave = progress(frame, durationInFrames - 8, durationInFrames, easeInExpo);
  const amount = Math.max(arrive, leave);
  const scale = 1 + arrive * 0.6 + leave * 2.5;
  // Radial blur: a few enlarged, faded copies; only rendered while the blur is visible.
  const copies = amount > 0.02 ? [1.06, 1.14, 1.24] : [];
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Footage style={{ transform: `scale(${scale})`, filter: `brightness(${1 - amount * 0.4})` }} />
      {copies.map((k, i) => (
        <Footage key={k} muted style={{ transform: `scale(${scale * (1 + (k - 1) * amount * 2)})`, opacity: 0.28 * amount, filter: `blur(${4 + i * 4}px)` }} />
      ))}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.5} variant="spaced" />
    </AbsoluteFill>
  );
};

/** 15 vertigo: dolly zoom — the background stretches away while the person stays the same size. */
export const Vertigo: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const hasSubject = Boolean(useSource().matte);
  const t = progress(frame, 0, durationInFrames, (x) => x);
  const bg = hasSubject ? 1 + 0.25 * t : 1 + 0.12 * t;
  return (
    <AbsoluteFill>
      {/* the person is also in the background copy; a growing blur hides the doubled edge */}
      <Footage style={{ transform: `scale(${bg})`, filter: hasSubject ? `blur(${t * 9}px) brightness(${1 - 0.15 * t})` : undefined }} />
      <Subject />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.6} variant="upper" />
    </AbsoluteFill>
  );
};

/** 04 frame break: the full-screen shot shrinks into a post card, and the person spills out of its edges. */
export const FrameBreak: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const shrink = progress(frame, 0, 16, easeOutExpo);
  const k = interpolate(shrink, [0, 1], [1, 0.62]);
  const ui = progress(frame, 12, 22);
  // The card is narrower than the shrunken shot, so whatever of the person lies outside it spills over the edge.
  const w = 1080 * k * (1 - 0.24 * shrink);
  const h = 1920 * k * (1 - 0.16 * shrink);
  const left = (1080 - w) / 2;
  const top = (1920 - h) / 2 - 60 * shrink + 40 * shrink;
  const frameStyle: React.CSSProperties = { transform: `translate(0px, ${-60 * shrink}px) scale(${k})` };
  return (
    <AbsoluteFill style={{ background: '#0E0F0D' }}>
      <Footage muted style={{ filter: `blur(${30 * shrink}px) brightness(${1 - 0.65 * shrink})`, transform: 'scale(1.15)' }} />
      <Vignette strength={0.8 * shrink} />
      <AbsoluteFill style={{ clipPath: `inset(${top}px ${left}px ${1920 - top - h}px ${left}px round ${46 * shrink}px)` }}>
        <Footage style={frameStyle} />
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: w,
          height: h,
          borderRadius: 46,
          border: `4px solid rgba(255,255,255,${0.7 * shrink})`,
          opacity: ui,
        }}
      >
        <div style={{ position: 'absolute', right: 26, bottom: 160, display: 'flex', flexDirection: 'column', gap: 30, fontSize: 44, color: '#fff' }}>
          <span>♡</span>
          <span>💬</span>
          <span>➤</span>
        </div>
        <div style={{ position: 'absolute', left: 28, bottom: 40, color: '#fff', fontFamily: fonts.display, fontWeight: 800, fontSize: 30 }}>
          <span style={{ display: 'inline-block', width: 44, height: 44, borderRadius: '50%', background: '#C9B79C', verticalAlign: 'middle', marginRight: 14 }} />
          {seg.text ?? 'yourbrand'}
          <span style={{ marginLeft: 16, padding: '4px 16px', border: '2px solid #fff', borderRadius: 10, fontSize: 22 }}>Follow</span>
          <div style={{ fontWeight: 600, fontSize: 22, opacity: 0.85, marginTop: 10 }}>{seg.items[0] ?? ''}</div>
        </div>
      </div>
      {/* unclipped person on top: hands and head break out of the card */}
      <Subject style={frameStyle} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.86} />
    </AbsoluteFill>
  );
};

/** 11 pull-back reveal: the shot pulls back into an editor window with a task list, render bar and a counter to 100. */
export const PullBack: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const pull = progress(frame, 0, 16, easeOutExpo);
  const k = interpolate(pull, [0, 1], [1, 0.58]);
  const steps = seg.items.length ? seg.items : ['Transcribed 1 clip', 'Picked the take', 'Cut 3 shots', 'Captions added', 'Rendered 150 frames'];
  const per = (durationInFrames - 24) / steps.length;
  const done = (i: number) => frame >= 16 + (i + 1) * per;
  const renderP = interpolate(frame, [16, durationInFrames - 6], [0, 1], clamp);
  const count = Math.round(renderP * 100);
  const finished = renderP >= 1;
  const winW = 1080 * k;
  const winH = 1920 * k;
  const winLeft = 1080 - winW - 60 * pull;
  const winTop = (1920 - winH) / 2 + 40 * pull;
  return (
    <AbsoluteFill style={{ background: '#F4F1EA' }}>
      <AbsoluteFill style={{ clipPath: `inset(${winTop}px ${1080 - winLeft - winW}px ${1920 - winTop - winH}px ${winLeft}px round ${28 * pull}px)` }}>
        <Footage style={{ transformOrigin: '0 0', transform: `translate(${winLeft}px, ${winTop}px) scale(${k})` }} />
      </AbsoluteFill>
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.58} size={74 * (1 - 0.3 * pull)} />
      <div style={{ opacity: pull, fontFamily: fonts.display }}>
        <div style={{ position: 'absolute', left: winLeft, top: winTop - 50, width: winW, display: 'flex', justifyContent: 'space-between', fontSize: 24, fontWeight: 600, color: '#77736A' }}>
          <span>● ● ●</span>
          <span>{seg.text ?? 'reel.mp4'}</span>
          <span>Assistant</span>
        </div>
        <div style={{ position: 'absolute', left: 40, top: 640, width: 360, padding: 26, borderRadius: 22, background: '#fff', boxShadow: '0 20px 50px rgba(0,0,0,0.12)' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#333', marginBottom: 16 }}>
            ● Working on <span style={{ background: '#4E6BF5', color: '#fff', borderRadius: 8, padding: '2px 10px' }}>edit</span>
          </div>
          {steps.map((s, i) => {
            const d = done(i);
            const c = pop(frame, fps, 16 + (i + 1) * per, 12);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 25, fontWeight: 600, color: d ? '#222' : '#B7B3AA', margin: '12px 0' }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: d ? '#2EAD5B' : 'transparent', border: d ? 'none' : '3px solid #D5D1C8', color: '#fff', fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${d ? c : 1})` }}>
                  {d ? '✓' : ''}
                </div>
                {s}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 40, top: 330, fontFamily: fonts.serif, fontWeight: 600, fontSize: 210, lineHeight: 1, color: '#16161A' }}>
          {count}
          <span style={{ fontSize: 90 }}>%</span>
        </div>
        <div style={{ position: 'absolute', left: winLeft, top: winTop + winH + 30, width: winW, height: 70, borderRadius: 16, background: finished ? '#DDF3E3' : '#fff', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}>
          <div style={{ width: `${renderP * 100}%`, height: '100%', background: finished ? '#2EAD5B' : '#4E6BF5', opacity: 0.85 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 4, padding: '0 14px' }}>
            {Array.from({ length: 48 }, (_, i) => (
              <div key={i} style={{ flex: 1, height: 10 + 40 * Math.abs(Math.sin(i * 1.7)), background: 'rgba(255,255,255,0.75)', borderRadius: 3 }} />
            ))}
          </div>
        </div>
        <div style={{ position: 'absolute', left: winLeft, top: winTop + winH + 112, fontSize: 24, fontWeight: 700, color: finished ? '#2EAD5B' : '#77736A' }}>
          {finished ? '✓ done' : '● rendering'} {Math.round(renderP * 150)} / 150
        </div>
      </div>
    </AbsoluteFill>
  );
};
