// Mixes ("レシピ"): a named look that narrows each axis, so a whole reel feels consistent while every
// beat still gets its own scene, camera move and transition. The planner and rollStyle() pick inside
// these lists. Pure data, shared by the server and the editor.
import { effectIds, type BeatStyle, type EffectId } from '../schemas.ts';
import {
  accentColors,
  accents as allAccents,
  cameraMoves,
  captionStyles,
  fontChoices,
  grades,
  textures,
  transitions,
  type Accent,
  type CameraMove,
  type CaptionStyle,
  type FontChoice,
  type Grade,
  type Texture,
  type Transition,
} from './axes.ts';
import { editTypes, tempos, videoStyles, videoTemplateById, type TempoId } from './video-catalog.ts';

export type Recipe = {
  id: string;
  name: string;
  desc: string;
  scenes: EffectId[];
  captions: CaptionStyle[];
  cameras: CameraMove[];
  transitions: Transition[];
  grades: Grade[];
  textures: Texture[];
  accents: Accent[];
  /** Chance (0–1) that each allowed accent is switched on for a beat. */
  accentRate: number;
  fonts: FontChoice[];
  colors: string[];
  /** Beat length the planner aims for, e.g. '1.5-3 seconds', and how many beats. */
  beat?: string;
  beats?: string;
  /** Mood words for the generated music bed. */
  mood?: string;
  premium?: boolean;
  /** Catalog row for server-added templates. */
  en?: string;
  categories?: string[];
};

