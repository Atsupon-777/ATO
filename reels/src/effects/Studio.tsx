// Motion-design scenes after the "skills" Atsupon collected (notes/instagram-effects-Dei5MKHgHyB.md):
// a GSAP-style masked text reveal, layered website UI (Design DNA), an isometric voxel wave and line icons
// that draw themselves (Lottie / SVG motion design), and a flat illustrated board (Genjutsu).
// The full-frame graphics scenes keep the speaker in a small round window so the talk never disappears.
import React from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { posterOf, useMediaSrc, usePreviewMode } from '../lib/assets';
import { fonts } from '../lib/fonts';
import { clamp, easeInOut, easeOutExpo, pop, progress } from '../lib/timing';
import { Caption, captionY, FONT_FAMILY, Footage, Sandwich, splitWords, useSource, type EffectProps } from './layers';

/** GSAP's power4.out, the ease most text reveals use. */
const power4 = Easing.bezier(0.25, 1, 0.5, 1);

const useFamily = (fallback = fonts.display) => {
  const s = useSource();
  return s.style.font ? FONT_FAMILY[s.style.font] : fallback;
};

/** The speaker in a small round window, for scenes that fill the frame with graphics. */
const SpeakerBubble: React.FC<{ x?: number; y?: number; size?: number; ring?: string }> = ({ x = 70, y = 1500, size = 300, ring = '#fff' }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useSource();
  const media = useMediaSrc(s.video);
  const { still } = usePreviewMode();
  const p = pop(frame, fps, 4, 14);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        border: `8px solid ${ring}`,
        boxShadow: '0 20px 50px rgba(0,0,0,0.35)',
        transform: `scale(${p})`,
      }}
    >
      {still ? (
        <img src={posterOf(s.video, s.trimBefore / fps + 0.4)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${s.focusX * 100}% 30%` }} />
      ) : (
        <OffthreadVideo
          src={media.url}
          onError={media.onError}
          trimBefore={s.trimBefore}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${s.focusX * 100}% 30%` }}
        />
      )}
    </div>
  );
};

/** A dark plate behind the caption, for scenes on light backgrounds where white captions would vanish. */
const CaptionPlate: React.FC<{ y: number }> = ({ y: y0 }) => {
  const frame = useCurrentFrame();
  const y = captionY(useSource(), y0);
  return (
    <div
      style={{
        position: 'absolute',
        left: 50,
        right: 50,
        top: y * 1920 - 130,
        height: 220,
        borderRadius: 40,
        background: 'rgba(16,16,20,0.86)',
        opacity: progress(frame, 0, 8),
      }}
    />
  );
};

/** Splits a line into at most `n` lines of roughly equal length, keeping words whole. */
const toLines = (text: string, n: number) => {
  const words = splitWords(text);
  const spaced = /\s/.test(text.trim());
  const per = Math.ceil(words.length / Math.min(n, words.length || 1));
  const out: string[] = [];
  for (let i = 0; i < words.length; i += per) out.push(words.slice(i, i + per).join(spaced ? ' ' : ''));
  return out;
};

/**
 * GSAP-style text reveal: the line splits into up to three rows; each row rises out of a mask with its
 * letters staggered, the emphasised word gets an accent swipe, and the rows leave upward at the end.
 * Sits behind the speaker when there is a matte.
 */
