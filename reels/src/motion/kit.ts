// Small helpers shared by the motion-graphics scenes: eases, springs and deterministic noise.
import { interpolate, staticFile } from 'remotion';

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** 0→1 between frames a and b, clamped. */
export const lin = (f: number, a: number, b: number) => clamp01((f - a) / Math.max(1e-6, b - a));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

export const E = {
  outCubic: (x: number) => 1 - (1 - x) ** 3,
  inCubic: (x: number) => x ** 3,
  inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outExpo: (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  outBack: (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
};

/** Eased 0→1 between frames a and b. */
export const k = (f: number, a: number, b: number, e: (x: number) => number = E.outCubic) => e(lin(f, a, b));

/** A damped spring 0→1→settles, x = 0..1 of its run. */
export const springX = (x: number, freq = 1.4, damp = 6) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.exp(-damp * x) * Math.cos(2 * Math.PI * freq * x));

/** Deterministic pseudo-random in [0, 1) for an integer seed (no Math.random: renders must repeat). */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const range = (f: number, input: number[], output: number[]) =>
  interpolate(f, input, output, { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

/** Formats a count with thousands separators and the given decimals. */
export const fmtNum = (n: number, decimals = 0) =>
  n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** An image/video prop: full URLs pass through; a bare path like "samples/photos/x.jpg" is a file in public/. */
export const asset = (u: string) => (/^(https?:|data:|blob:)/.test(u) ? u : staticFile(u.replace(/^\/+/, '')));
