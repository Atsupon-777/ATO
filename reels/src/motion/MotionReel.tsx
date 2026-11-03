// A reel made only of motion-graphics scenes (no footage): each scene is one style from src/motion,
// played back to back. The AI planner picks the styles and writes their text; the person only picks.
import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { z } from 'zod';
import { cjkVars, loadFonts } from '../lib/fonts';
import { Headline, type HeadlineProps } from './Headline';
import { InkWash, type InkWashProps } from './InkWash';
import { StatChart, type StatChartProps } from './StatChart';

/** Every motion style the app can play, by id. Add a style here and in motionSceneSchema. */
export const motionScenes = {
  statChart: StatChart as React.FC<any>,
  headline: Headline as React.FC<any>,
  inkWash: InkWash as React.FC<any>,
} as const;
export type MotionSceneId = keyof typeof motionScenes;
export const motionSceneIds = Object.keys(motionScenes) as MotionSceneId[];

export const motionSceneSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('statChart'), seconds: z.number().min(2).max(12).default(5.7), props: z.custom<StatChartProps>() }),
  z.object({ kind: z.literal('headline'), seconds: z.number().min(2).max(12).default(5), props: z.custom<HeadlineProps>() }),
  z.object({ kind: z.literal('inkWash'), seconds: z.number().min(2).max(12).default(5), props: z.custom<InkWashProps>() }),
]);
export type MotionScene = z.infer<typeof motionSceneSchema>;

export const motionReelSchema = z.object({
  scenes: z.array(motionSceneSchema).min(1).max(12),
  lang: z.string().optional(),
  music: z.string().optional(),
});
export type MotionReelProps = z.infer<typeof motionReelSchema>;

export const motionReelFrames = (p: MotionReelProps, fps: number) => Math.round(p.scenes.reduce((a, s) => a + s.seconds, 0) * fps);

export const MotionReel: React.FC<MotionReelProps> = ({ scenes, lang, music }) => {
  loadFonts(JSON.stringify(scenes));
  let at = 0;
  return (
    <AbsoluteFill style={{ background: '#000', ...cjkVars(lang) }}>
      {scenes.map((s, i) => {
        const C = motionScenes[s.kind];
        const from = at;
        const len = Math.round(s.seconds * 30);
        at += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <C {...(s.props as object)} />
          </Sequence>
        );
      })}
      {music ? <Audio src={music} /> : null}
    </AbsoluteFill>
  );
};

/** Sample reel for the studio and the sample renders (the fictional brand Lumina). */
export const motionSample: MotionReelProps = {
  lang: 'ja',
  scenes: [
    {
      kind: 'statChart',
      seconds: 5.7,
      props: {
        brand: 'Lumina',
        label: '定期便のお客さま',
        from: 0,
        to: 12480,
        unit: '人',
        milestones: [
          { at: 0.3, label: '発売' },
          { at: 0.62, label: '雑誌掲載' },
        ],
        payoff: '1年で1万人を突破',
        subtitle: '毎朝のスキンケアに選ばれています',
      },
    },
    {
      kind: 'headline',
      seconds: 5.5,
      props: {
        masthead: 'The Morning Ledger',
        date: '2026年11月3日',
        kicker: 'ビジネス ／ 美容',
        headline: '小さな化粧品ブランドが、\n口コミだけで1万人に届いた',
        byline: '文・編集部',
        body: 'Luminaは広告をほとんど使わずに成長した。発売から半年で、定期便のお客さまの7割が友人からの紹介だった。商品の説明より、使った人の言葉が届いたという。',
        highlight: '定期便のお客さまの7割が友人からの紹介だった',
      },
    },
    { kind: 'inkWash', seconds: 5, props: { title: '朝の光をまとう', sub: '京都の水でつくる化粧水', seal: '光' } },
  ],
};