export const TextReveal: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const s = useSource();
  const family = useFamily();
  const line = seg.text ?? seg.caption ?? 'Create quick and effective';
  const rows = toLines(line, 3);
  const em = seg.emphasis.map((e) => e.toLowerCase());
  const longest = Math.max(...rows.map((r) => [...r].length), 4);
  const cjk = /[぀-鿿]/.test(line);
  const size = Math.min(170, (cjk ? 880 : 1500) / longest);
  const outAt = durationInFrames - 10;
  const kicker = seg.items[0];
  const behind = (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(160deg, rgba(10,12,10,0.86), rgba(10,12,10,0.55) 55%, ${s.accent}55)` }} />
      <div style={{ position: 'absolute', left: 80, right: 80, top: 430, fontFamily: family, color: '#fff' }}>
        {kicker ? (
          <div
            style={{
              fontSize: 30,
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              opacity: progress(frame, 2, 14) * (1 - progress(frame, outAt, outAt + 8)),
              marginBottom: 30,
            }}
          >
            {kicker}
          </div>
        ) : null}
        {rows.map((row, r) => {
          const start = 4 + r * 5;
          const leave = progress(frame, outAt + r * 2, outAt + r * 2 + 10, Easing.bezier(0.5, 0, 0.75, 0));
          const chars = [...row];
          const italic = r === 1 && !cjk;
          return (
            <div key={r} style={{ overflow: 'hidden', paddingBottom: size * 0.12, marginBottom: -size * 0.06 }}>
              <div
                style={{
                  fontSize: size,
                  fontWeight: italic ? 500 : 700,
                  fontStyle: italic ? 'italic' : 'normal',
                  fontFamily: italic ? fonts.serif : family,
                  lineHeight: 1.05,
                  letterSpacing: '-0.035em',
                  whiteSpace: 'nowrap',
                  transform: `translateY(${-leave * 115}%)`,
                }}
              >
                {chars.map((ch, i) => {
                  const p = progress(frame, start + i * 0.9, start + i * 0.9 + 18, power4);
                  return (
                    <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - p) * 115}%) rotate(${(1 - p) * 8}deg)`, whiteSpace: 'pre' }}>
                      {ch}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        {rows.some((r) => em.some((e) => r.toLowerCase().includes(e))) || em.length ? (
          <div
            style={{
              marginTop: 40,
              display: 'inline-block',
              padding: '14px 30px',
              borderRadius: 40,
              background: s.accent,
              color: '#111',
              fontSize: 36,
              fontWeight: 800,
              transform: `scale(${pop(frame, 30, 24, 12)}) rotate(-3deg)`,
              opacity: 1 - progress(frame, outAt, outAt + 8),
            }}
          >
            {seg.emphasis[0] ?? ''}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
  return (
    <AbsoluteFill>
      <Sandwich behind={behind} />
      <Caption text={seg.text ? seg.caption : undefined} emphasis={seg.emphasis} y={0.8} />
    </AbsoluteFill>
  );
};

/** One browser window with a traffic-light bar. */
const Window: React.FC<{ w: number; h: number; dark?: boolean; children: React.ReactNode; style?: React.CSSProperties }> = ({ w, h, dark, children, style }) => (
  <div
    style={{
      position: 'absolute',
      width: w,
      height: h,
      borderRadius: 26,
      overflow: 'hidden',
      background: dark ? '#17201b' : '#fbfbf8',
      boxShadow: '0 40px 90px rgba(0,0,0,0.28), 0 0 0 2px rgba(0,0,0,0.06)',
      ...style,
    }}
  >
    <div style={{ height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 22px', background: dark ? '#0f1512' : '#eeede8' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
        <div key={c} style={{ width: 16, height: 16, borderRadius: 8, background: c }} />
      ))}
    </div>
    {children}
  </div>
);

/**
 * Design DNA: on a dotted design board, website windows slide in and stack in perspective: a light
 * landing page with the beat's headline, a dark hero with a huge condensed word, and the speaker playing
 * inside a third window. `text` = headline, `items` = nav labels.
 */
