// A reel made only of motion-graphics scenes (no footage): each scene is one style from src/motion,
// played back to back. The AI planner picks the styles and writes their text; the person only picks.
import React from 'react';
import { AbsoluteFill, Audio, Sequence } from 'remotion';
import { z } from 'zod';
import { cjkVars, loadFonts } from '../lib/fonts';
import { Bars3d, CompareTable, KineticType, PhoneStack, ReviewStars, type Bars3dProps, type CompareTableProps, type KineticTypeProps, type PhoneStackProps, type ReviewStarsProps } from './Batch4Scenes';
import { Donut, FlapBoard, PinDrop, RankingRace, SearchFind, Typewriter, type DonutProps, type FlapBoardProps, type PinDropProps, type RankingRaceProps, type SearchFindProps, type TypewriterProps } from './Batch5Scenes';
import { BeforeAfter, GoldLine, ProgressRing, ScrollPage, Versus, VerticalCopy, type BeforeAfterProps, type GoldLineProps, type ProgressRingProps, type ScrollPageProps, type VersusProps, type VerticalCopyProps } from './Batch6Scenes';
import { BrushText, Chalkboard, UkiyoWave, WashiSeal, Watercolor, Whiteboard, type BrushTextProps, type ChalkboardProps, type UkiyoWaveProps, type WashiSealProps, type WatercolorProps, type WhiteboardProps } from './Batch7Scenes';
import { Photo25d, PhotoWall, Collage, Polaroids, TextMask, SplitScreen, type Photo25dProps, type PhotoWallProps, type CollageProps, type PolaroidsProps, type TextMaskProps, type SplitScreenProps } from './Batch8Scenes';
import { Ingredients, PriceTag, SizeCompare, Colorways, Turntable, LogoShine, type IngredientsProps, type PriceTagProps, type SizeCompareProps, type ColorwaysProps, type TurntableProps, type LogoShineProps } from './Batch9Scenes';
import { FloatIcons, Liquid, GlassCards, Text3d, Clay, Handwriting, type FloatIconsProps, type LiquidProps, type GlassCardsProps, type Text3dProps, type ClayProps, type HandwritingProps } from './Batch10Scenes';
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
  washiSeal: WashiSeal as React.FC<any>,
  brushText: BrushText as React.FC<any>,
  ukiyoWave: UkiyoWave as React.FC<any>,
  watercolor: Watercolor as React.FC<any>,
  chalkboard: Chalkboard as React.FC<any>,
  whiteboard: Whiteboard as React.FC<any>,
  photo25d: Photo25d as React.FC<any>,
  photoWall: PhotoWall as React.FC<any>,
  collage: Collage as React.FC<any>,
  polaroids: Polaroids as React.FC<any>,
  textMask: TextMask as React.FC<any>,
  splitScreen: SplitScreen as React.FC<any>,
  ingredients: Ingredients as React.FC<any>,
  priceTag: PriceTag as React.FC<any>,
  sizeCompare: SizeCompare as React.FC<any>,
  colorways: Colorways as React.FC<any>,
  turntable: Turntable as React.FC<any>,
  logoShine: LogoShine as React.FC<any>,
  floatIcons: FloatIcons as React.FC<any>,
  liquid: Liquid as React.FC<any>,
  glassCards: GlassCards as React.FC<any>,
  text3d: Text3d as React.FC<any>,
  clay: Clay as React.FC<any>,
  handwriting: Handwriting as React.FC<any>,
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
  z.object({ kind: z.literal('washiSeal'), seconds: z.number().min(3).max(8).default(4), ...shotFields, props: z.custom<WashiSealProps>() }),
  z.object({ kind: z.literal('brushText'), seconds: z.number().min(3).max(8).default(4), ...shotFields, props: z.custom<BrushTextProps>() }),
  z.object({ kind: z.literal('ukiyoWave'), seconds: z.number().min(3).max(8).default(4.5), ...shotFields, props: z.custom<UkiyoWaveProps>() }),
  z.object({ kind: z.literal('watercolor'), seconds: z.number().min(3).max(8).default(4.5), ...shotFields, props: z.custom<WatercolorProps>() }),
  z.object({ kind: z.literal('chalkboard'), seconds: z.number().min(3).max(10).default(5), ...shotFields, props: z.custom<ChalkboardProps>() }),
  z.object({ kind: z.literal('whiteboard'), seconds: z.number().min(3).max(10).default(6), ...shotFields, props: z.custom<WhiteboardProps>() }),
  z.object({ kind: z.literal('photo25d'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<Photo25dProps>() }),
  z.object({ kind: z.literal('photoWall'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<PhotoWallProps>() }),
  z.object({ kind: z.literal('collage'), seconds: z.number().min(2.5).max(10).default(5), ...shotFields, props: z.custom<CollageProps>() }),
  z.object({ kind: z.literal('polaroids'), seconds: z.number().min(2.5).max(10).default(5.5), ...shotFields, props: z.custom<PolaroidsProps>() }),
  z.object({ kind: z.literal('textMask'), seconds: z.number().min(2.5).max(10).default(4), ...shotFields, props: z.custom<TextMaskProps>() }),
  z.object({ kind: z.literal('splitScreen'), seconds: z.number().min(2.5).max(10).default(4), ...shotFields, props: z.custom<SplitScreenProps>() }),
  z.object({ kind: z.literal('ingredients'), seconds: z.number().min(2.5).max(10).default(6), ...shotFields, props: z.custom<IngredientsProps>() }),
  z.object({ kind: z.literal('priceTag'), seconds: z.number().min(2.5).max(10).default(4), ...shotFields, props: z.custom<PriceTagProps>() }),
  z.object({ kind: z.literal('sizeCompare'), seconds: z.number().min(2.5).max(10).default(4), ...shotFields, props: z.custom<SizeCompareProps>() }),
  z.object({ kind: z.literal('colorways'), seconds: z.number().min(2.5).max(10).default(5), ...shotFields, props: z.custom<ColorwaysProps>() }),
  z.object({ kind: z.literal('turntable'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<TurntableProps>() }),
  z.object({ kind: z.literal('logoShine'), seconds: z.number().min(2.5).max(10).default(3.5), ...shotFields, props: z.custom<LogoShineProps>() }),
  z.object({ kind: z.literal('floatIcons'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<FloatIconsProps>() }),
  z.object({ kind: z.literal('liquid'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<LiquidProps>() }),
  z.object({ kind: z.literal('glassCards'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<GlassCardsProps>() }),
  z.object({ kind: z.literal('text3d'), seconds: z.number().min(2.5).max(10).default(3.5), ...shotFields, props: z.custom<Text3dProps>() }),
  z.object({ kind: z.literal('clay'), seconds: z.number().min(2.5).max(10).default(3.5), ...shotFields, props: z.custom<ClayProps>() }),
  z.object({ kind: z.literal('handwriting'), seconds: z.number().min(2.5).max(10).default(4.5), ...shotFields, props: z.custom<HandwritingProps>() }),
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

/** Seventh sample: Japanese and hand-made materials (a made-up sushi bar, Kaede). */
export const motionSample7: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'brushText', seconds: 4, props: { text: '旬', sub: '鮨 楓' } },
    { kind: 'ukiyoWave', seconds: 4.5, props: { title: '海から、今朝', sub: '朝どれの魚だけ' } },
    { kind: 'watercolor', seconds: 4.5, props: { image: 'samples/photos/sushi.jpg', title: '季節のおまかせ', sub: '十二貫' } },
    { kind: 'chalkboard', seconds: 5, props: { title: '本日のおすすめ', lines: [{ text: '寒ぶり', value: '680' }, { text: 'あん肝', value: '520' }, { text: '白子ポン酢', value: '880' }] } },
    { kind: 'whiteboard', seconds: 6, props: { title: 'ご予約の流れ', steps: ['LINEで日時', '席を確保', '当日ご来店'] } },
    { kind: 'washiSeal', seconds: 4, props: { title: '鮨 楓', sub: '神楽坂', seal: '楓', since: '創業 昭和四十二年' } },
  ],
};

/** Eighth sample: photo-based styles, using the sample photos in public/samples/photos (a made-up travel brand, Tabi). */
export const motionSample8: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'textMask', seconds: 4, props: { text: 'TABI', image: 'samples/photos/travel.jpg', sub: '週末の小さな旅' } },
    { kind: 'photo25d', seconds: 4.5, props: { image: 'samples/photos/cafe.jpg', title: '路地裏のカフェ', sub: '地元の人だけが知る朝ごはん', focus: { x: 0.5, y: 0.45 } } },
    { kind: 'polaroids', seconds: 5.5, props: { images: ['samples/photos/matcha.jpg', 'samples/photos/sushi.jpg', 'samples/photos/florist.jpg', 'samples/photos/ramen.jpg'], captions: ['抹茶', '寿司', '花屋', 'ラーメン'], title: '1日で、4つの寄り道' } },
    { kind: 'collage', seconds: 5, props: { images: ['samples/photos/fashion.jpg', 'samples/photos/sneaker.jpg', 'samples/photos/interior.jpg', 'samples/photos/cat.jpg'], words: ['自由', 'に', '旅'] } },
    { kind: 'splitScreen', seconds: 4, props: { panels: [{ image: 'samples/photos/travel.jpg', label: '見る' }, { image: 'samples/photos/ramen.jpg', label: '食べる' }, { image: 'samples/photos/interior.jpg', label: '泊まる' }] } },
    { kind: 'photoWall', seconds: 4.5, props: { images: ['samples/photos/travel.jpg', 'samples/photos/cafe.jpg', 'samples/photos/matcha.jpg', 'samples/photos/sushi.jpg', 'samples/photos/florist.jpg', 'samples/photos/ramen.jpg', 'samples/photos/interior.jpg', 'samples/photos/fashion.jpg', 'samples/photos/cat.jpg', 'samples/photos/puppy.jpg'], title: 'あなたの次の週末へ' } },
  ],
};