export const recipes: Recipe[] = [
  {
    id: 'hype',
    name: 'ハイプ',
    desc: '速いカットとズーム、太字と強い色。勢いで見せるリール向け。',
    scenes: ['digitalZoom', 'zoomThrough', 'couchWall', 'chartGrow', 'paperCut', 'vertigo', 'orbit', 'glassType', 'kineticType', 'infographic'],
    captions: ['pop', 'upper', 'bounce', 'box', 'stack'],
    cameras: ['punch', 'shake', 'push', 'spinIn', 'dollyIn', 'panLeft', 'panRight', 'dollyZoom'],
    transitions: ['zoomBlur', 'whipLeft', 'whipUp', 'flash', 'glitch', 'spin'],
    grades: ['punchy', 'tealOrange', 'neon'],
    textures: ['none', 'grain', 'scanlines'],
    accents: ['beatFlash', 'emoji', 'arrows', 'progress', 'sparkles'],
    accentRate: 0.35,
    fonts: ['display', 'sansJP'],
    colors: ['#E9F06B', '#FF5A36', '#29D3F0', '#FF6FB5'],
  },
  {
    id: 'editorial',
    name: 'エディトリアル',
    desc: '雑誌の表紙のような上品なセリフ体と落ち着いた色。ブランド・美容向け。',
    scenes: ['coverStory', 'glassType', 'headlineWall', 'orbit', 'vertigo', 'frameBreak', 'kineticType'],
    captions: ['script', 'spaced', 'blur', 'outline'],
    cameras: ['push', 'pull', 'drift', 'rack', 'dollyIn', 'tracking', 'orbitCam', 'tiltDown'],
    transitions: ['blurDissolve', 'dip', 'iris', 'slide'],
    grades: ['film', 'faded', 'warm', 'mono'],
    textures: ['grain', 'lightLeak', 'vignette', 'none'],
    accents: ['letterbox', 'sparkles', 'glow'],
    accentRate: 0.3,
    fonts: ['serif', 'mincho'],
    colors: ['#F2E3A0', '#FFFFFF', '#FF6FB5'],
  },
  {
    id: 'saas',
    name: 'ビジネス・SaaS',
    desc: 'アプリ画面、チェックリスト、グラフで「何ができるか」を伝える。',
    scenes: ['uiWorld', 'phoneMockup', 'checklist', 'pullBack', 'greenScreen', 'chartGrow', 'frameBreak', 'infographic', 'kineticType'],
    captions: ['pop', 'highlighter', 'typewriter', 'box'],
    cameras: ['push', 'still', 'drift', 'punch', 'dollyIn', 'panRight', 'tiltUp'],
    transitions: ['slide', 'cut', 'zoomBlur', 'split'],
    grades: ['natural', 'cool', 'punchy'],
    textures: ['none', 'vignette'],
    accents: ['underline', 'progress', 'arrows'],
    accentRate: 0.35,
    fonts: ['display', 'sansJP'],
    colors: ['#5B8CFF', '#3DDC97', '#E9F06B'],
  },
  {
    id: 'handmade',
    name: '手づくり',
    desc: '落書き、切り貼り、マーカー。親しみやすいクリエイター系。',
    scenes: ['doodleBoil', 'paperCut', 'couchWall', 'headlineWall', 'checklist'],
    captions: ['highlighter', 'bounce', 'box', 'stack'],
    cameras: ['handheld', 'tilt', 'punch', 'still', 'panLeft'],
    transitions: ['cut', 'slide', 'spin', 'whipUp'],
    grades: ['warm', 'pastel', 'natural'],
    textures: ['paper', 'halftone', 'dust', 'none'],
    accents: ['stickers', 'arrows', 'outline', 'underline', 'emoji'],
    accentRate: 0.45,
    fonts: ['display', 'sansJP'],
    colors: ['#FF6FB5', '#FFC542', '#5B8CFF'],
  },
  {
    id: 'cinema',
    name: 'シネマ',
    desc: 'ゆっくりした寄り引きと映画のような色。語り・ストーリー向け。',
    scenes: ['vertigo', 'zoomThrough', 'coverStory', 'frameBreak', 'glassType', 'kineticType'],
    captions: ['spaced', 'blur', 'script'],
    cameras: ['dollyIn', 'pull', 'tracking', 'crane', 'orbitCam', 'dollyZoom', 'tiltUp', 'panRight', 'rack'],
    transitions: ['dip', 'blurDissolve', 'zoomBlur', 'iris'],
    grades: ['tealOrange', 'film', 'night', 'mono'],
    textures: ['grain', 'lightLeak', 'vignette'],
    accents: ['letterbox', 'glow'],
    accentRate: 0.5,
    fonts: ['serif', 'display'],
    colors: ['#F2E3A0', '#FFFFFF'],
  },
  {
    id: 'y2k',
    name: 'Y2K・ネオン',
    desc: 'ネオン、グリッチ、走査線。若い層・エンタメ向け。',
    scenes: ['orbit', 'glassType', 'couchWall', 'zoomThrough', 'digitalZoom', 'paperCut', 'kineticType'],
    captions: ['neon', 'outline', 'bounce', 'upper'],
    cameras: ['spinIn', 'shake', 'punch', 'handheld', 'orbitCam', 'dollyZoom'],
    transitions: ['glitch', 'flash', 'spin', 'whipLeft'],
    grades: ['neon', 'cool', 'punchy', 'night'],
    textures: ['scanlines', 'halftone', 'grain'],
    accents: ['sparkles', 'glow', 'emoji', 'beatFlash', 'stickers'],
    accentRate: 0.45,
    fonts: ['display'],
    colors: ['#B18CFF', '#29D3F0', '#FF6FB5', '#3DDC97'],
  },
  {
    id: 'soft',
    name: 'やさしい',
    desc: '淡い色とやわらかい動き。暮らし・ウェルネス・美容向け。',
    scenes: ['orbit', 'coverStory', 'checklist', 'phoneMockup', 'doodleBoil', 'headlineWall', 'infographic'],
    captions: ['script', 'blur', 'pop', 'highlighter'],
    cameras: ['drift', 'push', 'still', 'panLeft', 'crane', 'tiltUp'],
    transitions: ['blurDissolve', 'slide', 'iris', 'dip'],
    grades: ['pastel', 'warm', 'faded'],
    textures: ['lightLeak', 'none', 'paper'],
    accents: ['sparkles', 'stickers', 'underline', 'glow'],
    accentRate: 0.35,
    fonts: ['serif', 'sansJP', 'display'],
    colors: ['#FF6FB5', '#F2E3A0', '#B18CFF'],
  },
  {
    id: 'midnight',
    name: 'ミッドナイト',
    desc: '深いプラムの背景に、キーワードだけ大きなグラデのイタリック。通知・タイル・出典カードで語りを見せる（5パス編集の見た目）。',
    scenes: ['notifications', 'tiles', 'sourceCard', 'kineticType', 'coverStory', 'glassType', 'digitalZoom'],
    captions: ['keyword'],
    cameras: ['push', 'drift', 'still', 'dollyIn'],
    transitions: ['blurDissolve', 'cut', 'dip'],
    grades: ['midnight'],
    textures: ['none', 'grain'],
    accents: ['echo', 'progress'],
    accentRate: 0.4,
    fonts: ['serif'],
    colors: ['#E7B4CF', '#C7B5F0', '#F6CBA6'],
  },
  {
    id: 'motion',
    name: 'モーションデザイン',
    desc: '本物の3D、マスクから立ち上がる文字、立体ブロック、線画アイコン、イラスト図解。制作会社のモーショングラフィックス風。',
    scenes: ['object3d', 'particles3d', 'textReveal', 'uiLayers', 'isoGrid', 'lineIcons', 'flatBoard', 'kineticType', 'infographic'],
    captions: ['pop', 'blur', 'spaced', 'keyword'],
    cameras: ['still', 'push', 'drift', 'dollyIn'],
    transitions: ['zoomBlur', 'whipLeft', 'whipUp', 'slide', 'blurDissolve', 'iris'],
    grades: ['natural', 'punchy', 'cool'],
    textures: ['none', 'grain'],
    accents: ['progress', 'beatFlash'],
    accentRate: 0.25,
    fonts: ['display', 'sansJP'],
    colors: ['#5B8CFF', '#3DDC97', '#B18CFF', '#29D3F0', '#FF5A36'],
  },
  {
    id: 'all',
    name: 'おまかせミックス',
    desc: 'すべての要素から、話の内容に合わせて自由に組み合わせます。',
    scenes: [],
    captions: [],
    cameras: [],
    transitions: [],
    grades: [],
    textures: [],
    accents: [],
    accentRate: 0.3,
    fonts: [],
    colors: [],
  },
];

