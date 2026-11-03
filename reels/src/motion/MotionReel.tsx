// A reel made only of motion-graphics scenes (no footage): each scene is one style from src/motion,
// played back to back. The AI planner picks the styles and writes their text; the person only picks.
import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { z } from 'zod';
import { cjkVars, loadFonts } from '../lib/fonts';
import { Bars3d, CompareTable, KineticType, PhoneStack, ReviewStars, type Bars3dProps, type CompareTableProps, type KineticTypeProps, type PhoneStackProps, type ReviewStarsProps } from './Batch4Scenes';
import { Donut, FlapBoard, PinDrop, RankingRace, SearchFind, Typewriter, type DonutProps, type FlapBoardProps, type PinDropProps, type RankingRaceProps, type SearchFindProps, type TypewriterProps } from './Batch5Scenes';
import { BeforeAfter, GoldLine, ProgressRing, ScrollPage, Versus, VerticalCopy, type BeforeAfterProps, type GoldLineProps, type ProgressRingProps, type ScrollPageProps, type VersusProps, type VerticalCopyProps } from './Batch6Scenes';
import { Headline, type HeadlineProps } from './Headline';
import { InkWash, type InkWashProps } from './InkWash';
import { GlobeZoom, MapRoute, type GlobeZoomProps, type MapRouteProps } from './MapScenes';
import { CursorDemo, KpiTiles, LogoLine, type CursorDemoProps, type KpiTilesProps, type LogoLineProps } from './MoreScenes';
import { PaperDesk, type PaperDeskProps } from './PaperDesk';
import { StatChart, type StatChartProps } from './StatChart';
import { Teardown, type TeardownProps } from './Teardown';
import { Shot, cameraIds, enterIds } from './shot';
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
  kineticType: KineticType as React.FC<any>,
  reviewStars: ReviewStars as React.FC<any>,
  compareTable: CompareTable as React.FC<any>,
  phoneStack: PhoneStack as React.FC<any>,
  bars3d: Bars3d as React.FC<any>,
  donut: Donut as React.FC<any>,
  rankingRace: RankingRace as React.FC<any>,
  flapBoard: FlapBoard as React.FC<any>,
  typewriter: Typewriter as React.FC<any>,
  pinDrop: PinDrop as React.FC<any>,
  searchFind: SearchFind as React.FC<any>,
  progressRing: ProgressRing as React.FC<any>,
  versus: Versus as React.FC<any>,
  beforeAfter: BeforeAfter as React.FC<any>,
  scrollPage: ScrollPage as React.FC<any>,
  verticalCopy: VerticalCopy as React.FC<any>,
  goldLine: GoldLine as React.FC<any>,
} as const;
export type MotionSceneId = keyof typeof motionScenes;
export const motionSceneIds = Object.keys(motionScenes) as MotionSceneId[];

/** Optional entrance and camera move; the planner fills them from variety.ts so reels differ. */
const shotFields = { enter: z.enum(enterIds).optional(), camera: z.enum(cameraIds).optional() };

