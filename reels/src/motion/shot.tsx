// Entrance and camera move layered on top of any motion style, so one style can look different from reel
// to reel: 8 entrances x 7 camera moves = 56 versions per style, before its own layout options.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { E, lin, mix } from './kit';
import { useLook } from './theme';

export const enterIds = ['cut', 'fade', 'rise', 'zoomBlur', 'wipe', 'iris', 'swing', 'drop'] as const;
export const cameraIds = ['still', 'pushIn', 'pullOut', 'driftLeft', 'driftRight', 'tilt', 'float'] as const;
export type EnterId = (typeof enterIds)[number];
export type CameraId = (typeof cameraIds)[number];

/** Japanese names for the studio and logs. */
export const SHOT_LABELS = {
  enter: { cut: 'カット', fade: 'フェードイン', rise: 'スライドイン', zoomBlur: 'ズームぼかし', wipe: 'ワイプ', iris: '丸く開く', swing: '回り込み', drop: '落ちてくる' },
  camera: { still: '固定', pushIn: '寄る', pullOut: '引く', driftLeft: '左へ流す', driftRight: '右へ流す', tilt: '傾ける', float: '漂う' },
} as const;

const ENTER_S = 0.5;

export const Shot: React.FC<{ enter?: EnterId; camera?: CameraId; children: React.ReactNode }> = ({ enter = 'cut', camera = 'still', children }) => {
  const f = useCurrentFrame();
  const L = useLook();
  const { fps, durationInFrames: D } = useVideoConfig();
  const e = E.outCubic(lin(f, 0, ENTER_S * fps));
  const c = E.inOutCubic(lin(f, 0, D)); // camera runs the whole scene, gently
  // camera
  let cam = '';
  switch (camera) {
    case 'pushIn': cam = `scale(${mix(1, 1.09, c)})`; break;
    case 'pullOut': cam = `scale(${mix(1.1, 1, c)})`; break;
    case 'driftLeft': cam = `scale(1.07) translateX(${mix(28, -28, c)}px)`; break;
    case 'driftRight': cam = `scale(1.07) translateX(${mix(-28, 28, c)}px)`; break;
    case 'tilt': cam = `scale(1.07) rotate(${mix(-1.4, 1.4, c)}deg)`; break;
    case 'float': cam = `scale(1.05) translateY(${Math.sin((f / fps) * 1.3) * 14}px) rotate(${Math.sin((f / fps) * 0.9) * 0.5}deg)`; break;
  }
  // entrance
  let tr = '', opacity = 1, filter: string | undefined, clip: string | undefined;
  switch (enter) {
    case 'fade': opacity = e; break;
    case 'rise': tr = `translateY(${(1 - e) * 220}px)`; opacity = Math.min(1, e * 1.6); break;
    case 'zoomBlur': tr = `scale(${mix(1.35, 1, e)})`; filter = e < 1 ? `blur(${(1 - e) * 26}px)` : undefined; opacity = Math.min(1, e * 2); break;
    case 'wipe': clip = `inset(0 ${(1 - E.inOutCubic(lin(f, 0, ENTER_S * fps))) * 100}% 0 0)`; break;
    case 'iris': clip = `circle(${E.inOutCubic(lin(f, 0, ENTER_S * fps * 1.2)) * 120}% at 50% 50%)`; break;
    case 'swing': tr = `perspective(1800px) rotateY(${(1 - e) * -38}deg) translateX(${(1 - e) * 160}px)`; opacity = Math.min(1, e * 1.8); break;
    case 'drop': {
      const s = E.outBack(lin(f, 0, ENTER_S * fps * 1.2));
      tr = `translateY(${(1 - s) * -1920}px)`;
      break;
    }
  }
  return (
    <AbsoluteFill style={{ overflow: 'hidden', background: L?.bg ?? '#000' }}>
      <AbsoluteFill style={{ transform: tr || undefined, opacity, filter, clipPath: clip }}>
        <AbsoluteFill style={{ transform: cam || undefined }}>{children}</AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
