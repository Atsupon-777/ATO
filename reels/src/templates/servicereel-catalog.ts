// ServiceReel catalog: every sensible presentation layout × screen type × style, as pure data.
// Ids match the enums in src/servicereel.ts; a template id is `svc-<layout>-<screen>-<style>`.
import type { ServiceLayout, ServiceScreen, ServiceStyle } from '../servicereel';

type Named<T extends string> = { id: T; ja: string; en: string };

export type ServiceIndustry =
  | 'app'
  | 'school'
  | 'beauty'
  | 'restaurant'
  | 'realestate'
  | 'consulting'
  | 'recruiting'
  | 'events'
  | 'fitness';
export type ServicePurpose = 'awareness' | 'explainer' | 'campaign' | 'recruiting';

export const serviceLayouts: (Named<ServiceLayout> & {
  desc: string;
  screens: ServiceScreen[];
  industries: ServiceIndustry[];
  purposes: ServicePurpose[];
})[] = [
  {
    id: 'orbit',
    ja: '3Dデバイス回転',
    en: '3D device orbit',
    desc: '画面がゆっくり3Dで回り、機能カードが奥行きの中に浮かぶ',
    screens: ['phone', 'desktop', 'both'],
    industries: ['app', 'school', 'consulting', 'events', 'realestate'],
    purposes: ['awareness', 'explainer'],
  },
  {
    id: 'clickthrough',
    ja: 'クリック操作デモ',
    en: 'Click-through demo',
    desc: 'カーソルや指が実際に画面を操作し、押した所にズームする',
    screens: ['phone', 'desktop', 'both'],
    industries: ['app', 'school', 'consulting', 'realestate'],
    purposes: ['explainer'],
  },
  {
    id: 'problem',
    ja: '課題→解決',
    en: 'Problem → solution',
    desc: '悩みを突きつけて打ち消し、ブランドが登場して答えを出す',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['app', 'consulting', 'school', 'recruiting', 'beauty', 'fitness'],
    purposes: ['awareness', 'explainer', 'recruiting'],
  },
  {
    id: 'beforeafter',
    ja: 'ビフォーアフター',
    en: 'Before / after',
    desc: '散らかったビフォーをスライダーで拭い去り、整ったアフターへ',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['beauty', 'realestate', 'consulting', 'app', 'fitness'],
    purposes: ['explainer', 'awareness'],
  },
  {
    id: 'stats',
    ja: '実績カウントアップ',
    en: 'Results count-up',
    desc: '大きな数字がグラフと一緒にカウントアップし、最後に一覧で締める',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['app', 'fitness', 'school', 'consulting', 'recruiting', 'realestate'],
    purposes: ['awareness', 'recruiting'],
  },
  {
    id: 'features',
    ja: '3つの特長',
    en: 'Three features',
    desc: '大きな番号と見出しの雑誌風レイアウトで特長を1つずつ見せる',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['app', 'school', 'beauty', 'restaurant', 'realestate', 'consulting', 'recruiting', 'events', 'fitness'],
    purposes: ['awareness', 'explainer'],
  },
  {
    id: 'pricing',
    ja: '料金プラン比較',
    en: 'Pricing plans',
    desc: 'プランが積み重なり、価格がカウントアップ、おすすめをタップで選ぶ',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['app', 'school', 'beauty', 'fitness', 'restaurant', 'events', 'consulting'],
    purposes: ['campaign', 'explainer'],
  },
  {
    id: 'voice',
    ja: 'お客様の声',
    en: 'Customer voice',
    desc: '星が満ち、口コミが読み上げるように浮かび、本人の名前で締める',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['beauty', 'school', 'consulting', 'realestate', 'restaurant', 'fitness', 'app'],
    purposes: ['awareness'],
  },
  {
    id: 'steps',
    ja: '3ステップ',
    en: '1-2-3 steps',
    desc: '上のレールが1→2→3と進み、ステップごとに画面が寄り直す',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['app', 'school', 'consulting', 'events', 'recruiting', 'realestate', 'restaurant'],
    purposes: ['explainer', 'recruiting'],
  },
  {
    id: 'kinetic',
    ja: 'キネティックタイポ',
    en: 'Kinetic type',
    desc: '1拍ごとに言葉が色面で切り替わり、ロゴが衝撃波と共に着地する',
    screens: ['phone', 'desktop', 'both', 'none'],
    industries: ['restaurant', 'events', 'recruiting', 'beauty', 'app', 'fitness'],
    purposes: ['awareness', 'campaign', 'recruiting'],
  },
];

