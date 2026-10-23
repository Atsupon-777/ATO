// Video templates by combination: edit type × tempo × style. Every combination is a full mix (Recipe), so the
// planner, rollStyles() and the editor treat a template exactly like the hand-made mixes in recipes.ts.
// Pure data, shared by the server and the editor.
import type { EffectId } from '../schemas.ts';
import type { Accent, CameraMove, CaptionStyle, FontChoice, Grade, Texture, Transition } from './axes.ts';

export type VideoCategory = 'trend' | 'vlog' | 'talk' | 'review' | 'beauty' | 'food' | 'travel' | 'fitness' | 'fun' | 'business';

export const videoCategories: { id: VideoCategory; ja: string; en: string }[] = [
  { id: 'trend', ja: 'トレンド', en: 'Trending' },
  { id: 'vlog', ja: 'Vlog', en: 'Vlog' },
  { id: 'talk', ja: 'トーク・解説', en: 'Talk & explainer' },
  { id: 'review', ja: '商品レビュー', en: 'Product review' },
  { id: 'beauty', ja: 'ビューティー', en: 'Beauty' },
  { id: 'food', ja: 'フード', en: 'Food' },
  { id: 'travel', ja: '旅行', en: 'Travel' },
  { id: 'fitness', ja: 'フィットネス', en: 'Fitness' },
  { id: 'fun', ja: 'エンタメ・おもしろ', en: 'Fun' },
  { id: 'business', ja: 'ビジネス', en: 'Business' },
];

/** The motion grammar of an edit: which scenes, moves, cuts and captions it is built from. */
export type EditType = {
  id: string;
  ja: string;
  en: string;
  desc: string;
  categories: VideoCategory[];
  /** Heavier scenes (3D, many layers): marked premium and costs more. */
  premium?: boolean;
  scenes: EffectId[];
  cameras: CameraMove[];
  transitions: Transition[];
  captions: CaptionStyle[];
  accents: Accent[];
  accentRate: number;
};

