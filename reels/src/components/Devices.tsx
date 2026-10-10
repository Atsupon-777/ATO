import React from 'react';
import { Img } from 'remotion';
import { fonts } from '../lib/fonts';

/** A minimal browser window around a desktop screenshot. */
export const BrowserFrame: React.FC<{
  src: string;
  width: number;
  url?: string;
  aspect?: number;
  /** focus zoom inside the window: 1 = whole page */
  zoom?: number;
  focusX?: number;
  focusY?: number;
  dark?: boolean;
}> = ({ src, width, url = '', aspect = 1.6, zoom = 1, focusX = 0.5, focusY = 0.5, dark = false }) => {
  const bar = Math.round(width * 0.055);
  const h = width / aspect;
  const tx = (0.5 - focusX) * 100 * (zoom - 1);
  const ty = (0.5 - focusY) * 100 * (zoom - 1);
  return (
    <div
      style={{
        width,
        borderRadius: width * 0.022,
        overflow: 'hidden',
        background: dark ? '#1B1C22' : '#FFFFFF',
        boxShadow: '0 60px 120px rgba(15,20,40,0.35), 0 12px 30px rgba(15,20,40,0.18)',
      }}
    >
      <div style={{ height: bar, display: 'flex', alignItems: 'center', gap: bar * 0.22, padding: `0 ${bar * 0.45}px` }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => (
          <div key={c} style={{ width: bar * 0.28, height: bar * 0.28, borderRadius: '50%', background: c }} />
        ))}
        <div
          style={{
            flex: 1,
            marginLeft: bar * 0.4,
            height: bar * 0.56,
            borderRadius: bar * 0.3,
            background: dark ? '#2A2B33' : '#F0F1F4',
            color: dark ? '#A6A8B3' : '#6B6E78',
            fontFamily: fonts.display,
            fontWeight: 600,
            fontSize: bar * 0.3,
            display: 'flex',
            alignItems: 'center',
            paddingLeft: bar * 0.4,
          }}
        >
          {url}
        </div>
      </div>
      <div style={{ width, height: h, overflow: 'hidden', position: 'relative' }}>
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            transform: `translate(${tx}%, ${ty}%) scale(${zoom})`,
          }}
        />
      </div>
    </div>
  );
};

/** A phone with a thin bezel around a mobile screenshot. */
export const PhoneFrame: React.FC<{ src: string; width: number; zoom?: number; focusX?: number; focusY?: number }> = ({
  src,
  width,
  zoom = 1,
  focusX = 0.5,
  focusY = 0.5,
}) => {
  const h = width * 2.16;
  const bezel = width * 0.035;
  const tx = (0.5 - focusX) * 100 * (zoom - 1);
  const ty = (0.5 - focusY) * 100 * (zoom - 1);
  return (
    <div
      style={{
        width,
        height: h,
        borderRadius: width * 0.16,
        background: '#0D0D10',
        padding: bezel,
        boxShadow: '0 60px 120px rgba(15,20,40,0.4), inset 0 0 0 2px #3A3B42',
      }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: width * 0.13, overflow: 'hidden', position: 'relative' }}>
        <Img
          src={src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'top',
            transform: `translate(${tx}%, ${ty}%) scale(${zoom})`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: width * 0.03,
            left: '50%',
            width: width * 0.3,
            height: width * 0.085,
            marginLeft: -width * 0.15,
            borderRadius: 999,
            background: '#0D0D10',
          }}
        />
      </div>
    </div>
  );
};

/** macOS-style pointer with a click ripple. `press` is 0→1→0 around the click. */
export const Cursor: React.FC<{ x: number; y: number; press: number; ripple: number; color: string }> = ({
  x,
  y,
  press,
  ripple,
  color,
}) => (
  <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
    {ripple > 0 && ripple < 1 ? (
      <div
        style={{
          position: 'absolute',
          left: -90 * ripple,
          top: -90 * ripple,
          width: 180 * ripple,
          height: 180 * ripple,
          borderRadius: '50%',
          border: `6px solid ${color}`,
          opacity: 1 - ripple,
        }}
      />
    ) : null}
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      style={{ transform: `scale(${1 - press * 0.18})`, transformOrigin: '4px 3px', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.35))' }}
    >
      <path d="M4 3 L4 19 L8.5 15 L11.5 21.5 L14 20.4 L11 14 L17 14 Z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  </div>
);