/** Ninth sample: product styles (a made-up watch brand, Hikari, and the Lumina serum). */
export const motionSample9: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'turntable', seconds: 4.5, props: { product: 'samples/watch-cutout.png', cutout: true, name: 'HIKARI 38', sub: 'AUTOMATIC' } },
    { kind: 'ingredients', seconds: 6, props: { product: 'samples/photos/serum.jpg', name: 'Lumina 美容液', points: [{ title: '京都の水', text: '伏見の軟水を使用' }, { title: 'ビタミンC', text: '朝の肌にハリ' }, { title: '無香料', text: '敏感肌にも' }, { title: '30mL', text: '約2か月分' }] } },
    { kind: 'sizeCompare', seconds: 4, props: { product: 'samples/watch-cutout.png', cutout: true, heightCm: 11.5, label: '手のひらサイズ' } },
    { kind: 'colorways', seconds: 5, props: { product: 'samples/photos/sneaker.jpg', name: '全4色', colors: [{ name: 'ホワイト', swatch: '#e9e6e0', hue: 0 }, { name: 'サンセット', swatch: '#ff7a3d', hue: 40 }, { name: 'ミント', swatch: '#5ed1b0', hue: 140 }, { name: 'ラベンダー', swatch: '#a68cff', hue: 240 }] } },
    { kind: 'priceTag', seconds: 4, props: { product: 'samples/photos/sneaker.jpg', label: '週末だけの', before: '12,800円', price: '8,980円', badge: '30%\nOFF', until: '11月10日まで' } },
    { kind: 'logoShine', seconds: 3.5, props: { name: 'HIKARI', tagline: '時を、身につける' } },
  ],
};

