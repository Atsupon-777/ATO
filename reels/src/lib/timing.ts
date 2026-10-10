import { Easing, interpolate, spring } from 'remotion';

export const FPS = 30;

/** Frames per beat for a given tempo. Templates place scenes on beats so cuts land on the music. */
export const beatFrames = (bpm: number, fps = FPS) => (60 / bpm) * fps;

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** 0→1 progress between two frames with an ease, clamped. */
export const progress = (frame: number, from: number, to: number, easing = Easing.bezier(0.22, 1, 0.36, 1)) =>
  interpolate(frame, [from, to], [0, 1], { ...clamp, easing });

export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOutExpo = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInExpo = Easing.bezier(0.7, 0, 0.84, 0);

/** A snappy spring tuned for type and UI entrances. */
export const pop = (frame: number, fps: number, delay = 0, damping = 14) =>
  spring({ frame: frame - delay, fps, config: { damping, stiffness: 180, mass: 0.6 } });
