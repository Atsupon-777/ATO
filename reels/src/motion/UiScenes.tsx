// UI-style motion scenes: a chat thread, a pricing table, a milestone timeline and a logo end card.
// Light, product-film look on a soft gradient; every element springs in on its own beat.
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../lib/fonts';
import { E, k, lin, mix, rand, springX } from './kit';
import { useLook, type Look } from './theme';

const BG = 'radial-gradient(110% 70% at 50% 0%, #f4f1ff 0%, #e9eef8 55%, #dfe6f2 100%)';
const INK = '#14161c';
/** The light product-film look these scenes default to, or the reel's theme. */
const useUi = () => {
  const L = useLook();
  return {
    L,
    bg: L ? `radial-gradient(110% 70% at 50% 0%, ${L.surface} 0%, ${L.bg} 70%)` : BG,
    ink: L?.ink ?? INK,
    card: L?.surface ?? '#fff',
    soft: L ? `color-mix(in srgb, ${L.ink} 7%, ${L.surface})` : '#f0f2f7',
    head: L?.head ?? fonts.sansJP,
    body: L?.body ?? fonts.sansJP,
  };
};
export type { Look };

// ---------- chat ----------

export type ChatProps = {
  title?: string;
  /** Messages in order; `me` sits on the right in the accent colour. */
  messages: { me?: boolean; text: string }[];
  accent?: string;
};