export const motionSceneSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('statChart'), seconds: z.number().min(2).max(12).default(5.7), ...shotFields, props: z.custom<StatChartProps>() }),
  z.object({ kind: z.literal('headline'), seconds: z.number().min(2).max(12).default(5), ...shotFields, props: z.custom<HeadlineProps>() }),
  z.object({ kind: z.literal('inkWash'), seconds: z.number().min(2).max(12).default(5), ...shotFields, props: z.custom<InkWashProps>() }),
  z.object({ kind: z.literal('teardown'), seconds: z.number().min(3).max(12).default(7.4), ...shotFields, props: z.custom<TeardownProps>() }),
  z.object({ kind: z.literal('paperDesk'), seconds: z.number().min(3).max(12).default(7.9), ...shotFields, props: z.custom<PaperDeskProps>() }),
  z.object({ kind: z.literal('chat'), seconds: z.number().min(2).max(12).default(5), ...shotFields, props: z.custom<ChatProps>() }),
  z.object({ kind: z.literal('pricing'), seconds: z.number().min(2).max(12).default(4), ...shotFields, props: z.custom<PricingProps>() }),
  z.object({ kind: z.literal('timeline'), seconds: z.number().min(2).max(12).default(5), ...shotFields, props: z.custom<TimelineProps>() }),
  z.object({ kind: z.literal('logoReveal'), seconds: z.number().min(2).max(8).default(3.5), ...shotFields, props: z.custom<LogoRevealProps>() }),
  z.object({ kind: z.literal('mapRoute'), seconds: z.number().min(3).max(12).default(5.5), ...shotFields, props: z.custom<MapRouteProps>() }),
  z.object({ kind: z.literal('globeZoom'), seconds: z.number().min(3).max(12).default(5), ...shotFields, props: z.custom<GlobeZoomProps>() }),
  z.object({ kind: z.literal('cursorDemo'), seconds: z.number().min(3).max(12).default(6), ...shotFields, props: z.custom<CursorDemoProps>() }),
  z.object({ kind: z.literal('kpiTiles'), seconds: z.number().min(2).max(10).default(4), ...shotFields, props: z.custom<KpiTilesProps>() }),
  z.object({ kind: z.literal('logoLine'), seconds: z.number().min(2).max(8).default(3), ...shotFields, props: z.custom<LogoLineProps>() }),
  z.object({ kind: z.literal('kineticType'), seconds: z.number().min(1.5).max(8).default(3), ...shotFields, props: z.custom<KineticTypeProps>() }),
  z.object({ kind: z.literal('reviewStars'), seconds: z.number().min(3).max(10).default(5), ...shotFields, props: z.custom<ReviewStarsProps>() }),
  z.object({ kind: z.literal('compareTable'), seconds: z.number().min(3).max(10).default(5), ...shotFields, props: z.custom<CompareTableProps>() }),
  z.object({ kind: z.literal('phoneStack'), seconds: z.number().min(3).max(10).default(6), ...shotFields, props: z.custom<PhoneStackProps>() }),
  z.object({ kind: z.literal('bars3d'), seconds: z.number().min(3).max(10).default(4.5), ...shotFields, props: z.custom<Bars3dProps>() }),
  z.object({ kind: z.literal('donut'), seconds: z.number().min(3).max(10).default(4.5), ...shotFields, props: z.custom<DonutProps>() }),
  z.object({ kind: z.literal('rankingRace'), seconds: z.number().min(3).max(12).default(6), ...shotFields, props: z.custom<RankingRaceProps>() }),
  z.object({ kind: z.literal('flapBoard'), seconds: z.number().min(2).max(8).default(3.5), ...shotFields, props: z.custom<FlapBoardProps>() }),
  z.object({ kind: z.literal('typewriter'), seconds: z.number().min(2).max(10).default(4.5), ...shotFields, props: z.custom<TypewriterProps>() }),
  z.object({ kind: z.literal('pinDrop'), seconds: z.number().min(3).max(10).default(5), ...shotFields, props: z.custom<PinDropProps>() }),
  z.object({ kind: z.literal('searchFind'), seconds: z.number().min(3).max(10).default(4.5), ...shotFields, props: z.custom<SearchFindProps>() }),
  z.object({ kind: z.literal('progressRing'), seconds: z.number().min(3).max(8).default(4), ...shotFields, props: z.custom<ProgressRingProps>() }),
  z.object({ kind: z.literal('versus'), seconds: z.number().min(3).max(8).default(4), ...shotFields, props: z.custom<VersusProps>() }),
  z.object({ kind: z.literal('beforeAfter'), seconds: z.number().min(3).max(8).default(4), ...shotFields, props: z.custom<BeforeAfterProps>() }),
  z.object({ kind: z.literal('scrollPage'), seconds: z.number().min(3).max(10).default(5), ...shotFields, props: z.custom<ScrollPageProps>() }),
  z.object({ kind: z.literal('verticalCopy'), seconds: z.number().min(3).max(10).default(5), ...shotFields, props: z.custom<VerticalCopyProps>() }),
  z.object({ kind: z.literal('goldLine'), seconds: z.number().min(2.5).max(8).default(3.5), ...shotFields, props: z.custom<GoldLineProps>() }),
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
            <Shot enter={s.enter} camera={s.camera}>
              <C {...(s.props as object)} />
            </Shot>
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