/** Tenth sample: 3D and material styles (a made-up kids' class, Pocco, and a fintech app). */
export const motionSample10: MotionReelProps = {
  lang: 'ja',
  scenes: [
    { kind: 'clay', seconds: 3.5, props: { title: 'ぽっこ教室', sub: 'ねんど・お絵かき・こうさく' } },
    { kind: 'handwriting', seconds: 4.5, props: { lines: ['手を動かすと、', '頭も動く。'], underline: true } },
    { kind: 'floatIcons', seconds: 4.5, props: { title: 'できること', items: [{ icon: 'calendar', label: '予約' }, { icon: 'chat', label: '先生に相談' }, { icon: 'star', label: 'ごほうび' }, { icon: 'bell', label: 'お知らせ' }, { icon: 'chart', label: '成長記録' }, { icon: 'lock', label: '安心' }] } },
    { kind: 'liquid', seconds: 4.5, props: { title: 'とろける保湿', sub: 'Lumina ジェル' } },
    { kind: 'glassCards', seconds: 4.5, props: { title: '今月のお金', cards: [{ label: '残高', value: '¥482,300' }, { label: '今月の支出', value: '¥96,120' }, { label: '貯金ペース', value: '+12%' }] } },
    { kind: 'text3d', seconds: 3.5, props: { text: 'SALE', sub: '週末だけ 最大50%OFF' } },
  ],
};
