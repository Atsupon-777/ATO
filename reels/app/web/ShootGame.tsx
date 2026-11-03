// A small tap game for the waiting screen: a hoop drifts through the air, tap to shoot the ball up into it.
// Works offline, draws on one canvas, keeps the best score on this device only.
import React, { useEffect, useRef, useState } from 'react';

const BEST_KEY = 'editless-shoot-best';
const readBest = () => {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
};
const saveBest = (n: number) => {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {}
};

type Ball = { x: number; y: number; vx: number; vy: number; flying: boolean; scored: boolean; passedRim: boolean };

export const ShootGame: React.FC<{ labels: { title: string; hint: string; score: string; best: string; miss: string } }> = ({ labels }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(readBest);
  const [flash, setFlash] = useState<'' | 'in' | 'miss'>('');
  const shoot = useRef<() => void>(() => {});

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const W = 320, H = 360;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    c.width = W * dpr;
    c.height = H * dpr;
    ctx.scale(dpr, dpr);
    const floorY = H - 34, R = 13;
    const hoop = { x: W / 2, y: 110, w: 64, dir: 1, speed: 70 };
    const ball: Ball = { x: W / 2, y: floorY - R, vx: 0, vy: 0, flying: false, scored: false, passedRim: false };
    let streak = 0, last = performance.now(), raf = 0, pop = 0;
    const reset = () => Object.assign(ball, { x: W / 2, y: floorY - R, vx: 0, vy: 0, flying: false, scored: false, passedRim: false });
    shoot.current = () => {
      if (ball.flying) return;
      // The ball reaches the rim about 1.2 s later. It aims three quarters of the way from where the hoop is to where it
      // will be, so a shot near a turn (or with the hoop coming toward the middle) goes in: timing is the game.
      const T = 1.23;
      const ahead = hoop.x + hoop.dir * hoop.speed * T * 0.75;
      Object.assign(ball, { flying: true, vy: -720, vx: (ahead - ball.x) / T + (Math.random() - 0.5) * 16 });
    };
    const lime = '#DFFF4F', ink = '#0A0A0B';
    const frame = (t: number) => {
      const dt = Math.min(0.04, (t - last) / 1000);
      last = t;
      // the hoop drifts faster as the streak grows
      hoop.speed = 50 + Math.min(streak, 10) * 12;
      hoop.x += hoop.dir * hoop.speed * dt;
      if (hoop.x > W - 50 || hoop.x < 50) hoop.dir *= -1;
      hoop.y = 110 + Math.sin(t / 900) * 18;
      if (ball.flying) {
        ball.vy += 900 * dt;
        ball.x += ball.vx * dt;
        ball.y += ball.vy * dt;
        // coming down through the rim counts as a basket
        if (!ball.passedRim && ball.vy > 0 && ball.y > hoop.y) {
          ball.passedRim = true;
          if (Math.abs(ball.x - hoop.x) < hoop.w / 2 - R * 0.4) {
            ball.scored = true;
            streak += 1;
            pop = 1;
            setScore((s) => {
              const n = s + 1;
              setBest((b) => (n > b ? (saveBest(n), n) : b));
              return n;
            });
            setFlash('in');
          }
        }
        if (ball.y > H + R || ball.x < -R || ball.x > W + R) {
          if (!ball.scored) {
            streak = 0;
            setScore(0);
            setFlash('miss');
          }
          reset();
        }
      }
      pop = Math.max(0, pop - dt * 2);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.roundRect(0, 0, W, H, 18);
      ctx.fill();
      // backboard + net
      ctx.strokeStyle = 'rgba(255,255,255,.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(hoop.x - 40, hoop.y - 54, 80, 50);
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= 4; i++) {
        const x0 = hoop.x - hoop.w / 2 + (hoop.w / 4) * i;
        ctx.beginPath();
        ctx.moveTo(x0, hoop.y);
        ctx.lineTo(hoop.x - hoop.w / 4 + (hoop.w / 8) * i, hoop.y + 30);
        ctx.stroke();
      }
      // ball in front of the net while it drops through, behind the rim on the way up
      const drawBall = () => {
        ctx.fillStyle = lime;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ball.x - R, ball.y);
        ctx.lineTo(ball.x + R, ball.y);
        ctx.moveTo(ball.x, ball.y - R);
        ctx.lineTo(ball.x, ball.y + R);
        ctx.stroke();
      };
      if (!ball.passedRim) drawBall();
      ctx.strokeStyle = pop > 0 ? `rgba(223,255,79,${0.5 + pop / 2})` : lime;
      ctx.lineWidth = 4 + pop * 4;
      ctx.beginPath();
      ctx.moveTo(hoop.x - hoop.w / 2, hoop.y);
      ctx.lineTo(hoop.x + hoop.w / 2, hoop.y);
      ctx.stroke();
      if (ball.passedRim) drawBall();
      // floor
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(20, floorY);
      ctx.lineTo(W - 20, floorY);
      ctx.stroke();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 700);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="shootgame">
      <div className="shoothead">
        <b>{labels.title}</b>
        <span>
          {labels.score} {score} ・ {labels.best} {best}
        </span>
      </div>
      <canvas
        ref={canvas}
        style={{ width: '100%', maxWidth: 320, aspectRatio: '320 / 360', touchAction: 'manipulation' }}
        onPointerDown={(e) => {
          e.preventDefault();
          shoot.current();
        }}
        role="button"
        aria-label={labels.hint}
      />
      <small className={flash ? `shootflash ${flash}` : ''}>{flash === 'in' ? 'Nice!' : flash === 'miss' ? labels.miss : labels.hint}</small>
    </div>
  );
};