/** Fourth sample: a made-up fitness app (Kumo Fit), for kinetic type, reviews, comparison, phones and 3D bars. */
export const motionSample4: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'kineticType', seconds: 2.6, props: { words: ['ジム、', '続かない？', '家で5分。'] } },
    {
      kind: 'phoneStack',
      seconds: 6,
      props: { screens: [{ caption: '今日のメニューが届く' }, { caption: '動画を見ながら5分' }, { caption: '続いた日が見える' }] },
    },
    {
      kind: 'compareTable',
      seconds: 5,
      props: {
        title: 'ジムとくらべて',
        us: 'Kumo Fit',
        them: 'ジム',
        rows: [
          { label: '月額', us: '980円', them: '8,000円' },
          { label: '移動時間', us: '0分', them: '30分' },
          { label: '24時間いつでも', us: true, them: false },
          { label: '専属コーチ', us: true, them: true },
        ],
      },
    },
    {
      kind: 'bars3d',
      seconds: 4.5,
      props: { title: '続いた人の数', unit: '人', bars: [{ label: '1月', value: 1200 }, { label: '3月', value: 2600 }, { label: '5月', value: 4100 }, { label: '7月', value: 7800 }] },
    },
    {
      kind: 'reviewStars',
      seconds: 5,
      props: { rating: 4.8, source: 'App Store', count: '2,300件', quotes: [{ text: '朝の5分が習慣になりました', who: '30代・会社員' }, { text: 'ジムより続いてます', who: '40代・主婦' }] },
    },
    { kind: 'logoReveal', seconds: 3.5, props: { name: 'Kumo Fit', tagline: '家で、5分だけ。', cta: '7日間無料' } },
  ],
};

/** Fifth sample: a made-up ramen chain (Menya Sora), for donut, ranking race, flap board, typewriter, pins and search. */
export const motionSample5: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'searchFind', seconds: 4.5, props: { query: '渋谷 ラーメン 深夜', result: { name: '麺屋 そら 渋谷店', text: '朝4時まで。鶏白湯が自慢です。', tag: '営業中' }, others: ['ほかのお店 A', 'ほかのお店 B'] } },
    { kind: 'typewriter', seconds: 4.5, props: { lines: ['スープは12時間。', '麺は毎朝、店で打つ。', 'だから、また来たくなる。'] } },
    { kind: 'donut', seconds: 4.5, props: { title: 'お客さまの声', slices: [{ label: 'また来たい', value: 87 }, { label: 'ふつう', value: 10 }, { label: 'その他', value: 3 }] } },
    {
      kind: 'rankingRace',
      seconds: 6,
      props: {
        title: '渋谷の人気ラーメン',
        periods: ['2023', '2024', '2025', '2026'],
        highlight: '麺屋 そら',
        unit: '票',
        items: [
          { label: '麺屋 そら', values: [120, 480, 1300, 2600] },
          { label: 'お店 A', values: [900, 1100, 1250, 1400] },
          { label: 'お店 B', values: [700, 900, 1500, 1700] },
          { label: 'お店 C', values: [1000, 1050, 1100, 1150] },
          { label: 'お店 D', values: [400, 800, 900, 1000] },
        ],
      },
    },
    { kind: 'pinDrop', seconds: 5, props: { title: '東京に広がっています', count: 24, label: '店舗' } },
    { kind: 'flapBoard', seconds: 3.5, props: { label: 'NEW SHOP OPEN', lines: ['SHIBUYA', 'OPEN 11:00', '2026-12-01'] } },
  ],
};

/** Sixth sample: a made-up ryokan (Shizuku), for progress ring, versus, before/after, scroll page, vertical copy and gold line. */
export const motionSample6: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'verticalCopy', seconds: 5, props: { lines: ['湯けむりの', '向こうに、', '静かな朝。'], seal: '雫' } },
    { kind: 'scrollPage', seconds: 5, props: { site: 'shizuku-ryokan.jp', sections: [{ heading: '山あいの、八つの部屋' }, { heading: '源泉かけ流しの露天' }, { heading: '季節の会席' }, { heading: 'ご予約はこちら' }] } },
    { kind: 'beforeAfter', seconds: 4, props: { before: { label: '電話予約', lines: ['営業時間だけ', '折り返しの電話', '空室を口で説明'] }, after: { label: 'Web予約', lines: ['24時間いつでも', 'その場で確定', '空室がひと目で'] } } },
    { kind: 'versus', seconds: 4, props: { title: '予約にかかる時間', before: { label: '電話', value: 12, unit: '分' }, after: { label: 'Web', value: 1, unit: '分' }, verdict: '12分 → 1分' } },
    { kind: 'progressRing', seconds: 4, props: { value: 96, label: 'また泊まりたい', sub: '宿泊者アンケート 2026' } },
    { kind: 'goldLine', seconds: 3.5, props: { title: '宿 雫', sub: 'SHIZUKU' } },
  ],
};
