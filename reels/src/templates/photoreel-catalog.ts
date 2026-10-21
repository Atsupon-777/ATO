// PhotoReel catalog: pure data, no React. Every template is a motion × photo count × style;
// combinations that would look broken (a carousel of one photo) are left out rather than shipped.
import type { PhotoMotion, PhotoStyle } from '../photoreel.ts';

export type PhotoCategory = 'travel' | 'food' | 'cafe' | 'fashion' | 'cosmetics' | 'product' | 'memories' | 'realestate';
export type PhotoCount = 1 | 3 | 5 | 10;

export const photoCounts: readonly PhotoCount[] = [1, 3, 5, 10];

export const photoCategories: { id: PhotoCategory; ja: string; en: string }[] = [
  { id: 'travel', ja: '旅行', en: 'Travel' },
  { id: 'food', ja: 'グルメ', en: 'Food' },
  { id: 'cafe', ja: 'カフェ', en: 'Cafe' },
  { id: 'fashion', ja: 'ファッション', en: 'Fashion' },
  { id: 'cosmetics', ja: 'コスメ', en: 'Cosmetics' },
  { id: 'product', ja: '商品紹介', en: 'Product' },
  { id: 'memories', ja: '思い出・カップル', en: 'Memories & couples' },
  { id: 'realestate', ja: '物件・店舗紹介', en: 'Real estate & shops' },
];

export const photoMotions: {
  id: PhotoMotion;
  ja: string;
  en: string;
  desc: string;
  /** Fewest photos the motion needs to read as intended. */
  minPhotos: number;
  categories: PhotoCategory[];
}[] = [
  { id: 'cinematic', ja: 'シネマ', en: 'Cinematic', desc: 'ゆっくり寄って引くカメラと光のディゾルブ。映画の予告編のような余韻', minPhotos: 1, categories: ['travel', 'food', 'cafe', 'realestate', 'memories', 'fashion'] },
  { id: 'beatcut', ja: 'ビートカット', en: 'Beat cut', desc: '拍ごとに切り替わる寄りとフラッシュ。勢いで見せる', minPhotos: 1, categories: ['fashion', 'product', 'food', 'travel'] },
  { id: 'portal', ja: 'ズームスルー', en: 'Zoom-through', desc: '写真の中に次の写真が現れ、カメラが飛び込んでいく', minPhotos: 3, categories: ['travel', 'food', 'realestate', 'product'] },
  { id: 'push', ja: 'スワイプ', en: 'Push', desc: '次の写真が前の写真を奥へ押しやる、アプリのような滑らかな切り替え', minPhotos: 3, categories: ['product', 'fashion', 'cosmetics', 'food', 'realestate'] },
  { id: 'polaroid', ja: 'ポラロイド', en: 'Polaroid', desc: 'ポラロイドが降ってきて重なり、色が浮かび上がる。手書き風キャプション', minPhotos: 1, categories: ['memories', 'travel', 'cafe'] },
  { id: 'collage', ja: 'コラージュ', en: 'Collage', desc: '一枚ずつ全画面で見せてからグリッドに収まり、最後に一枚の作品になる', minPhotos: 3, categories: ['realestate', 'cafe', 'food', 'fashion', 'memories'] },
  { id: 'magazine', ja: 'マガジン', en: 'Magazine cover', desc: '大きなタイトルロゴの雑誌表紙。写真ごとにページがめくれる', minPhotos: 1, categories: ['fashion', 'cosmetics', 'travel'] },
  { id: 'carousel', ja: 'カルーセル', en: 'Carousel', desc: 'インスタの投稿をスワイプしていくような見せ方', minPhotos: 3, categories: ['product', 'cafe', 'food', 'realestate', 'cosmetics'] },
  { id: 'flip', ja: 'カードフリップ', en: 'Card flip', desc: '浮かぶ写真カードが立体的に裏返り、裏面に次の写真', minPhotos: 3, categories: ['cosmetics', 'product', 'fashion'] },
  { id: 'filmstrip', ja: 'フィルム', en: 'Film strip', desc: '光に透かした35mmフィルムが一コマずつ送られていく', minPhotos: 3, categories: ['travel', 'memories', 'cafe'] },
  { id: 'thennow', ja: 'ビフォーアフター', en: 'Then & now', desc: '比較スライダーが行き来して、前後の写真を見比べながら切り替わる', minPhotos: 3, categories: ['realestate', 'cosmetics', 'fashion', 'memories'] },
  { id: 'split', ja: 'スライス', en: 'Split slices', desc: '写真が帯状に割れて互い違いに飛び去り、次の写真が現れる', minPhotos: 3, categories: ['fashion', 'product', 'food', 'travel'] },
  { id: 'scrapbook', ja: 'スクラップブック', en: 'Scrapbook', desc: 'マスキングテープで貼った写真と手描きの落書き。日記帳をめくるように進む', minPhotos: 1, categories: ['memories', 'travel', 'cafe', 'food'] },
  { id: 'cube', ja: 'キューブ', en: '3D cube', desc: '立方体が回転して、隣の面から次の写真が現れる', minPhotos: 3, categories: ['product', 'fashion', 'realestate', 'travel'] },
  { id: 'burn', ja: 'フィルムバーン', en: 'Film burn', desc: 'フィルムの揺れとちらつき。切り替えでオレンジの光が焼き付くアナログな質感', minPhotos: 1, categories: ['travel', 'memories', 'fashion', 'cafe'] },
];

export const photoStyles: {
  id: PhotoStyle;
  ja: string;
  en: string;
  desc: string;
  palette: { bg: string; ink: string; accent: string };
  font: 'serif' | 'display';
}[] = [
  { id: 'editorial', ja: 'エディトリアル', en: 'Editorial', desc: 'セリフ体と細い罫線。雑誌のような上品さ', palette: { bg: '#0F0D0B', ink: '#F5EFE4', accent: '#C9A97C' }, font: 'serif' },
  { id: 'bold', ja: 'ボールド', en: 'Bold', desc: '極太の大文字と色ブロック。ストリートの強さ', palette: { bg: '#0A0A0A', ink: '#FFFFFF', accent: '#E6FF4F' }, font: 'display' },
  { id: 'minimal', ja: 'ミニマル', en: 'Minimal', desc: '静かなサンセリフとすりガラス。余白で見せる', palette: { bg: '#F4F1EC', ink: '#1C1B19', accent: '#B08D6A' }, font: 'display' },
];

export type PhotoTemplate = {
  id: string;
  motion: PhotoMotion;
  count: PhotoCount;
  style: PhotoStyle;
  categories: PhotoCategory[];
  nameJa: string;
  nameEn: string;
};

export const photoTemplates: PhotoTemplate[] = photoMotions.flatMap((m) =>
  photoCounts
    .filter((count) => count >= m.minPhotos)
    .flatMap((count) =>
      photoStyles.map((s) => ({
        id: `photo-${m.id}-${count}-${s.id}`,
        motion: m.id,
        count,
        style: s.id,
        categories: m.categories,
        nameJa: `${m.ja}・${count}枚・${s.ja}`,
        nameEn: `${m.en} · ${count} ${count === 1 ? 'photo' : 'photos'} · ${s.en}`,
      })),
    ),
);
