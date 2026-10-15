// Effects built around app UI: the product on screen next to (or behind) the speaker.
import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { asset } from '../lib/assets';
import { fonts } from '../lib/fonts';
import { clamp, easeOutExpo, pop, progress } from '../lib/timing';
import { Caption, Footage, Subject, useHasSubject, useSource, type EffectProps } from './layers';

const typed = (text: string, frame: number, from: number, perChar = 2) =>
  text.slice(0, Math.max(0, Math.floor((frame - from) / perChar)));

/** 03 ui world: the top half becomes the app — clips fly into the drop zone, a label pops, a command is typed. */
export const UiWorld: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { accent } = useSource();
  const n = 5;
  const landed = 6 + n * 4;
  const label = pop(frame, fps, landed, 10);
  const command = seg.items[0] ?? '/video-edit';
  return (
    <AbsoluteFill style={{ background: '#F6F3EC' }}>
      <AbsoluteFill style={{ top: 860 }}>
        <Footage style={{ transform: 'translateY(-300px)' }} />
      </AbsoluteFill>
      <div style={{ position: 'absolute', top: 210, width: '100%', textAlign: 'center', fontFamily: fonts.serif, fontWeight: 600, fontSize: 64, color: '#2A2724' }}>
        <span style={{ color: '#D97757' }}>✳</span> {seg.text ?? 'ATO Reels'}
      </div>
      <div style={{ position: 'absolute', left: 60, right: 60, top: 330, height: 420, borderRadius: 34, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.12)', border: '2px solid #E7E2D8' }}>
        {frame < landed - 2 ? (
          <div style={{ position: 'absolute', inset: 30, border: '3px dashed #D9D2C4', borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: fonts.display, fontWeight: 600, fontSize: 32, color: '#A39C8F' }}>
            ⇪ Drop files here
          </div>
        ) : null}
        <div style={{ position: 'absolute', left: 40, bottom: 110, fontFamily: fonts.display, fontWeight: 600, fontSize: 34, color: frame > landed + 8 ? '#222' : '#A39C8F' }}>
          {frame > landed + 8 ? `${typed(command, frame, landed + 8)}|` : 'How can I help you today?'}
        </div>
        <div style={{ position: 'absolute', right: 30, bottom: 30, width: 60, height: 60, borderRadius: 16, background: frame > landed + 8 + command.length * 2 ? '#D97757' : '#EBC3B3' }} />
        <div style={{ position: 'absolute', right: 40, top: 70, padding: '8px 20px', background: accent, fontFamily: fonts.display, fontWeight: 800, fontSize: 30, transform: `scale(${label}) rotate(-3deg)` }}>
          {seg.items[1] ?? 'RAW CLIPS'}
        </div>
      </div>
      {Array.from({ length: n }, (_, i) => {
        const p = progress(frame, i * 4, i * 4 + 12, easeOutExpo);
        const x = interpolate(p, [0, 1], [700 + i * 60, 100 + i * 128]);
        const y = interpolate(p, [0, 1], [-300, 380]) - Math.sin(p * Math.PI) * 140;
        const img = seg.images[i % Math.max(1, seg.images.length)];
        return (
          <div key={i} style={{ position: 'absolute', left: x, top: y, width: 112, height: 180, borderRadius: 16, overflow: 'hidden', transform: `rotate(${(1 - p) * 25}deg)`, boxShadow: '0 10px 24px rgba(0,0,0,0.25)', background: `hsl(${30 + i * 25}, 25%, 35%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 40 }}>
            {img ? <Img src={asset(img)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : '▶'}
          </div>
        );
      })}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.68} variant="upper" size={68} />
    </AbsoluteFill>
  );
};

/** 06 phone mockup: a floating phone beside the speaker shows an assistant chat; a tap hits the action button. */
export const PhoneMockup: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const enter = progress(frame, 0, 14, easeOutExpo);
  const msgs = seg.items.length ? seg.items : ['Found one fix for you.', 'Pause Ad 3, move the budget to Ad 1'];
  const tapAt = Math.round(durationInFrames * 0.7);
  const tap = progress(frame, tapAt, tapAt + 8);
  const approved = frame >= tapAt + 4;
  return (
    <AbsoluteFill>
      <Footage />
      <div
        style={{
          position: 'absolute',
          right: 50,
          top: 300,
          width: 420,
          height: 860,
          borderRadius: 64,
          background: '#0B0B0D',
          border: '10px solid #2B2B30',
          boxShadow: '0 40px 90px rgba(0,0,0,0.55)',
          transform: `translateX(${(1 - enter) * 500}px) rotateY(-12deg) rotateZ(${(1 - enter) * 8}deg)`,
          padding: 30,
          fontFamily: fonts.display,
          color: '#fff',
        }}
      >
        <div style={{ width: 120, height: 34, borderRadius: 20, background: '#000', margin: '0 auto 30px' }} />
        <div style={{ fontWeight: 800, fontSize: 28 }}>
          <span style={{ color: useSource().accent }}>●</span> {seg.text ?? 'Ads Assistant'}
        </div>
        {msgs.map((m, i) => {
          const s = pop(frame, fps, 12 + i * 10, 13);
          const last = i === msgs.length - 1;
          return (
            <div key={i} style={{ marginTop: 22, padding: last ? 22 : 0, borderRadius: 22, background: last ? '#1E1E23' : 'transparent', fontSize: last ? 30 : 24, fontWeight: last ? 800 : 600, opacity: s, transform: `translateY(${(1 - s) * 30}px)` }}>
              {m}
              {last ? (
                <div style={{ marginTop: 22, display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ padding: '12px 30px', borderRadius: 30, background: approved ? '#2EAD5B' : '#fff', color: approved ? '#fff' : '#111', fontSize: 24, transform: `scale(${1 - 0.1 * Math.sin(tap * Math.PI)})` }}>
                    {approved ? '✓ Approved' : 'Approve'}
                  </div>
                  <span style={{ fontSize: 22, opacity: 0.6 }}>Not now</span>
                </div>
              ) : null}
            </div>
          );
        })}
        {frame >= tapAt - 10 && frame < tapAt + 14 ? (
          <div style={{ position: 'absolute', left: 90, top: 470, width: 64, height: 64, borderRadius: '50%', background: 'rgba(255,255,255,0.55)', transform: `scale(${1 - 0.35 * Math.sin(tap * Math.PI)})`, opacity: interpolate(frame, [tapAt - 10, tapAt - 4, tapAt + 8, tapAt + 14], [0, 1, 1, 0], clamp) }} />
        ) : null}
      </div>
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.7} />
    </AbsoluteFill>
  );
};

/** 07 checklist: a dark glass card over the speaker; items type in and get checked, the counter climbs. */
export const Checklist: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { accent } = useSource();
  const items = seg.items.length ? seg.items : ['Drop your clips', 'Trigger the skill', 'Post it'];
  const enter = pop(frame, fps, 0, 14);
  const per = (durationInFrames - 10) / items.length;
  const checked = items.filter((_, i) => frame >= 6 + i * per + per * 0.6).length;
  return (
    <AbsoluteFill>
      <Footage />
      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          top: 260,
          padding: '36px 40px',
          borderRadius: 34,
          background: 'rgba(22,22,26,0.62)',
          backdropFilter: 'blur(24px)',
          border: '2px solid rgba(255,255,255,0.12)',
          boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
          fontFamily: fonts.display,
          color: '#fff',
          transform: `scale(${0.9 + 0.1 * enter})`,
          opacity: enter,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24, fontWeight: 800, letterSpacing: '0.18em', opacity: 0.75 }}>
          <span>
            <span style={{ color: accent }}>●</span> {(seg.text ?? 'All you need to do').toUpperCase()}
          </span>
          <span style={{ letterSpacing: 0 }}>
            {checked} of {items.length}
          </span>
        </div>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', margin: '18px 0 10px' }}>
          <div style={{ width: `${(checked / items.length) * 100}%`, height: '100%', borderRadius: 3, background: accent }} />
        </div>
        {items.map((it, i) => {
          const from = 6 + i * per;
          const isChecked = frame >= from + per * 0.6;
          const c = pop(frame, fps, from + per * 0.6, 10);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 22, padding: '18px 0', borderTop: i ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
              <div style={{ width: 46, height: 46, borderRadius: '50%', border: isChecked ? 'none' : '3px solid rgba(255,255,255,0.45)', background: isChecked ? accent : 'transparent', color: '#111', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', transform: `scale(${isChecked ? c : 1})` }}>
                {isChecked ? '✓' : ''}
              </div>
              <span style={{ fontSize: 40, fontWeight: 800, opacity: frame >= from ? 1 : 0.25 }}>
                {frame >= from ? typed(it, frame, from, 1) : '────────'}
              </span>
            </div>
          );
        })}
      </div>
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.8} />
    </AbsoluteFill>
  );
};

/** 12 green screen: the room is replaced by the app (focus timer + tasks); the person stands in front of it. */
export const GreenScreen: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { accent } = useSource();
  const hasSubject = useHasSubject();
  const tasks = seg.items.length ? seg.items.slice(0, 3) : ['Write the sales page', 'Record 2 reels', 'Send the newsletter'];
  const secs = 50 * 60 - 3 - Math.floor(frame / fps);
  const clock = `${String(Math.floor(secs / 60)).padStart(2, '0')} : ${String(secs % 60).padStart(2, '0')}`;
  const line = progress(frame, 6, 20);
  return (
    <AbsoluteFill style={{ background: 'linear-gradient(180deg, #5B2BE0 0%, #EDE9F7 22%, #F7F5F0 60%, #3D2CC9 100%)' }}>
      <div style={{ position: 'absolute', left: 50, right: 50, top: 170, borderRadius: 28, background: '#FBFAF7', boxShadow: '0 30px 80px rgba(40,20,120,0.3)', overflow: 'hidden', fontFamily: fonts.display }}>
        <div style={{ height: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: '#8B877E' }}>✳ {seg.text ?? 'Focus'}</div>
        <div style={{ background: '#121214', color: '#fff', display: 'flex', alignItems: 'center', gap: 26, padding: '20px 30px' }}>
          <span style={{ fontSize: 22, color: '#F07B5A' }}>● FOCUS</span>
          <span style={{ fontSize: 64, fontWeight: 800 }}>{clock}</span>
          <span style={{ fontSize: 26, opacity: 0.85 }}>{tasks[0]}</span>
        </div>
        {tasks.map((t, i) => (
          <div key={i} style={{ margin: '18px 28px', padding: '14px 20px', borderRadius: 14, border: i === 0 ? '3px solid #E7B6A8' : 'none', background: i === 0 ? '#FCF1EC' : 'transparent', fontSize: 28, fontWeight: 600, color: i === 0 ? '#222' : '#B4AFA6', display: 'flex', justifyContent: 'space-between' }}>
            <span>{i === 0 ? '◉' : '○'} {t}</span>
            {i === 0 ? <span style={{ fontSize: 18, background: '#E05A3A', color: '#fff', borderRadius: 8, padding: '4px 10px' }}>NOW</span> : <span>🔒</span>}
          </div>
        ))}
        <div style={{ height: 30 }} />
      </div>
      <div style={{ position: 'absolute', top: 820, width: '100%', textAlign: 'center', fontFamily: fonts.serif, fontWeight: 600, fontSize: 92, color: '#1B1A18', opacity: line, transform: `translateY(${(1 - line) * 30}px)` }}>
        <span style={{ color: accent === '#E9F06B' ? '#D97757' : accent }}>✳</span> {seg.items[3] ?? 'Everything else waits.'}
      </div>
      {hasSubject ? (
        <Subject style={{ transform: 'translateY(240px) scale(0.95)' }} />
      ) : (
        <div style={{ position: 'absolute', left: 240, top: 1080, width: 600, height: 600, borderRadius: '50%', overflow: 'hidden', border: '10px solid #fff', boxShadow: '0 30px 80px rgba(0,0,0,0.3)' }}>
          <Footage />
        </div>
      )}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.42} size={66} />
    </AbsoluteFill>
  );
};