export const ChatThread: React.FC<ChatProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useUi();
  const accent = p.accent ?? U.L?.accent ?? '#4f46e5';
  const onAccent = U.L?.onAccent ?? '#fff';
  const msgs = p.messages.slice(0, 7);
  const step = Math.max(t(0.45), (D - t(1.4)) / Math.max(1, msgs.length));
  const at = (i: number) => t(0.5) + i * step;
  // typing dots before each incoming message
  const shown = msgs.filter((_, i) => f >= at(i)).length;
  const typing = shown < msgs.length && !msgs[shown]?.me && f > at(shown) - t(0.4);
  const scroll = Math.max(0, shown - 5) * 150;
  const phone = k(f, 0, t(0.6), E.outExpo);
  return (
    <AbsoluteFill style={{ background: U.bg }}>
      <div
        style={{
          position: 'absolute',
          left: 110,
          top: 200,
          width: 860,
          height: 1380,
          borderRadius: 72,
          background: U.card,
          boxShadow: '0 50px 120px rgba(30,40,80,.18), inset 0 0 0 2px rgba(20,22,28,.06)',
          overflow: 'hidden',
          transform: `translateY(${(1 - phone) * 300}px) scale(${mix(0.92, 1, phone)})`,
          opacity: phone,
        }}
      >
        <div style={{ height: 150, display: 'flex', alignItems: 'center', gap: 22, padding: '40px 48px 0', borderBottom: '1px solid rgba(20,22,28,.07)' }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: `linear-gradient(135deg, ${accent}, #22d3ee)` }} />
          <div style={{ fontFamily: U.head, fontWeight: 900, fontSize: 36, color: U.ink }}>{p.title ?? 'Chat'}</div>
        </div>
        <div style={{ position: 'absolute', left: 40, right: 40, top: 190, transform: `translateY(${-scroll}px)` }}>
          {msgs.map((m, i) => {
            const s = springX(lin(f, at(i), at(i) + t(0.5)), 1.2, 6);
            if (f < at(i)) return null;
            return (
              <div key={i} style={{ display: 'flex', justifyContent: m.me ? 'flex-end' : 'flex-start', marginBottom: 26 }}>
                <div
                  style={{
                    maxWidth: 600,
                    padding: '26px 34px',
                    borderRadius: 40,
                    borderBottomRightRadius: m.me ? 10 : 40,
                    borderBottomLeftRadius: m.me ? 40 : 10,
                    background: m.me ? accent : U.soft,
                    color: m.me ? onAccent : U.ink,
                    fontFamily: U.body,
                    fontWeight: 700,
                    fontSize: 36,
                    lineHeight: 1.4,
                    transform: `scale(${s})`,
                    transformOrigin: m.me ? 'bottom right' : 'bottom left',
                  }}
                >
                  {m.text}
                </div>
              </div>
            );
          })}
          {typing ? (
            <div style={{ display: 'inline-flex', gap: 10, padding: '26px 34px', borderRadius: 40, background: U.soft }}>
              {[0, 1, 2].map((d) => (
                <div key={d} style={{ width: 16, height: 16, borderRadius: 8, background: '#9aa3b5', transform: `translateY(${Math.sin(f / 3 - d) * 6}px)` }} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- pricing ----------

export type PricingProps = {
  title?: string;
  plans: { name: string; price: string; per?: string; points: string[]; best?: boolean }[];
  accent?: string;
};

export const Pricing: React.FC<PricingProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const U = useUi();
  const accent = p.accent ?? U.L?.accent ?? '#4f46e5';
  const plans = p.plans.slice(0, 3);
  const best = Math.max(0, plans.findIndex((x) => x.best));
  const glow = k(f, t(1.7), t(2.2));
  return (
    <AbsoluteFill style={{ background: U.bg, alignItems: 'center' }}>
      {p.title ? (
        <div style={{ marginTop: 230, fontFamily: U.head, fontWeight: U.L?.headWeight ?? 900, fontSize: 64, color: U.ink, opacity: k(f, 0, t(0.4)), transform: `translateY(${(1 - k(f, 0, t(0.5), E.outExpo)) * 40}px)` }}>{p.title}</div>
      ) : null}
      <div style={{ position: 'absolute', top: 420, left: 70, right: 70, display: 'grid', gap: 34 }}>
        {plans.map((pl, i) => {
          const s = springX(lin(f, t(0.35) + i * t(0.18), t(1.1) + i * t(0.18)), 1.1, 6);
          const isBest = i === best && plans.some((x) => x.best);
          return (
            <div
              key={i}
              style={{
                position: 'relative',
                padding: '40px 48px',
                borderRadius: 40,
                background: isBest ? (U.L ? accent : INK) : U.card,
                color: isBest ? (U.L ? U.L.onAccent : '#fff') : U.ink,
                boxShadow: isBest ? `0 0 0 ${4 * glow}px ${accent}, 0 30px ${80 * glow + 40}px color-mix(in srgb, ${accent} ${Math.round(15 + 25 * glow)}%, transparent)` : '0 20px 50px rgba(30,40,80,.1)',
                transform: `translateX(${(1 - s) * (i % 2 ? 700 : -700)}px) scale(${isBest ? 1 + 0.03 * glow : 1})`,
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                alignItems: 'center',
                fontFamily: U.body,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: 44 }}>{pl.name}</div>
                <div style={{ marginTop: 12, fontSize: 28, opacity: 0.7, lineHeight: 1.5 }}>{pl.points.slice(0, 2).join(' ・ ')}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 64 }}>{pl.price}</span>
                {pl.per ? <span style={{ fontSize: 26, opacity: 0.6 }}> {pl.per}</span> : null}
              </div>
              {isBest ? (
                <div style={{ position: 'absolute', top: -22, right: 48, padding: '8px 22px', borderRadius: 99, background: U.L ? U.ink : accent, color: U.L ? U.card : '#fff', fontWeight: 900, fontSize: 24, transform: `scale(${springX(glow, 1.3, 6)})` }}>おすすめ</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// ---------- timeline ----------

export type TimelineProps = {
  title?: string;
  events: { year: string; text: string }[];
  accent?: string;
};

export const Timeline: React.FC<TimelineProps> = (p) => {
  const f = useCurrentFrame();
  const { fps, durationInFrames: D } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#ff5a36';
  const bg = L?.bg ?? '#0f1115', ink = L?.ink ?? '#fff', head = L?.head ?? fonts.sansJP;
  const ev = p.events.slice(0, 6);
  const run = k(f, t(0.4), D - t(0.8), E.inOutCubic);
  const gap = 230;
  const y0 = 480;
  return (
    <AbsoluteFill style={{ background: bg }}>
      {p.title ? <div style={{ position: 'absolute', left: 90, top: 200, right: 90, fontFamily: head, fontWeight: L?.headWeight ?? 900, fontSize: 60, color: ink, lineHeight: 1.2 }}>{p.title}</div> : null}
      <div style={{ position: 'absolute', left: 150, top: y0, width: 4, height: (ev.length - 1) * gap * run, background: `linear-gradient(${accent}, ${L?.accent2 ?? '#ffb36b'})`, borderRadius: 2 }} />
      {ev.map((e, i) => {
        const reach = (i / Math.max(1, ev.length - 1)) ;
        const on = lin(f, t(0.4) + (D - t(1.2)) * reach, t(0.4) + (D - t(1.2)) * reach + t(0.4));
        const s = springX(on, 1.2, 6);
        return (
          <div key={i} style={{ position: 'absolute', left: 120, top: y0 + i * gap - 32, display: 'flex', alignItems: 'center', gap: 44, opacity: Math.min(1, on * 2) }}>
            <div style={{ width: 64, height: 64, borderRadius: 32, background: bg, boxShadow: `inset 0 0 0 6px ${accent}`, transform: `scale(${s})`, display: 'grid', placeItems: 'center' }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: accent }} />
            </div>
            <div style={{ transform: `translateX(${(1 - s) * 60}px)` }}>
              <div style={{ fontFamily: fonts.display, fontWeight: 800, fontSize: 40, color: accent }}>{e.year}</div>
              <div style={{ fontFamily: L?.body ?? fonts.sansJP, fontWeight: 700, fontSize: 40, color: ink, marginTop: 6, maxWidth: 760 }}>{e.text}</div>
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// ---------- logo end card ----------

export type LogoRevealProps = {
  name: string;
  /** A logo image; without one the name is set as a wordmark. */
  logo?: string;
  tagline?: string;
  cta?: string;
  accent?: string;
  dark?: boolean;
};

export const LogoReveal: React.FC<LogoRevealProps> = (p) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (s: number) => s * fps;
  const L = useLook();
  const accent = p.accent ?? L?.accent ?? '#dfff4f';
  const bg = L?.bg ?? (p.dark === false ? '#f6f4ef' : '#0a0a0b');
  const fg = L?.ink ?? (p.dark === false ? INK : '#fff');
  const letters = [...p.name];
  // shards gather into the mark, then a light sweep crosses it
  const gather = k(f, 0, t(1.1), E.outExpo);
  const sweep = lin(f, t(1.3), t(2.0));
  const tag = k(f, t(1.5), t(2.0));
  const btn = springX(lin(f, t(2.0), t(2.7)), 1.2, 6);
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      {Array.from({ length: 26 }, (_, i) => {
        const a = rand(i) * Math.PI * 2, r = 500 + rand(i + 50) * 500;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 540 + Math.cos(a) * r * (1 - gather) - 6,
              top: 900 + Math.sin(a) * r * (1 - gather) - 6,
              width: 12,
              height: 12,
              borderRadius: 3,
              background: accent,
              opacity: (1 - gather) * 0.9,
              transform: `rotate(${rand(i + 9) * 180 * (1 - gather)}deg)`,
            }}
          />
        );
      })}
      <div style={{ position: 'relative', marginTop: -120, opacity: gather, transform: `scale(${mix(0.86, 1, gather)})`, filter: `blur(${(1 - gather) * 10}px)` }}>
        {p.logo ? (
          <Img src={p.logo} style={{ width: 360, height: 360, objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', fontFamily: L && L.head !== fonts.sansJP ? L.head : fonts.display, fontWeight: 800, fontSize: Math.min(170, 1500 / Math.max(4, letters.length)), letterSpacing: '-0.03em', color: fg }}>
            {letters.map((c, i) => (
              <span key={i} style={{ display: 'inline-block', transform: `translateY(${(1 - k(f, i * 2, t(0.7) + i * 2, E.outExpo)) * 60}px)` }}>
                {c}
              </span>
            ))}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            inset: '-20px -60px',
            background: `linear-gradient(100deg, transparent ${sweep * 140 - 30}%, rgba(255,255,255,.55) ${sweep * 140 - 15}%, transparent ${sweep * 140}%)`,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
          }}
        />
      </div>
      {p.tagline ? (
        <div style={{ marginTop: 34, fontFamily: fonts.sansJP, fontWeight: 700, fontSize: 40, color: fg, opacity: tag * 0.75, transform: `translateY(${(1 - tag) * 20}px)` }}>{p.tagline}</div>
      ) : null}
      {p.cta ? (
        <div style={{ marginTop: 70, padding: '28px 64px', borderRadius: 99, background: accent, color: L?.onAccent ?? '#0a0a0b', fontFamily: L?.head ?? fonts.sansJP, fontWeight: 900, fontSize: 40, transform: `scale(${btn})` }}>{p.cta}</div>
      ) : null}
    </AbsoluteFill>
  );
};