export const UiLayers: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = useSource();
  const family = useFamily();
  const head = seg.text ?? seg.emphasis[0] ?? 'Uncomplicate it';
  const nav = (seg.items.length ? seg.items : ['Product', 'Docs', 'Pricing']).slice(0, 3);
  const drift = interpolate(frame, [0, durationInFrames], [0, 1], clamp);
  const win = (i: number) => {
    const p = pop(frame, fps, 3 + i * 7, 16);
    return { p, t: `translate(${(1 - p) * (i % 2 ? 700 : -700)}px, ${(1 - p) * 120}px)` };
  };
  const [a, b, c] = [win(0), win(1), win(2)];
  return (
    <AbsoluteFill style={{ background: '#efede6', fontFamily: family }}>
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(rgba(0,0,0,0.16) 2.4px, transparent 2.6px)', backgroundSize: '44px 44px' }} />
      <AbsoluteFill style={{ perspective: 2200 }}>
        <AbsoluteFill style={{ transform: `rotateX(${12 - drift * 4}deg) rotateY(${-14 + drift * 8}deg) rotateZ(4deg) translateY(-60px)`, transformStyle: 'preserve-3d' }}>
          <Window w={760} h={620} style={{ left: 40, top: 300, transform: a.t, opacity: a.p }}>
            <div style={{ display: 'flex', gap: 26, padding: '22px 34px', fontSize: 22, color: '#444' }}>
              <b style={{ color: '#111' }}>◆</b>
              {nav.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </div>
            <div style={{ padding: '40px 40px', fontSize: 72, fontWeight: 800, lineHeight: 1.02, color: '#111', letterSpacing: '-0.03em', maxWidth: 520 }}>{head}</div>
            <div style={{ display: 'flex', gap: 16, padding: '10px 40px' }}>
              <div style={{ padding: '14px 30px', borderRadius: 30, background: s.accent, fontSize: 22, fontWeight: 800, color: '#111' }}>Get started</div>
              <div style={{ padding: '14px 30px', borderRadius: 30, background: '#111', fontSize: 22, fontWeight: 800, color: '#fff' }}>Learn more</div>
            </div>
          </Window>
          <Window w={720} h={560} dark style={{ left: 300, top: 780, transform: b.t, opacity: b.p }}>
            <AbsoluteFill style={{ top: 52, background: `linear-gradient(180deg, transparent, ${s.accent}40)` }} />
            <div style={{ position: 'absolute', left: 36, top: 90, fontSize: 22, letterSpacing: '0.24em', color: '#cfd8d2' }}>{nav[0]?.toUpperCase()}</div>
            <div
              style={{
                position: 'absolute',
                left: 30,
                right: 30,
                bottom: 40,
                fontSize: Math.min(150, 980 / Math.max(4, [...head].length)),
                fontWeight: 800,
                lineHeight: 0.9,
                color: '#fff',
                textTransform: 'uppercase',
                letterSpacing: '-0.04em',
                transform: `scaleY(1.25)`,
                transformOrigin: 'bottom left',
              }}
            >
              {head}
            </div>
          </Window>
          <Window w={460} h={560} style={{ left: 560, top: 140, transform: c.t, opacity: c.p }}>
            <div style={{ position: 'absolute', inset: '52px 0 0 0' }}>
              <Footage />
            </div>
          </Window>
        </AbsoluteFill>
      </AbsoluteFill>
      {seg.caption ? <CaptionPlate y={0.8} /> : null}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.8} />
    </AbsoluteFill>
  );
};