export const editTypes: EditType[] = [
  { id: 'jumpcut', ja: 'ジャンプカット', en: 'Jump cut', desc: '間を詰めて、寄り引きを切り替えながらテンポよく話す。', categories: ['talk', 'vlog', 'trend'], scenes: ['digitalZoom', 'frameBreak', 'kineticType'], cameras: ['punch', 'still', 'push', 'pull'], transitions: ['cut'], captions: ['pop', 'box', 'upper'], accents: ['progress', 'underline'], accentRate: 0.3 },
  { id: 'beatcut', ja: 'ビートに合わせてカット', en: 'Beat cut', desc: '音のビートで切り替わり、フラッシュと寄りで勢いを出す。', categories: ['trend', 'fun', 'fitness'], scenes: ['digitalZoom', 'zoomThrough', 'kineticType', 'vertigo'], cameras: ['punch', 'shake', 'spinIn'], transitions: ['flash', 'cut', 'zoomBlur'], captions: ['upper', 'stack', 'bounce'], accents: ['beatFlash', 'progress'], accentRate: 0.5 },
  { id: 'zoomio', ja: 'ズームイン・アウト', en: 'Zoom in & out', desc: '一気に寄って、また引く。キーワードで画面が動く。', categories: ['talk', 'trend', 'review'], scenes: ['digitalZoom', 'zoomThrough', 'pullBack'], cameras: ['punch', 'dollyIn', 'pull', 'push'], transitions: ['zoomBlur', 'cut'], captions: ['pop', 'stack'], accents: ['underline', 'sparkles'], accentRate: 0.3 },
  { id: 'whip', ja: 'ホイップ', en: 'Whip pan', desc: 'シュッと流れる切り替えで、カットがつながる。', categories: ['trend', 'travel', 'vlog'], scenes: ['digitalZoom', 'zoomThrough', 'frameBreak', 'kineticType'], cameras: ['panLeft', 'panRight', 'tracking', 'punch'], transitions: ['whipLeft', 'whipUp'], captions: ['pop', 'upper'], accents: ['progress'], accentRate: 0.25 },
  { id: 'glitch', ja: 'グリッチ', en: 'Glitch', desc: 'ノイズと走査線で画面が乱れる、デジタルな切り替え。', categories: ['trend', 'fun'], scenes: ['digitalZoom', 'glassType', 'orbit', 'kineticType'], cameras: ['shake', 'handheld', 'punch'], transitions: ['glitch', 'flash'], captions: ['neon', 'outline', 'upper'], accents: ['beatFlash', 'glow'], accentRate: 0.45 },
  { id: 'flash', ja: 'フラッシュ', en: 'Flash', desc: '白く光って切り替わる。決めの一言を強く見せる。', categories: ['trend', 'beauty', 'fitness'], scenes: ['digitalZoom', 'coverStory', 'glassType', 'kineticType'], cameras: ['punch', 'push', 'spinIn'], transitions: ['flash', 'cut'], captions: ['stack', 'upper', 'pop'], accents: ['beatFlash', 'sparkles'], accentRate: 0.45 },
  { id: 'speedramp', ja: 'スロー→早送り', en: 'Speed ramp', desc: 'ゆっくり溜めて、一気に加速する寄り。', categories: ['travel', 'fitness', 'trend'], scenes: ['vertigo', 'zoomThrough', 'digitalZoom'], cameras: ['dollyIn', 'dollyZoom', 'punch'], transitions: ['zoomBlur', 'blurDissolve'], captions: ['blur', 'spaced'], accents: ['letterbox', 'progress'], accentRate: 0.3 },
  { id: 'split', ja: '分割画面', en: 'Split screen', desc: '画面が割れて閉じる、比べて見せる構成。', categories: ['review', 'business', 'talk'], scenes: ['frameBreak', 'tiles', 'infographic', 'checklist'], cameras: ['still', 'push', 'drift'], transitions: ['split', 'slide'], captions: ['box', 'highlighter'], accents: ['arrows', 'underline'], accentRate: 0.35 },
  { id: 'textbehind', ja: '人物の後ろに文字', en: 'Text behind you', desc: '大きな文字が頭の後ろに入る、雑誌のような見せ方。', categories: ['beauty', 'trend', 'talk'], scenes: ['coverStory', 'glassType', 'kineticType', 'headlineWall'], cameras: ['push', 'drift', 'dollyIn'], transitions: ['blurDissolve', 'cut', 'dip'], captions: ['spaced', 'script', 'blur'], accents: ['outline', 'glow'], accentRate: 0.35 },
  { id: 'doodle', ja: '手描き落書き', en: 'Doodles', desc: '輪郭や矢印が手描きでうごめく、親しみやすい編集。', categories: ['vlog', 'fun', 'talk'], scenes: ['doodleBoil', 'paperCut', 'headlineWall', 'couchWall'], cameras: ['handheld', 'tilt', 'still'], transitions: ['cut', 'slide', 'spin'], captions: ['highlighter', 'bounce', 'box'], accents: ['arrows', 'stickers', 'outline', 'emoji'], accentRate: 0.5 },
  { id: 'cinema', ja: '映画風（黒帯）', en: 'Cinematic bars', desc: '黒帯とフィルムの色、ゆっくりした寄り引き。', categories: ['travel', 'vlog', 'food'], scenes: ['vertigo', 'zoomThrough', 'coverStory', 'frameBreak'], cameras: ['dollyIn', 'crane', 'tracking', 'pull', 'orbitCam'], transitions: ['dip', 'blurDissolve', 'iris'], captions: ['spaced', 'blur', 'script'], accents: ['letterbox', 'glow'], accentRate: 0.6 },
  { id: 'vlog', ja: 'Vlog風', en: 'Vlog', desc: '手持ちの揺れ、日付とステッカー、軽い切り替え。', categories: ['vlog', 'travel', 'food'], scenes: ['frameBreak', 'couchWall', 'paperCut', 'digitalZoom'], cameras: ['handheld', 'drift', 'panRight'], transitions: ['slide', 'cut', 'whipLeft'], captions: ['typewriter', 'pop', 'highlighter'], accents: ['stickers', 'emoji', 'underline'], accentRate: 0.4 },
  { id: 'asmr', ja: 'ASMR風', en: 'Calm ASMR', desc: '静かで余白の多い画面、ゆっくり溶ける切り替え。', categories: ['food', 'beauty', 'vlog'], scenes: ['vertigo', 'coverStory', 'glassType'], cameras: ['still', 'drift', 'push', 'rack'], transitions: ['blurDissolve', 'dip'], captions: ['spaced', 'blur'], accents: ['glow'], accentRate: 0.2 },
  { id: 'beforeafter', ja: 'ビフォーアフター', en: 'Before & after', desc: '前と後を割って見せ、変化を数字で強調する。', categories: ['beauty', 'fitness', 'review'], scenes: ['frameBreak', 'infographic', 'checklist', 'tiles'], cameras: ['push', 'punch', 'still'], transitions: ['split', 'iris', 'flash'], captions: ['box', 'stack', 'highlighter'], accents: ['arrows', 'sparkles'], accentRate: 0.4 },
  { id: 'countdown', ja: 'カウントダウン', en: 'Countdown', desc: '3・2・1と数字で進む、最後まで見たくなる構成。', categories: ['trend', 'fun', 'talk'], scenes: ['kineticType', 'tiles', 'infographic', 'digitalZoom'], cameras: ['punch', 'push', 'shake'], transitions: ['flash', 'zoomBlur', 'cut'], captions: ['stack', 'upper'], accents: ['progress', 'beatFlash'], accentRate: 0.45 },
  { id: 'ranking', ja: 'ランキング形式', en: 'Ranking', desc: '順位のタイルと見出しで、ベスト3を発表する。', categories: ['review', 'food', 'beauty'], scenes: ['tiles', 'checklist', 'headlineWall', 'kineticType'], cameras: ['push', 'punch', 'still'], transitions: ['slide', 'flash', 'cut'], captions: ['box', 'stack', 'pop'], accents: ['sparkles', 'underline'], accentRate: 0.4 },
  { id: 'explainer', ja: '図解で解説', en: 'Explainer', desc: 'グラフ・チェック・出典カードで話を整理して見せる。', categories: ['talk', 'business'], scenes: ['infographic', 'chartGrow', 'checklist', 'sourceCard', 'flatBoard'], cameras: ['push', 'still', 'drift'], transitions: ['slide', 'blurDissolve', 'cut'], captions: ['highlighter', 'keyword', 'box'], accents: ['underline', 'progress'], accentRate: 0.35 },
  { id: 'news', ja: 'ニュース風', en: 'Newsroom', desc: '見出しと通知が積み上がる、速報のような見せ方。', categories: ['talk', 'business', 'trend'], scenes: ['headlineWall', 'notifications', 'sourceCard', 'digitalZoom'], cameras: ['push', 'punch', 'still'], transitions: ['slide', 'cut', 'flash'], captions: ['box', 'upper'], accents: ['progress', 'underline'], accentRate: 0.35 },
  { id: 'phone', ja: 'スマホ画面', en: 'Phone screens', desc: 'チャット・通知・アプリ画面で話を見せる。', categories: ['business', 'talk', 'review'], scenes: ['phoneMockup', 'notifications', 'uiWorld', 'greenScreen'], cameras: ['push', 'drift', 'still'], transitions: ['slide', 'zoomBlur'], captions: ['pop', 'typewriter'], accents: ['arrows', 'progress'], accentRate: 0.3 },
  { id: 'social', ja: 'SNSカード', en: 'Social cards', desc: '投稿カードが人物の周りを回り、後ろに貼られる。', categories: ['trend', 'business', 'talk'], scenes: ['orbit', 'couchWall', 'frameBreak'], cameras: ['orbitCam', 'push', 'dollyIn'], transitions: ['zoomBlur', 'whipUp', 'slide'], captions: ['pop', 'bounce'], accents: ['sparkles', 'emoji'], accentRate: 0.4 },
  { id: 'kinetic', ja: 'キネティック文字', en: 'Kinetic type', desc: '話す言葉が大きく飛び込み、ポスターのように積み上がる。', categories: ['trend', 'talk', 'fitness'], scenes: ['kineticType', 'textReveal', 'glassType'], cameras: ['punch', 'push', 'still'], transitions: ['cut', 'flash', 'whipUp'], captions: ['stack', 'keyword'], accents: ['beatFlash'], accentRate: 0.3 },
  { id: 'collage', ja: '切り貼りコラージュ', en: 'Paper collage', desc: '紙の切り抜きとテープ、文字が1つずつ貼られる。', categories: ['vlog', 'beauty', 'fun'], scenes: ['paperCut', 'headlineWall', 'doodleBoil', 'couchWall'], cameras: ['tilt', 'handheld', 'still'], transitions: ['cut', 'spin', 'slide'], captions: ['highlighter', 'box'], accents: ['stickers', 'arrows'], accentRate: 0.45 },
  { id: 'neon', ja: 'ネオン夜', en: 'Neon night', desc: '光る文字と夜の色、グロウで人物が浮かぶ。', categories: ['trend', 'fun', 'food'], scenes: ['glassType', 'orbit', 'zoomThrough', 'kineticType'], cameras: ['orbitCam', 'spinIn', 'handheld'], transitions: ['glitch', 'spin', 'flash'], captions: ['neon', 'outline'], accents: ['glow', 'sparkles'], accentRate: 0.5 },
  { id: 'dolly', ja: 'ドリーズーム', en: 'Dolly zoom', desc: '背景だけが伸びる、映画のめまい演出。', categories: ['trend', 'travel', 'fun'], scenes: ['vertigo', 'zoomThrough', 'frameBreak'], cameras: ['dollyZoom', 'dollyIn', 'crane'], transitions: ['zoomBlur', 'dip'], captions: ['spaced', 'upper'], accents: ['letterbox'], accentRate: 0.4 },
  { id: 'magazine', ja: '雑誌の表紙', en: 'Magazine cover', desc: '表紙のような大きなセリフ体と見出しで上品に。', categories: ['beauty', 'trend'], scenes: ['coverStory', 'headlineWall', 'textReveal'], cameras: ['push', 'drift', 'tiltDown'], transitions: ['blurDissolve', 'dip', 'iris'], captions: ['script', 'spaced'], accents: ['glow', 'sparkles'], accentRate: 0.3 },
  { id: 'storytime', ja: 'ストーリータイム', en: 'Storytime', desc: '語りに合わせて、1語ずつのキーワードと静かな寄り。', categories: ['talk', 'vlog'], scenes: ['kineticType', 'coverStory', 'digitalZoom', 'vertigo'], cameras: ['push', 'drift', 'dollyIn'], transitions: ['blurDissolve', 'cut'], captions: ['keyword', 'blur'], accents: ['echo', 'progress'], accentRate: 0.35 },
  { id: 'unboxing', ja: '開封・レビュー', en: 'Unboxing', desc: 'チェックリストと評価の数字で、商品の良さを伝える。', categories: ['review', 'beauty'], scenes: ['checklist', 'tiles', 'sourceCard', 'digitalZoom'], cameras: ['punch', 'push', 'still'], transitions: ['slide', 'cut', 'zoomBlur'], captions: ['pop', 'highlighter'], accents: ['sparkles', 'arrows', 'emoji'], accentRate: 0.4 },
  { id: 'motion3d', ja: '3Dモーション', en: '3D motion', desc: '本物の3Dの物体と粒子、制作会社のような映像。', categories: ['business', 'trend'], premium: true, scenes: ['object3d', 'particles3d', 'textReveal', 'isoGrid'], cameras: ['still', 'push', 'drift'], transitions: ['zoomBlur', 'blurDissolve', 'iris'], captions: ['spaced', 'blur', 'pop'], accents: ['progress'], accentRate: 0.2 },
  { id: 'layers', ja: 'レイヤー奥行き', en: 'Depth layers', desc: '画面が奥行きを持って重なり、その中で人物が話す。', categories: ['business', 'talk'], premium: true, scenes: ['uiLayers', 'uiWorld', 'pullBack', 'greenScreen'], cameras: ['dollyIn', 'orbitCam', 'push'], transitions: ['zoomBlur', 'slide'], captions: ['pop', 'keyword'], accents: ['progress', 'glow'], accentRate: 0.3 },
  { id: 'illustrated', ja: 'イラスト図解', en: 'Illustrated', desc: '線画アイコンとフラットな図解が描かれていく。', categories: ['talk', 'business', 'fitness'], premium: true, scenes: ['lineIcons', 'flatBoard', 'isoGrid', 'infographic'], cameras: ['still', 'push'], transitions: ['slide', 'whipLeft', 'iris'], captions: ['highlighter', 'pop'], accents: ['underline'], accentRate: 0.25 },
];