const STYLE_MOOD: Record<string, string> = {
  clean: 'bright, modern, clean electronic pop',
  film: 'warm, cinematic, analog, emotional',
  pop: 'playful, upbeat, colourful pop',
  night: 'dark, moody, synthwave, late-night',
  mono: 'minimal, stylish, lo-fi, understated',
};
const TEMPO_BPM: Record<TempoId, string> = { slow: '80-95 BPM, slow and spacious', normal: '100-115 BPM', fast: '120-135 BPM, driving, punchy drums on every beat' };

/** A video template (src/effects/video-catalog.ts) as a mix: its edit type narrows the motion, its style the look. */
function templateRecipe(id: string): Recipe | undefined {
  const v = videoTemplateById(id);
  if (!v) return undefined;
  const t = editTypes.find((x) => x.id === v.type)!;
  const m = tempos.find((x) => x.id === v.tempo)!;
  const st = videoStyles.find((x) => x.id === v.style)!;
  return {
    id,
    name: v.ja,
    desc: `${t.desc}（テンポ: ${m.ja}、スタイル: ${st.ja}）`,
    scenes: t.scenes,
    captions: t.captions,
    cameras: t.cameras,
    transitions: t.transitions,
    grades: st.grades,
    textures: st.textures,
    accents: t.accents,
    accentRate: t.accentRate,
    fonts: st.fonts,
    colors: st.colors,
    beat: m.beat,
    beats: m.beats,
    mood: `${STYLE_MOOD[st.id] ?? ''}, ${TEMPO_BPM[m.id]}`,
    premium: t.premium,
  };
}

/** Mixes the server adds at run time (DATA_DIR/templates.json), so new templates need no app update. */
export const extraRecipes: Recipe[] = [];

export const recipeById = (id?: string): Recipe =>
  (id && templateRecipe(id)) || recipes.find((r) => r.id === id) || extraRecipes.find((r) => r.id === id) || recipes[recipes.length - 1];

/** The lists a recipe allows on each axis (an empty list in the recipe means every option). */
export const recipeAxes = (r: Recipe) => ({
  scenes: r.scenes.length ? r.scenes : [...effectIds],
  captions: r.captions.length ? r.captions : [...captionStyles],
  cameras: r.cameras.length ? r.cameras : [...cameraMoves],
  transitions: r.transitions.length ? r.transitions : [...transitions],
  grades: r.grades.length ? r.grades : [...grades],
  textures: r.textures.length ? r.textures : [...textures],
  accents: r.accents.length ? r.accents : [...allAccents],
  fonts: r.fonts.length ? r.fonts : [...fontChoices],
  colors: r.colors.length ? r.colors : [...accentColors],
});

/** Small seeded PRNG so a shuffle is reproducible from its seed. */
const mulberry = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Picks a look for each of `n` beats inside a recipe. Grade, texture and font stay the same for the whole
 * reel (so it reads as one video); scene, caption, camera, transition and accents change beat to beat,
 * never repeating the previous beat's scene or transition.
 */
export function rollStyles(recipe: Recipe, n: number, seed = 1, opts: { hasMatte?: boolean } = {}) {
  const ax = recipeAxes(recipe);
  const rnd = mulberry(seed);
  const pick = <T,>(list: readonly T[], avoid?: T) => {
    const pool = list.length > 1 && avoid !== undefined ? list.filter((x) => x !== avoid) : list;
    return pool[Math.floor(rnd() * pool.length)];
  };
  const grade = pick(ax.grades);
  const texture = pick(ax.textures);
  const font = pick(ax.fonts);
  const color = pick(ax.colors);
  const needsMatte = ['outline', 'glow'];
  // Bars and the progress line read as part of the whole video, so they are decided once per reel.
  const reelWide = ['letterbox', 'progress'];
  const reelAccents = ax.accents.filter((a) => reelWide.includes(a) && rnd() < recipe.accentRate);
  const out: { scene: (typeof ax.scenes)[number]; style: BeatStyle }[] = [];
  const unused = [...ax.scenes];
  for (let i = 0; i < n; i++) {
    const prev = out[i - 1];
    // walk through every allowed scene before repeating one
    if (!unused.length) unused.push(...ax.scenes.filter((x) => x !== prev?.scene));
    const scene = unused.splice(Math.floor(rnd() * unused.length), 1)[0];
    const accents = [
      ...reelAccents,
      ...ax.accents
        .filter((a) => !reelWide.includes(a) && (opts.hasMatte || !needsMatte.includes(a)) && rnd() < recipe.accentRate)
        .slice(0, 2),
    ];
    out.push({
      scene,
      style: {
        caption: pick(ax.captions, prev?.style.caption),
        camera: pick(ax.cameras, prev?.style.camera),
        transition: i === 0 ? 'cut' : pick(ax.transitions, prev?.style.transition),
        grade,
        texture,
        font,
        color,
        accents,
      },
    });
  }
  return out;
}
