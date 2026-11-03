// A reel made only of motion-graphics scenes (no footage): each scene is one style from src/motion,
// played back to back. The AI planner picks the styles and writes their text; the person only picks.
import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { z } from 'zod';
import { cjkVars, loadFonts } from '../lib/fonts';
import { Headline, type HeadlineProps } from './Headline';
import { InkWash, type InkWashProps } from './InkWash';
import { GlobeZoom, MapRoute, type GlobeZoomProps, type MapRouteProps } from './MapScenes';
import { CursorDemo, KpiTiles, LogoLine, type CursorDemoProps, type KpiTilesProps, type LogoLineProps } from './MoreScenes';
import { PaperDesk, type PaperDeskProps } from './PaperDesk';
import { StatChart, type StatChartProps } from './StatChart';
import { Teardown, type TeardownProps } from './Teardown';
import { MotionThemeContext, PACE, lookOf, motionThemeSchema } from './theme';
import { ChatThread, LogoReveal, Pricing, Timeline, type ChatProps, type LogoRevealProps, type PricingProps, type TimelineProps } from './UiScenes';

/** Every motion style the app can play, by id. Add a style here and in motionSceneSchema. */
export const motionScenes = {
  statChart: StatChart as React.FC<any>,
  headline: Headline as React.FC<any>,
  inkWash: InkWash as React.FC<any>,
  teardown: Teardown as React.FC<any>,
  paperDesk: PaperDesk as React.FC<any>,
  chat: ChatThread as React.FC<any>,
  pricing: Pricing as React.FC<any>,
  timeline: Timeline as React.FC<any>,
  logoReveal: LogoReveal as React.FC<any>,
  mapRoute: MapRoute as React.FC<any>,
  globeZoom: GlobeZoom as React.FC<any>,
  cursorDemo: CursorDemo as React.FC<any>,
  kpiTiles: KpiTiles as React.FC<any>,
  logoLine: LogoLine as React.FC<any>,
} as const;
export type MotionSceneId = keyof typeof motionScenes;
export const motionSceneIds = Object.keys(motionScenes) as MotionSceneId[];

export const motionSceneSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('statChart'), seconds: z.number().min(2).max(12).default(5.7), props: z.custom<StatChartProps>() }),
  z.object({ kind: z.literal('headline'), seconds: z.number().min(2).max(12).default(5), props: z.custom<HeadlineProps>() }),
  z.object({ kind: z.literal('inkWash'), seconds: z.number().min(2).max(12).default(5), props: z.custom<InkWashProps>() }),
  z.object({ kind: z.literal('teardown'), seconds: z.number().min(3).max(12).default(7.4), props: z.custom<TeardownProps>() }),
  z.object({ kind: z.literal('paperDesk'), seconds: z.number().min(3).max(12).default(7.9), props: z.custom<PaperDeskProps>() }),
  z.object({ kind: z.literal('chat'), seconds: z.number().min(2).max(12).default(5), props: z.custom<ChatProps>() }),
  z.object({ kind: z.literal('pricing'), seconds: z.number().min(2).max(12).default(4), props: z.custom<PricingProps>() }),
  z.object({ kind: z.literal('timeline'), seconds: z.number().min(2).max(12).default(5), props: z.custom<TimelineProps>() }),
  z.object({ kind: z.literal('logoReveal'), seconds: z.number().min(2).max(8).default(3.5), props: z.custom<LogoRevealProps>() }),
  z.object({ kind: z.literal('mapRoute'), seconds: z.number().min(3).max(12).default(5.5), props: z.custom<MapRouteProps>() }),
  z.object({ kind: z.literal('globeZoom'), seconds: z.number().min(3).max(12).default(5), props: z.custom<GlobeZoomProps>() }),
  z.object({ kind: z.literal('cursorDemo'), seconds: z.number().min(3).max(12).default(6), props: z.custom<CursorDemoProps>() }),
  z.object({ kind: z.literal('kpiTiles'), seconds: z.number().min(2).max(10).default(4), props: z.custom<KpiTilesProps>() }),
  z.object({ kind: z.literal('logoLine'), seconds: z.number().min(2).max(8).default(3), props: z.custom<LogoLineProps>() }),
]);
export type MotionScene = z.infer<typeof motionSceneSchema>;

export const motionReelSchema = z.object({
  scenes: z.array(motionSceneSchema).min(1).max(12),
  lang: z.string().optional(),
  music: z.string().optional(),
  /** Tone and manner shared by every scene; unset keeps each scene's own look. */
  theme: motionThemeSchema.optional(),
});
export type MotionReelProps = z.infer<typeof motionReelSchema>;