/** Mixes two #rrggbb colours. */
const mix = (a: string, b: string, t: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a.length === 7 ? a : '#5b8cff'), p(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`;
};
const shade = (c: string, k: number) => mix(c.length === 7 ? c : '#5b8cff', '#000000', k);

/**
 * Isometric voxel wave (Lottie-style motion design): a grid of cubes rises from the floor in a ripple
 * from the centre and keeps breathing, deep violet at the edges to the accent colour in the middle;
 * the beat's text types on in big serif letters around it.
 */
export const IsoGrid: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const s = useSource();
  const n = 11;
  const tile = 46;
  const cx = 540;
  const cy = 980;
  const word = (seg.text ?? seg.emphasis[0] ?? 'WITH THE AI').toUpperCase();
  const cubes: { x: number; y: number; d: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cubes.push({ x: i, y: j, d: Math.hypot(i - (n - 1) / 2, j - (n - 1) / 2) });
  // back to front so nearer cubes cover farther ones
  cubes.sort((p, q) => p.x + p.y - (q.x + q.y));
  const edge = '#3b1d8f';
  const core = s.accent;
  const letters = [...word];
  const shown = Math.floor(interpolate(frame, [4, 4 + letters.length * 2.2], [0, letters.length], clamp));
  return (
    <AbsoluteFill style={{ background: '#ece9e3' }}>
      <div
        style={{
          position: 'absolute',
          left: 40,
          right: 40,
          top: 470,
          textAlign: 'center',
          fontFamily: '"Courier New", "Noto Sans JP", monospace',
          fontSize: Math.min(200, 1700 / Math.max(5, letters.length)),
          color: '#1a1a1a',
          letterSpacing: '0.04em',
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
        }}
      >
        {letters.slice(0, shown).join('')}
        <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>▍</span>
      </div>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        {cubes.map(({ x, y, d }, k) => {
          const rise = progress(frame, 4 + d * 2.4, 22 + d * 2.4, easeOutExpo);
          const h = rise * (18 + 46 * (1 - d / 8) + 16 * Math.sin(frame * 0.12 - d * 0.9));
          const px = cx + (x - y) * tile;
          const py = cy + (x + y - n + 1) * tile * 0.5 - h;
          const t = Math.max(0, 1 - d / 7.2);
          const top = mix(edge, core, t);
          const lift = (x + y) % 7 === 0 && d > 4 ? 26 * rise : 0;
          const topY = py - lift;
          return (
            <g key={k} opacity={rise > 0 ? 1 : 0}>
              <polygon points={`${px - tile},${topY + tile * 0.5} ${px},${topY + tile} ${px},${topY + tile + h} ${px - tile},${topY + tile * 0.5 + h}`} fill={shade(top, 0.3)} />
              <polygon points={`${px + tile},${topY + tile * 0.5} ${px},${topY + tile} ${px},${topY + tile + h} ${px + tile},${topY + tile * 0.5 + h}`} fill={shade(top, 0.5)} />
              <polygon points={`${px},${topY} ${px + tile},${topY + tile * 0.5} ${px},${topY + tile} ${px - tile},${topY + tile * 0.5}`} fill={top} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      <SpeakerBubble ring="#1a1a1a" x={790} y={110} size={230} />
      {seg.caption ? <CaptionPlate y={0.78} /> : null}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.78} />
    </AbsoluteFill>
  );
};

/** Line icons drawn as single strokes on a 100×100 grid. */
const ICONS: Record<string, string> = {
  bulb: 'M50 12 C30 12 22 28 22 40 C22 54 34 60 36 72 L64 72 C66 60 78 54 78 40 C78 28 70 12 50 12 Z M38 82 L62 82 M42 91 L58 91',
  rocket: 'M50 8 C66 22 70 44 64 66 L36 66 C30 44 34 22 50 8 Z M36 56 L22 72 L34 74 M64 56 L78 72 L66 74 M44 76 L50 92 L56 76 M50 30 A7 7 0 1 0 50.1 30',
  chart: 'M12 88 L88 88 M12 88 L12 12 M24 70 L42 50 L56 62 L84 26 M70 26 L84 26 L84 40',
  chat: 'M14 20 L86 20 L86 66 L46 66 L28 84 L30 66 L14 66 Z M28 36 L72 36 M28 50 L60 50',
  heart: 'M50 84 C20 62 10 44 18 30 C26 16 44 18 50 32 C56 18 74 16 82 30 C90 44 80 62 50 84 Z',
  star: 'M50 10 L61 38 L91 39 L67 58 L76 88 L50 70 L24 88 L33 58 L9 39 L39 38 Z',
};
const ICON_ORDER = ['bulb', 'rocket', 'chart', 'chat', 'heart', 'star'];
const pathLength = 420;

/**
 * SVG line animation: two to four line icons draw themselves stroke by stroke, then fill with the accent
 * colour and bounce, each with its label. `items` = labels (2-4), `text` = title.
 */
export const LineIcons: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = useSource();
  const family = useFamily();
  const labels = (seg.items.length ? seg.items : ['Idea', 'Launch', 'Grow']).slice(0, 4);
  const start = Math.floor(seg.text?.length ?? 0) % ICON_ORDER.length;
  const cols = labels.length > 2 ? 2 : labels.length;
  const title = pop(frame, fps, 0, 15);
  return (
    <AbsoluteFill style={{ background: '#0d0d10', fontFamily: family, color: '#fff' }}>
      <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, ${s.accent}26, transparent 60%)` }} />
      {seg.text ? (
        <div style={{ position: 'absolute', top: 250, left: 60, right: 60, textAlign: 'center', fontSize: 84, fontWeight: 800, letterSpacing: '-0.02em', opacity: title, transform: `translateY(${(1 - title) * 40}px)` }}>
          {seg.text}
        </div>
      ) : null}
      <div style={{ position: 'absolute', top: 470, left: 90, right: 90, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, rowGap: 70, columnGap: 60 }}>
        {labels.map((label, i) => {
          const at = 6 + i * 8;
          const draw = progress(frame, at, at + 24, easeInOut);
          const fill = progress(frame, at + 22, at + 32);
          const b = pop(frame, fps, at + 22, 9);
          const icon = ICONS[ICON_ORDER[(start + i) % ICON_ORDER.length]];
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26 }}>
              <svg width={300} height={300} viewBox="0 0 100 100" style={{ transform: `scale(${0.9 + 0.1 * b})`, overflow: 'visible' }}>
                <path d={icon} fill={s.accent} fillOpacity={fill * 0.9} stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={pathLength} strokeDashoffset={pathLength * (1 - draw)} />
              </svg>
              <div style={{ fontSize: 46, fontWeight: 800, opacity: progress(frame, at + 16, at + 26) }}>{label}</div>
            </div>
          );
        })}
      </div>
      <SpeakerBubble ring={s.accent} x={390} y={1450} size={300} />
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.67} size={64} />
    </AbsoluteFill>
  );
};