export const serviceScreens: (Named<ServiceScreen> & { needs: string })[] = [
  { id: 'phone', ja: 'スマホ画面', en: 'Phone screen', needs: 'phone' },
  { id: 'desktop', ja: 'PC画面', en: 'Desktop screen', needs: 'desktop' },
  { id: 'both', ja: 'スマホ+PC', en: 'Phone + desktop', needs: 'phone,desktop' },
  { id: 'none', ja: '画面なし', en: 'No screen', needs: '' },
];

export const serviceStyles: (Named<ServiceStyle> & { desc: string })[] = [
  { id: 'clean', ja: 'クリーン', en: 'Clean', desc: '温かいオフホワイトに柔らかな影。上品で信頼感' },
  { id: 'noir', ja: 'ノワール', en: 'Noir', desc: '漆黒にアクセントの光。テック・夜・高級感' },
  { id: 'vivid', ja: 'ビビッド', en: 'Vivid', desc: 'ブランドカラーの全面背景。元気で目を止める' },
];

export const serviceIndustries: Named<ServiceIndustry>[] = [
  { id: 'app', ja: 'アプリ・SaaS', en: 'App / SaaS' },
  { id: 'school', ja: 'スクール・講座', en: 'School / course' },
  { id: 'beauty', ja: '美容サロン', en: 'Beauty salon' },
  { id: 'restaurant', ja: '飲食店', en: 'Restaurant' },
  { id: 'realestate', ja: '不動産', en: 'Real estate' },
  { id: 'consulting', ja: '士業・コンサル', en: 'Professional services' },
  { id: 'recruiting', ja: '採用', en: 'Recruiting' },
  { id: 'events', ja: 'イベント', en: 'Events' },
  { id: 'fitness', ja: 'フィットネス', en: 'Fitness' },
];

export const servicePurposes: Named<ServicePurpose>[] = [
  { id: 'awareness', ja: '認知・初めての紹介', en: 'Awareness / first intro' },
  { id: 'explainer', ja: '機能・サービス説明', en: 'Feature explainer' },
  { id: 'campaign', ja: 'キャンペーン告知', en: 'Campaign announcement' },
  { id: 'recruiting', ja: '採用', en: 'Recruiting' },
];

/** Businesses that plausibly have their own app or web screen to show. */
const SCREEN_INDUSTRIES: ServiceIndustry[] = ['app', 'school', 'consulting', 'realestate', 'events', 'recruiting', 'fitness'];
/** Businesses that sell a place, a product or people rather than software. */
const PHOTO_INDUSTRIES: ServiceIndustry[] = [
  'school',
  'beauty',
  'restaurant',
  'realestate',
  'consulting',
  'recruiting',
  'events',
  'fitness',
];

export type ServiceTemplate = {
  id: string;
  layout: ServiceLayout;
  screen: ServiceScreen;
  style: ServiceStyle;
  industries: ServiceIndustry[];
  purposes: ServicePurpose[];
  nameJa: string;
  nameEn: string;
};

export const serviceTemplates: ServiceTemplate[] = serviceLayouts.flatMap((l) =>
  l.screens.flatMap((screenId) => {
    const sc = serviceScreens.find((x) => x.id === screenId)!;
    const fit = screenId === 'none' ? PHOTO_INDUSTRIES : SCREEN_INDUSTRIES;
    const industries = l.industries.filter((i) => fit.includes(i));
    if (!industries.length) return [];
    return serviceStyles.map((st) => ({
      id: `svc-${l.id}-${screenId}-${st.id}`,
      layout: l.id,
      screen: screenId,
      style: st.id,
      industries,
      purposes: l.purposes,
      nameJa: `${l.ja}・${sc.ja}・${st.ja}`,
      nameEn: `${l.en} · ${sc.en} · ${st.en}`,
    }));
  }),
);