const paceOf = (p: Pick<MotionReelProps, 'theme'>) => PACE[p.theme?.pace ?? 'normal'];
export const motionReelFrames = (p: MotionReelProps, fps: number) => p.scenes.reduce((a, s) => a + Math.round(s.seconds * paceOf(p) * fps), 0);

export const MotionReel: React.FC<MotionReelProps> = ({ scenes, lang, music, theme }) => {
  loadFonts(JSON.stringify(scenes));
  const look = theme ? lookOf(motionThemeSchema.parse(theme)) : null;
  const pace = paceOf({ theme });
  let at = 0;
  return (
    <MotionThemeContext.Provider value={look}>
    <AbsoluteFill style={{ background: '#000', ...cjkVars(lang) }}>
      {scenes.map((s, i) => {
        const C = motionScenes[s.kind];
        const from = at;
        const len = Math.round(s.seconds * pace * 30);
        at += len;
        return (
          <Sequence key={i} from={from} durationInFrames={len}>
            <C {...(s.props as object)} />
          </Sequence>
        );
      })}
      {music ? <Audio src={music} /> : null}
    </AbsoluteFill>
    </MotionThemeContext.Provider>
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

/** Second sample: a made-up booking app (Hoshi), to show the UI and paper styles. */
export const motionSample2: MotionReelProps = {
  lang: 'ja',
  scenes: [
    {
      kind: 'paperDesk',
      seconds: 7.9,
      props: {
        kicker: 'FIELD NOTES · Nº 01',
        headline: '予約の電話、\n1日に何本取っていますか？',
        card: ['電話は営業時間だけ', '聞き間違いがある', '手が止まる'],
        aside: '全部なくせる',
        label: '24時間 自動で予約',
      },
    },
    {
      kind: 'chat',
      seconds: 5,
      props: {
        title: 'Hoshi 予約',
        messages: [
          { text: '明日の19時、2名で空いてますか？' },
          { me: true, text: '空いています。カウンター席でお取りしますね。' },
          { text: 'お願いします！' },
          { me: true, text: 'ご予約できました。前日にお知らせを送ります。' },
        ],
      },
    },
    {
      kind: 'teardown',
      seconds: 7.4,
      props: {
        name: 'Hoshi',
        layers: [
          { title: '受ける', text: 'LINEとWebで24時間' },
          { title: '整える', text: '席と時間を自動で調整' },
          { title: '知らせる', text: '前日に自動でリマインド' },
        ],
      },
    },
    {
      kind: 'timeline',
      seconds: 5,
      props: {
        title: '小さな店から、全国へ',
        events: [
          { year: '2023', text: '1店舗で試験運用' },
          { year: '2024', text: '導入50店舗' },
          { year: '2025', text: '無断キャンセル半分に' },
          { year: '2026', text: '全国1,000店舗' },
        ],
      },
    },
    {
      kind: 'pricing',
      seconds: 4,
      props: {
        title: 'まずは無料で',
        plans: [
          { name: 'フリー', price: '0円', points: ['月30件まで', 'LINE予約'] },
          { name: 'スタンダード', price: '4,980円', per: '/月', points: ['予約無制限', 'リマインド'], best: true },
          { name: 'プロ', price: '9,800円', per: '/月', points: ['複数店舗', '分析'] },
        ],
      },
    },
    { kind: 'logoReveal', seconds: 3.5, props: { name: 'Hoshi', tagline: '電話のいらない予約', cta: '無料ではじめる' } },
  ],
};

/** Third sample: a made-up cafe chain (Tsumugi), for the map, globe, demo and KPI styles. */
export const motionSample3: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'globeZoom', seconds: 5, props: { lat: 35.0, lon: 135.77, place: '京都・三条', note: '世界中から、この一杯を飲みに' } },
    { kind: 'mapRoute', seconds: 5.5, props: { from: '三条駅から', to: 'つむぎ珈琲 三条店', eta: '徒歩6分' } },
    {
      kind: 'cursorDemo',
      seconds: 6,
      props: {
        app: 'つむぎ珈琲 モバイルオーダー',
        steps: [
          { button: 'ほうじ茶ラテを選ぶ', result: 'ほうじ茶ラテ（M）' },
          { button: '受け取り時間を選ぶ', result: '10:30に受け取り' },
          { button: '注文する', result: '注文しました' },
        ],
      },
    },
    {
      kind: 'kpiTiles',
      seconds: 4,
      props: {
        title: 'オープンから1年',
        tiles: [
          { label: '来店', value: 48200, unit: '人' },
          { label: 'リピート率', value: 62, unit: '%' },
          { label: 'モバイル注文', value: 35, unit: '%' },
          { label: '平均待ち時間', value: 2.4, unit: '分', decimals: 1 },
        ],
      },
    },
    { kind: 'logoLine', seconds: 3, props: { name: 'TSUMUGI', tagline: 'つむぎ珈琲' } },
  ],
};