const BOARD = ['#4FB59B', '#3A86F0', '#F5A524', '#E85D5D'];
/** People rows per column, so the board reads like work in progress. */
const PEOPLE = [2, 3, 1, 0];

/** One person row on a board column: avatar circle plus two text lines. */
const PersonRow: React.FC<{ color: string; show: number }> = ({ color, show }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 12, transform: `scale(${show})`, transformOrigin: 'left center', margin: '0 0 26px 18px' }}>
    <div style={{ width: 52, height: 52, borderRadius: 26, background: '#fff', border: '3px solid #1d1d1f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 22, height: 22, borderRadius: 11, background: color, border: '2px solid #1d1d1f' }} />
    </div>
    <div>
      <div style={{ width: 70, height: 6, borderRadius: 3, background: '#1d1d1f', marginBottom: 8 }} />
      <div style={{ width: 46, height: 6, borderRadius: 3, background: 'rgba(29,29,31,0.45)' }} />
    </div>
  </div>
);

/**
 * Flat illustrated board (Genjutsu style): on a warm paper background with a line-drawn city, four numbered
 * coloured columns rise one after another and fill with people rows, with hand-drawn props (plant, glasses,
 * pencil) and the label written underneath. `text` = label, `items` = column titles (optional).
 */
export const FlatBoard: React.FC<EffectProps> = ({ seg }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const s = useSource();
  const family = useFamily();
  const cols = BOARD.map((c, i) => (i === 3 ? s.accent : c));
  const heights = [560, 640, 520, 600];
  const label = seg.text ?? 'Agile';
  const sway = Math.sin(frame / 9) * 3;
  const draw = progress(frame, 0, 26, easeInOut);
  const zoom = interpolate(frame, [0, durationInFrames], [1.04, 1], clamp);
  return (
    <AbsoluteFill style={{ background: '#f4f1ea', fontFamily: family }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
          {/* skyline in thin grey lines */}
          {[
            [80, 520, 140, 660],
            [250, 420, 120, 760],
            [420, 560, 160, 620],
            [640, 380, 110, 800],
            [800, 480, 180, 700],
          ].map(([x, y, w, h], i) => (
            <g key={i} stroke="#c9c5bc" strokeWidth={3} fill="none" strokeDasharray={2600} strokeDashoffset={2600 * (1 - draw)}>
              <rect x={x} y={y} width={w} height={h} />
              {Array.from({ length: Math.floor(h / 46) }, (_, k) => (
                <line key={k} x1={x + 16} x2={x + w - 16} y1={y + 24 + k * 46} y2={y + 24 + k * 46} />
              ))}
            </g>
          ))}
          <line x1={60} x2={1020} y1={1240} y2={1240} stroke="#1d1d1f" strokeWidth={4} strokeDasharray={1000} strokeDashoffset={1000 * (1 - draw)} />
          {/* glasses */}
          <g transform="translate(110 1150) rotate(-8)" stroke="#1d1d1f" strokeWidth={5} fill="#fff" opacity={progress(frame, 30, 38)}>
            <rect x={0} y={0} width={70} height={44} rx={16} />
            <rect x={90} y={0} width={70} height={44} rx={16} />
            <line x1={70} y1={18} x2={90} y2={18} />
          </g>
          {/* pencil */}
          <g transform={`translate(${170 + (1 - progress(frame, 34, 46)) * -300} 1290) rotate(18)`}>
            <rect x={0} y={0} width={190} height={16} rx={4} fill="#3A86F0" stroke="#1d1d1f" strokeWidth={4} />
            <polygon points="190,0 222,8 190,16" fill="#f4d7a8" stroke="#1d1d1f" strokeWidth={4} />
          </g>
          {/* plant */}
          <g transform={`translate(880 1240) rotate(${sway})`} stroke="#1d1d1f" strokeWidth={4} opacity={progress(frame, 26, 36)}>
            {[-50, -20, 10, 40].map((a, k) => (
              <path key={k} d={`M0 -110 C ${a} -200, ${a * 1.6} -280, ${a * 2} -330 C ${a * 0.4} -260, ${-a * 0.2} -190, 0 -110 Z`} fill={k % 2 ? '#fff' : '#4FB59B'} />
            ))}
            <path d="M-70 -110 L70 -110 L50 0 L-50 0 Z" fill="#fff" />
          </g>
        </svg>
        {cols.map((color, i) => {
          const at = 6 + i * 6;
          const rise = pop(frame, fps, at, 15);
          const h = heights[i];
          return (
            <div key={i} style={{ position: 'absolute', left: 150 + i * 185, bottom: 1920 - 1240, width: 160, height: h * rise }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '28px 28px 8px 8px', background: color, border: '4px solid #1d1d1f', overflow: 'hidden', paddingTop: 140 }}>
                {Array.from({ length: PEOPLE[i] }, (_, k) => (
                  <PersonRow key={k} color={BOARD[(i + k + 1) % 4]} show={pop(frame, fps, at + 12 + k * 5, 12)} />
                ))}
              </div>
              <div
                style={{
                  position: 'absolute',
                  top: -40,
                  left: 0,
                  right: 0,
                  textAlign: 'center',
                  fontSize: 110,
                  fontWeight: 800,
                  color: '#1d1d1f',
                  opacity: rise,
                }}
              >
                {i + 1}
              </div>
              {seg.items[i] ? (
                <div style={{ position: 'absolute', bottom: -64, left: -12, right: -12, textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#1d1d1f' }}>{seg.items[i]}</div>
              ) : null}
            </div>
          );
        })}
        <div
          style={{
            position: 'absolute',
            top: 1330,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 110,
            fontWeight: 600,
            color: '#2a4fa8',
            opacity: progress(frame, 24, 34),
            transform: `translateY(${(1 - progress(frame, 24, 36, easeOutExpo)) * 30}px)`,
          }}
        >
          {label}
        </div>
      </AbsoluteFill>
      <SpeakerBubble ring="#1d1d1f" x={790} y={110} size={230} />
      {seg.caption ? <CaptionPlate y={0.86} /> : null}
      <Caption text={seg.caption} emphasis={seg.emphasis} y={0.86} size={60} />
    </AbsoluteFill>
  );
};