/** How fast the edit moves: beat length the planner aims for, and how hard the cuts are. */
export const tempos = [
  { id: 'slow', ja: 'ゆっくり', en: 'Slow', beat: '2.5-4 seconds', beats: '4-7' },
  { id: 'normal', ja: 'ふつう', en: 'Normal', beat: '1.5-3 seconds', beats: '6-10' },
  { id: 'fast', ja: '速い・ビート合わせ', en: 'Fast, on the beat', beat: '0.8-1.8 seconds', beats: '9-14' },
] as const;
export type TempoId = (typeof tempos)[number]['id'];

/** The look over the whole reel. */
export const videoStyles: { id: string; ja: string; en: string; grades: Grade[]; textures: Texture[]; fonts: FontChoice[]; colors: string[] }[] = [
  { id: 'clean', ja: 'クリーン', en: 'Clean', grades: ['natural', 'punchy'], textures: ['none'], fonts: ['display', 'sansJP'], colors: ['#E9F06B', '#FFFFFF', '#5B8CFF'] },
  { id: 'film', ja: 'フィルム', en: 'Film', grades: ['film', 'warm', 'tealOrange'], textures: ['grain', 'lightLeak'], fonts: ['serif', 'mincho'], colors: ['#F2E3A0', '#FFFFFF'] },
  { id: 'pop', ja: 'ポップ', en: 'Pop', grades: ['punchy', 'pastel'], textures: ['none', 'halftone'], fonts: ['display'], colors: ['#FF6FB5', '#FFC542', '#29D3F0', '#FF5A36'] },
  { id: 'night', ja: 'ナイト', en: 'Night', grades: ['night', 'neon', 'cool'], textures: ['grain', 'scanlines', 'vignette'], fonts: ['display', 'serif'], colors: ['#B18CFF', '#29D3F0', '#E7B4CF'] },
  { id: 'mono', ja: 'モノクロ', en: 'Mono', grades: ['mono', 'faded'], textures: ['grain', 'dust', 'vignette'], fonts: ['serif', 'mincho', 'display'], colors: ['#FFFFFF', '#F2E3A0'] },
];

export type VideoTemplate = {
  id: string;
  type: string;
  tempo: TempoId;
  style: string;
  ja: string;
  en: string;
  categories: VideoCategory[];
  premium: boolean;
};

/** Every combination. Calm edits are not made fast, and beat-driven ones are not made slow. */
export const videoTemplates: VideoTemplate[] = editTypes.flatMap((t) =>
  tempos
    .filter((m) => !((m.id === 'fast' && ['asmr', 'cinema', 'storytime'].includes(t.id)) || (m.id === 'slow' && ['beatcut', 'flash', 'glitch', 'countdown'].includes(t.id))))
    .flatMap((m) =>
      videoStyles.map((s) => ({
        id: `v-${t.id}-${m.id}-${s.id}`,
        type: t.id,
        tempo: m.id,
        style: s.id,
        ja: `${t.ja}・${m.ja}・${s.ja}`,
        en: `${t.en} · ${m.en} · ${s.en}`,
        categories: t.categories,
        premium: !!t.premium,
      })),
    ),
);

export const videoTemplateById = (id: string) => videoTemplates.find((v) => v.id === id);
