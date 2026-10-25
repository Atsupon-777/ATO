import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Player, Thumbnail, type PlayerRef } from '@remotion/player';
import { accentColors, accents, cameraMoves, captionStyles, combinationCount, fontChoices, grades, textures, transitions } from '../../src/effects/axes';
import { recipeAxes, recipeById, recipes, rollStyles } from '../../src/effects/recipes';
import { videoCategories, videoTemplates } from '../../src/effects/video-catalog';
import { serviceIndustries, serviceLayouts, serviceStyles, serviceTemplates } from '../../src/templates/servicereel-catalog';
import type { ServiceReelProps } from '../../src/servicereel';
import { ProductShine, productShineFrames } from '../../src/templates/ProductShine';
import { SaaSPromo, saasPromoBeats } from '../../src/templates/SaaSPromo';
import { TalkCaptions, talkCaptionsDuration } from '../../src/templates/TalkCaptions';
import { EffectsReel, MUSIC_DEFAULT, effectsReelDuration } from '../../src/templates/EffectsReel';
import { FivePass, fivePassDuration } from '../../src/templates/FivePass';
import { ExperienceFilm, experienceFilmDuration, experienceTimeline } from '../../src/templates/ExperienceFilm';
import { PhotoAdFilm, photoAdDuration } from '../../src/templates/PhotoAdFilm';
import photoAdSample from '../../props/photoad-demo.json';
import { FPS, beatFrames } from '../../src/lib/timing';
import { keepSegments, paginate, placeWords } from '../../src/lib/edit';
import { STICKER_PATHS } from '../../src/effects/overlays';
import { effectIds, stickerIds, type Overlay, type BeatStyle, type EffectId, type EffectsReelProps, type ExperienceFilmProps, type FivePassProps, type PhotoAdProps, type ProductShineProps, type SaaSPromoProps, type TalkCaptionsProps } from '../../src/schemas';
import productSample from '../../props/product-watch.json';
import saasSample from '../../props/saas-sample.json';
import talkSample from '../../props/talk-sample.json';
import effectsSample from '../../props/effects-demo.json';
import fivePassSample from '../../props/fivepass-demo.json';
import serviceSample from '../../props/service-features.json';
import photoSample from '../../props/photo-cinematic.json';
import experienceSample from '../../props/experience-demo.json';
import { PhotoReel, photoReelDuration } from '../../src/templates/PhotoReel';
import { photoCategories, photoMotions, photoStyles, photoTemplates } from '../../src/templates/photoreel-catalog';
import type { PhotoReelProps } from '../../src/photoreel';
import { ServiceReel, serviceReelDuration } from '../../src/templates/ServiceReel';

import { LANG_NAMES, langs, type Lang } from '../../src/lang';
import { lang, setLang, tr } from './i18n';
import { authHeader, checkVerified, config as appConfig, confirmPhoneCode, deleteAccount, linkedPhone, registerPushToken, resendVerification, sendPhoneCode, resetPassword, signInApple, signInEmail, signInGoogle, signOut, signUpEmail, startAuth, useAuth } from './auth';
import { apiUrl, enablePush, iapBuy, iapProducts, iapRestore, isNative, manageStoreSubscription, mediaQuery, pickFromLibrary, platform, saveToCameraRoll, shareVideo, type IapProduct } from './native';
import { PreviewMode, asset, posterOf } from '../../src/lib/assets';
import { FRAMING_LABEL, LAYOUT_LABEL, UNFRAMED_SCENES, directShots, framings, showsSpeaker, type Framing, type Shot } from '../../src/effects/shots';

// ---------- live previews: light, few, and never able to take the app down ----------

// Live previews play the light copies of job videos (src/lib/assets.ts); renders never set this.
(globalThis as any).reels_preview = true;

/** Phones (and the app): one live preview at a time, posters everywhere else. */
const LITE = isNative || /iPhone|iPad|iPod|Android/.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

/**
 * Crash-loop guard. When iOS ends the web view (out of memory), the app reloads on the same page, and if
 * that page is what used the memory it would loop forever. Three starts within 40 seconds, none of which
 * lasted 15 seconds, switch live previews to tap-to-play posters for the next 10 minutes.
 */
const SAFE_MODE = (() => {
  try {
    const now = Date.now();
    const boots = (JSON.parse(localStorage.getItem('editless-boots') || '[]') as number[]).filter((t) => now - t < 40_000);
    boots.push(now);
    localStorage.setItem('editless-boots', JSON.stringify(boots));
    setTimeout(() => {
      try {
        localStorage.setItem('editless-boots', '[]');
      } catch {}
    }, 15_000);
    if (boots.length >= 3) localStorage.setItem('editless-safe', String(now + 10 * 60_000));
    return Number(localStorage.getItem('editless-safe') || 0) > now;
  } catch {
    return false;
  }
})();

/** Catches a preview that throws, so one bad clip shows a still instead of a blank or broken page. */
class PreviewBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: unknown) {
    console.warn('preview failed', e);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** In place of a preview that could not play: the still, and a short note. */
const PreviewFallback: React.FC<{ poster?: string; note?: string; onPlay?: () => void }> = ({ poster, note, onPlay }) => (
  <div className="pvfallback" onClick={onPlay} role={onPlay ? 'button' : undefined} aria-label={onPlay ? tr("再生") : undefined}>
    {poster ? <img src={poster} alt="" /> : null}
    {onPlay ? (
      <span className="pvplay" aria-hidden>
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    ) : null}
    {note ? <small>{note}</small> : null}
  </div>
);

/** Player error screen (Remotion's errorFallback): calm, on brand, no stack trace. */
const playerError = () => <PreviewFallback note={tr("プレビューを再生できませんでした")} />;

/**
 * One live preview in the whole app at a time. Starting one stops whichever was playing, so a screen
 * never holds two players' videos in memory (the crash loop on iPhone) and never plays two sounds.
 */
let soloSeq = 0;
let soloNow = 0;
const soloListeners = new Set<() => void>();
const useSolo = () => {
  const id = useMemo(() => ++soloSeq, []);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => soloNow !== id && setOn(false);
    soloListeners.add(f);
    return () => void soloListeners.delete(f);
  }, [id]);
  const start = useCallback(() => {
    soloNow = id;
    soloListeners.forEach((f) => f());
    setOn(true);
  }, [id]);
  const stop = useCallback(() => {
    if (soloNow === id) soloNow = 0;
    setOn(false);
  }, [id]);
  return [on, start, stop] as const;
};
type Solo = ReturnType<typeof useSolo>;

const PlayDisc: React.FC<{ size?: number }> = ({ size = 26 }) => (
  <span className="pvplay" aria-hidden>
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  </span>
);

/**
 * Every live <Player> or <video> sits in one of these. Nothing plays by itself: a still (an image, or a
 * one-frame composition) with a play button until the user taps it, like CapCut. The still stays under the
 * player, so a cut or a seek never flashes black. Scrolled out of view it goes back to the still (which
 * also frees its video memory), and starting another preview stops this one. Errors show the still.
 */
const LivePreview: React.FC<{ poster?: string | React.ReactNode; solo?: Solo; label?: string; children: React.ReactNode }> = ({ poster, solo, label, children }) => {
  const own = useSolo();
  const [on, start, stop] = solo ?? own;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!on || !el) return;
    const io = new IntersectionObserver(([e]) => e.intersectionRatio < 0.3 && stop(), { threshold: [0, 0.3] });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  const still = typeof poster === 'string' ? <img src={poster} alt="" draggable={false} /> : poster;
  return (
    <div className={`live ${on ? 'on' : ''}`} ref={box}>
      <div className="livestill">{still}</div>
      {on ? (
        <PreviewBoundary fallback={<PreviewFallback poster={typeof poster === 'string' ? poster : undefined} note={tr("プレビューを再生できませんでした")} />}>{children}</PreviewBoundary>
      ) : (
        <button className="liveplay" onClick={(e) => (e.stopPropagation(), start())} aria-label={label ?? tr("再生")}>
          <PlayDisc />
        </button>
      )}
    </div>
  );
};

/** A still frame for a job's props: the talking video's first frames, else its first photo or screenshot. */
const propsPoster = (props: any): string | undefined =>
  !props ? undefined : Array.isArray(props.shots) && typeof props.shots[0]?.src === 'string' ? (posterOf(props.shots[0].src) ?? media(props.shots[0].src)) : typeof props.video === 'string' ? posterOf(props.video) : (props.photo ?? props.photos?.[0]?.src ?? props.photos?.[0] ?? props.desktop ?? props.phone) ? media(String(props.photo ?? props.photos?.[0]?.src ?? props.photos?.[0] ?? props.desktop ?? props.phone)) : undefined;

// 億 only reads naturally in Japanese and Chinese; other languages get a compact number ("96.3B").
function mixCount() {
  const n = combinationCount(effectIds.length);
  return lang === 'ja' || lang === 'zh'
    ? tr("約{0}億通り", Math.floor(n / 1e8).toLocaleString())
    : tr("約{0}通り", new Intl.NumberFormat(lang, { notation: 'compact', maximumFractionDigits: 1 }).format(n));
}

type TemplateId = 'ProductShine' | 'SaaSPromo' | 'TalkCaptions' | 'EffectsReel' | 'FivePass' | 'ServiceReel' | 'PhotoReel' | 'ExperienceFilm' | 'PhotoAdFilm';

const TEMPLATES: Record<
  TemplateId,
  { name: string; tag: string; desc: string; component: React.FC<any>; frames: (p: any) => number; sample: any }
> = {
  ProductShine: {
    name: tr("商品を魅せる"),
    tag: tr("写真1枚から"),
    desc: tr("商品写真を自動で切り抜き、AIでスタジオ撮影風に。光の反射とディテールのアップで高級感のあるリールに。"),
    component: ProductShine,
    frames: (p) => productShineFrames(p, FPS),
    sample: productSample,
  },
  SaaSPromo: {
    name: tr("サービス紹介"),
    tag: tr("スクショから"),
    desc: tr("PC・スマホの画面を3Dで動かし、機能・実績の数字・CTAまでテンポよく見せるサービス紹介リール。"),
    component: SaaSPromo,
    frames: () => Math.round(saasPromoBeats * beatFrames(128)),
    sample: saasSample,
  },
  TalkCaptions: {
    name: tr("トーク動画＋字幕"),
    tag: tr("動画から"),
    desc: tr("話している動画をアップすると、文字起こし・無音カット・言い淀みカット・テロップまで自動。字幕は1つずつ直せます。"),
    component: TalkCaptions,
    frames: (p) => talkCaptionsDuration(p, FPS),
    sample: talkSample,
  },
  EffectsReel: {
    name: tr("トーク＋動画エフェクト"),
    tag: tr("動画から"),
    desc: tr("話している動画を、カットごとに違うエフェクト・字幕・カメラ・切り替えで仕上げます。{0}種のエフェクトと演出の掛け合わせで、1カットあたり{1}。ミックスを選ぶと全体の雰囲気がそろいます。", effectIds.length, mixCount()),
    component: EffectsReel,
    frames: (p) => effectsReelDuration(p, FPS),
    sample: effectsSample,
  },
  FivePass: {
    name: tr("5パス編集"),
    tag: tr("動画から"),
    desc: tr("プロの編集者と同じ5つの工程（文字起こし・切り抜き・字幕・演出・音）を1つずつ進めます。工程ごとに止めて確認し、ひとこと書いて作り直したり、前の版に戻したりできます。"),
    component: FivePass,
    frames: (p) => fivePassDuration(p, FPS),
    sample: fivePassSample,
  },
  ServiceReel: {
    name: tr("サービス紹介"),
    tag: tr("テンプレートから"),
    desc: tr("お店・スクール・アプリなどのサービスを、選んだテンプレートの見せ方で紹介します。文章はAIが書き、BGMもAIが作ります。"),
    component: ServiceReel,
    frames: (p) => serviceReelDuration(p, FPS),
    sample: serviceSample,
  },
  PhotoReel: {
    name: tr("写真を見せる"),
    tag: tr("写真から"),
    desc: tr("写真を1〜10枚載せるだけ。選んだテンプレートの動きで、タイトル・キャプション・BGMまでAIが仕上げます。"),
    component: PhotoReel,
    frames: (p) => photoReelDuration(p, FPS),
    sample: photoSample,
  },
  ExperienceFilm: {
    name: tr("体験を映画のように"),
    tag: tr("言葉なしの短編映画"),
    desc: tr("ツアー・体験・宿・ワークショップを、話さない短編映画に。到着、体験の瞬間、五感のディテール、いちばんの景色までAIが撮り下ろし、音楽もAIが作ります。写真や動画があれば実際の場所として使います。"),
    component: ExperienceFilm,
    frames: (p) => experienceFilmDuration(p, FPS),
    sample: experienceSample,
  },
  PhotoAdFilm: {
    name: tr("写真1枚で広告動画"),
    tag: tr("写真1枚から"),
    desc: tr("商品写真1枚から、中身が本当に動く広告動画に。液体が流れ落ちるシーン、肌にのる瞬間、モデルが使うシーン、最後の商品カットまでAIが撮り下ろし、音楽もAIが作ります。"),
    component: PhotoAdFilm,
    frames: (p) => photoAdDuration(p, FPS),
    sample: photoAdSample,
  },
};

/** Japanese names for the 17 effects (catalog: notes/video-effects.md). */
const EFFECT_NAMES: Record<(typeof effectIds)[number], string> = {
  orbit: tr("01 オービット（カードが周回）"),
  couchWall: tr("02 壁一面のカード"),
  uiWorld: tr("03 アプリ画面の世界"),
  frameBreak: tr("04 フレームを破る"),
  digitalZoom: tr("05 デジタルズーム"),
  phoneMockup: tr("06 スマホモック"),
  checklist: tr("07 チェックリスト"),
  headlineWall: tr("08 見出しの壁"),
  zoomThrough: tr("09 ズームスルー"),
  chartGrow: tr("10 グラフが伸びる"),
  pullBack: tr("11 引いて見せる"),
  greenScreen: tr("12 背景差し替え"),
  paperCut: tr("13 紙の切り抜き"),
  doodleBoil: tr("14 落書きアニメ"),
  vertigo: tr("15 めまいズーム"),
  coverStory: tr("16 雑誌の表紙"),
  glassType: tr("17 ガラス文字"),
  kineticType: tr("18 キネティック・タイポ"),
  infographic: tr("19 インフォグラフィック"),
  notifications: tr("20 通知の積み重ね"),
  tiles: tr("21 チェック付きタイル"),
  sourceCard: tr("22 出典カード"),
  object3d: tr("23 3Dオブジェクト"),
  particles3d: tr("24 3Dパーティクル"),
  textReveal: tr("25 テキストリビール"),
  uiLayers: tr("26 UIレイヤー"),
  isoGrid: tr("27 アイソメ・ブロック"),
  lineIcons: tr("28 線画アイコン"),
  flatBoard: tr("29 イラスト図解"),
};

type Job = {
  premiumPaid?: boolean;
  /** The current export was made with 高画質・高音質. */
  hq?: boolean;
  id: string;
  template: TemplateId;
  title: string;
  createdAt: string;
  status: 'generating' | 'ready' | 'rendering' | 'done' | 'error';
  step?: { n: number; total: number; label: string; at?: string };
  renderProgress?: number;
  renderStartedAt?: string;
  props?: any;
  usage?: { totalUsd: number; lines: { step: string; model: string; units: string; usd: number }[] };
  video?: string;
  error?: string;
  thumb?: string;
  /** Still frame address (server-cut), from the job list. */
  poster?: string;
  versions?: Record<number, number>;
  tokens?: number;
  /** Music beds made for this reel, by genre (plus `original`). */
  musicTracks?: Record<string, string>;
};

// Static preview build (no server): jobs come from window.ATO_DEMO, edits stay in memory,
// and generation/export explain that they need the server.
const DEMO = (window as any).ATO_DEMO as { jobs: Job[] } | undefined;
const BASE: string = (window as any).remotion_staticBase ?? '';
/** Address of a file under public/ ("jobs/…", "/uploads/…"). In the app it points at the server, with the media key. */
const media = (p: string) => (/^(blob:|https?:|data:)/.test(p) ? p : `${BASE}/${p.replace(/^\//, '')}${mediaQuery(p)}`);
const DEMO_BLOCKED = tr("このプレビューでは生成と書き出しは動きません（サーバー版で動作確認済み）。編集とプレビューは試せます。");

const demoApi = async (url: string, init?: RequestInit): Promise<any> => {
  const jobs = DEMO!.jobs;
  const method = init?.method ?? 'GET';
  if (url === '/api/jobs' && method === 'GET') return jobs.map(({ props, ...j }) => ({ ...j, thumb: j.thumb ?? (j.template === 'ProductShine' ? props?.photo : j.template === 'SaaSPromo' ? props?.desktop : undefined) }));
  const m = url.match(/^\/api\/jobs\/([\w-]+)(\/props|\/render)?$/);
  const job = m && jobs.find((j) => j.id === m[1]);
  if (job && !m![2]) return structuredClone(job);
  if (job && m![2] === '/props') {
    job.props = JSON.parse(String(init!.body)).props;
    return structuredClone(job);
  }
  throw new Error(DEMO_BLOCKED);
};

const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  if (DEMO) return demoApi(url, init);
  const r = await fetch(apiUrl(url), { ...init, headers: { 'Content-Type': 'application/json', ...authHeader(), ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (r.status === 402 && j.code === 'tokens') throw new Error(tr("トークンが足りません。アカウントのページでプランを選ぶか、トークンを追加してください。"));
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
};

const uploadFile = async (f: File) => {
  if (DEMO) return { file: f.name, url: URL.createObjectURL(f) };
  const r = await fetch(apiUrl(`/api/upload?name=${encodeURIComponent(f.name)}`), { method: 'POST', body: f, headers: authHeader() });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j as { file: string; url: string };
};

// Tokens per reel, the same table as the server (A: own material 2, B: AI photo or effects 5, C: AI video 12).
const tokensFor = (t: TemplateId, input: Record<string, any>) =>
  t === 'ExperienceFilm' || t === 'PhotoAdFilm' ? 12 : t === 'ProductShine' ? (input.video ? 12 : 5) : t === 'EffectsReel' || t === 'FivePass' || t === 'SaaSPromo' || t === 'ServiceReel' ? 5 : 2;
/** Product ad films: an account's first one is free (the server's PRODUCT_AD). */
const PRODUCT_AD = new Set<string>(['ProductShine', 'ExperienceFilm', 'PhotoAdFilm', 'PhotoAd']);
/** Tokens to export a finished reel (each time), and extra for the premium edit (stickers, captions added by hand). */
const EXPORT_TOKENS = 1;
const PREMIUM_TOKENS = 2;
/** 高画質・高音質で書き出す adds this much to that export (the same as the server's HQ_TOKENS). */
const HQ_TOKENS = 2;
const exportCost = (job: Job, p: { overlays?: unknown[] }, hq = false) => EXPORT_TOKENS + (p.overlays?.length && !job.premiumPaid ? PREMIUM_TOKENS : 0) + (hq ? HQ_TOKENS : 0);
/** Plan sizes run into the hundreds, so counts get separators in the viewer's language. */
const fmtN = (n: number) => n.toLocaleString(lang);

const STEP_LABELS: Record<string, string> = {
  'cut-out': tr("商品を切り抜き"),
  'studio shot': tr("スタジオ撮影風の写真を生成"),
  'plan and copy': tr("構成とコピーを作成"),
  'motion clip (Veo)': tr("AI動画クリップを生成（1〜3分）"),
  'on-skin model shot': tr("モデル使用シーンを生成"),
  'build props': tr("動画を組み立て"),
  render: tr("動画を組み立て"),
  'copy and layout': tr("画面を読み取り、コピーと見せ場を作成"),
  audio: tr("音声を抽出"),
  transcribe: tr("文字起こし"),
  matte: tr("人物を切り抜き（数分かかります）"),
  'plan effects': tr("話に合わせてエフェクトを選ぶ"),
  'scene stills': tr("各シーンの絵を作成"),
};

// ---------- small UI pieces ----------

const Field: React.FC<{ label: string; max?: number; value: string; onChange: (v: string) => void; multiline?: boolean; placeholder?: string }> = ({
  label,
  max,
  value,
  onChange,
  multiline,
  placeholder,
}) => (
  <div className="field">
    <label>
      <span>{label}</span>
      {max ? <span style={{ color: value.length > max ? 'var(--danger)' : undefined }}>{value.length}/{max}</span> : null}
    </label>
    {multiline ? (
      <textarea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input type="text" value={value} placeholder={placeholder} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    )}
  </div>
);

const Drop: React.FC<{ label: string; hint: string; accept: string; value?: { file: string; url: string; name: string }; onChange: (v: any) => void }> = ({
  label,
  hint,
  accept,
  value,
  onChange,
}) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const take = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      onChange({ ...(await uploadFile(f)), name: f.name });
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };
  const isVideo = value && /\.(mp4|mov|m4v)$/i.test(value.file);
  return (
    <div className="field">
      <label>{label}</label>
      <div
        className={`drop ${over ? 'over' : ''}`}
        onClick={() => (isNative ? pickFromLibrary(accept).then((f) => take(f ?? undefined), (e) => setErr(e?.message ?? String(e))) : ref.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files[0]))}
      >
        {value ? isVideo ? <video src={media(value.url)} muted playsInline /> : <img src={media(value.url)} /> : <div style={{ width: 72, height: 72, borderRadius: 8, background: 'var(--panel2)', display: 'grid', placeItems: 'center', fontSize: 24 }}>{tr("＋")}</div>}
        <div>
          <div>{busy ? tr("アップロード中…") : value ? value.name : isNative ? tr("写真ライブラリから選ぶ") : tr("クリックまたはドラッグ＆ドロップ")}</div>
          <div className="hint">{hint}</div>
          {err ? <div className="err">{err}</div> : null}
        </div>
        <input ref={ref} type="file" accept={accept} hidden onChange={(e) => take(e.target.files?.[0])} />
      </div>
    </div>
  );
};

const Colors: React.FC<{ value: Record<string, string>; labels: Record<string, string>; onChange: (v: Record<string, string>) => void }> = ({ value, labels, onChange }) => (
  <div className="colors">
    {Object.keys(labels).map((k) => (
      <label key={k}>
        <input type="color" value={value[k]} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
        {labels[k]}
      </label>
    ))}
  </div>
);

/** The editor's preview: a still until tapped, then the composition with controls. */
const Preview: React.FC<{ template: TemplateId; props: any; playerRef?: React.RefObject<PlayerRef | null>; controls?: boolean; children?: React.ReactNode }> = ({
  template,
  props,
  playerRef,
  controls = true,
  children,
}) => {
  const t = TEMPLATES[template];
  const frames = Math.max(1, t.frames(props));
  return (
    <div className="player">
      <LivePreview poster={propsPoster(props)}>
      <Player
        ref={playerRef}
        component={t.component}
        inputProps={props}
        durationInFrames={frames}
        fps={FPS}
        compositionWidth={1080}
        compositionHeight={1920}
        style={{ width: '100%', aspectRatio: '9 / 16' }}
        controls={controls}
        loop
        autoPlay
        initiallyMuted
        errorFallback={playerError}
        acknowledgeRemotionLicense
      />
      </LivePreview>
      <Watermark />
      {children}
    </div>
  );
};

// ---------- screens ----------

const STYLE_OPTIONS = [
  { id: 'luxury', name: tr("ラグジュアリー"), note: tr("黒大理石・金色の光") },
  { id: 'clean', name: tr("クリーン"), note: tr("白背景・やわらかい光") },
  { id: 'cosmetic', name: tr("コスメ"), note: tr("ピンク・水しぶき") },
  { id: 'natural', name: tr("ナチュラル"), note: tr("木目・木漏れ日") },
];

const newJobCrumbs = (template: TemplateId, fx?: EffectId, mix?: string) => {
  const it = CATALOG.find((c) => c.key === (fx ?? (mix ? `mix-${mix}` : template)));
  const g = GROUPS.find((x) => x.id === it?.group);
  return [{ label: tr("ホーム"), href: '#/' }, ...(g ? [{ label: g.name, href: `#/?g=${g.id}` }] : []), { label: it?.name ?? TEMPLATES[template].name, href: '#/' }, { label: tr("素材を入れる") }];
};

// ---------- brand kit: saved with the account, filled into every new reel's form ----------

type Brand = { name?: string; handle?: string; color?: string; logo?: string };
let brandLoad: Promise<Brand> | null = null;
const loadBrand = () => (brandLoad ??= DEMO ? Promise.resolve({}) : api<Brand>('/api/me/brand').catch(() => ({})));
const saveBrand = async (b: Brand) => {
  const saved = await api<Brand>('/api/me/brand', { method: 'PUT', body: JSON.stringify(b) });
  brandLoad = Promise.resolve(saved);
  return saved;
};
const hasBrand = (b: Brand | null) => Boolean(b && (b.name || b.handle || b.color || b.logo));
/** Which form field holds the brand name, the handle and the logo, per template (and its length limit). */
const BRAND_FIELDS: Partial<Record<TemplateId, { name?: [string, number]; handle?: boolean; logo?: boolean }>> = {
  ProductShine: { name: ['brand', 16], handle: true },
  ExperienceFilm: { name: ['name', 24], handle: true },
  ServiceReel: { name: ['name', 24], logo: true },
  SaaSPromo: { name: ['name', 20], logo: true },
  PhotoReel: { handle: true },
};
const logoInput = (url?: string) => (url ? { file: url.split('/').pop()!, url, name: tr("ブランドのロゴ") } : undefined);
/** The form with the brand kit filled into the fields that are still empty; the colour always rides along. */
const withBrand = (s: Record<string, any>, b: Brand, t: TemplateId) => {
  const f = BRAND_FIELDS[t] ?? {};
  const x = { ...s };
  if (f.name && b.name && !x[f.name[0]]) x[f.name[0]] = b.name.slice(0, f.name[1]);
  if (f.handle && b.handle && !x.handle) x.handle = b.handle;
  if (f.logo && b.logo && !x.logo) x.logo = logoInput(b.logo);
  if (b.color) x.accent = b.color;
  return x;
};

/** Language the AI writes the video's copy and captions in. Talk videos can keep the spoken language. */
const VideoLang: React.FC<{ template: TemplateId; value: string; onChange: (v: string) => void }> = ({ template, value, onChange }) => {
  const talk = template === 'TalkCaptions' || template === 'EffectsReel' || template === 'FivePass';
  return (
    <div className="field">
      <label>{talk ? tr("字幕の言語") : tr("動画の言語")}</label>
      <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
        {talk ? <option value="">{tr("話している言語のまま")}</option> : null}
        {langs.map((l) => (
          <option key={l} value={l}>
            {LANG_NAMES[l].native}
          </option>
        ))}
      </select>
      {talk && value ? <p className="cost">{tr("話している内容をこの言語に翻訳して字幕にします。")}</p> : null}
    </div>
  );
};

const NewJob: React.FC<{ template: TemplateId; fx?: EffectId; mixArg?: string; tplArg?: string; onStarted: (job: Job) => void; onBack: () => void }> = ({ template, fx, mixArg, tplArg, onStarted, onBack }) => {
  // tplArg is a catalog template ("tpl-<id>"), which is also the key of its sample render.
  const tplId = tplArg?.slice(4);
  const goal = goalOfHash();
  const [input, setInput] = useState<Record<string, any>>({ goal, lang: template === 'TalkCaptions' || template === 'EffectsReel' || template === 'FivePass' ? '' : lang, style: 'luxury', cta: template === 'ExperienceFilm' || template === 'PhotoAdFilm' ? '' : tr("詳しくはプロフィールへ"), effects: fx ? [fx] : [], recipe: (template === 'EffectsReel' && tplId) || mixArg || 'all', templateId: tplId });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: any) => setInput((s) => ({ ...s, [k]: v }));
  const t = TEMPLATES[template];
  // the brand kit fills the name, handle and logo; with none saved yet, offer to keep what is typed here
  const [brand, setBrand] = useState<Brand | null>(null);
  const [remember, setRemember] = useState(true);
  useEffect(() => {
    loadBrand().then((b) => (setBrand(b), setInput((s) => withBrand(s, b, template))));
  }, []);
  const bf = BRAND_FIELDS[template] ?? {};
  // 初回の商品動画は無料: the account's first product ad film costs nothing
  const [freeFirst, setFreeFirst] = useState<Me['freeFirst']>();
  useEffect(() => {
    if (PRODUCT_AD.has(template) && !DEMO) api<Me>('/api/me').then((m) => setFreeFirst(m.freeFirst), () => null);
  }, []);
  const typedBrand: Brand = { name: bf.name ? input[bf.name[0]] || undefined : undefined, handle: bf.handle ? input.handle || undefined : undefined, logo: bf.logo ? input.logo?.url : undefined };
  const offerSave = brand !== null && !hasBrand(brand) && Boolean(typedBrand.name || typedBrand.handle) && !DEMO;
  const ready =
    template === 'ExperienceFilm' ? input.name && input.description : template === 'PhotoAdFilm' ? input.photo && input.brand : template === 'ProductShine' ? input.photo && input.brand && input.name : template === 'SaaSPromo' ? input.desktop && input.name : template === 'ServiceReel' ? input.name && input.description : template === 'PhotoReel' ? input.photo1 : input.video;
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const body: Record<string, any> = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v && typeof v === 'object' ? v.file : v]));
      body.photos = Array.from({ length: 10 }, (_, i) => body[`photo${i + 1}`]).filter(Boolean);
      if (offerSave && remember) await saveBrand({ ...typedBrand, handle: typedBrand.handle?.replace(/^@*/, '@') }).catch(() => null);
      onStarted(await api<Job>('/api/jobs', { method: 'POST', body: JSON.stringify({ template, input: body }) }));
      // In the app: ask once whether to send a notification when it's ready (the reason is obvious right now).
      enablePush(registerPushToken);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div className={`editor ${goal ? 'goalfirst' : ''}`}>
      <div className="stage">
        <div className="player">
          <div style={{ aspectRatio: '9 / 16' }}>
            <ShowVideo k={tplArg ?? fx ?? (mixArg ? `mix-${mixArg}` : template)} controls />
          </div>
        </div>
        <p className="cost" style={{ textAlign: 'center' }}>{tr("このテンプレートで実際に作った見本")}</p>
      </div>
      <div>
        <Crumbs items={newJobCrumbs(template, fx, mixArg)} />
        {goal ? <span className="goaltag">{GOAL_CHOICES.find((g) => g.id === goal)!.name}</span> : null}
        <h1 style={{ marginTop: goal ? 8 : 16 }}>{t.name}</h1>
        <p className="sub">{t.desc}</p>
        <div className="form">
          {template === 'ProductShine' ? (
            <>
              <Drop label={tr("商品写真")} hint={tr("スマホで撮った写真でOK。商品全体が写っているもの")} accept="image/*" value={input.photo} onChange={set('photo')} />
              <div className="grid2">
                <Field label={tr("ブランド名")} max={16} value={input.brand ?? ''} onChange={set('brand')} placeholder="FUJI ASAHIEN" />
                <Field label={tr("商品名")} max={24} value={input.name ?? ''} onChange={set('name')} placeholder={tr("静寂")} />
              </div>
              <Field
                label={tr("商品の特徴（コピーはここに書いたことだけを使います）")}
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder={tr("例: 静岡県産の一番茶、石臼挽き、濃茶向け")}
              />
              <div className="field">
                <label>{tr("撮影スタイル")}</label>
                <div className="chips">
                  {STYLE_OPTIONS.map((s) => (
                    <button key={s.id} className={`chip ${input.style === s.id ? 'on' : ''}`} onClick={() => set('style')(s.id)}>
                      {s.name}
                      <small>{s.note}</small>
                    </button>
                  ))}
                </div>
              </div>
              <label className="check">
                <input type="checkbox" checked={!!input.video} onChange={(e) => set('video')(e.target.checked)} />
                <span>
                  {tr("AI動画クリップを入れる（Veo・8秒）")}
                  <small>{tr("カメラがゆっくり回り込む映像が入り、ぐっと高級感が出ます。生成に1〜3分ほどかかります。")}</small>
                </span>
              </label>
              {input.style === 'cosmetic' && input.video ? (
                <label className="check">
                  <input type="checkbox" checked={!!input.onSkin} onChange={(e) => set('onSkin')(e.target.checked)} />
                  <span>
                    {tr("モデルが使っているシーンにする")}
                    <small>{tr("化粧品向け。AIが生成したモデルが商品を肌にのせる映像になります。")}</small>
                  </span>
                </label>
              ) : null}
              <div className="grid2">
                <Field label={tr("最後のひとこと（CTA）")} max={16} value={input.cta ?? ''} onChange={set('cta')} />
                <Field label={tr("アカウント名")} max={30} value={input.handle ?? ''} onChange={set('handle')} placeholder="@your_brand" />
              </div>
            </>
          ) : template === 'ExperienceFilm' ? (
            <>
              <div className="grid2">
                <Field label={tr("お店・ブランドの名前")} max={24} value={input.name ?? ''} onChange={set('name')} placeholder="Rinrin Cycling Kyoto" />
                <Field label={tr("場所")} max={40} value={input.place ?? ''} onChange={set('place')} placeholder={tr("例: 京都・嵐山")} />
              </div>
              <Field
                label={tr("どんな体験か")}
                multiline
                value={input.description ?? ''}
                onChange={set('description')}
                placeholder={tr("例: 早朝の京都を少人数で巡るガイド付きサイクリング。路地、鴨川、竹林を走り、最後は高台から街を見渡す")}
              />
              <Field
                label={tr("所要時間・料金・人数など（最後の画面ではここに書いたことだけを使います）")}
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder={tr("例: 約3時間、1名12,000円、英語ガイド、最大6名")}
              />
              <div className="photodrops">
                {Array.from({ length: Math.min(6, Object.keys(input).filter((k) => /^photo\d+$/.test(k) && input[k]).length + 1) }, (_, i) => (
                  <Drop key={i} label={tr("写真・動画{0}（任意）", i + 1)} hint={tr("実際の場所や体験の様子")} accept="image/*,video/*" value={input[`photo${i + 1}`]} onChange={set(`photo${i + 1}`)} />
                ))}
              </div>
              <p className="cost">{tr("写真や動画がなくても作れます。あれば実際の場所・人として映像に使い、足りない場面をAIが同じ雰囲気で撮り下ろします。")}</p>
              <div className="grid2">
                <Field label={tr("予約先（URL・電話など、任意）")} max={40} value={input.url ?? ''} onChange={set('url')} placeholder="rinrin-cycling.jp" />
                <Field label={tr("最後のひとこと（CTA、任意）")} max={16} value={input.cta ?? ''} onChange={set('cta')} placeholder={tr("空き枠を見る")} />
              </div>
              <Field label={tr("アカウント名（任意）")} max={30} value={input.handle ?? ''} onChange={set('handle')} placeholder="@your_account" />
              <p className="cost">{tr("AIが5つの場面（つかみ・到着・体験・五感・いちばんの景色）を映像にし、音楽を作って短編映画に仕上げます。生成に3〜6分ほどかかります。")}</p>
            </>
          ) : template === 'PhotoAdFilm' ? (
            <>
              <Drop label={tr("商品の写真（1枚）")} hint={tr("スマホで撮った写真で大丈夫です。ラベルが読めるように")} accept="image/*" value={input.photo} onChange={set('photo')} />
              <div className="grid2">
                <Field label={tr("ブランド名")} max={24} value={input.brand ?? ''} onChange={set('brand')} placeholder="LUMINA" />
                <Field label={tr("どんな商品か（任意）")} max={60} value={input.description ?? ''} onChange={set('description')} placeholder={tr("例: 化粧水")} />
              </div>
              <Field
                label={tr("言ってよいこと（任意。コピーはここに書いたことだけを使います）")}
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder={tr("例: 150mL、無香料")}
              />
              <div className="grid2">
                <Field label={tr("最後のひとこと（CTA、任意）")} max={16} value={input.cta ?? ''} onChange={set('cta')} placeholder={tr("詳しく見る")} />
                <Field label={tr("アカウント名（任意）")} max={30} value={input.handle ?? ''} onChange={set('handle')} placeholder="@your_brand" />
              </div>
              <p className="cost">{tr("AIが5つの場面（液体が流れ落ちる・質感のアップ・肌にのる瞬間・モデルが使う・商品カット）を映像にし、音楽を作って広告動画に仕上げます。生成に3〜5分ほどかかります。")}</p>
            </>
          ) : template === 'PhotoReel' ? (
            <>
              <div className="photodrops">
                {Array.from({ length: Math.min(10, Object.keys(input).filter((k) => /^photo\d+$/.test(k) && input[k]).length + 1) }, (_, i) => (
                  <Drop key={i} label={tr("写真{0}", i + 1)} hint={i ? tr("任意") : tr("1枚目は必須")} accept="image/*" value={input[`photo${i + 1}`]} onChange={set(`photo${i + 1}`)} />
                ))}
              </div>
              <p className="cost">{tr("写真は10枚まで。順番はAIが見やすく並べ替えます。")}</p>
              <Field label={tr("どんな写真か（任意）")} multiline value={input.description ?? ''} onChange={set('description')} placeholder={tr("例: 京都の週末旅行。カフェと紅葉")} />
              <Field label={tr("アカウント名（任意）")} max={30} value={input.handle ?? ''} onChange={set('handle')} placeholder="@your_account" />
            </>
          ) : template === 'ServiceReel' ? (
            <>
              <div className="grid2">
                <Field label={tr("サービス名・お店の名前")} max={24} value={input.name ?? ''} onChange={set('name')} placeholder="Salon Mirai" />
                <Field label={tr("URL（任意）")} max={40} value={input.url ?? ''} onChange={set('url')} placeholder="salon-mirai.jp" />
              </div>
              <Field label={tr("どんなサービスか")} multiline value={input.description ?? ''} onChange={set('description')} placeholder={tr("例: 渋谷の美容室。くせ毛を活かすカットが得意")} />
              <Field
                label={tr("数字・料金・お客様の声・キャンペーン（動画ではここに書いたことだけを使います）")}
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder={tr("例: リピート率92%、カット 6,600円、初回20%オフ")}
              />
              <div className="grid2">
                <Drop label={tr("スマホ画面（任意）")} hint={tr("アプリやサイトのスクリーンショット")} accept="image/*" value={input.phone} onChange={set('phone')} />
                <Drop label={tr("PC画面（任意）")} hint={tr("サイトや管理画面のスクリーンショット")} accept="image/*" value={input.desktop} onChange={set('desktop')} />
              </div>
              <div className="grid2">
                {[1, 2, 3, 4].map((n) => (
                  <Drop key={n} label={tr("写真{0}（任意）", n)} hint={tr("お店・商品・人の写真")} accept="image/*" value={input[`photo${n}`]} onChange={set(`photo${n}`)} />
                ))}
              </div>
              <Drop label={tr("ロゴ（任意）")} hint={tr("透過PNGがおすすめ")} accept="image/*" value={input.logo} onChange={set('logo')} />
            </>
          ) : template === 'SaaSPromo' ? (
            <>
              <Drop label={tr("PC画面のスクリーンショット")} hint={tr("サービスのトップや管理画面など")} accept="image/*" value={input.desktop} onChange={set('desktop')} />
              <Drop label={tr("スマホ画面のスクリーンショット（任意）")} hint={tr("あるとスマホのモックアップも動きます")} accept="image/*" value={input.mobile} onChange={set('mobile')} />
              <Drop label={tr("ロゴ（任意）")} hint={tr("透過PNGがおすすめ")} accept="image/*" value={input.logo} onChange={set('logo')} />
              <div className="grid2">
                <Field label={tr("サービス名")} max={20} value={input.name ?? ''} onChange={set('name')} placeholder="Lumina" />
                <Field label="URL" max={40} value={input.url ?? ''} onChange={set('url')} placeholder="lumina.app" />
              </div>
              <Field label={tr("どんなサービスか")} multiline value={input.description ?? ''} onChange={set('description')} placeholder={tr("例: 写真1枚から広告リールを自動で作るSNS運用ツール")} />
              <Field
                label={tr("実績の数字（動画で使う数字はここからだけ）")}
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder={tr("例: 総再生回数 9939万回、総フォロワー 377万人、導入社数 120社")}
              />
            </>
          ) : (
            <>
              <Drop label={tr("トーク動画")} hint={tr("3分以内のMP4 / MOV。縦でも横でもOK")} accept="video/*" value={input.video} onChange={set('video')} />
              {template === 'EffectsReel' ? <MixPicker value={input.recipe} onChange={set('recipe')} /> : null}
              <p className="cost">
                {template === 'FivePass'
                  ? tr("まず文字起こしだけを行います。そのあと編集画面で、切り抜き → 字幕 → 演出 → 音を1工程ずつ確認しながら進めます。")
                  : template === 'EffectsReel'
                  ? tr("文字起こし → 人物の切り抜き → 話の内容に合わせて、選んだミックスの中でカットごとにエフェクト・字幕・カメラ・切り替えを組み合わせます。")
                  : tr("文字起こし → 無音・言い淀み（えー、あの）のカット → 単語ごとのテロップまで自動で行います。")}
              </p>
            </>
          )}
          <VideoLang template={template} value={input.lang} onChange={set('lang')} />
          {hasBrand(brand) ? (
            <p className="brandnote">
              {brand!.color ? <i style={{ background: brand!.color }} /> : null}
              {tr("ブランドキットの内容を入れています")} <a href="#/me">{tr("変更")}</a>
            </p>
          ) : null}
          {offerSave ? (
            <label className="check brandsave">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>
                {tr("次回から自動で入れる")}
                <small>{tr("名前とアカウント名をブランドキットに保存します。アカウントのページでいつでも変えられます。")}</small>
              </span>
            </label>
          ) : null}
          <div className="actions">
            <button className="btn" disabled={!ready || busy || !!DEMO} onClick={submit}>
              {busy ? tr("送信中…") : input.video && template !== 'ProductShine' ? tr("作成する") : tr("AIで作成する")}
            </button>
            <span className="cost">
              {freeFirst === 'available' ? (
                <>
                  {tr("消費:")} <s>{fmtN(tokensFor(template, input))}</s> <b>0{tr("トークン")}</b> <span className="freefirst">{tr("初回の商品動画は無料")}</span>
                </>
              ) : (
                <>
                  {tr("消費:")}{' '}<b>{fmtN(tokensFor(template, input))}{tr("トークン")}</b>
                </>
              )}
            </span>
          </div>
          {freeFirst === 'needs_phone' ? <p className="cost">{tr("初回の商品動画は無料です。アカウントのページで電話番号を確認すると使えます。")}</p> : null}
          {err ? <div className="err">{err}</div> : null}
          {DEMO ? <div className="warn">{DEMO_BLOCKED}</div> : null}
        </div>
      </div>
    </div>
  );
};

const useJob = (id: string) => {
  const [job, setJob] = useState<Job | null>(null);
  const [nonce, refresh] = useState(0);
  useEffect(() => {
    let alive = true;
    let timer: any;
    const tick = async () => {
      try {
        const j = await api<Job>(`/api/jobs/${id}`);
        if (!alive) return;
        setJob((prev) => (prev && prev.props && j.props && prev.status === j.status ? { ...j, props: prev.props } : j));
        if (j.status === 'generating' || j.status === 'rendering') timer = setTimeout(tick, 1500);
      } catch {
        timer = setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, nonce]);
  return [job, setJob, () => refresh((n) => n + 1)] as const;
};

/** Rough seconds each generation step takes, for the progress bar and the time-left estimate. */
const STEP_SECONDS: Record<string, number> = {
  'cut-out': 15,
  'studio shot': 25,
  'plan and copy': 15,
  'motion clip (Veo)': 120,
  'on-skin model shot': 120,
  'build props': 5,
  render: 5,
  'copy and layout': 25,
  audio: 5,
  transcribe: 30,
  matte: 150,
  'plan effects': 20,
  'scene stills': 45,
};

/** Re-renders every second while something is running, so bars and countdowns move. */
const useNow = (on: boolean) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
};

const timeLeft = (sec: number) =>
  sec < 15 ? tr("まもなく完了") : sec < 60 ? tr("あと1分以内") : tr("あと約{0}分", Math.ceil(sec / 60));

/** A horizontal bar with the percentage and the time left underneath. */
const ProgressBar: React.FC<{ fraction: number; label: string; left: number }> = ({ fraction, label, left }) => {
  const pct = Math.max(2, Math.min(99, Math.round(fraction * 100)));
  return (
    <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
      <div className="progresshead">
        <b>{label}</b>
        <span>{pct}%</span>
      </div>
      <div className="bar">
        <div style={{ width: `${pct}%` }} />
      </div>
      <div className="cost">{timeLeft(left)}</div>
    </div>
  );
};

const Generating: React.FC<{ job: Job }> = ({ job }) => {
  const steps =
    job.template === 'ExperienceFilm'
      ? ['plan and copy', 'scene stills', 'motion clip (Veo)', 'build props']
      : job.template === 'PhotoAdFilm'
      ? ['plan', 'keyframes', 'motion (Omni) and music', 'build props']
      : job.template === 'ProductShine'
      ? ['cut-out', 'studio shot', 'plan and copy', ...(jobTokens(job) >= 12 ? ['motion clip (Veo)'] : []), 'build props']
      : job.template === 'SaaSPromo'
        ? ['copy and layout', 'build props']
        : job.template === 'ServiceReel' || job.template === 'PhotoReel'
          ? ['copy', 'music']
        : job.template === 'EffectsReel'
          ? ['audio', 'transcribe', 'matte', 'plan effects']
          : ['audio', 'transcribe', 'build props'];
  const cur = job.step?.label;
  const norm = (l?: string) => (l === 'on-skin model shot' ? 'motion clip (Veo)' : l === 'render' ? 'build props' : l);
  const curIdx = Math.max(0, steps.indexOf(norm(cur) ?? ''));
  const now = useNow(true);
  // Time left = what remains of the current step (by its usual length) + the usual length of the steps after it.
  const inStep = job.step?.at ? (now - Date.parse(job.step.at)) / 1000 : 0;
  const curSec = STEP_SECONDS[steps[curIdx]] ?? 20;
  const left = Math.max(5, curSec - inStep) + steps.slice(curIdx + 1).reduce((a, s) => a + (STEP_SECONDS[s] ?? 20), 0);
  const elapsed = Math.max(1, (now - Date.parse(job.createdAt)) / 1000);
  return (
    <div className="genwrap">
      <BackButton fallback="#/reels" />
      <h1>{tr("AIが作成しています")}</h1>
      <p className="sub">{tr("このページを閉じても作成は続きます。履歴からいつでも開けます。")}</p>
      <ProgressBar fraction={elapsed / (elapsed + left)} label={STEP_LABELS[steps[curIdx]] ?? tr("準備中")} left={left} />
      <div className="steps">
        {steps.map((s, i) => (
          <div key={s} className={i < curIdx ? 'done' : i === curIdx ? 'cur' : ''}>
            <span>{i < curIdx ? '✓' : i === curIdx ? '●' : '○'}</span>
            <span>{STEP_LABELS[s]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const RenderProgress: React.FC<{ job: Job }> = ({ job }) => {
  const now = useNow(true);
  const p = job.renderProgress ?? 0;
  const spent = job.renderStartedAt ? (now - Date.parse(job.renderStartedAt)) / 1000 : 0;
  // Until a few percent are done there is nothing to extrapolate from, so assume about a minute.
  const left = p > 0.05 ? (spent / p) * (1 - p) : Math.max(10, 60 - spent);
  return <ProgressBar fraction={p} label={tr("書き出し中…")} left={left} />;
};

/**
 * Save to Photos or post to Instagram / TikTok through the phone's share sheet (Web Share API with a file).
 * iOS only opens the sheet straight from a tap, so the file is fetched ahead of time; where sharing files
 * isn't supported (most desktops) it falls back to a plain download.
 */
const ShareButton: React.FC<{ job: Job; compact?: boolean }> = (p) => (isNative ? <NativeShare {...p} /> : <WebShare {...p} />);

/** In the app: save straight to the camera roll, or open the share sheet (Instagram, TikTok…) with the file. */
const NativeShare: React.FC<{ job: Job; compact?: boolean }> = ({ job, compact }) => {
  const url = media(job.video!);
  const name = `${job.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'reel'}-${job.id.slice(-6)}.mp4`;
  const [busy, setBusy] = useState<'' | 'save' | 'share'>('');
  const [msg, setMsg] = useState('');
  const run = (what: 'save' | 'share') => async () => {
    setBusy(what);
    setMsg('');
    try {
      if (what === 'save') {
        await saveToCameraRoll(url, name);
        setMsg(tr("カメラロールに保存しました。"));
      } else await shareVideo(url, name, job.title);
    } catch (e: any) {
      const m = String(e?.message ?? e);
      setMsg(/denied|permission|access/i.test(m) ? tr("写真へのアクセスが許可されていません。設定アプリで Editless の「写真」を許可してください。") : m);
    }
    setBusy('');
  };
  if (compact)
    return (
      <button onClick={run('share')} disabled={!!busy} aria-label={tr("保存・共有")}>
        <span>⇪</span>
        {busy ? tr("準備中…") : tr("保存・共有")}
        {msg ? <small style={{ maxWidth: 120 }}>{msg}</small> : null}
      </button>
    );
  return (
    <>
      <button className="btn" onClick={run('save')} disabled={!!busy}>
        {busy === 'save' ? tr("保存中…") : tr("カメラロールに保存")}
      </button>
      <button className="btn ghost" onClick={run('share')} disabled={!!busy}>
        {busy === 'share' ? tr("準備中…") : tr("InstagramやTikTokに共有")}
      </button>
      {msg ? <p className="cost" style={{ width: '100%', textAlign: 'center', margin: 0 }}>{msg}</p> : null}
    </>
  );
};

const WebShare: React.FC<{ job: Job; compact?: boolean }> = ({ job, compact }) => {
  const url = media(job.video!);
  const name = `${job.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'reel'}.mp4`;
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState('');
  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([], 'x.mp4', { type: 'video/mp4' })] });
  const load = useCallback(async () => {
    const b = await fetch(url, { headers: authHeader() }).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.statusText))));
    const f = new File([b], name, { type: 'video/mp4' });
    setFile(f);
    return f;
  }, [url]);
  useEffect(() => {
    if (canShareFiles && !compact && !DEMO) load().catch(() => setMsg(tr("動画を読み込めませんでした。もう一度タップしてください。")));
  }, [load]);
  const share = async () => {
    setMsg('');
    if (!canShareFiles || DEMO) return void window.open(url, '_blank');
    try {
      const f = file ?? (await load());
      await navigator.share({ files: [f], title: job.title });
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      // The tap "expired" while the file downloaded (iOS); it is ready now, so one more tap works.
      setMsg(e?.name === 'NotAllowedError' ? tr("準備ができました。もう一度タップしてください。") : e?.message ?? String(e));
    }
  };
  if (compact)
    return (
      <button onClick={share} aria-label={tr("保存・共有")}>
        <span>⇪</span>
        {tr("保存・共有")}
        {msg ? <small style={{ maxWidth: 120 }}>{msg}</small> : null}
      </button>
    );
  return (
    <>
      <button className="btn" onClick={share} disabled={canShareFiles && !file && !DEMO && !msg}>
        {canShareFiles ? (file ? tr("写真に保存・SNSで共有") : tr("準備中…")) : tr("ダウンロード")}
      </button>
      {canShareFiles ? <p className="cost" style={{ width: '100%', textAlign: 'center', margin: 0 }}>{tr("「ビデオを保存」で写真アプリへ。InstagramやTikTokを選ぶとそのまま投稿できます。")}</p> : null}
      {msg ? <p className="cost" style={{ width: '100%', textAlign: 'center', margin: 0 }}>{msg}</p> : null}
    </>
  );
};

// ---------- 投稿文: caption, hashtags and when to post, for a finished reel (free) ----------

type PostKitData = { caption: string; hashtags: string[]; when: { day: string; time: string; why: string } };

/** Copies text; the iPhone app's web view may lack the async clipboard, so a hidden textarea is the fallback. */
const copyText = async (t: string) => {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, t.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
};

const CopyButton: React.FC<{ text: string; label?: string; big?: boolean }> = ({ text, label, big }) => {
  const [done, setDone] = useState(false);
  return (
    <button className={`btn ${big ? '' : 'small'} ghost pkcopy ${done ? 'done' : ''}`} onClick={async () => (await copyText(text)) && (setDone(true), setTimeout(() => setDone(false), 1800))}>
      {done ? tr("コピーしました") : (label ?? tr("コピー"))}
    </button>
  );
};

/** The 投稿文 card under a finished reel: written once by the AI, kept with the reel, copied with one tap. */
const PostKit: React.FC<{ job: Job }> = ({ job }) => {
  const [kit, setKit] = useState<PostKitData | null>((job as { postkit?: Record<string, PostKitData> }).postkit?.[lang] ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = async (fresh = false) => {
    setBusy(true);
    setErr('');
    try {
      setKit(await api<PostKitData>(`/api/jobs/${job.id}/postkit`, { method: 'POST', body: JSON.stringify({ lang, fresh }) }));
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };
  useEffect(() => {
    if (!kit && !DEMO) load();
  }, [job.id]);
  const tags = kit?.hashtags.join(' ') ?? '';
  return (
    <section className="postkit" aria-busy={busy}>
      <div className="pkhead">
        <span>
          <b>{tr("投稿文")}</b>
          <small>{tr("AIが書きました・無料")}</small>
        </span>
        {kit ? (
          <button className="linkbtn" disabled={busy} onClick={() => load(true)}>
            {busy ? tr("書いています…") : tr("別の文にする")}
          </button>
        ) : null}
      </div>
      {!kit ? (
        busy ? (
          <div className="pkwait">
            <i className="gspin" /> {tr("キャプションとハッシュタグを書いています…")}
          </div>
        ) : (
          <button className="btn small" onClick={() => load()} disabled={!!DEMO}>
            {tr("投稿文を作る")}
          </button>
        )
      ) : (
        <>
          <div className="pkblock">
            <p className="pkcaption">{kit.caption}</p>
            <CopyButton text={kit.caption} />
          </div>
          <div className="pkblock">
            <div className="pktags">
              {kit.hashtags.map((h) => (
                <span key={h}>{h}</span>
              ))}
            </div>
            <CopyButton text={tags} />
          </div>
          <div className="pkwhen">
            <Glyph d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" size={18} />
            <div>
              <b>{tr("おすすめの投稿時間")}</b>
              <span>
                {kit.when.day} · {kit.when.time}
              </span>
              <small>{kit.when.why}</small>
            </div>
          </div>
          <CopyButton big text={`${kit.caption}\n\n${tags}`} label={tr("キャプションとハッシュタグをまとめてコピー")} />
        </>
      )}
      {err ? <p className="err">{err}</p> : null}
    </section>
  );
};

/**
 * 高画質・高音質で書き出す: off by default, HQ_TOKENS more for the export it is on for. Also says plainly that the
 * previews in the app play a lighter copy and the export is made from the full footage.
 */
const HqOption: React.FC<{ on: boolean; set: (on: boolean) => void }> = ({ on, set }) => (
  <>
    <label className={`hqopt ${on ? 'on' : ''}`}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>
        <b>
          {tr("高画質・高音質で書き出す")} <small className="tokcost">{tr("＋{0}トークン", HQ_TOKENS)}</small>
        </b>
        <small>{tr("ビットレートを上げて細部まで鮮明に書き出します。声は雑音を抑え、聞き取りやすいスタジオ風の音に整えます。")}</small>
      </span>
    </label>
    <p className="cost" style={{ width: '100%', margin: '0 0 6px' }}>{tr("アプリ内のプレビューは軽い画質で再生しています。書き出す動画は元の映像から作ります。")}</p>
  </>
);

/** Tokens this reel used. Cost figures stay server-side (usage.json) and are never shown to customers. */
const Cost: React.FC<{ job: Job }> = ({ job }) => <p className="cost">{tr("このリールで使ったトークン:")}{' '}{fmtN(jobTokens(job))}</p>;

const Editor: React.FC<{ id: string }> = ({ id }) => {
  const [job, setJob, refreshJob] = useJob(id);
  const [props, setProps] = useState<any>(null);
  const [saveErr, setSaveErr] = useState('');
  const [saved, setSaved] = useState(true);
  const playerRef = useRef<PlayerRef | null>(null);
  const dirty = useRef(false);
  const side = useRef<HTMLDivElement>(null);
  usePanelAccordion(side);
  // EffectsReel opens on the pick flow; the detailed panels are one tap away.
  const [advanced, setAdvanced] = useState(false);
  // 高画質・高音質で書き出す (off unless chosen for this export)
  const [hq, setHq] = useState(false);

  useEffect(() => {
    if (job?.props && !props) setProps(job.props);
  }, [job?.props]);
  // 5-pass edit: each pass (or rollback) replaces the props on the server.
  useEffect(() => {
    if (job?.template === 'FivePass' && job.status === 'ready' && job.props) setProps(job.props);
  }, [job?.status, job?.props?.pass, JSON.stringify(job?.versions)]);
  const runPass = async (pass: number, note?: string) => {
    try {
      setJob(await api<Job>(`/api/jobs/${id}/pass`, { method: 'POST', body: JSON.stringify({ pass, note }) }));
      refreshJob();
    } catch (e: any) {
      setSaveErr(e.message);
    }
  };
  const restore = async (pass: number, version: number) => {
    try {
      const j = await api<Job>(`/api/jobs/${id}/restore`, { method: 'POST', body: JSON.stringify({ pass, version }) });
      setJob(j);
      setProps(j.props);
    } catch (e: any) {
      setSaveErr(e.message);
    }
  };

  // Save edits shortly after the user stops typing.
  useEffect(() => {
    if (!props || !dirty.current) return;
    setSaved(false);
    const t = setTimeout(async () => {
      try {
        const j = await api<Job>(`/api/jobs/${id}/props`, { method: 'PUT', body: JSON.stringify({ props }) });
        setJob((prev) => (prev ? { ...prev, status: j.status, error: undefined } : prev));
        setSaveErr('');
        setSaved(true);
      } catch (e: any) {
        setSaveErr(e.message);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [props]);

  const update = useCallback((fn: (p: any) => any) => {
    dirty.current = true;
    setProps((p: any) => fn(structuredClone(p)));
  }, []);

  if (!job) return <div className="genwrap"><BackButton fallback="#/reels" /><p className="sub">{tr("読み込み中…")}</p></div>;
  if (job.status === 'generating' && !(job.template === 'FivePass' && props)) return <Generating job={job} />;
  if (job.status === 'error' && !job.props)
    return (
      <div className="genwrap">
        <BackButton fallback="#/reels" />
        <h1>{tr("作成できませんでした")}</h1>
        <p className="err">{job.error}</p>
      </div>
    );
  if (!props) return null;

  const render = async () => {
    try {
      const j = await api<Job>(`/api/jobs/${id}/render`, { method: 'POST', body: JSON.stringify({ hq }) });
      setJob({ ...j, props });
      refreshJob();
    } catch (e: any) {
      setSaveErr(e.message);
    }
  };

  if (job.template === 'ExperienceFilm' && !advanced)
    return <FilmPick job={job} p={props} update={update} saved={saved} err={saveErr || job.error} onRender={render} onAdvanced={() => setAdvanced(true)} />;
  if (job.template === 'EffectsReel' && !advanced)
    return <PickFlow job={job} p={props} update={update} saved={saved} err={saveErr || job.error} hq={hq} setHq={setHq} onRender={render} onAdvanced={() => setAdvanced(true)} />;

  const t = TEMPLATES[job.template];
  const isTalk = job.template === 'TalkCaptions';
  return (
    <div className="editor">
      <div className="stage">
        {isTalk ? <TalkStage props={props} update={update} playerRef={playerRef} /> : <Preview template={job.template} props={props} playerRef={playerRef} />}
        <div className="actions" style={{ justifyContent: 'center' }}>
          {job.status === 'rendering' ? (
            <div style={{ width: '100%' }}>
              <RenderProgress job={job} />
            </div>
          ) : (
            <>
              <HqOption on={hq} set={setHq} />
              <button className={`btn ${job.status === 'done' && job.video ? 'ghost' : ''}`} disabled={!saved || !!DEMO || (job.template === 'FivePass' && props.pass < 5)} onClick={render} title={DEMO ? DEMO_BLOCKED : job.template === 'FivePass' && props.pass < 5 ? tr("5つの工程が終わると書き出せます") : undefined}>
                {tr("動画を書き出す")} <small className="tokcost">{tr("{0}トークン", exportCost(job, props as { overlays?: unknown[] }, hq))}</small>
              </button>
              {job.status === 'done' && job.video ? <ShareButton job={job} /> : null}
            </>
          )}
        </div>
        {job.status === 'done' && job.video ? <p className="cost ok" style={{ textAlign: 'center' }}>{tr("書き出し完了。編集すると再書き出しできます。")}</p> : null}
        {job.status === 'done' && job.video ? <PostKit job={job} /> : null}
        {job.error ? <p className="err">{job.error}</p> : null}
        {saveErr ? <p className="err">{saveErr}</p> : null}
      </div>
      <div ref={side}>
        <Crumbs items={[{ label: tr("リール"), href: '#/reels' }, { label: t.name, href: '#/reels' }, { label: job.title }]} />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span className="tag">{t.name}</span>
            <h1>{job.title}</h1>
          </div>
          <span className={`pill save ${saved ? '' : 'busy'}`}>{saved ? tr("保存済み") : tr("保存中…")}</span>
        </div>
        <Cost job={job} />
        {job.template === 'EffectsReel' || job.template === 'ExperienceFilm' ? (
          <button className="btn small ghost" style={{ marginTop: 8 }} onClick={() => setAdvanced(false)}>
            {tr("かんたんに選ぶ画面に戻る")}
          </button>
        ) : null}
        <div style={{ height: 16 }} />
        {job.template === 'ProductShine' ? (
          <ProductPanel p={props} update={update} />
        ) : job.template === 'ExperienceFilm' ? (
          <ExperiencePanel p={props} update={update} />
        ) : job.template === 'PhotoAdFilm' ? (
          <PhotoAdPanel p={props} update={update} />
        ) : job.template === 'SaaSPromo' ? (
          <SaasPanel p={props} update={update} />
        ) : job.template === 'ServiceReel' ? (
          <ServicePanel p={props} update={update} />
        ) : job.template === 'PhotoReel' ? (
          <PhotoPanel p={props} update={update} />
        ) : job.template === 'EffectsReel' ? (
          <EffectsPanel p={props} update={update} playerRef={playerRef} />
        ) : job.template === 'FivePass' ? (
          <FivePassPanel job={job} p={props} update={update} onRun={runPass} onRestore={restore} />
        ) : (
          <TalkPanel p={props} update={update} playerRef={playerRef} />
        )}
      </div>
    </div>
  );
};

// ---------- 5-pass edit (director mode) ----------

const PASSES = [
  { name: tr("文字起こし"), what: tr("話した言葉とその時間をすべて拾います。言葉は下で直せます。") },
  { name: tr("切り抜き"), what: tr("人物をふちのやわらかい切り抜きにして、背景と分けます。") },
  { name: tr("字幕"), what: tr("1〜3語ずつ、大事な言葉を大きく見せる字幕を付けます。") },
  { name: tr("演出"), what: tr("話の流れに合わせて、カードや数字のシーンを差し込みます。") },
  { name: tr("音"), what: tr("効果音を置き、音量をそろえて書き出せる状態にします。") },
];

const FivePassPanel: React.FC<{ job: Job; p: FivePassProps; update: PanelProps<FivePassProps>['update']; onRun: (pass: number, note?: string) => void; onRestore: (pass: number, version: number) => void }> = ({
  job,
  p,
  update,
  onRun,
  onRestore,
}) => {
  const [note, setNote] = useState('');
  const [wordsEdited, setWordsEdited] = useState(false);
  const running = job.status === 'generating';
  const runningPass = running ? Number(job.step?.label.replace('pass ', '')) : 0;
  const cur = p.pass;
  const latest = job.versions?.[cur] ?? 1;
  const notes = p.notes.filter((n) => n.pass === cur);
  const go = (pass: number, withNote?: string) => {
    onRun(pass, withNote);
    setNote('');
    setWordsEdited(false);
  };
  return (
    <>
      <div className="panel">
        <ol className="stepper">
          {PASSES.map((ps, i) => {
            const n = i + 1;
            const state = runningPass === n ? 'run' : n < cur ? 'done' : n === cur ? 'cur' : '';
            return (
              <li key={n} className={state}>
                <span className="dot">{state === 'done' ? '✓' : String(n).padStart(2, '0')}</span>
                <span className="lbl">{ps.name}</span>
              </li>
            );
          })}
        </ol>
        <div className="passhead">
          <span className="tag">PASS {String(cur).padStart(2, '0')} / 05</span>
          <b>{PASSES[cur - 1].name}</b>
        </div>
        <p className="cost">{PASSES[cur - 1].what}</p>
        {running ? (
          <div className="passrun">
            <span className="spin" aria-hidden />
            {tr("パス{0}（{1}）を実行しています…", String(runningPass).padStart(2, '0'), PASSES[runningPass - 1]?.name ?? '')}
          </div>
        ) : (
          <>
            {cur > 1 ? (
              <div className="field">
                <label>{tr("直してほしいこと（このパスを作り直すときにAIへ伝えます）")}</label>
                <textarea className="input" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={tr("例: 字幕をもっと大きく、2語ずつに")} />
              </div>
            ) : null}
            <div className="row">
              {cur > 1 ? (
                <button className="btn ghost" disabled={!!DEMO} onClick={() => go(cur, note)}>
                  {tr("このパスを作り直す")}
                </button>
              ) : null}
              {cur < 5 ? (
                <button className="btn" disabled={!!DEMO} onClick={() => go(cur + 1)}>
                  {tr("次のパスへ")} → {PASSES[cur].name}
                </button>
              ) : (
                <span className="cost ok">{tr("5つの工程が終わりました。上の「MP4を書き出す」で書き出せます。")}</span>
              )}
            </div>
            {latest > 1 ? (
              <div className="versions">
                <span className="cost">{tr("このパスの版")}</span>
                {Array.from({ length: latest }, (_, i) => i + 1).map((v) => (
                  <button key={v} className="fchip" disabled={!!DEMO} onClick={() => onRestore(cur, v)} title={tr("この版に戻す")}>
                    v{v}
                  </button>
                ))}
              </div>
            ) : null}
            {notes.length ? (
              <ul className="notes">
                {notes.map((n, i) => (
                  <li key={i}>
                    <span className="tag">v{n.version + 1}</span> {n.text}
                  </li>
                ))}
              </ul>
            ) : null}
            {DEMO ? <p className="warn">{DEMO_BLOCKED}</p> : null}
          </>
        )}
      </div>
      <div className="panel">
        <h2>{tr("話した言葉")}</h2>
        <p className="cost">{tr("聞き間違いはここで直せます。直したあとは、字幕から先を作り直すと反映されます。")}</p>
        <div className="wordedit">
          {p.words.map((w, i) => (
            <input
              key={i}
              className="word"
              value={w.text}
              style={{ width: `${[...w.text].reduce((n, c) => n + (c.charCodeAt(0) > 0x2e80 ? 1 : 0.6), 0) + 1.2}em` }}
              title={`${w.start.toFixed(1)}s`}
              onChange={(e) => {
                const v = e.target.value;
                setWordsEdited(true);
                update((x) => void (x.words[i].text = v));
              }}
            />
          ))}
        </div>
        {wordsEdited && cur >= 3 && !running ? (
          <div className="warn" style={{ marginTop: 10 }}>
            {tr("言葉を直しました。字幕・演出・音（03〜05）を作り直しますか？")}{' '}
            <button className="btn small" onClick={() => go(3)}>
              {tr("03から作り直す")}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
};

type PanelProps<P> = { p: P; update: (fn: (p: P) => P | void) => void };
const mut =
  <P,>(update: PanelProps<P>['update'], fn: (p: P) => void) =>
  () =>
    update((p) => (fn(p), p));

const ProductPanel: React.FC<PanelProps<ProductShineProps>> = ({ p, update }) => {
  const set = (fn: (p: ProductShineProps) => void) => mut(update, fn)();
  return (
    <>
      <div className="panel">
        <h2>{tr("テキスト")}</h2>
        <div className="form" style={{ maxWidth: 'none' }}>
          <div className="grid2">
            <Field label={tr("ブランド名")} max={16} value={p.brand} onChange={(v) => set((x) => void (x.brand = v))} />
            <Field label={tr("商品名")} max={24} value={p.productName} onChange={(v) => set((x) => void (x.productName = v))} />
          </div>
          <Field label={tr("キャッチコピー")} max={22} value={p.tagline} onChange={(v) => set((x) => void (x.tagline = v))} />
          <div className="grid2">
            <Field label="CTA" max={16} value={p.cta} onChange={(v) => set((x) => void (x.cta = v))} />
            <Field label={tr("アカウント名")} max={30} value={p.handle} onChange={(v) => set((x) => void (x.handle = v))} />
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>{tr("ディテールのアップ（3カット）")}</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.details.map((d, i) => (
            <div key={i} className="grid2">
              <Field label={tr("{0}. 英字ラベル", i + 1)} max={24} value={d.kicker} onChange={(v) => set((x) => void (x.details[i].kicker = v))} />
              <Field label={tr("{0}. 見出し", i + 1)} max={14} value={d.title} onChange={(v) => set((x) => void (x.details[i].title = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("色とテンポ")}</h2>
        <Colors
          value={p.palette}
          labels={{ accent: tr("アクセント"), glow: tr("光"), base: tr("背景") }}
          onChange={(v) => set((x) => void (x.palette = v as any))}
        />
        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>{tr("テンポ（BPM）")}</span>
            <span>{p.bpm}</span>
          </label>
          <input type="range" min={90} max={150} value={p.bpm} onChange={(e) => set((x) => void (x.bpm = Number(e.target.value)))} />
        </div>
        {p.clip !== undefined ? (
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={!!p.clip} onChange={(e) => set((x) => void (e.target.checked ? null : delete x.clip))} disabled={!p.clip} />
            <span>{tr("AI動画クリップを使う")}</span>
          </label>
        ) : null}
      </div>
    </>
  );
};

// ---------- experience film: whole-film takes to pick from, then the text ----------

type FilmOpt = { id: string; name: string; note?: string; swatch?: string; apply: (x: ExperienceFilmProps) => void };

/** Colour worlds, the same as the server's LOOKS (server/experience.ts). */
const FILM_LOOKS: { id: string; name: string; grade: ExperienceFilmProps['grade']; palette: ExperienceFilmProps['palette'] }[] = [
  { id: 'golden', name: tr("金色の朝"), grade: 'warm', palette: { accent: '#E2B66E', glow: '#FFD49A', base: '#0B0907', ink: '#F7F0E4' } },
  { id: 'verdant', name: tr("緑と木漏れ日"), grade: 'verdant', palette: { accent: '#C9B27C', glow: '#FFE7B0', base: '#0B110C', ink: '#F3F0E6' } },
  { id: 'ocean', name: tr("海と空"), grade: 'cool', palette: { accent: '#8FD3E8', glow: '#CFF4FF', base: '#06121A', ink: '#EEF7FA' } },
  { id: 'night', name: tr("夜と灯り"), grade: 'noir', palette: { accent: '#D9A55B', glow: '#FFC07A', base: '#08070A', ink: '#F4EEE6' } },
  { id: 'airy', name: tr("明るく軽やか"), grade: 'neutral', palette: { accent: '#B8925A', glow: '#FFFFFF', base: '#14110E', ink: '#FBF8F2' } },
];
const FILM_TYPES: { id: ExperienceFilmProps['type']; name: string }[] = [
  { id: 'mincho', name: tr("明朝") },
  { id: 'serif', name: tr("セリフ") },
  { id: 'sans', name: tr("ゴシック") },
];
/** Pace: how long each shot holds and how slow it plays. */
const FILM_PACES: { id: string; name: string; k: number; rate: number }[] = [
  { id: 'calm', name: tr("ゆったり"), k: 1.15, rate: 0.9 },
  { id: 'normal', name: tr("ふつう"), k: 1, rate: 1 },
  { id: 'brisk', name: tr("テンポよく"), k: 0.82, rate: 1.12 },
];

/** A whole-film take: a colour world, a typeface, the copy's direction and a pace, applied to the film as the AI made it. */
const filmTake = (orig: ExperienceFilmProps, seed: number, k: number): FilmOpt => {
  const r = rng(seed * 7919 + k * 104729 + 1);
  const look = FILM_LOOKS[Math.floor(r() * FILM_LOOKS.length)];
  const type = FILM_TYPES[Math.floor(r() * FILM_TYPES.length)];
  const pace = FILM_PACES[Math.floor(r() * FILM_PACES.length)];
  const cjk = orig.lang === 'ja' || orig.lang === 'zh' || orig.lang === undefined;
  const vertical = cjk ? r() < 0.5 : false;
  return {
    id: `take-${seed}-${k}`,
    name: `${look.name} · ${type.name}`,
    note: `${pace.name}${cjk ? ` · ${vertical ? tr("縦書き") : tr("横書き")}` : ''}`,
    swatch: look.palette.accent,
    apply: (x) => {
      x.grade = look.grade;
      x.palette = { ...look.palette };
      x.type = type.id;
      x.vertical = vertical;
      x.shots = orig.shots.map((s) => ({ ...s, seconds: Math.min(8, Math.max(1.5, Math.round(s.seconds * pace.k * 10) / 10)), rate: Math.min(2, Math.max(0.25, Math.round(s.rate * pace.rate * 100) / 100)) }));
    },
  };
};

/** The film for a thumbnail: each clip replaced by a still the server cuts from it, so a grid decodes no video. */
const filmStill = (p: ExperienceFilmProps): ExperienceFilmProps => ({
  ...p,
  music: undefined,
  shots: p.shots.map((s) => (/^jobs\/[\w-]+\/[\w.-]+\.mp4$/.test(s.src) ? { ...s, src: s.src.replace(/\.mp4$/, `.t${Math.max(0, Math.round((s.trimStart + s.seconds * s.rate * 0.9) * 2) * 5)}.jpg`) } : s)),
});

const FilmThumb: React.FC<{ p: ExperienceFilmProps }> = ({ p }) => {
  const still = filmStill(p);
  const { end, total } = experienceTimeline(still, FPS);
  return (
    <div className="wmwrap">
      <PreviewMode.Provider value={STILL}>
        <PreviewBoundary fallback={<PreviewFallback poster={propsPoster(p)} />}>
          <Thumbnail component={ExperienceFilm} inputProps={still} durationInFrames={total} fps={FPS} compositionWidth={1080} compositionHeight={1920} frameToDisplay={Math.min(total - 1, end + 56)} style={{ width: '100%', height: '100%' }} />
        </PreviewBoundary>
      </PreviewMode.Provider>
      <Watermark small />
    </div>
  );
};

/**
 * The pick screen of an experience film: the film, then whole-film takes made from the same shots (colour world,
 * typeface, vertical or horizontal copy, pace). A tap takes one; 「別の案」 deals new ones; the text is one tap away.
 */
/** Mood quick picks for an experience film: its colour world and typeface, its length, or fewer lines on screen. */
const applyFilmMood = (x: ExperienceFilmProps, mood: MoodId) => {
  const look = (id: string) => FILM_LOOKS.find((l) => l.id === id)!;
  const cjk = x.lang === 'ja' || x.lang === 'zh' || x.lang === undefined;
  if (mood === 'luxe' || mood === 'fun') {
    const l = look(mood === 'luxe' ? 'night' : 'airy');
    x.grade = l.grade;
    x.palette = { ...l.palette };
    x.type = mood === 'luxe' ? (cjk ? 'mincho' : 'serif') : 'sans';
    if (mood === 'fun') x.vertical = false;
  } else if (mood === 'short') {
    x.shots = x.shots.map((sh) => ({ ...sh, seconds: Math.max(1.5, Math.round(sh.seconds * 0.8 * 10) / 10) }));
  } else {
    x.shots = x.shots.map((sh) => ({ ...sh, kicker: '', line: sh.beat === 'hook' || sh.beat === 'peak' ? sh.line : '' }));
  }
};
const filmSeconds = (p: ExperienceFilmProps) => p.shots.reduce((a, sh) => a + sh.seconds, 0);

const FilmPick: React.FC<{ job: Job; p: ExperienceFilmProps; update: PanelProps<ExperienceFilmProps>['update']; saved: boolean; err?: string; onRender: () => void; onAdvanced: () => void }> = ({
  job,
  p,
  update,
  saved,
  err,
  onRender,
  onAdvanced,
}) => {
  const orig = useMemo(() => structuredClone(job.props as ExperienceFilmProps), [job.id]);
  const [seed, setSeed] = useState(1);
  const [chosen, setChosen] = useState('orig');
  const takes = useMemo(
    () => [
      { id: 'orig', name: tr("最初の案"), note: tr("AIの案"), swatch: orig.palette.accent, apply: (x: ExperienceFilmProps) => Object.assign(x, structuredClone(orig), { title: x.title, tagline: x.tagline, place: x.place, chips: x.chips, cta: x.cta, url: x.url, handle: x.handle, shots: orig.shots.map((s, i) => ({ ...s, line: x.shots[i]?.line ?? s.line, kicker: x.shots[i]?.kicker ?? s.kicker })) }) } as FilmOpt,
      ...[0, 1, 2, 3, 4].map((k) => filmTake(orig, seed, k)),
    ],
    [seed, orig],
  );
  const mood = useMood(p, update as (fn: (x: ExperienceFilmProps) => ExperienceFilmProps) => void, applyFilmMood, (a, b, m) =>
    m === 'short' ? tr("{0}秒 → {1}秒", Math.round(filmSeconds(a)), Math.round(filmSeconds(b))) : m === 'less' ? tr("最初と最後の言葉だけ残しました") : '',
  );
  const preview = (o: FilmOpt) => {
    const x = structuredClone(p);
    o.apply(x);
    // copy edits the user made stay with every take
    x.shots = x.shots.map((s, i) => ({ ...s, line: p.shots[i]?.line ?? s.line, kicker: p.shots[i]?.kicker ?? s.kicker }));
    return x;
  };
  return (
    <div className="editor" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="stage" style={{ position: 'static', width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <Preview template="ExperienceFilm" props={p} />
        <div className="actions" style={{ justifyContent: 'center' }}>
          {job.status === 'rendering' ? (
            <div style={{ width: '100%' }}>
              <RenderProgress job={job} />
            </div>
          ) : (
            <>
              <button className={`btn ${job.status === 'done' && job.video ? 'ghost' : ''}`} disabled={!saved || !!DEMO} onClick={onRender} title={DEMO ? DEMO_BLOCKED : undefined}>
                {tr("動画を書き出す")} <small className="tokcost">{tr("{0}トークン", exportCost(job, {}))}</small>
              </button>
              {job.status === 'done' && job.video ? <ShareButton job={job} /> : null}
            </>
          )}
        </div>
        {job.status === 'done' && job.video ? <p className="cost ok" style={{ textAlign: 'center' }}>{tr("書き出し完了。編集すると再書き出しできます。")}</p> : null}
        {job.status === 'done' && job.video ? <PostKit job={job} /> : null}
        {err ? <p className="err">{err}</p> : null}
      </div>
      <div>
        <Crumbs items={[{ label: tr("リール"), href: '#/reels' }, { label: TEMPLATES.ExperienceFilm.name, href: '#/reels' }, { label: job.title }]} />
        <h1 style={{ marginTop: 12 }}>{job.title}</h1>
        <Cost job={job} />
        <MoodChips p={p} {...mood} />
        <div className="panel" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>{tr("全体の案")}</h2>
            <button className="btn small ghost" onClick={() => setSeed((n) => n + 1)}>
              {tr("別の案")}
            </button>
          </div>
          <p className="cost">{tr("同じ映像のまま、色・書体・文字の向き・テンポを変えた案です。タップすると全体が切り替わります。")}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
            {takes.map((o) => (
              <button
                key={o.id}
                onClick={() => (setChosen(o.id), update((x) => preview(o)))}
                aria-pressed={chosen === o.id}
                style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: 6, borderRadius: 12, padding: 4, outline: chosen === o.id ? '2px solid var(--accent)' : '1px solid var(--line, rgba(127,127,127,.25))' }}
              >
                <div style={{ aspectRatio: '9 / 16', borderRadius: 9, overflow: 'hidden', background: '#000' }}>
                  <FilmThumb p={preview(o)} />
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.3, padding: '0 4px 4px' }}>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 9, background: o.swatch, marginRight: 6 }} />
                  <b>{o.name}</b>
                  {o.note ? <div className="cost" style={{ margin: 0 }}>{o.note}</div> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
        <span className={`pill save ${saved ? '' : 'busy'}`}>{saved ? tr("保存済み") : tr("保存中…")}</span>
        <button className="btn small ghost" style={{ marginTop: 12, marginLeft: 8 }} onClick={onAdvanced}>
          {tr("文字を直す")}
        </button>
      </div>
    </div>
  );
};

const ExperiencePanel: React.FC<PanelProps<ExperienceFilmProps>> = ({ p, update }) => {
  const set = (fn: (p: ExperienceFilmProps) => void) => mut(update, fn)();
  const BEAT: Record<string, string> = { hook: tr("つかみ"), arrival: tr("到着"), activity: tr("体験"), sensory: tr("五感"), peak: tr("いちばんの景色") };
  return (
    <>
      <div className="panel">
        <h2>{tr("最後の画面")}</h2>
        <div className="form" style={{ maxWidth: 'none' }}>
          <div className="grid2">
            <Field label={tr("お店・ブランドの名前")} max={24} value={p.brand} onChange={(v) => set((x) => void (x.brand = v))} />
            <Field label={tr("場所（英字）")} max={32} value={p.place} onChange={(v) => set((x) => void (x.place = v))} />
          </div>
          <Field label={tr("体験の名前")} max={28} value={p.title} onChange={(v) => set((x) => void (x.title = v))} />
          <Field label={tr("キャッチコピー")} max={40} value={p.tagline} onChange={(v) => set((x) => void (x.tagline = v))} />
          <div className="grid2">
            {[0, 1, 2].map((i) => (
              <Field
                key={i}
                label={tr("情報{0}（任意）", i + 1)}
                max={16}
                value={p.chips[i] ?? ''}
                onChange={(v) => set((x) => void (x.chips = [0, 1, 2].map((k) => (k === i ? v : (x.chips[k] ?? ''))).filter(Boolean)))}
              />
            ))}
          </div>
          <div className="grid2">
            <Field label="CTA" max={30} value={p.cta} onChange={(v) => set((x) => void (x.cta = v))} />
            <Field label={tr("予約先（URL・電話など、任意）")} max={40} value={p.url} onChange={(v) => set((x) => void (x.url = v))} />
          </div>
          <Field label={tr("アカウント名")} max={30} value={p.handle} onChange={(v) => set((x) => void (x.handle = v))} />
        </div>
      </div>
      <div className="panel">
        <h2>{tr("場面ごとのひとこと")}</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.shots.map((s, i) => (
            <div key={i} className="grid2">
              <Field label={`${i + 1}. ${BEAT[s.beat] ?? s.beat}`} max={40} value={s.line} onChange={(v) => set((x) => void (x.shots[i].line = v))} />
              <Field label={tr("{0}. 英字ラベル", i + 1)} max={28} value={s.kicker} onChange={(v) => set((x) => void (x.shots[i].kicker = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("色と音")}</h2>
        <Colors value={p.palette} labels={{ accent: tr("アクセント"), glow: tr("光"), base: tr("背景"), ink: tr("文字") }} onChange={(v) => set((x) => void (x.palette = v as ExperienceFilmProps['palette']))} />
        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>{tr("音楽の音量")}</span>
            <span>{Math.round(p.musicVolume * 100)}%</span>
          </label>
          <input type="range" min={0} max={100} value={Math.round(p.musicVolume * 100)} onChange={(e) => set((x) => void (x.musicVolume = Number(e.target.value) / 100))} />
        </div>
      </div>
    </>
  );
};

const PhotoAdPanel: React.FC<PanelProps<PhotoAdProps>> = ({ p, update }) => {
  const set = (fn: (p: PhotoAdProps) => void) => mut(update, fn)();
  const BEAT: Record<string, string> = { splash: tr("流れ落ちる"), texture: tr("質感"), bridge: tr("肌にのる"), ritual: tr("使うシーン"), pack: tr("商品カット") };
  return (
    <>
      <div className="panel">
        <h2>{tr("最後の画面")}</h2>
        <div className="form" style={{ maxWidth: 'none' }}>
          <div className="grid2">
            <Field label={tr("ブランド名")} max={24} value={p.brand} onChange={(v) => set((x) => void (x.brand = v))} />
            <Field label={tr("商品名（ブランド名と同じなら出ません）")} max={30} value={p.name} onChange={(v) => set((x) => void (x.name = v))} />
          </div>
          <Field label={tr("キャッチコピー")} max={36} value={p.tagline} onChange={(v) => set((x) => void (x.tagline = v))} />
          <div className="grid2">
            <Field label="CTA" max={24} value={p.cta} onChange={(v) => set((x) => void (x.cta = v))} />
            <Field label={tr("アカウント名")} max={30} value={p.handle} onChange={(v) => set((x) => void (x.handle = v))} />
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>{tr("場面ごとのひとこと")}</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.shots.map((s, i) =>
            s.beat === 'pack' ? null : (
              <div key={i} className="grid2">
                <Field label={`${i + 1}. ${BEAT[s.beat] ?? s.beat}`} max={30} value={s.line} onChange={(v) => set((x) => void (x.shots[i].line = v))} />
                <Field label={tr("{0}. 英字ラベル", i + 1)} max={24} value={s.kicker} onChange={(v) => set((x) => void (x.shots[i].kicker = v))} />
              </div>
            ),
          )}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("色と音")}</h2>
        <Colors value={{ ink: p.ink }} labels={{ ink: tr("文字") }} onChange={(v) => set((x) => void (x.ink = (v as { ink: string }).ink))} />
        {[
          { k: 'musicVolume' as const, label: tr("音楽の音量") },
          { k: 'sfxVolume' as const, label: tr("水の音の音量") },
        ].map(({ k, label }) => (
          <div key={k} className="field" style={{ marginTop: 14 }}>
            <label>
              <span>{label}</span>
              <span>{Math.round(p[k] * 100)}%</span>
            </label>
            <input type="range" min={0} max={100} value={Math.round(p[k] * 100)} onChange={(e) => set((x) => void (x[k] = Number(e.target.value) / 100))} />
          </div>
        ))}
      </div>
    </>
  );
};

// ---------- effect mixing: labels, mix picker, per-beat style ----------

const AXIS_LABELS: Record<string, Record<string, string>> = {
  caption: { pop: tr("ポップ"), blur: tr("ぼかしから"), spaced: tr("字間ひろめ"), upper: tr("大文字"), script: tr("筆記体ゴールド"), outline: tr("袋文字"), box: tr("黒帯"), highlighter: tr("マーカー"), typewriter: tr("タイプ"), stack: tr("縦積み"), bounce: tr("バウンド"), neon: tr("ネオン"), keyword: tr("キーワード強調") },
  camera: { still: tr("固定"), push: tr("ゆっくり寄る"), pull: tr("ゆっくり引く"), drift: tr("横に流れる"), punch: tr("パンチイン"), shake: tr("衝撃ゆれ"), tilt: tr("傾き"), spinIn: tr("回転イン"), handheld: tr("手持ち風"), rack: tr("ピント送り"), dollyIn: tr("ドリーイン"), panLeft: tr("パン（左へ）"), panRight: tr("パン（右へ）"), tiltUp: tr("ティルトアップ"), tiltDown: tr("ティルトダウン"), tracking: tr("トラッキング"), crane: tr("クレーン"), orbitCam: tr("オービット（カメラ周回）"), dollyZoom: tr("ドリーズーム") },
  transition: { cut: tr("カット"), zoomBlur: tr("ズームブラー"), whipLeft: tr("横スワイプ"), whipUp: tr("縦スワイプ"), flash: tr("フラッシュ"), glitch: tr("グリッチ"), slide: tr("スライド"), dip: tr("暗転"), iris: tr("丸ワイプ"), split: tr("左右から閉じる"), spin: tr("回転"), blurDissolve: tr("ぼかしディゾルブ") },
  grade: { natural: tr("ナチュラル"), warm: tr("あたたかい"), cool: tr("クール"), mono: tr("モノクロ"), film: tr("フィルム"), tealOrange: tr("ティール＆オレンジ"), pastel: tr("パステル"), punchy: tr("くっきり"), faded: tr("色あせ"), neon: tr("ネオン"), sepia: tr("セピア"), night: tr("ナイト"), midnight: tr("ミッドナイト") },
  texture: { none: tr("なし"), grain: tr("フィルム粒子"), lightLeak: tr("光漏れ"), vignette: tr("周辺減光"), halftone: tr("網点"), scanlines: tr("走査線"), dust: tr("ほこり"), paper: tr("紙") },
  accent: { sparkles: tr("キラキラ"), outline: tr("人物の白フチ"), arrows: tr("手描き矢印"), underline: tr("下線"), emoji: tr("絵文字"), beatFlash: tr("ビートで光る"), letterbox: tr("シネマ帯"), progress: tr("進行バー"), stickers: tr("ステッカー"), glow: tr("人物の後光"), echo: tr("エコー") },
  font: { display: tr("太ゴシック（欧文）"), sansJP: tr("ゴシック"), serif: tr("セリフ"), mincho: tr("明朝") },
};
const lbl = (axis: string, v?: string) => (v ? AXIS_LABELS[axis]?.[v] ?? v : '—');

/** 約2,044億通り: scenes × every style axis × accent subsets (src/effects/axes.ts). */
// 億 only reads naturally in Japanese and Chinese; other languages get a compact number ("96.3B").
const MIX_COUNT = mixCount();

const MixPicker: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => (
  <div className="field">
    <label>
      <span>{tr("ミックス（エフェクトの組み合わせ方）")}</span>
      <span>{tr("1カットあたり")}{MIX_COUNT}</span>
    </label>
    <div className="mixgrid">
      {recipes.map((r) => (
        <button key={r.id} className={`mix ${value === r.id ? 'on' : ''}`} onClick={() => onChange(r.id)}>
          <b>{tr(r.name)}</b>
          <small>{tr(r.desc)}</small>
        </button>
      ))}
    </div>
  </div>
);

const Select: React.FC<{ label: string; axis: string; options: readonly string[]; value?: string; onChange: (v: string) => void }> = ({ label, axis, options, value, onChange }) => (
  <div className="field">
    <label>{label}</label>
    <select className="sel" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {value ? null : <option value="">{tr("標準")}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {lbl(axis, o)}
        </option>
      ))}
    </select>
  </div>
);

/** Reel-level look + shuffle. Grade, texture, font and colour are written to every beat. */
const MixPanel: React.FC<PanelProps<EffectsReelProps>> = ({ p, update }) => {
  const recipe = recipeById(p.recipe);
  const first = p.segments[0]?.style ?? {};
  const setAll = (patch: Partial<BeatStyle>) =>
    update((x) => {
      x.segments.forEach((s) => (s.style = { ...(s.style ?? {}), ...patch }));
      return x;
    });
  const [spin, setSpin] = useState(0);
  const shuffle = (id = p.recipe) => (
    setSpin((n) => n + 1),
    update((x) => {
      const looks = rollStyles(recipeById(id), x.segments.length, Math.floor(Math.random() * 1e5), { hasMatte: !!x.matte });
      x.recipe = id;
      x.segments.forEach((s, i) => {
        s.effect = looks[i].scene;
        s.style = looks[i].style;
      });
      return x;
    })
  );
  return (
    <div className="panel">
      <h2>
        {tr("ミックス")}
        <button className="btn small" onClick={() => shuffle()}>
          <span key={spin} className={spin ? 'dice' : ''}>🎲</span>{' '}{tr("シャッフル")}
        </button>
      </h2>
      <p className="cost" style={{ marginTop: -4 }}>
        {tr("各カットは「エフェクト × 字幕 × カメラ × 切り替え × 色味 × 質感 × 飾り」の掛け合わせです（1カットあたり{0}）。シャッフルすると、いまのミックスの中で全カットの組み合わせを引き直します。文字の内容はそのままです。", MIX_COUNT)}
      </p>
      <MixPicker value={recipe.id} onChange={(id) => shuffle(id)} />
      <div className="grid2" style={{ marginTop: 12 }}>
        <Select label={tr("フォント（全体）")} axis="font" options={fontChoices} value={first.font} onChange={(v) => setAll({ font: v as never })} />
        <div className="field">
          <label>{tr("差し色（全体）")}</label>
          <div className="swatches">
            {accentColors.map((c) => (
              <button key={c} className={`sw ${first.color === c ? 'on' : ''}`} style={{ background: c }} aria-label={c} onClick={() => setAll({ color: c })} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const LookOption: React.FC<{ k: string; name: string; on: boolean; onPick: () => void }> = ({ k, name, on, onPick }) => {
  const [hover, setHover] = useState(false);
  const has = showcaseList?.has(k);
  // keep the current choice in view inside its row, without scrolling the page
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const el = ref.current, row = el?.parentElement;
    if (!on || !el || !row) return;
    const x = el.offsetLeft - row.offsetLeft;
    if (x < row.scrollLeft || x + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: x - 8, behavior: 'smooth' });
  }, [on]);
  return (
    <button ref={ref} className={`lookopt ${on ? 'on' : ''}`} onClick={onPick} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={() => setHover(false)}>
      <div className="lookthumb">{has ? hover ? <ShowVideo k={k} /> : <img src={showcase(k).poster} alt="" loading="lazy" /> : <span>{name}</span>}</div>
      <span>{name}</span>
    </button>
  );
};

/**
 * The AI already knows what is in every cut, so each element is a choice, not an edit:
 * tap a cut, then pick its effect, caption look, caption position, camera and transition from real renders.
 */
const CutPicker: React.FC<PanelProps<EffectsReelProps> & { playerRef: React.RefObject<PlayerRef | null>; startFrame: (i: number) => number }> = ({ p, update, playerRef, startFrame }) => {
  useShowcaseKeys();
  const [i, setI] = useState(0);
  const seg = p.segments[Math.min(i, p.segments.length - 1)];
  const set = (fn: (p: EffectsReelProps) => void) => mut(update, fn)();
  const st = seg.style ?? {};
  const setStyle = (patch: Partial<BeatStyle>) => set((x) => void (x.segments[i].style = { ...(x.segments[i].style ?? {}), ...patch }));
  const open = (k: number) => (setI(k), playerRef.current?.seekTo(startFrame(k)));
  const on = new Set(st.accents ?? []);
  const row = (label: string, prefix: string, axis: 'caption' | 'camera' | 'transition', values: readonly string[]) => (
    <div className="cutrow">
      <div className="cutlabel">
        {label} <b>{lbl(axis, st[axis])}</b>
      </div>
      <div className="lookopts">
        {values.map((v) => (
          <LookOption key={v} k={`${prefix}-${v}`} name={lbl(axis, v)} on={st[axis] === v} onPick={() => setStyle({ [axis]: v })} />
        ))}
      </div>
    </div>
  );
  return (
    <div className="panel">
      <h2>{tr("カットごとに選ぶ")}</h2>
      <p className="cost" style={{ marginTop: -4 }}>{tr("カットを選ぶと、そのカットに入っている要素が並びます。変えたいものをタップするだけです。")}</p>
      {!p.matte ? <p className="cost">{tr("人物の切り抜きがないため、「人物の後ろ」に出る系のエフェクトは前面に重なって表示されます。")}</p> : null}
      <div className="cutstrip">
        {p.segments.map((c, k) => (
          <button key={k} className={`cutchip ${k === i ? 'on' : ''}`} onClick={() => open(k)}>
            <b>{String(k + 1).padStart(2, '0')}</b>
            <small>{c.start.toFixed(1)}s</small>
            <span>{EFFECT_NAMES[c.effect].replace(/^\d+\s*/, '').replace(/\s*[（(].*[）)]/, '')}</span>
          </button>
        ))}
      </div>
      {seg.caption ? <div className="cutline">“{seg.caption}”</div> : null}
      <div className="cutrow">
        <div className="cutlabel">
          {tr("エフェクト")} <b>{EFFECT_NAMES[seg.effect].replace(/^\d+\s*/, '').replace(/\s*[（(].*[）)]/, '')}</b>
        </div>
        <div className="lookopts">
          {effectIds.map((fx) => (
            <LookOption key={fx} k={fx} name={EFFECT_NAMES[fx].replace(/^\d+\s*/, '').replace(/\s*[（(].*[）)]/, '')} on={seg.effect === fx} onPick={() => set((x) => void (x.segments[i].effect = fx))} />
          ))}
        </div>
      </div>
      {row(tr("字幕"), 'cap', 'caption', captionStyles)}
      <div className="cutrow">
        <div className="cutlabel">{tr("テロップの位置")}</div>
        <div className="posopts">
          {([undefined, 'top', 'middle', 'bottom'] as const).map((v) => (
            <button key={v ?? 'auto'} className={`posopt ${st.captionPos === v ? 'on' : ''}`} onClick={() => setStyle({ captionPos: v })}>
              <div className="posframe">{v ? <i style={{ top: { top: '14%', middle: '44%', bottom: '70%' }[v] }} /> : <em>AI</em>}</div>
              <span>{v ? { top: tr("上"), middle: tr("中央"), bottom: tr("下") }[v] : tr("おまかせ")}</span>
            </button>
          ))}
        </div>
      </div>
      {row(tr("カメラ"), 'cam', 'camera', cameraMoves)}
      {row(tr("入りの切り替え"), 'tr', 'transition', transitions)}
      <div className="cutrow">
        <div className="cutlabel">{tr("飾り")}</div>
        <div className="accentchips">
          {accents.map((a) => {
            const disabled = !p.matte && (a === 'outline' || a === 'glow');
            return (
              <button
                key={a}
                disabled={disabled}
                title={disabled ? tr("人物の切り抜きがある動画で使えます") : undefined}
                className={`fchip ${on.has(a) ? 'on' : ''}`}
                onClick={() => {
                  const next = new Set(on);
                  next.has(a) ? next.delete(a) : next.add(a);
                  setStyle({ accents: [...next] as never });
                }}
              >
                {lbl('accent', a)}
              </button>
            );
          })}
        </div>
      </div>
      <details className="fold">
        <summary>{tr("文字の間違いを直す")}</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <Field label={tr("字幕")} max={60} value={seg.caption ?? ''} onChange={(v) => set((x) => void (x.segments[i].caption = v))} />
              <div className="grid2">
                <Field label={tr("強調する言葉（空白区切り）")} value={seg.emphasis.join(' ')} onChange={(v) => set((x) => void (x.segments[i].emphasis = v.split(/\s+/).filter(Boolean)))} />
                <Field label={tr("エフェクトの文字")} max={40} value={seg.text ?? ''} onChange={(v) => set((x) => void (x.segments[i].text = v || undefined))} />
              </div>
              <Field
                label={tr("項目（1行に1つ：チェックリスト・見出し・カードなど）")}
                multiline
                value={seg.items.join('\n')}
                onChange={(v) => set((x) => void (x.segments[i].items = v.split('\n').filter((l) => l.trim()).slice(0, 12)))}
              />
        </div>
      </details>
    </div>
  );
};

// ---------- look builder: upload once, then just pick ----------

/**
 * The reel the AI made, rebuilt step by step like a look book: whole-look takes, colours, font, opening,
 * captions, elements, motion, then a final check with caption height and brightness.
 * Every card plays the user's own footage with that option applied; "これにする" takes it,
 * "似た案" keeps it and deals new cards that differ in the details.
 */
type LookOpt = { id: string; name: string; note?: string; swatch?: string; apply: (x: EffectsReelProps) => void; on: (x: EffectsReelProps) => boolean; seg?: number };
type BuildStep = { key: string; name: string; hint: string; multi?: boolean; deal: (p: EffectsReelProps, seed: number, like?: LookOpt) => LookOpt[] };

const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pickN = <T,>(arr: readonly T[], n: number, r: () => number) => [...arr].sort(() => r() - 0.5).slice(0, n);
const allStyle = (x: EffectsReelProps, patch: Partial<BeatStyle>) => x.segments.forEach((s) => (s.style = { ...(s.style ?? {}), ...patch }));
const sameAll = <K extends keyof BeatStyle>(x: EffectsReelProps, k: K, v: BeatStyle[K]) => x.segments.every((s) => s.style?.[k] === v);
/** Effects that draw their own type instead of the caption layer, so caption picks would not show on them. */
const OWN_TYPE = new Set<EffectId>(['kineticType', 'infographic', 'notifications', 'tiles', 'sourceCard']);
/** A beat with a spoken line on the caption layer, so caption-related cards have something to show. */
const talkingSeg = (p: EffectsReelProps) => {
  const i = p.segments.findIndex((s, k) => k > 0 && s.caption && !OWN_TYPE.has(s.effect));
  return i > 0 ? i : Math.max(0, p.segments.findIndex((s) => s.caption));
};
const effectLabel = (fx: EffectId) => EFFECT_NAMES[fx].replace(/^\d+\s*/, '').replace(/\s*[（(].*[）)]/, '');

const THEMES: { id: string; name: string; accent: string; ink: string; paper: string; grade: (typeof grades)[number] }[] = [
  { id: 'yellow', name: tr("イエロー×黒"), accent: '#E9F06B', ink: '#FFFFFF', paper: '#111111', grade: 'natural' },
  { id: 'sunset', name: tr("夕焼け"), accent: '#FF5A36', ink: '#FFF6EC', paper: '#1A0F0A', grade: 'warm' },
  { id: 'mint', name: tr("ミント"), accent: '#3DDC97', ink: '#FFFFFF', paper: '#0E1A14', grade: 'cool' },
  { id: 'blue', name: tr("ブルー"), accent: '#5B8CFF', ink: '#FFFFFF', paper: '#0B1020', grade: 'punchy' },
  { id: 'pink', name: tr("ピンク"), accent: '#FF6FB5', ink: '#FFFFFF', paper: '#1E0F18', grade: 'pastel' },
  { id: 'gold', name: tr("ゴールド"), accent: '#F2E3A0', ink: '#FFFFFF', paper: '#16130B', grade: 'film' },
  { id: 'neon', name: tr("ネオン"), accent: '#29D3F0', ink: '#FFFFFF', paper: '#0A0A14', grade: 'neon' },
  { id: 'mono', name: tr("モノクロ"), accent: '#FFFFFF', ink: '#FFFFFF', paper: '#000000', grade: 'mono' },
  { id: 'midnight', name: tr("ミッドナイト"), accent: '#B18CFF', ink: '#FFFFFF', paper: '#0B0A0D', grade: 'midnight' },
  { id: 'teal', name: tr("ティール＆オレンジ"), accent: '#FFC542', ink: '#FFFFFF', paper: '#0E1416', grade: 'tealOrange' },
];
const themeOpt = (t: { id: string; name: string; accent: string; ink: string; paper: string; grade: (typeof grades)[number] }): LookOpt => ({
  id: `${t.id}-${t.accent}-${t.grade}`,
  name: t.name,
  note: lbl('grade', t.grade) === t.name ? undefined : lbl('grade', t.grade),
  swatch: t.accent,
  apply: (x) => ((x.palette = { accent: t.accent, ink: t.ink, paper: t.paper }), allStyle(x, { color: t.accent, grade: t.grade })),
  on: (x) => x.palette.accent === t.accent && sameAll(x, 'grade', t.grade) && sameAll(x, 'color', t.accent),
});

const HOOK_FX: EffectId[] = ['coverStory', 'kineticType', 'glassType', 'textReveal', 'paperCut', 'frameBreak', 'zoomThrough', 'digitalZoom', 'headlineWall', 'doodleBoil', 'vertigo', 'particles3d'];
const MOTIONS: { id: string; name: string; cams: (typeof cameraMoves)[number][]; trs: (typeof transitions)[number][] }[] = [
  { id: 'calm', name: tr("静か"), cams: ['drift', 'push', 'pull'], trs: ['blurDissolve', 'dip'] },
  { id: 'punchy', name: tr("勢い"), cams: ['punch', 'shake', 'push'], trs: ['whipLeft', 'whipUp', 'flash'] },
  { id: 'cinema', name: tr("シネマ"), cams: ['dollyIn', 'crane', 'tracking'], trs: ['dip', 'blurDissolve'] },
  { id: 'vlog', name: tr("手持ちVlog"), cams: ['handheld', 'drift'], trs: ['cut', 'slide'] },
  { id: 'dynamic', name: tr("ダイナミック"), cams: ['orbitCam', 'spinIn', 'dollyIn'], trs: ['zoomBlur', 'spin'] },
  { id: 'glitch', name: tr("グリッチ"), cams: ['shake', 'punch'], trs: ['glitch', 'flash'] },
  { id: 'float', name: tr("ふわっと"), cams: ['crane', 'tiltUp', 'drift'], trs: ['slide', 'iris'] },
  { id: 'hitch', name: tr("めまい"), cams: ['dollyZoom', 'rack'], trs: ['zoomBlur', 'split'] },
];
const motionOpt = (id: string, name: string, cams: readonly string[], trs: readonly string[], note?: string): LookOpt => ({
  id,
  name,
  note: note ?? `${lbl('camera', cams[0])} · ${lbl('transition', trs[0])}`,
  apply: (x) => x.segments.forEach((s, i) => (s.style = { ...(s.style ?? {}), camera: cams[i % cams.length] as never, transition: trs[i % trs.length] as never })),
  on: (x) => x.segments.every((s, i) => s.style?.camera === cams[i % cams.length] && s.style?.transition === trs[i % trs.length]),
});

const BUILD_STEPS: BuildStep[] = [
  {
    key: 'take',
    name: tr("全体の案"),
    hint: tr("AIがあなたの動画で作った、まるごと違う案です。気に入ったものを選ぶと、次のステップはそれをもとに進みます。"),
    deal: (p, seed, like) =>
      [0, 1, 2, 3, 4, 5].map((k) => {
        const recipe = like ? recipeById(like.id.split(':')[0]) : recipes[(k + seed) % recipes.length];
        const looks = rollStyles(recipe, p.segments.length, seed * 31 + k * 7919, { hasMatte: !!p.matte });
        const sig = looks.map((l) => l.scene + l.style.caption + l.style.grade).join();
        return {
          id: `${recipe.id}:${seed}:${k}`,
          name: tr(recipe.name),
          note: `${lbl('grade', looks[0].style.grade)} · ${lbl('caption', looks[0].style.caption)}`,
          seg: 0,
          apply: (x: EffectsReelProps) => {
            x.recipe = recipe.id;
            x.segments.forEach((s, i) => ((s.effect = looks[i].scene), (s.style = looks[i].style)));
          },
          on: (x: EffectsReelProps) => x.segments.map((s) => s.effect + s.style?.caption + s.style?.grade).join() === sig,
        };
      }),
  },
  {
    key: 'colors',
    name: tr("色"),
    hint: tr("文字の差し色と映像の色味です。フォントや字幕もこの色で作られます。"),
    deal: (p, seed, like) => {
      const r = rng(seed + 11);
      if (!like) return pickN(THEMES, 8, r).map(themeOpt);
      const base = THEMES.find((t) => like.id.startsWith(t.id + '-')) ?? THEMES[0];
      const grade = (like.id.split('-').pop() ?? base.grade) as (typeof grades)[number];
      const accent = like.id.split('-')[1] ?? base.accent;
      return [
        ...pickN(accentColors.filter((c) => c !== accent), 4, r).map((c) => themeOpt({ ...base, accent: c, grade })),
        ...pickN(grades.filter((g) => g !== grade), 4, r).map((g) => themeOpt({ ...base, accent, grade: g })),
      ];
    },
  },
  {
    key: 'font',
    name: tr("フォント"),
    hint: tr("フック・字幕・カードに使う書体です。似た案を押すと、その書体に合う字幕の組み合わせが出ます。"),
    deal: (p, seed, like) => {
      const r = rng(seed + 23);
      const fontOpt = (f: (typeof fontChoices)[number], cap?: (typeof captionStyles)[number]): LookOpt => ({
        id: `${f}-${cap ?? ''}`,
        name: lbl('font', f),
        note: cap ? lbl('caption', cap) : undefined,
        seg: talkingSeg(p),
        apply: (x) => allStyle(x, cap ? { font: f, caption: cap } : { font: f }),
        on: (x) => sameAll(x, 'font', f) && (!cap || sameAll(x, 'caption', cap)),
      });
      if (!like) return fontChoices.map((f) => fontOpt(f));
      const f = like.id.split('-')[0] as (typeof fontChoices)[number];
      return pickN(captionStyles, 6, r).map((c) => fontOpt(f, c));
    },
  },
  {
    key: 'hook',
    name: tr("冒頭"),
    hint: tr("最初の1〜2秒の見せ方です。ここで止まってもらえるかが決まります。"),
    deal: (p, seed, like) => {
      const r = rng(seed + 37);
      const hookOpt = (fx: EffectId, tr0?: (typeof transitions)[number], cam?: (typeof cameraMoves)[number]): LookOpt => ({
        id: `${fx}-${tr0 ?? ''}-${cam ?? ''}`,
        name: effectLabel(fx),
        note: tr0 || cam ? [cam && lbl('camera', cam), tr0 && lbl('transition', tr0)].filter(Boolean).join(' · ') : EFFECT_DESC[fx],
        seg: 0,
        apply: (x) => {
          x.segments[0].effect = fx;
          if (!x.segments[0].text) x.segments[0].text = (x.segments[0].caption ?? '').split(/[、。,.!?！？]/)[0].slice(0, 24) || undefined;
          if (tr0 || cam) x.segments[0].style = { ...(x.segments[0].style ?? {}), ...(tr0 ? { transition: tr0 } : {}), ...(cam ? { camera: cam } : {}) };
        },
        on: (x) => x.segments[0].effect === fx && (!tr0 || x.segments[0].style?.transition === tr0) && (!cam || x.segments[0].style?.camera === cam),
      });
      if (!like) return pickN(HOOK_FX, 8, r).map((fx) => hookOpt(fx));
      const fx = like.id.split('-')[0] as EffectId;
      return [0, 1, 2, 3, 4, 5].map(() => hookOpt(fx, pickN(transitions, 1, r)[0], pickN(cameraMoves, 1, r)[0]));
    },
  },
  {
    key: 'captions',
    name: tr("字幕"),
    hint: tr("話している言葉の出し方です。選んだ色とフォントで描いています。"),
    deal: (p, seed, like) => {
      const r = rng(seed + 41);
      const capOpt = (c: (typeof captionStyles)[number], acc?: (typeof accents)[number]): LookOpt => ({
        id: `${c}-${acc ?? ''}`,
        name: lbl('caption', c),
        note: acc ? `+ ${lbl('accent', acc)}` : undefined,
        seg: talkingSeg(p),
        apply: (x) =>
          x.segments.forEach((s) => {
            const a = new Set(s.style?.accents ?? []);
            if (acc) a.add(acc);
            s.style = { ...(s.style ?? {}), caption: c, accents: [...a] as never };
          }),
        on: (x) => sameAll(x, 'caption', c) && (!acc || x.segments.every((s) => s.style?.accents?.includes(acc))),
      });
      if (!like) return pickN(captionStyles, 8, r).map((c) => capOpt(c));
      const c = like.id.split('-')[0] as (typeof captionStyles)[number];
      return (['underline', 'emoji', 'echo', 'beatFlash', 'sparkles', 'stickers'] as const).map((a) => capOpt(c, a));
    },
  },
  {
    key: 'elements',
    name: tr("飾り"),
    hint: tr("入れたいものに全部チェックしてください。あなたの色とフォントで表示しています。"),
    multi: true,
    deal: (p) =>
      accents
        .filter((a) => p.matte || (a !== 'outline' && a !== 'glow'))
        .map((a) => ({
          id: a,
          name: lbl('accent', a),
          seg: talkingSeg(p),
          apply: (x: EffectsReelProps) => {
            const has = x.segments.every((s) => s.style?.accents?.includes(a));
            x.segments.forEach((s) => {
              const set = new Set(s.style?.accents ?? []);
              has ? set.delete(a) : set.add(a);
              s.style = { ...(s.style ?? {}), accents: [...set] as never };
            });
          },
          on: (x: EffectsReelProps) => x.segments.every((s) => s.style?.accents?.includes(a)),
        })),
  },
  {
    key: 'motion',
    name: tr("動き"),
    hint: tr("カメラの動きとカットのつなぎ方です。カットごとに少しずつ変えてあります。"),
    deal: (p, seed, like) => {
      const r = rng(seed + 53);
      if (!like) return MOTIONS.map((m) => motionOpt(m.id, m.name, m.cams, m.trs));
      const m = MOTIONS.find((x) => like.id.startsWith(x.id)) ?? MOTIONS[0];
      return [0, 1, 2, 3, 4, 5].map((k) => {
        const trs = pickN(transitions, 2, r);
        return motionOpt(`${m.id}-${k}-${trs.join()}`, m.name, m.cams, trs, trs.map((t) => lbl('transition', t)).join(' · '));
      });
    },
  },
];

/** A small live preview: one beat of the user's reel with the option applied. Plays while hovered or tapped. */
const LiveCard: React.FC<{ base: EffectsReelProps; opt: LookOpt; n: number; multi?: boolean; onTake: () => void; onMore?: () => void }> = ({ base, opt, n, multi, onTake, onMore }) => {
  const ref = useRef<PlayerRef | null>(null);
  const props = useMemo(() => {
    const x = structuredClone(base);
    opt.apply(x);
    const seg = x.segments[Math.min(opt.seg ?? talkingSeg(x), x.segments.length - 1)];
    return { ...x, segments: [seg], music: undefined };
  }, [base, opt]);
  const frames = Math.max(1, effectsReelDuration(props, FPS));
  const still = Math.min(frames - 1, Math.round(frames * 0.6));
  const on = opt.on(base);
  return (
    <div className={`livecard ${on ? 'on' : ''}`}>
      <div className="livehead">
        <span>{n}</span>
        {on ? <b>{multi ? '✓' : tr("選択中")}</b> : null}
      </div>
      <div className="livethumb">
        <LivePreview poster={<ReelStill props={props} at={still / frames} />}>
        <Player
          ref={ref}
          component={EffectsReel}
          inputProps={props}
          durationInFrames={frames}
          fps={FPS}
          compositionWidth={1080}
          compositionHeight={1920}
          initialFrame={still}
          style={{ width: '100%', aspectRatio: '9 / 16' }}
          loop
          autoPlay
          initiallyMuted
          errorFallback={playerError}
          acknowledgeRemotionLicense
        />
        </LivePreview>
      </div>
      <div className="livename">
        <b>
          {opt.swatch ? <i className="liveswatch" style={{ background: opt.swatch }} /> : null}
          {opt.name}
        </b>
        {opt.note ? <small>{opt.note}</small> : null}
      </div>
      <div className="liveact">
        <button className={`btn small ${on ? '' : 'ghost'}`} onClick={onTake}>
          {multi ? (on ? tr("外す") : tr("入れる")) : on ? tr("選択中") : tr("選ぶ")}
        </button>
        {onMore ? (
          <button className="btn small ghost" onClick={onMore}>
            {tr("似た案")}
          </button>
        ) : null}
      </div>
    </div>
  );
};

const LookBuilder: React.FC<PanelProps<EffectsReelProps>> = ({ p, update }) => {
  const [step, setStep] = useState(0);
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 1e5));
  const [like, setLike] = useState<LookOpt | undefined>();
  const last = BUILD_STEPS.length; // the check step comes after the picking steps
  const s = BUILD_STEPS[step];
  // the cards are dealt once per step / reshuffle, so taking one does not reshuffle the rest
  const dealt = useMemo(() => (s ? s.deal(p, seed, like) : []), [step, seed, like, p.segments.length, !!p.matte]);
  const go = (k: number) => (setStep(k), setLike(undefined));
  const take = (o: LookOpt) => update((x) => (o.apply(x), x));
  const top = useRef<HTMLDivElement>(null);
  const scrollTop = () => top.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion() ? 'auto' : 'smooth' });
  return (
    <div className="panel builder" ref={top}>
      {/* role keeps the accordion from folding it: this is where the editor starts */}
      <h2 role="heading" aria-level={2}>{tr("見た目を選ぶ")}</h2>
      <p className="cost" style={{ marginTop: -4 }}>{tr("ステップごとに、あなたの動画で作った案から選ぶだけです。前のステップで選んだものが次の案に引き継がれます。")}</p>
      <div className="buildsteps">
        {[...BUILD_STEPS.map((b) => b.name), tr("仕上げ")].map((name, k) => (
          <button key={k} className={`buildstep ${k === step ? 'on' : ''}`} onClick={() => go(k)}>
            <small>{k + 1}</small> {name}
          </button>
        ))}
      </div>
      {s ? (
        <>
          <p className="buildhint">
            {tr("ステップ{0}/{1}", step + 1, last + 1)} · {like ? tr("「{0}」に近い案です。", like.name) : s.hint}
          </p>
          <div className="livegrid">
            {dealt.map((o, k) => (
              <LiveCard key={o.id + k} base={p} opt={o} n={k + 1} multi={s.multi} onTake={() => take(o)} onMore={s.multi ? undefined : () => (take(o), setLike(o), scrollTop())} />
            ))}
          </div>
          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn small ghost" disabled={step === 0} onClick={() => (go(step - 1), scrollTop())}>
              {tr("戻る")}
            </button>
            <div className="row" style={{ gap: 8 }}>
              {s.multi ? null : (
                <button className="btn small ghost" onClick={() => (setLike(undefined), setSeed((n) => n + 1))}>
                  🎲 {tr("ほかの案")}
                </button>
              )}
              <button className="btn small" onClick={() => (go(step + 1), scrollTop())}>
                {tr("次へ")}
              </button>
            </div>
          </div>
        </>
      ) : (
        <FinishStep p={p} update={update} onBack={() => go(step - 1)} onJump={go} />
      )}
    </div>
  );
};

/** Last step: what was picked, plus the two fine adjustments (caption height, brightness). */
const FinishStep: React.FC<PanelProps<EffectsReelProps> & { onBack: () => void; onJump: (k: number) => void }> = ({ p, update, onBack, onJump }) => {
  const st = p.segments[1]?.style ?? p.segments[0]?.style ?? {};
  const set = (fn: (x: EffectsReelProps) => void) => update((x) => (fn(x), x));
  const capY = p.captionY;
  const bright = p.brightness ?? 1;
  const summary: [number, string, string][] = [
    [0, tr("全体の案"), tr(recipeById(p.recipe).name)],
    [1, tr("色"), `${lbl('grade', st.grade)}`],
    [2, tr("フォント"), lbl('font', st.font)],
    [3, tr("冒頭"), effectLabel(p.segments[0].effect)],
    [4, tr("字幕"), lbl('caption', st.caption)],
    [5, tr("飾り"), (st.accents ?? []).map((a) => lbl('accent', a)).join('、') || tr("なし")],
    [6, tr("動き"), `${lbl('camera', st.camera)} · ${lbl('transition', st.transition)}`],
  ];
  return (
    <>
      <p className="buildhint">{tr("ステップ{0}/{1}", 8, 8)} · {tr("最後に字幕の高さと明るさを整えます。プレビューにすぐ反映されます。")}</p>
      <div className="field">
        <label>
          <span>{tr("テロップの位置")}</span>
          <span>{capY === undefined ? tr("おまかせ") : `${Math.round(capY * 100)}%`}</span>
        </label>
        <div className="posopts" style={{ marginBottom: 8 }}>
          {([undefined, 0.16, 0.46, 0.72] as const).map((v) => (
            <button key={v ?? 'auto'} className={`posopt ${capY === v ? 'on' : ''}`} onClick={() => set((x) => void (x.captionY = v))}>
              <div className="posframe">{v !== undefined ? <i style={{ top: `${Math.round(v * 100) - 2}%` }} /> : <em>AI</em>}</div>
              <span>{v === undefined ? tr("おまかせ") : v < 0.3 ? tr("上") : v < 0.6 ? tr("中央") : tr("下")}</span>
            </button>
          ))}
        </div>
        <input type="range" min={0.05} max={0.9} step={0.01} value={capY ?? 0.62} aria-label={tr("テロップの位置")} onChange={(e) => set((x) => void (x.captionY = Number(e.target.value)))} />
        <div className="rangeends">
          <span>{tr("上")}</span>
          <span>{tr("下")}</span>
        </div>
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label>
          <span>{tr("明るさ")}</span>
          <span>
            {bright === 1 ? tr("そのまま") : `${bright > 1 ? '+' : ''}${Math.round((bright - 1) * 100)}`}
            {bright !== 1 ? (
              <button className="iconbtn" style={{ marginLeft: 8 }} onClick={() => set((x) => void (x.brightness = undefined))}>
                {tr("元に戻す")}
              </button>
            ) : null}
          </span>
        </label>
        <input type="range" min={0.6} max={1.4} step={0.02} value={bright} aria-label={tr("明るさ")} onChange={(e) => set((x) => void (x.brightness = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))} />
        <div className="rangeends">
          <span>{tr("暗く")}</span>
          <span>{tr("明るく")}</span>
        </div>
      </div>
      <div className="buildsum">
        {summary.map(([k, name, value]) => (
          <button key={k} onClick={() => onJump(k)}>
            <span>{name}</span>
            <b>{value}</b>
            <small>{tr("変える")}</small>
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <button className="btn small ghost" onClick={onBack}>
          {tr("戻る")}
        </button>
        <span className="cost">{tr("できあがったら「動画を書き出す」を押してください。")}</span>
      </div>
    </>
  );
};

// ---------- pick flow: whole takes in a feed, two-way picks, finger tuning, then post ----------

type PickStage = 'feed' | 'tune' | 'post';
const PICK_STAGES: [PickStage, string][] = [
  ['feed', tr("選ぶ")],
  ['tune', tr("整える")],
  ['post', tr("投稿")],
];

const withOpt = (base: EffectsReelProps, opt?: LookOpt, oneBeat?: boolean) => {
  const x = structuredClone(base);
  opt?.apply(x);
  if (!oneBeat) return x;
  return { ...x, segments: [x.segments[Math.min(opt?.seg ?? talkingSeg(x), x.segments.length - 1)]], music: undefined };
};

/**
 * The reel (or a stretch of it) sized by its box: a still with a play button until tapped (see LivePreview).
 * inFrame/outFrame loop one scene of the reel.
 */
const ReelPlayer: React.FC<{ props: EffectsReelProps; playerRef?: React.RefObject<PlayerRef | null>; solo?: Solo; inFrame?: number; outFrame?: number; at?: number }> = ({ props, playerRef, solo, inFrame, outFrame, at }) => (
  <div className="wmwrap">
    <LivePreview poster={<ReelStill props={props} at={at} bare />} solo={solo}>
    <Player
      ref={playerRef}
      component={EffectsReel}
      inputProps={props}
      durationInFrames={Math.max(1, effectsReelDuration(props, FPS))}
      fps={FPS}
      compositionWidth={1080}
      compositionHeight={1920}
      style={{ width: '100%', height: '100%' }}
      inFrame={inFrame}
      outFrame={outFrame}
      initialFrame={inFrame}
      autoPlay
      loop
      initiallyMuted
      errorFallback={playerError}
      acknowledgeRemotionLicense
    />
    </LivePreview>
    <Watermark />
  </div>
);

/** Night or day; remembered on this device. */
const ThemeButton: React.FC = () => {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f5f2eb' : '#070708');
    try {
      localStorage.setItem('editless-theme', theme);
    } catch {}
  }, [theme]);
  const light = theme === 'light';
  return (
    <button className="langbtn themebtn" onClick={() => setTheme(light ? 'dark' : 'light')} aria-label={light ? tr("ダークモードにする") : tr("ライトモードにする")} title={light ? tr("ダークモードにする") : tr("ライトモードにする")}>
      <Glyph d={light ? G.moon : G.sun} size={18} />
    </button>
  );
};

/** ATO mark over every preview. Previews are free to watch, so a screen grab of one is not a clean reel; the export is. */
const Watermark: React.FC<{ small?: boolean }> = ({ small }) => (
  <div className={`wm ${small ? 'small' : ''}`} aria-hidden>
    <img src="icons/ato-mark.png" alt="" draggable={false} />
  </div>
);

const STILL = { still: true };
/**
 * A one-frame poster of a take, for grids and option strips (cheap: a still image under the graphics, no
 * video decoded). In crash-guard mode it is just the server's still image. `bare` leaves out the watermark
 * (the box around it has one).
 */
const ReelStill: React.FC<{ props: EffectsReelProps; at?: number; bare?: boolean }> = ({ props, at = 0.45, bare }) => {
  const frames = Math.max(1, effectsReelDuration(props, FPS));
  return (
    <div className="wmwrap">
      {SAFE_MODE ? (
        <PreviewFallback poster={posterOf(props.video)} />
      ) : (
        <PreviewMode.Provider value={STILL}>
          <PreviewBoundary fallback={<PreviewFallback poster={posterOf(props.video)} />}>
            <Thumbnail component={EffectsReel} inputProps={props} durationInFrames={frames} fps={FPS} compositionWidth={1080} compositionHeight={1920} frameToDisplay={Math.min(frames - 1, Math.round(frames * at))} style={{ width: '100%', height: '100%' }} />
          </PreviewBoundary>
        </PreviewMode.Provider>
      )}
      {bare ? null : <Watermark small />}
    </div>
  );
};

const Glyph: React.FC<{ d: string; fill?: boolean; size?: number }> = ({ d, fill, size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={fill ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const G = {
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  similar: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  sound: 'M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7',
  mute: 'M4 9v6h4l5 4V5L8 9zM17 9l4 6M21 9l-4 6',
  back: 'M15 5l-7 7 7 7',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  sparkle: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4',
  save: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  close: 'M6 6l12 12M18 6L6 18',
  text: 'M5 6h14M12 6v13M9 19h6',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
};

// ---------- the pick screen: a small preview, the versions to choose from, and the reel's scenes ----------

/** One cut of an AI-made reel, lettered A, B, C… with its place on the reel's clock (frames). */
type Scene = { i: number; label: string; from: number; dur: number };
const sceneLabel = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(65 + (i % 26))}${Math.floor(i / 26) + 1}`);
const scenesOf = (p: EffectsReelProps): Scene[] => {
  let at = 0;
  return p.segments.map((s, i) => {
    const dur = Math.max(1, Math.round((s.end - s.start) * FPS));
    const sc = { i, label: sceneLabel(i), from: at, dur };
    at += dur;
    return sc;
  });
};
const clock = (frames: number) => {
  const s = Math.max(0, frames / FPS);
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** A version on the pick screen: what it changes (`kind`, e.g. 字幕) and how. */
type Edition = LookOpt & { kind: string };

/** The cut as the AI made it, so "the first version" is always one tap away. */
const sceneSnapshot = (orig: EffectsReelProps['segments'][number], i: number): Edition => {
  const sig = (s: EffectsReelProps['segments'][number]) => s.effect + JSON.stringify(s.style ?? {}) + (s.text ?? '') + JSON.stringify(s.shot ?? {});
  return {
    id: `orig-${i}`,
    kind: tr("AIの案"),
    name: tr("最初の案"),
    seg: i,
    apply: (x) => {
      x.segments[i].effect = orig.effect;
      x.segments[i].style = structuredClone(orig.style);
      x.segments[i].text = orig.text;
      x.segments[i].shot = structuredClone(orig.shot);
    },
    on: (x) => sig(x.segments[i]) === sig(orig),
  };
};

/** Pictures this reel already has (made for its cutaway beats), to offer on other scenes too. */
const reelPictures = (p: EffectsReelProps) => [...new Set(p.segments.map((s) => s.shot?.image).filter((x): x is string => Boolean(x && !x.startsWith('prompt:'))))];

/**
 * Other editions of one cut, each one visibly different in its thumbnail: how the speaker is framed
 * (寄り / 引き / 三分割), a cutaway instead of the speaker (full-screen line, picture, split screen), the
 * scene's look, the color, the captions. Picks only touch this cut, and picks of different kinds add up.
 */
const sceneEditions = (p: EffectsReelProps, i: number, seed: number): Edition[] => {
  const r = rng(seed * 97 + i * 131 + 7);
  const seg = p.segments[i];
  const st = seg.style ?? {};
  const sh: Shot = seg.shot ?? {};
  const layout = sh.layout ?? 'speaker';
  const ax = recipeAxes(recipeById(p.recipe));
  const style = (patch: Partial<BeatStyle>) => (x: EffectsReelProps) => void (x.segments[i].style = { ...(x.segments[i].style ?? {}), ...patch });
  const shot = (patch: Shot) => (x: EffectsReelProps) => void (x.segments[i].shot = { ...(x.segments[i].shot ?? {}), ...patch });
  const out: Edition[] = [];
  // framing: the speaker tighter or wider than now (scenes that box the footage keep the recorded framing)
  if (!UNFRAMED_SCENES.includes(seg.effect)) {
    const cur: Framing | undefined = layout === 'speaker' ? (sh.framing ?? 'wide') : undefined;
    const want: Framing[] = cur === 'close' ? ['wide', r() < 0.5 ? 'thirdsL' : 'thirdsR'] : cur === 'wide' ? ['close', r() < 0.5 ? 'thirdsL' : 'thirdsR'] : ['close', 'wide'];
    for (const f of want.filter((f) => f !== cur && framings.includes(f))) {
      out.push({
        id: `fr-${i}-${f}`,
        kind: tr("構図"),
        name: tr(FRAMING_LABEL[f]),
        seg: i,
        apply: shot({ layout: 'speaker', framing: f, move: f === 'wide' ? 'pull' : 'push' }),
        on: (x) => (x.segments[i].shot?.layout ?? 'speaker') === 'speaker' && x.segments[i].shot?.framing === f,
      });
    }
  }
  // cutaways: the line full-screen, a picture of what is said, the speaker over the picture; or back to the speaker
  const pic = sh.image ?? reelPictures(p)[i % Math.max(1, reelPictures(p).length)];
  const lays = (['text', 'broll', 'split'] as const).filter((l) => l !== layout && (l === 'text' || pic));
  for (const l of pickN(lays, layout === 'speaker' ? 2 : 1, r)) {
    out.push({
      id: `ly-${i}-${l}`,
      kind: l === 'text' ? tr("レイアウト") : tr("画像"),
      name: tr(LAYOUT_LABEL[l]),
      seg: i,
      apply: shot({ layout: l, move: 'push', image: l === 'text' ? sh.image : pic }),
      on: (x) => x.segments[i].shot?.layout === l,
    });
  }
  if (layout !== 'speaker') {
    out.push({ id: `ly-${i}-speaker`, kind: tr("レイアウト"), name: tr(LAYOUT_LABEL.speaker), seg: i, apply: shot({ layout: 'speaker', framing: 'medium' }), on: (x) => showsSpeaker(x.segments[i]) });
  }
  const fxPool = [...new Set([...ax.scenes, ...HOOK_FX])].filter((fx) => fx !== seg.effect && (OWN_TYPE.has(fx) ? Boolean(seg.caption || seg.text) : true));
  const fxOpt = (fx: EffectId): Edition => ({
    id: `fx-${i}-${fx}`,
    kind: tr("演出"),
    name: effectLabel(fx),
    seg: i,
    apply: (x) => {
      x.segments[i].effect = fx;
      // a scene plays on the speaker, so a cutaway beat comes back to them
      if (x.segments[i].shot?.layout && x.segments[i].shot!.layout !== 'speaker') x.segments[i].shot = { ...x.segments[i].shot, layout: 'speaker', framing: 'medium' };
      if (!x.segments[i].text) x.segments[i].text = (x.segments[i].caption ?? '').split(/[、。,.!?！？]/)[0].slice(0, 24) || undefined;
    },
    on: (x) => x.segments[i].effect === fx && showsSpeaker(x.segments[i]),
  });
  const fxs = pickN(fxPool, 2, r);
  out.push(fxOpt(fxs[0]));
  const g = pickN(grades.filter((v) => v !== st.grade && v !== 'natural'), 1, r)[0];
  out.push({ id: `gr-${i}-${g}`, kind: tr("色"), name: lbl('grade', g), seg: i, apply: style({ grade: g }), on: (x) => x.segments[i].style?.grade === g });
  if (seg.caption && layout !== 'text') {
    const c = pickN(captionStyles.filter((v) => v !== st.caption), 1, r)[0];
    out.push({ id: `cap-${i}-${c}`, kind: tr("字幕"), name: lbl('caption', c), seg: i, apply: style({ caption: c }), on: (x) => x.segments[i].style?.caption === c });
  }
  if (out.length < 7 && fxs[1]) out.push(fxOpt(fxs[1]));
  return out.slice(0, 7);
};

/**
 * The whole reel cut another way: new framings on every speaker beat and other beats cut away to the
 * line or to the reel's pictures (no new AI pictures are made).
 */
const recutOpt = (p: EffectsReelProps, seed: number): Edition => {
  const pics = reelPictures(p);
  const dir = directShots(
    p.segments.map((s) => ({ effect: s.effect, start: s.start, end: s.end, caption: s.caption, emphasis: s.emphasis })),
    [],
    { seed: seed * 7 + 3, pictures: pics.length },
  );
  let k = 0;
  const shots: Shot[] = dir.map((d, i) => {
    const sh = { ...d.shot };
    if (sh.layout === 'broll' || sh.layout === 'split') sh.image = pics[k++ % Math.max(1, pics.length)];
    // keep the planner's punch-in on the key word when the beat stays on the speaker
    if ((sh.layout ?? 'speaker') === 'speaker' && p.segments[i].shot?.punch !== undefined && sh.framing !== 'close') sh.punch = p.segments[i].shot!.punch;
    return sh;
  });
  const sig = JSON.stringify(shots);
  return {
    id: `recut-${seed}`,
    kind: tr("構図"),
    name: tr("別のカット割り"),
    seg: 0,
    apply: (x) => x.segments.forEach((s, i) => (s.shot = structuredClone(shots[i]))),
    on: (x) => JSON.stringify(x.segments.map((s) => s.shot ?? {})) === sig,
  };
};

/** The whole reel as the AI first made it. */
const reelSnapshot = (orig: EffectsReelProps): Edition => {
  const sig = (x: EffectsReelProps) => x.segments.map((s) => s.effect + JSON.stringify(s.style ?? {}) + JSON.stringify(s.shot ?? {})).join() + x.palette.accent;
  const want = sig(orig);
  return {
    id: 'orig',
    kind: tr("AIの案"),
    name: tr("最初の案"),
    seg: 0,
    apply: (x) => {
      x.recipe = orig.recipe;
      x.palette = structuredClone(orig.palette);
      // 「もっと短く」 took beats out: the first take has them all again
      if (x.segments.length !== orig.segments.length) (x.segments = structuredClone(orig.segments)), (x.speech = structuredClone(orig.speech));
      x.segments.forEach((s, k) => ((s.effect = orig.segments[k].effect), (s.style = structuredClone(orig.segments[k].style)), (s.text = orig.segments[k].text), (s.shot = structuredClone(orig.segments[k].shot))));
    },
    on: (x) => sig(x) === want,
  };
};

// ---------- mood quick picks: one tap changes several options at once ----------

type MoodId = 'luxe' | 'fun' | 'short' | 'less';
const MOOD_NAMES: { id: MoodId; name: string; icon: string }[] = [
  { id: 'luxe', name: tr("もっと高級に"), icon: G.sparkle },
  { id: 'fun', name: tr("もっと楽しく"), icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01' },
  { id: 'short', name: tr("もっと短く"), icon: 'M6 4l6 6 6-6M6 20l6-6 6 6' },
  { id: 'less', name: tr("文字を少なく"), icon: 'M5 6h14M12 6v13M4 20L20 4' },
];
const cycle = <T,>(arr: readonly T[], i: number) => arr[i % arr.length];
const PLAYFUL = new Set(['stickers', 'emoji', 'arrows', 'sparkles', 'beatFlash', 'underline']);
const isCjk = (l?: string) => l === undefined || l === 'ja' || l === 'zh';

/** Seconds of a reel (segments play back to back). */
const reelSeconds = (p: EffectsReelProps) => p.segments.reduce((a, s) => a + Math.max(0, s.end - s.start), 0);

/**
 * About a quarter shorter: drops the middle beats that say least (shortest lines), never the first or last,
 * never below three beats. The speech map (for ducking) is moved along with the beats that stay.
 */
const shortenReel = (x: EffectsReelProps) => {
  const n = x.segments.length;
  if (n <= 3) return;
  const drop = new Set(
    x.segments
      .map((s, i) => ({ i, score: (s.caption ?? '').length + (s.text ? 6 : 0) + (s.values?.length ? 20 : 0) }))
      .filter((c) => c.i > 0 && c.i < n - 1)
      .sort((a, b) => a.score - b.score)
      .slice(0, Math.min(n - 3, Math.max(1, Math.round(n * 0.25))))
      .map((c) => c.i),
  );
  let oldAt = 0;
  let newAt = 0;
  const speech: [number, number][] = [];
  x.segments.forEach((s, i) => {
    const d = Math.max(0, s.end - s.start);
    if (!drop.has(i)) {
      for (const [a, b] of x.speech ?? []) {
        const from = Math.max(a, oldAt);
        const to = Math.min(b, oldAt + d);
        if (to > from) speech.push([+(from - oldAt + newAt).toFixed(2), +(to - oldAt + newAt).toFixed(2)]);
      }
      newAt += d;
    }
    oldAt += d;
  });
  x.segments = x.segments.filter((_, i) => !drop.has(i));
  if (x.speech) x.speech = speech;
};

/**
 * What each mood does to a talking reel. Only free options: colours, fonts, captions, camera, cuts, accents and
 * length; the music changes only to a kind already made for this reel (picking it again is free).
 */
const applyMood = (x: EffectsReelProps, mood: MoodId, tracks: Record<string, string> = {}) => {
  const style = (i: number, patch: Partial<BeatStyle>) => (x.segments[i].style = { ...(x.segments[i].style ?? {}), ...patch });
  if (mood === 'luxe') {
    x.palette = { accent: '#F2E3A0', ink: '#FFFFFF', paper: '#16130B' };
    x.segments.forEach((s, i) =>
      style(i, {
        grade: 'film',
        color: '#F2E3A0',
        font: isCjk(x.lang) ? 'mincho' : 'serif',
        caption: 'spaced',
        camera: cycle(['dollyIn', 'drift', 'push'] as const, i),
        transition: i ? cycle(['blurDissolve', 'dip'] as const, i) : s.style?.transition,
        texture: 'grain',
        accents: (s.style?.accents ?? []).filter((a) => !PLAYFUL.has(a)) as never,
      }),
    );
    const t = tracks.classical ?? tracks.jazz;
    if (t) x.music = t;
  } else if (mood === 'fun') {
    x.palette = { accent: '#FF6FB5', ink: '#FFFFFF', paper: '#1E0F18' };
    x.segments.forEach((s, i) =>
      style(i, {
        grade: 'punchy',
        color: cycle(['#FF6FB5', '#FFC542', '#29D3F0'], i),
        font: isCjk(x.lang) ? 'sansJP' : 'display',
        caption: 'bounce',
        camera: cycle(['punch', 'shake', 'spinIn'] as const, i),
        transition: i ? cycle(['whipLeft', 'whipUp', 'zoomBlur', 'flash'] as const, i) : s.style?.transition,
        texture: 'none',
        accents: [...new Set([...(s.style?.accents ?? []).filter((a) => a !== 'letterbox'), ...(i % 2 ? ['emoji'] : ['sparkles'])])] as never,
      }),
    );
    if (tracks.pop) x.music = tracks.pop;
  } else if (mood === 'short') {
    shortenReel(x);
  } else {
    // fewer words on screen: 1-3 words at a time, no full-screen lines or word-heavy scenes, no extra labels
    x.segments.forEach((s, i) => {
      style(i, { caption: 'keyword', accents: (s.style?.accents ?? []).filter((a) => !['emoji', 'stickers', 'arrows', 'echo', 'underline'].includes(a)) as never });
      if (s.shot?.layout === 'text') s.shot = { ...s.shot, layout: 'speaker', framing: 'medium' };
      if (OWN_TYPE.has(s.effect) && i > 0) s.effect = 'digitalZoom';
      if (i > 0) s.text = undefined;
    });
  }
};

/**
 * The quick picks above the detailed choices: one tap applies a whole mood, a second chip undoes it.
 * `apply` returns the new props; nothing here costs tokens.
 */
const MoodChips: React.FC<{ p: any; onApply: (mood: MoodId) => void; onUndo?: () => void; last?: MoodId | null; note?: string }> = ({ onApply, onUndo, last, note }) => (
  <div className="moods" role="group" aria-label={tr("ひとことで変える")}>
    <div className="moodrow">
      {MOOD_NAMES.map((m) => (
        <button key={m.id} className={`mood ${last === m.id ? 'on' : ''}`} onClick={() => onApply(m.id)}>
          <Glyph d={m.icon} size={16} />
          {m.name}
        </button>
      ))}
      {onUndo ? (
        <button className="mood undo" onClick={onUndo}>
          <Glyph d="M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3" size={16} />
          {tr("元に戻す")}
        </button>
      ) : null}
    </div>
    {note ? <p className="moodnote">{note}</p> : null}
  </div>
);

/** Mood state for a screen: the props before the last tap (for 元に戻す) and a one-line note of what changed. */
const useMood = <P,>(p: P, update: (fn: (x: P) => P) => void, apply: (x: P, mood: MoodId) => void, describe?: (before: P, after: P, mood: MoodId) => string) => {
  const [prev, setPrev] = useState<P | null>(null);
  const [last, setLast] = useState<MoodId | null>(null);
  const [note, setNote] = useState('');
  const onApply = (mood: MoodId) => {
    const before = structuredClone(p);
    const after = structuredClone(p);
    apply(after, mood);
    setPrev(before);
    setLast(mood);
    setNote(describe ? describe(before, after, mood) : '');
    update(() => after);
  };
  const onUndo = prev
    ? () => {
        const back = prev;
        setPrev(null);
        setLast(null);
        setNote('');
        update(() => structuredClone(back));
      }
    : undefined;
  return { onApply, onUndo, last, note };
};

const moodNote = (before: EffectsReelProps, after: EffectsReelProps, mood: MoodId) =>
  mood === 'short'
    ? after.segments.length === before.segments.length
      ? tr("これ以上は短くできません")
      : tr("{0}秒 → {1}秒（話の少ないシーンを外しました）", Math.round(reelSeconds(before)), Math.round(reelSeconds(after)))
    : mood === 'luxe'
      ? tr("色・書体・字幕・カメラ・つなぎを落ち着いた高級感のある組み合わせにしました")
      : mood === 'fun'
        ? tr("色・字幕・カメラ・つなぎを明るく弾む組み合わせにしました")
        : tr("字幕を1〜3語ずつにして、文字だけの画面を減らしました");

/** Track rows under the preview. Read-only: they show what is in each scene, they are not for editing. */
const TRACKS: { id: 'video' | 'picture' | 'audio' | 'text'; name: string }[] = [
  { id: 'video', name: tr("動画") },
  { id: 'picture', name: tr("画像") },
  { id: 'audio', name: tr("音声") },
  { id: 'text', name: tr("テキスト") },
];
const PICTURE_ACCENTS = new Set(['stickers', 'emoji', 'sparkles', 'arrows']);

/** 音楽の種類 on the pick screen (the server holds the prompt for each). */
const MUSIC_GENRES: { id: string; name: string; tint: string }[] = [
  { id: 'jazz', name: tr("ジャズ風"), tint: '#c98b3c' },
  { id: 'phonk', name: tr("フォンク風"), tint: '#9b4dff' },
  { id: 'classical', name: tr("クラシック風"), tint: '#7c9cff' },
  { id: 'chill', name: tr("チル風"), tint: '#3ddc97' },
  { id: 'pop', name: tr("ポップス風"), tint: '#ff7eb6' },
];
/** BGM level under the voice (ducking stays on); 中 is the default. */
const MUSIC_LEVELS: { v: number; name: string }[] = [
  { v: 0, name: tr("ミュート") },
  { v: 0.18, name: tr("小") },
  { v: MUSIC_DEFAULT, name: tr("中") },
  { v: 0.6, name: tr("大") },
];
const musicLevelOf = (p: EffectsReelProps) => {
  const v = p.musicVolume ?? MUSIC_DEFAULT;
  return MUSIC_LEVELS.reduce((a, b) => (Math.abs(b.v - v) < Math.abs(a.v - v) ? b : a)).v;
};

/**
 * The 音声 choices on the pick screen: the kind of music (each new kind is made once, free, and kept on the job
 * so going back to it is instant) and how loud it sits under the voice.
 */
const AudioOptions: React.FC<{
  jobId: string;
  p: EffectsReelProps;
  first?: string;
  update: PanelProps<EffectsReelProps>['update'];
  tracks: Record<string, string>;
  setTracks: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}> = ({ jobId, p, first, update, tracks, setTracks }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api<Job>(`/api/jobs/${jobId}`)
      .then((j) => setTracks((t) => ({ ...t, ...(j.musicTracks ?? {}) })))
      .catch(() => {});
  }, [jobId]);
  const original = tracks.original ?? first;
  const setMusic = (music: string | undefined) => update((x) => ((x.music = music), x));
  const pickGenre = async (g: string) => {
    setErr('');
    if (tracks[g]) return setMusic(tracks[g]);
    setBusy(g);
    try {
      const j = await api<Job>(`/api/jobs/${jobId}/music`, { method: 'POST', body: JSON.stringify({ genre: g }) });
      setTracks((t) => ({ ...t, ...(j.musicTracks ?? {}) }));
      const music = (j.props as { music?: string } | undefined)?.music;
      if (music) setMusic(music);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setBusy(null);
  };
  const level = musicLevelOf(p);
  const check = (
    <span className="edcheck" aria-hidden>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
  const tile = (key: string, name: string, on: boolean, onClick: () => void, opts: { tint?: string; cost?: boolean; spin?: boolean; off?: boolean } = {}) => (
    <button key={key} role="option" aria-selected={on} aria-busy={opts.spin || undefined} className={`gtile ${on ? 'on' : ''} ${opts.off ? 'none' : ''}`} style={opts.tint ? ({ '--tint': opts.tint } as React.CSSProperties) : undefined} disabled={busy !== null && !opts.spin} onClick={onClick}>
      <span className="gicon" aria-hidden>
        {opts.spin ? <i className="gspin" /> : <Glyph d={opts.off ? G.mute : G.sound} size={16} />}
      </span>
      <b>{name}</b>
      {opts.spin ? <small>{tr("曲を作っています…")}</small> : opts.cost ? <small className="tokcost">{tr("無料")}</small> : null}
      {on ? check : null}
    </button>
  );
  return (
    <div className="audopts">
      <div className="audsec">
        <span className="audlabel">{tr("音量")}</span>
        <div className="seg" role="radiogroup" aria-label={tr("BGMの大きさ")}>
          {MUSIC_LEVELS.map((l) => (
            <button key={l.v} role="radio" aria-checked={level === l.v} className={level === l.v ? 'on' : ''} disabled={!p.music} onClick={() => update((x) => ((x.musicVolume = l.v), (x.duck = undefined), x))}>
              {l.name}
            </button>
          ))}
        </div>
      </div>
      <div className="audsec">
        <span className="audlabel">{tr("音楽の種類")}</span>
        <div className="gtiles" role="listbox" aria-label={tr("音楽の種類")}>
          {MUSIC_GENRES.map((g) => tile(g.id, g.name, Boolean(p.music && tracks[g.id] === p.music), () => pickGenre(g.id), { tint: g.tint, cost: !tracks[g.id], spin: busy === g.id }))}
          {original ? tile('original', tr("最初の曲"), p.music === original, () => setMusic(original), { tint: '#dfff4f' }) : null}
          {tile('none', tr("音楽なし"), !p.music, () => setMusic(undefined), { off: true })}
        </div>
        {err ? <p className="err">{err}</p> : null}
      </div>
    </div>
  );
};

/**
 * The pick screen (owner's sketch): a small preview on the left, the versions to choose from on the right
 * ("どれにしますか？"), and under them the reel as scenes on a timeline. Tap a scene and the preview shows
 * that scene and the grid shows other editions of it; with no scene chosen, the grid holds whole-reel
 * versions. Nothing here is edited by hand: every change is a tap on a version the AI made.
 */
const PickBoard: React.FC<{ job: Job; p: EffectsReelProps; update: PanelProps<EffectsReelProps>['update']; onDone: () => void }> = ({ job, p, update, onDone }) => {
  const [sel, setSel] = useState<number | null>(null);
  // 音声 chosen: the grid holds the music choices (kind and level) for the whole reel
  const [aud, setAud] = useState(false);
  const [tracks, setTracks] = useState<Record<string, string>>(job.musicTracks ?? {});
  const [seed, setSeed] = useState(() => 1 + Math.floor(Math.random() * 1e5));
  // what the AI made, as it was when this screen opened
  const orig = useRef(structuredClone(p)).current;
  const live = useRef(p);
  live.current = p;
  const scenes = useMemo(() => scenesOf(p), [p.segments]);
  const total = scenes.length ? scenes[scenes.length - 1].from + scenes[scenes.length - 1].dur : 1;
  const sc = sel === null ? null : scenes[Math.min(sel, scenes.length - 1)];
  useEffect(() => void (sel !== null && sel >= scenes.length && setSel(null)), [scenes.length]);
  // dealt once per scene / reshuffle, so taking one does not reshuffle the rest
  const editions = useMemo<Edition[]>(
    () =>
      sel === null
        ? [reelSnapshot(orig), ...(live.current.segments.some((s) => s.shot) ? [recutOpt(live.current, seed)] : []), ...BUILD_STEPS[0].deal(live.current, seed).map((o) => ({ ...o, kind: '' }))]
        : [sceneSnapshot(orig.segments.find((s) => s.start === live.current.segments[sel]?.start) ?? orig.segments[sel], sel), ...sceneEditions(live.current, sel, seed)],
    [sel, seed],
  );
  const take = (o: Edition) => update((x) => (o.apply(x), x));
  const mood = useMood(p, update, (x, m) => applyMood(x, m, tracks), moodNote);

  // preview: one player, a still until tapped
  const solo = useSolo();
  const [playing, , stopPlaying] = solo;
  const ref = useRef<PlayerRef | null>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const pl = ref.current;
    if (sc && pl) pl.seekTo(sc.from);
  }, [sel]);
  useEffect(() => void (muted ? ref.current?.mute() : ref.current?.unmute()), [muted, playing]);

  // timeline geometry: scene widths follow their length, never narrower than a finger
  const LABEL_W = 64;
  const MIN_W = 46;
  const scroller = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(300);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvail(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const xs = useMemo(() => {
    const k = avail / total;
    let x = 0;
    return scenes.map((s) => {
      const w = Math.max(MIN_W, s.dur * k);
      const at = x;
      x += w;
      return { x: at, w };
    });
  }, [scenes, avail, total]);
  const width = xs.length ? xs[xs.length - 1].x + xs[xs.length - 1].w : avail;
  const xAt = (f: number) => {
    const k = scenes.findIndex((s) => f < s.from + s.dur);
    const j = k < 0 ? scenes.length - 1 : k;
    if (j < 0) return 0;
    return xs[j].x + (Math.min(scenes[j].dur, Math.max(0, f - scenes[j].from)) / scenes[j].dur) * xs[j].w;
  };
  // playhead and clock follow the player without re-rendering the screen
  const head = useRef<HTMLDivElement>(null);
  const time = useRef<HTMLSpanElement>(null);
  const restFrame = sc ? sc.from : 0;
  useEffect(() => {
    const put = (f: number) => {
      if (head.current) head.current.style.transform = `translateX(${xAt(f)}px)`;
      if (time.current) time.current.textContent = `${clock(f)} / ${clock(total)}`;
    };
    if (!playing) return put(restFrame);
    let raf = 0;
    let wasPaused: boolean | null = null;
    const tick = () => {
      const pl = ref.current;
      if (pl) {
        put(pl.getCurrentFrame());
        const now = !pl.isPlaying();
        if (now !== wasPaused) setPaused((wasPaused = now));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, restFrame, xs, total]);
  // keep the chosen scene in view
  useEffect(() => {
    const el = scroller.current;
    if (!el || sel === null || !xs[sel]) return;
    const { x, w } = xs[sel];
    if (x < el.scrollLeft || x + w > el.scrollLeft + el.clientWidth) el.scrollTo({ left: Math.max(0, x - 24), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [sel]);

  const toggle = () => {
    if (!playing) return solo[1]();
    const pl = ref.current;
    if (!pl) return;
    pl.isPlaying() ? pl.pause() : pl.play();
  };
  const choose = (k: number | null) => {
    setAud(false);
    setSel(k === sel && !aud ? null : k);
    setSeed((s) => s + 1);
  };
  const chooseAudio = () => {
    setSel(null);
    setAud((a) => !a);
  };
  // the voice as a waveform where someone speaks (stable bars from the speech stretches), the BGM as a line
  const wave = useMemo(() => {
    const bars: { x: number; h: number }[] = [];
    const r = rng(7);
    for (const [a, b] of p.speech ?? []) {
      for (let x = xAt(a * FPS); x < xAt(b * FPS); x += 4) bars.push({ x, h: 0.25 + 0.75 * Math.abs(Math.sin(x * 0.13) * 0.6 + r() * 0.4) });
    }
    return bars;
  }, [p.speech, xs]);
  const seg = sc ? p.segments[sc.i] : null;
  return (
    <div className="board">
      <div className="boardtop">
        <div className="boardpv">
          <ReelPlayer
            props={p}
            playerRef={ref}
            solo={solo}
            inFrame={sc ? sc.from : undefined}
            outFrame={sc ? sc.from + sc.dur - 1 : undefined}
            at={sc ? (sc.from + sc.dur * 0.5) / total : 0.3}
          />
          {sc ? <span className="boardbadge">{tr("シーン {0}", sc.label)}</span> : aud ? <span className="boardbadge">{tr("音声")}</span> : null}
          {playing ? (
            <button className="boardsound" onClick={() => setMuted((m) => !m)} aria-label={tr("音")} aria-pressed={!muted}>
              <Glyph d={muted ? G.mute : G.sound} size={16} />
            </button>
          ) : null}
        </div>
        <div className="boardopts">
          <div className="boardoptsin">
            <div className="boardq">
              <b>{tr("どれにしますか？")}</b>
              <small>{aud ? tr("動画全体の音楽と音量") : sc ? tr("シーン {0} の別バージョン", sc.label) : tr("動画全体の案")}</small>
            </div>
            {aud ? (
              <AudioOptions jobId={job.id} p={p} first={orig.music} update={update} tracks={tracks} setTracks={setTracks} />
            ) : (
              <div className="boardgrid" role="listbox" aria-label={tr("どれにしますか？")}>
                {editions.map((o) => {
                  const on = o.on(p);
                  return (
                    <button key={o.id} role="option" aria-selected={on} className={`ed ${on ? 'on' : ''}`} onClick={() => take(o)}>
                      <div className="edthumb">
                        <ReelStill props={sc ? withOpt(p, o, true) : withOpt(p, o)} at={sc ? 0.6 : 0.3} bare />
                        {o.kind ? <span className="edkind">{o.kind}</span> : null}
                        {on ? (
                          <span className="edcheck" aria-hidden>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 12.5l4.5 4.5L19 7.5" />
                            </svg>
                          </span>
                        ) : null}
                        <b className="edname">{o.name}</b>
                      </div>
                    </button>
                  );
                })}
                <button className="ed more" onClick={() => setSeed((s) => s + 1)}>
                  <div className="edthumb">
                    <Glyph d={G.similar} size={22} />
                    <span>{tr("別の案を出す")}</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <MoodChips p={p} {...mood} />

      <div className="tl" aria-label={tr("シーン")}>
        <div className="tlbar">
          <button className="tlplay" onClick={toggle} aria-label={playing && !paused ? tr("一時停止") : tr("再生")}>
            {playing && !paused ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          <span className="tltime" ref={time}>
            {clock(restFrame)} / {clock(total)}
          </span>
          <span className="tlhint">{sc ? (seg?.caption ? `“${seg.caption}”` : '') : aud ? tr("BGMは動画全体に流れます") : tr("シーンをタップして選べます")}</span>
          <button className={`tlall ${sel === null && !aud ? 'on' : ''}`} onClick={() => (setSel(null), setAud(false), setSeed((s) => s + 1), playing && stopPlaying())}>
            {tr("全体")}
          </button>
        </div>
        <div className="tlbody">
          <div className="tllabels" style={{ width: LABEL_W }}>
            <span className="tlrulerpad" />
            {TRACKS.map((t) => (
              <span key={t.id}>{t.name}</span>
            ))}
          </div>
          <div className="tlscroll" ref={scroller}>
            <div className="tlinner" style={{ width }}>
              {scenes.map((s, k) => {
                const g = p.segments[k];
                const st = g.style ?? {};
                const lay = g.shot?.layout ?? 'speaker';
                const img = (lay === 'broll' || lay === 'split') && g.shot?.image && !g.shot.image.startsWith('prompt:') ? g.shot.image : undefined;
                const pic =
                  lay !== 'speaker'
                    ? tr(LAYOUT_LABEL[lay])
                    : EFFECT_GROUP[g.effect] !== 'camera'
                      ? effectLabel(g.effect)
                      : (st.accents ?? []).filter((a) => PICTURE_ACCENTS.has(a)).map((a) => lbl('accent', a)).join(' · ');
                return (
                  <button key={k} className={`tlcol ${sel === k ? 'on' : ''}`} style={{ left: xs[k]?.x, width: xs[k]?.w }} onClick={() => choose(k)} aria-pressed={sel === k} aria-label={tr("シーン {0}", s.label)}>
                    <span className="tlruler">
                      <b>{s.label}</b>
                      <small>{((g.end - g.start) || 0).toFixed(1)}s</small>
                    </span>
                    <span className="tlcell video" style={{ backgroundImage: posterOf(p.video, g.start + 0.4, true) ? `url("${posterOf(p.video, g.start + 0.4, true)}")` : undefined }} />
                    <span className={`tlcell picture ${pic ? '' : 'empty'} ${img ? 'img' : ''} ${lay === 'text' ? 'card' : ''}`} style={img ? { backgroundImage: `url("${asset(img)}")` } : undefined}>
                      {pic ? <span className="tlclamp">{pic}</span> : null}
                    </span>
                    <span className="tlcell audiogap" aria-hidden />
                    <span className={`tlcell text ${g.caption || g.text ? '' : 'empty'}`}>{g.caption || g.text ? <span className="tlclamp">{g.caption || g.text}</span> : null}</span>
                  </button>
                );
              })}
              <div className="tlaudrow">
                <button className={`tlaudio ${aud ? 'on' : ''}`} onClick={chooseAudio} aria-pressed={aud} aria-label={tr("音声")}>
                  <svg className="tlwave" width={width} height="100%" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" aria-hidden>
                    {wave.map((b, k) => (
                      <rect key={k} x={b.x} y={50 - b.h * 34} width={2} height={b.h * 68} rx={1} />
                    ))}
                  </svg>
                  {p.music ? <i className="tlmusic" style={{ opacity: 0.35 + musicLevelOf(p) }} /> : null}
                  <span className="tlaudname">{p.music ? (MUSIC_GENRES.find((g) => tracks[g.id] === p.music)?.name ?? tr("BGM")) : tr("音楽なし")}</span>
                </button>
              </div>
              <div className="tlhead" ref={head} aria-hidden>
                <i />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="pickcta">
        <button className="btn" onClick={onDone}>
          {tr("これで書き出す")}
        </button>
      </div>
    </div>
  );
};

const STICKERS = stickerIds;
const OVERLAY_COLORS = ['#DFFF4F', '#FFFFFF', '#FF5A36', '#7C9CFF', '#FF7EB6', '#0A0A0B'];

/** Drag the caption up or down on the video itself, or with the slider; brightness with one slider; premium layers on top. */
const PickTune: React.FC<{ jobId: string; tracks?: Record<string, string>; p: EffectsReelProps; update: PanelProps<EffectsReelProps>['update']; onNext: () => void }> = ({ jobId, tracks, p, update, onNext }) => {
  const mood = useMood(p, update, (x, m) => applyMood(x, m, tracks), moodNote);
  const [song, setSong] = useState<'idle' | 'busy' | string>('idle');
  const newSong = async () => {
    setSong('busy');
    try {
      const j = await api<Job>(`/api/jobs/${jobId}/music`, { method: 'POST', body: '{}' });
      const music = (j.props as { music?: string } | undefined)?.music;
      update((x) => void (x.music = music));
      setSong('idle');
    } catch (e) {
      setSong(e instanceof Error ? e.message : String(e));
    }
  };
  const set = (fn: (x: EffectsReelProps) => void) => update((x) => (fn(x), x));
  const ref = useRef<PlayerRef | null>(null);
  const solo = useSolo();
  const drag = useRef<{ x: number; y: number; moved: boolean; layer: number | null } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const capY = p.captionY;
  const bright = p.brightness ?? 1;
  const layers = p.overlays ?? [];
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(0.95, Math.max(0.05, (e.clientX - r.left) / r.width)), y: Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height)) };
  };
  const addLayer = (o: Overlay) => {
    set((x) => void (x.overlays = [...(x.overlays ?? []), o]));
    setSel(layers.length);
  };
  const editLayer = (k: number, patch: Partial<Overlay>) => set((x) => void (x.overlays = (x.overlays ?? []).map((o, j) => (j === k ? { ...o, ...patch } : o))));
  const dropLayer = (k: number) => {
    set((x) => void (x.overlays = (x.overlays ?? []).filter((_, j) => j !== k)));
    setSel(null);
  };
  const cur = sel !== null ? layers[sel] : undefined;
  return (
    <>
      <div className="pickreel tune">
        <div className="pickplayer">
          <ReelPlayer props={p} playerRef={ref} solo={solo} />
        </div>
        <div
          className={`capdrag ${dragging ? 'on' : ''}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const pt = at(e);
            // grab the nearest layer under the finger, else the caption line
            const hit = layers.findIndex((o) => Math.abs(o.x - pt.x) < 0.12 && Math.abs(o.y - pt.y) < 0.08);
            drag.current = { x: e.clientX, y: e.clientY, moved: false, layer: hit >= 0 ? hit : null };
            if (hit >= 0) setSel(hit);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d) return;
            if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
            d.moved = true;
            setDragging(true);
            const pt = at(e);
            if (d.layer !== null) editLayer(d.layer, { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 });
            else set((x) => void (x.captionY = Math.min(0.9, Math.round(pt.y * 100) / 100)));
          }}
          onPointerUp={() => {
            if (drag.current && !drag.current.moved && drag.current.layer === null) !solo[0] ? solo[1]() : ref.current?.isPlaying() ? ref.current.pause() : ref.current?.play();
            drag.current = null;
            setDragging(false);
          }}
        >
          <div className="capline" style={{ top: `${Math.round((capY ?? 0.62) * 100)}%` }}>
            <span>{capY === undefined ? tr("字幕（おまかせ）") : tr("字幕")}</span>
          </div>
          {layers.map((o, k) => (
            <i key={k} className={`layerdot ${sel === k ? 'on' : ''}`} style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%` }} />
          ))}
        </div>
      </div>
      <MoodChips p={p} {...mood} />
      <p className="pickhint">{tr("字幕やステッカーは、動画の上で指でドラッグして動かせます。")}</p>
      <div className="picktools">
        <div className="field">
          <label>
            <span>{tr("字幕の高さ")}</span>
            <button className={`chipbtn ${capY === undefined ? 'on' : ''}`} onClick={() => set((x) => void (x.captionY = undefined))}>
              {tr("おまかせ")}
            </button>
          </label>
          <input type="range" min={0.05} max={0.9} step={0.01} value={capY ?? 0.62} aria-label={tr("字幕の高さ")} onChange={(e) => set((x) => void (x.captionY = Number(e.target.value)))} />
          <div className="rangeends">
            <span>{tr("上")}</span>
            <span>{tr("下")}</span>
          </div>
        </div>
        <div className="field">
          <label>
            <span>{tr("明るさ")}</span>
            <span>{bright === 1 ? tr("そのまま") : `${bright > 1 ? '+' : ''}${Math.round((bright - 1) * 100)}`}</span>
          </label>
          <input type="range" min={0.6} max={1.4} step={0.02} value={bright} aria-label={tr("明るさ")} onChange={(e) => set((x) => void (x.brightness = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))} />
          <div className="rangeends">
            <span>{tr("暗く")}</span>
            <span>{tr("明るく")}</span>
          </div>
        </div>
        <div className="field">
          <label>
            <span>{tr("声の大きさ")}</span>
            <span>{Math.round((p.voiceVolume ?? 1) * 100)}%</span>
          </label>
          <input type="range" min={0} max={1.5} step={0.05} value={p.voiceVolume ?? 1} aria-label={tr("声の大きさ")} onChange={(e) => set((x) => void (x.voiceVolume = Number(e.target.value) === 1 ? undefined : Number(e.target.value)))} />
        </div>
        {p.music ? (
          <div className="field">
            <label>
              <span>{tr("BGMの大きさ")}</span>
              <button className={`chipbtn ${p.duck !== false ? 'on' : ''}`} onClick={() => set((x) => void (x.duck = x.duck === false ? undefined : false))}>
                {tr("話す間は自動で下げる")}
              </button>
            </label>
            <input type="range" min={0} max={1} step={0.05} value={p.musicVolume ?? MUSIC_DEFAULT} aria-label={tr("BGMの大きさ")} onChange={(e) => set((x) => void (x.musicVolume = Number(e.target.value)))} />
            <div className="rangeends">
              <span>{tr("声を優先")}</span>
              <span>{tr("BGMを優先")}</span>
            </div>
            <button className="chipbtn newsong" disabled={song === 'busy'} onClick={newSong}>
              {song === 'busy' ? tr("曲を作っています…") : tr("別の曲にする")} <small className="tokcost">{tr("無料")}</small>
            </button>
            {song !== 'idle' && song !== 'busy' ? <p className="err">{song}</p> : null}
          </div>
        ) : null}
        <div className="premium">
          <div className="premiumhead">
            <b>
              <Glyph d={G.sparkle} size={18} /> {tr("プレミアム編集")}
            </b>
            <span className="cost">{tr("書き出し時に＋{0}トークン", PREMIUM_TOKENS)}</span>
          </div>
          <div className="textadd">
            <input value={draft} maxLength={40} placeholder={tr("テロップの文字を入れる")} onChange={(e) => setDraft(e.target.value)} />
            <button
              className="btn small"
              disabled={!draft.trim() || layers.length >= 12}
              onClick={() => (addLayer({ kind: 'text', text: draft.trim(), x: 0.5, y: 0.22, scale: 1 }), setDraft(''))}
            >
              <Glyph d={G.text} size={16} /> {tr("足す")}
            </button>
          </div>
          <div className="stickers">
            {STICKERS.map((id) => (
              <button key={id} aria-label={id} disabled={layers.length >= 12} onClick={() => addLayer({ kind: 'sticker', sticker: id, x: 0.72, y: 0.3, scale: 1 })}>
                <svg viewBox="0 0 100 100" width="34" height="34" aria-hidden>
                  <path d={STICKER_PATHS[id]} fill="currentColor" />
                </svg>
              </button>
            ))}
          </div>
          {cur ? (
            <div className="layeredit">
              <span>{cur.kind === 'text' ? `「${cur.text}」` : tr("ステッカー")}</span>
              <div className="swatches">
                {OVERLAY_COLORS.map((c) => (
                  <button key={c} aria-label={c} className={(cur.color ?? p.palette.accent).toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{ background: c }} onClick={() => editLayer(sel!, { color: c })} />
                ))}
              </div>
              <input type="range" min={0.4} max={2.5} step={0.05} value={cur.scale ?? 1} aria-label={tr("大きさ")} onChange={(e) => editLayer(sel!, { scale: Number(e.target.value) })} />
              <button className="iconround" aria-label={tr("消す")} onClick={() => dropLayer(sel!)}>
                <Glyph d={G.trash} size={18} />
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="pickcta">
        <button className="btn" onClick={onNext}>
          {tr("これで仕上げる")}
        </button>
      </div>
    </>
  );
};

const PickFlow: React.FC<{
  job: Job;
  p: EffectsReelProps;
  update: PanelProps<EffectsReelProps>['update'];
  saved: boolean;
  err?: string;
  hq: boolean;
  setHq: (on: boolean) => void;
  onRender: () => void;
  onAdvanced: () => void;
}> = ({ job, p, update, saved, err, hq, setHq, onRender, onAdvanced }) => {
  const [stage, setStage] = useState<PickStage>(job.status === 'done' || job.status === 'rendering' ? 'post' : 'feed');
  const at = PICK_STAGES.findIndex(([s]) => s === stage);
  const back = () => (at > 0 ? setStage(PICK_STAGES[at - 1][0]) : goBack('#/reels'));
  return (
    <div className={`pick ${stage === 'feed' ? 'pickfull' : ''}`}>
      <div className="pickhead">
        <button className="iconround" onClick={back} aria-label={tr("戻る")}>
          <Glyph d={G.back} />
        </button>
        <ol className="pickstages">
          {PICK_STAGES.map(([s, name], k) => (
            <li key={s} className={k < at ? 'done' : k === at ? 'on' : ''}>
              <button onClick={() => setStage(s)} aria-current={k === at ? 'step' : undefined}>
                {name}
              </button>
            </li>
          ))}
        </ol>
        <button className="iconround" onClick={onAdvanced} aria-label={tr("細かく選ぶ")} title={tr("細かく選ぶ")}>
          <Glyph d={G.sliders} />
        </button>
      </div>
      {stage === 'feed' ? (
        <PickBoard job={job} p={p} update={update} onDone={() => setStage('post')} />
      ) : stage === 'tune' ? (
        <PickTune jobId={job.id} tracks={job.musicTracks} p={p} update={update} onNext={() => setStage('post')} />
      ) : (
        <div className="pickpost">
          <div className="pickpostrow">
            <div className="pickthumb">
              <ReelPlayer props={p} />
            </div>
            <div>
              <h1>{job.status === 'done' && job.video ? tr("できあがりました") : tr("いい感じに仕上がりました")}</h1>
              <p className="sub">{job.title}</p>
            </div>
          </div>
          {job.status === 'rendering' ? (
            <RenderProgress job={job} />
          ) : job.status === 'done' && job.video ? (
            <>
              <div className="pickshare">
                <ShareButton job={job} />
              </div>
              <PostKit job={job} />
            </>
          ) : (
            <div className="pickcta">
              <HqOption on={hq} set={setHq} />
              <button className="btn" disabled={!saved || !!DEMO} onClick={onRender} title={DEMO ? DEMO_BLOCKED : undefined}>
                {tr("動画を書き出す")} <small className="tokcost">{tr("{0}トークン", exportCost(job, p, hq))}</small>
              </button>
            </div>
          )}
          {job.status === 'done' && job.video ? (
            <div className="pickcta">
              {job.hq ? <p className="cost ok" style={{ width: '100%', margin: '0 0 6px' }}>{tr("高画質・高音質で書き出しました。")}</p> : null}
              <HqOption on={hq} set={setHq} />
              <button className="btn ghost" disabled={!saved || !!DEMO} onClick={onRender}>
                {tr("選び直した内容で書き出し直す")} <small className="tokcost">{tr("{0}トークン", exportCost(job, p, hq))}</small>
              </button>
            </div>
          ) : null}
          <button className="linkbtn" onClick={() => setStage('feed')}>
            {tr("最初から選び直す")}
          </button>
          {DEMO ? <div className="warn">{DEMO_BLOCKED}</div> : null}
        </div>
      )}
      {err ? <p className="err">{err}</p> : null}
    </div>
  );
};

/** Photo reels are finished by picking another motion or type style. */
const PhotoPanel: React.FC<PanelProps<PhotoReelProps>> = ({ p, update }) => {
  const set = (fn: (x: PhotoReelProps) => void) => update((x) => (fn(x), x));
  const nm = (x: { ja: string; en: string }) => (lang === 'ja' ? x.ja : x.en);
  return (
    <>
      <div className="panel">
        <h2>{tr("動き")}</h2>
        <div className="chips">
          {photoMotions
            .filter((m) => p.photos.length >= m.minPhotos)
            .map((m) => (
              <button key={m.id} className={`chip ${p.motion === m.id ? 'on' : ''}`} onClick={() => set((x) => void (x.motion = m.id))}>
                {nm(m)}
                {lang === 'ja' && <small>{m.desc}</small>}
              </button>
            ))}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("スタイル")}</h2>
        <div className="chips">
          {photoStyles.map((st) => (
            <button key={st.id} className={`chip ${p.style === st.id ? 'on' : ''}`} onClick={() => set((x) => void ((x.style = st.id), (x.palette = { ...st.palette, accent: x.palette.accent })))}>
              {nm(st)}
              {lang === 'ja' && <small>{st.desc}</small>}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

/** Service reels are finished by picking: another way of showing it, another look. */
const ServicePanel: React.FC<PanelProps<ServiceReelProps>> = ({ p, update }) => {
  const set = (fn: (x: ServiceReelProps) => void) => update((x) => (fn(x), x));
  const nm = (x: { ja: string; en: string }) => (lang === 'ja' ? x.ja : x.en);
  return (
    <>
      <div className="panel">
        <h2>{tr("見せ方")}</h2>
        <div className="chips">
          {serviceLayouts.map((l) => (
            <button key={l.id} className={`chip ${p.layout === l.id ? 'on' : ''}`} onClick={() => set((x) => void (x.layout = l.id))}>
              {nm(l)}
              {lang === 'ja' && <small>{l.desc}</small>}
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("スタイル")}</h2>
        <div className="chips">
          {serviceStyles.map((st) => (
            <button key={st.id} className={`chip ${p.style === st.id ? 'on' : ''}`} onClick={() => set((x) => void (x.style = st.id))}>
              {nm(st)}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

const EffectsPanel: React.FC<PanelProps<EffectsReelProps> & { playerRef: React.RefObject<PlayerRef | null> }> = ({ p, update, playerRef }) => {
  const set = (fn: (p: EffectsReelProps) => void) => mut(update, fn)();
  // Segments play back to back, so a segment's place on the timeline is the sum of the ones before it.
  const startFrame = (i: number) => p.segments.slice(0, i).reduce((a, s) => a + Math.max(1, Math.round((s.end - s.start) * FPS)), 0);
  return (
    <>
      <LookBuilder p={p} update={update} />
      <MixPanel p={p} update={update} />
      <CutPicker p={p} update={update} playerRef={playerRef} startFrame={startFrame} />
      <div className="panel">
        <h2>{tr("色")}</h2>
        <Colors value={p.palette} labels={{ accent: tr("アクセント"), ink: tr("文字"), paper: tr("紙") }} onChange={(v) => set((x) => void (x.palette = v as any))} />
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={p.counter} onChange={(e) => set((x) => void (x.counter = e.target.checked))} />
          <span>{tr("番号（01/17）を表示")}</span>
        </label>
      </div>
    </>
  );
};

const SaasPanel: React.FC<PanelProps<SaaSPromoProps>> = ({ p, update }) => {
  const set = (fn: (p: SaaSPromoProps) => void) => mut(update, fn)();
  const missingStats = p.stats.some((s) => !s.label);
  return (
    <>
      <div className="panel">
        <h2>{tr("冒頭のフック")}</h2>
        <div className="grid2">
          {p.hook.map((h, i) => (
            <Field key={i} label={tr("{0}行目", i + 1)} max={12} value={h} onChange={(v) => set((x) => void (x.hook[i] = v))} />
          ))}
          <Field label={tr("強調する言葉")} max={10} value={p.hookEmphasis} onChange={(v) => set((x) => void (x.hookEmphasis = v))} />
        </div>
      </div>
      <div className="panel">
        <h2>{tr("機能（3カット）")}</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.features.map((f, i) => (
            <div key={i} className="grid2">
              <Field label={tr("{0}. 英字ラベル", i + 1)} max={16} value={f.kicker} onChange={(v) => set((x) => void (x.features[i].kicker = v))} />
              <Field label={tr("{0}. 見出し", i + 1)} max={16} value={f.title} onChange={(v) => set((x) => void (x.features[i].title = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>
          {tr("実績の数字")}{' '}{missingStats ? <span className="warn">{tr("空欄があります。数字を入れてください")}</span> : null}
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.stats.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1.4fr', gap: 10 }}>
              <div className="field">
                <label>{tr("数値")}</label>
                <input type="number" value={s.value} onChange={(e) => set((x) => void (x.stats[i].value = Number(e.target.value)))} />
              </div>
              <Field label={tr("単位")} max={6} value={s.suffix} onChange={(v) => set((x) => void (x.stats[i].suffix = v))} />
              <Field label={tr("ラベル")} max={14} value={s.label} onChange={(v) => set((x) => void (x.stats[i].label = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("そのほか")}</h2>
        <div className="grid2">
          <Field label={tr("サービス名")} max={20} value={p.name} onChange={(v) => set((x) => void (x.name = v))} />
          <Field label="URL" max={40} value={p.url} onChange={(v) => set((x) => void (x.url = v))} />
          <Field label="CTA" max={14} value={p.cta} onChange={(v) => set((x) => void (x.cta = v))} />
          <Field label={tr("タグ（カンマ区切り）")} value={p.chips.join(',')} onChange={(v) => set((x) => void (x.chips = v.split(/[,、]/).map((c) => c.trim().slice(0, 14)).filter(Boolean).slice(0, 4)))} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Colors
            value={p.palette}
            labels={{ bg: tr("背景"), ink: tr("文字"), accent: tr("メイン"), accent2: tr("サブ"), panel: tr("パネル") }}
            onChange={(v) => set((x) => void (x.palette = v as any))}
          />
        </div>
      </div>
    </>
  );
};

const usePages = (p: TalkCaptionsProps) =>
  useMemo(() => {
    const segs = keepSegments(p.words, { ...p.cutSilence, fillers: p.fillers, sourceDuration: p.sourceDuration });
    return paginate(placeWords(p.words, segs, p.fillers, p.emphasis), p.captions.maxChars);
  }, [p.words, p.cutSilence, p.fillers, p.sourceDuration, p.emphasis, p.captions.maxChars]);

// Which caption is selected for dragging, shared between the stage and the list.
const SelContext = React.createContext<{ sel: number | null; setSel: (n: number | null) => void }>({ sel: null, setSel: () => {} });

const TalkStage: React.FC<{ props: TalkCaptionsProps; update: PanelProps<TalkCaptionsProps>['update']; playerRef: React.RefObject<PlayerRef | null> }> = ({
  props,
  update,
  playerRef,
}) => {
  const { sel } = React.useContext(SelContext);
  const pages = usePages(props);
  const box = useRef<HTMLDivElement>(null);
  const page = sel === null ? null : pages[sel];
  const o = sel === null ? undefined : props.overrides.find((x) => x.page === sel);
  const pos = { x: o?.x ?? props.captions.x, y: o?.y ?? props.captions.y };
  const move = (e: React.PointerEvent) => {
    if (sel === null || !(e.buttons & 1)) return;
    const r = box.current!.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    update((p) => {
      const ov = p.overrides.find((v) => v.page === sel);
      if (ov) Object.assign(ov, { x: round2(x), y: round2(y) });
      else p.overrides.push({ page: sel, x: round2(x), y: round2(y) });
      return p;
    });
  };
  return (
    <Preview template="TalkCaptions" props={props} playerRef={playerRef}>
      {page ? (
        <div ref={box} className="dragzone" onPointerDown={move} onPointerMove={move}>
          <div className="handle" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}>
            {tr("ドラッグで移動")}
          </div>
        </div>
      ) : null}
    </Preview>
  );
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

const TalkPanel: React.FC<PanelProps<TalkCaptionsProps> & { playerRef: React.RefObject<PlayerRef | null> }> = ({ p, update, playerRef }) => {
  const { sel, setSel } = React.useContext(SelContext);
  const pages = usePages(p);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const pl = playerRef.current;
    if (!pl) return;
    const f = (e: { detail: { frame: number } }) => setNow(e.detail.frame / FPS);
    pl.addEventListener('frameupdate', f);
    return () => pl.removeEventListener('frameupdate', f);
  });
  const setOv = (page: number, patch: Partial<TalkCaptionsProps['overrides'][number]>) =>
    update((x) => {
      const ov = x.overrides.find((v) => v.page === page);
      if (ov) Object.assign(ov, patch);
      else x.overrides.push({ page, ...patch });
      x.overrides = x.overrides.filter((v) => v.hidden || v.text || v.x !== undefined || v.y !== undefined);
      return x;
    });
  const c = p.captions;
  const setC = (patch: Partial<TalkCaptionsProps['captions']>) => update((x) => ((x.captions = { ...x.captions, ...patch }), x));
  const totalSrc = p.sourceDuration;
  const totalOut = pages.length ? pages[pages.length - 1].outEnd : 0;
  return (
    <>
      <div className="panel">
        <h2>
          {tr("テロップ（{0}）", pages.length)}
          <span className="cost">
            {fmt(totalSrc)} → {fmt(totalOut)}{tr("（{0}%カット）", Math.round((1 - totalOut / totalSrc) * 100))}
          </span>
        </h2>
        <p className="cost" style={{ marginTop: -4 }}>
          {tr("文字をクリックして直接修正。↕で選ぶとプレビュー上でドラッグして位置を動かせます。")}
        </p>
        <div className="caplist">
          {pages.map((pg) => {
            const o = p.overrides.find((v) => v.page === pg.index);
            const text = o?.text ?? pg.words.map((w) => w.text).join(/[A-Za-z]/.test(pg.words[0]?.text ?? '') ? ' ' : '');
            const isNow = now >= pg.outStart && now < pg.outEnd;
            return (
              <div key={pg.index} className={`cap ${isNow ? 'now' : ''} ${sel === pg.index ? 'sel' : ''} ${o?.hidden ? 'off' : ''}`}>
                <time onClick={() => playerRef.current?.seekTo(Math.round(pg.outStart * FPS) + 2)}>{fmt(pg.outStart)}</time>
                <input value={text} onFocus={() => playerRef.current?.seekTo(Math.round(pg.outStart * FPS) + 2)} onChange={(e) => setOv(pg.index, { text: e.target.value })} />
                <button
                  className={`iconbtn ${sel === pg.index ? 'on' : ''}`}
                  title={tr("位置を動かす")}
                  onClick={() => {
                    setSel(sel === pg.index ? null : pg.index);
                    playerRef.current?.pause();
                    playerRef.current?.seekTo(Math.round(pg.outStart * FPS) + 8);
                  }}
                >
                  ↕
                </button>
                <button className="iconbtn" title={o?.hidden ? tr("表示する") : tr("消す")} onClick={() => setOv(pg.index, { hidden: !o?.hidden })}>
                  {o?.hidden ? tr("戻す") : tr("消す")}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <h2>{tr("カット")}</h2>
        <label className="check">
          <input type="checkbox" checked={p.cutSilence.enabled} onChange={(e) => update((x) => ((x.cutSilence.enabled = e.target.checked), x))} />
          <span>{tr("無音と言い淀みを自動でカット")}</span>
        </label>
        <div className="field" style={{ marginTop: 12 }}>
          <label>
            <span>{tr("この長さ以上の無音をカット")}</span>
            <span>{p.cutSilence.minGap.toFixed(2)}{tr("秒")}</span>
          </label>
          <input type="range" min={0.2} max={1.5} step={0.05} value={p.cutSilence.minGap} onChange={(e) => update((x) => ((x.cutSilence.minGap = Number(e.target.value)), x))} />
        </div>
        <Field label={tr("カットする言葉（カンマ区切り）")} value={p.fillers.join(',')} onChange={(v) => update((x) => ((x.fillers = v.split(/[,、]/).map((s) => s.trim()).filter(Boolean)), x))} />
      </div>
      <div className="panel">
        <h2>{tr("デザイン")}</h2>
        <div className="grid2">
          <Field label={tr("タイトル")} max={30} value={p.title ?? ''} onChange={(v) => update((x) => ((x.title = v || undefined), x))} />
          <Field label={tr("強調する言葉（カンマ区切り）")} value={p.emphasis.join(',')} onChange={(v) => update((x) => ((x.emphasis = v.split(/[,、]/).map((s) => s.trim()).filter(Boolean)), x))} />
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>
              <span>{tr("文字の大きさ")}</span>
              <span>{c.fontSize}</span>
            </label>
            <input type="range" min={48} max={130} value={c.fontSize} onChange={(e) => setC({ fontSize: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>
              <span>{tr("テロップの高さ")}</span>
              <span>{Math.round(c.y * 100)}%</span>
            </label>
            <input type="range" min={0.1} max={0.92} step={0.01} value={c.y} onChange={(e) => setC({ y: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>
              <span>{tr("1枚の文字数")}</span>
              <span>{c.maxChars}</span>
            </label>
            <input type="range" min={6} max={30} value={c.maxChars} onChange={(e) => setC({ maxChars: Number(e.target.value) })} />
          </div>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={c.box} onChange={(e) => setC({ box: e.target.checked })} />
            <span>{tr("黒い帯を敷く")}</span>
          </label>
        </div>
        <div style={{ marginTop: 14 }}>
          <Colors
            value={{ color: c.color, highlight: c.highlight, stroke: c.stroke, accent: p.accent }}
            labels={{ color: tr("文字"), highlight: tr("話している語"), stroke: tr("ふち"), accent: tr("強調") }}
            onChange={(v) => update((x) => ((x.captions = { ...x.captions, color: v.color, highlight: v.highlight, stroke: v.stroke }), (x.accent = v.accent), x))}
          />
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={p.layout === 'fit-blur'} onChange={(e) => update((x) => ((x.layout = e.target.checked ? 'fit-blur' : 'cover'), x))} />
          <span>
            {tr("横動画を全体表示（背景はぼかし）")}
            <small>{tr("オフにすると縦にトリミングします")}</small>
          </span>
        </label>
      </div>
    </>
  );
};

const History: React.FC<{ onOpen: (id: string) => void }> = ({ onOpen }) => {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    api<Job[]>('/api/jobs').then(setJobs);
  }, []);
  if (!jobs) return <p className="sub">{tr("読み込み中…")}</p>;
  const label = { generating: tr("作成中"), ready: tr("編集できます"), rendering: tr("書き出し中"), done: tr("書き出し済み"), error: tr("エラー") };
  return (
    <>
      <div className="hist">
        {jobs.map((j) => (
          <button key={j.id} className="card" onClick={() => onOpen(j.id)}>
            <div className="thumb" style={{ backgroundImage: j.thumb ? `url(${media(j.thumb)})` : undefined, display: 'grid', placeItems: 'center' }}>
              {j.thumb ? null : <span style={{ fontSize: 30 }}>🎙</span>}
            </div>
            <div className="body">
              <div className="name" style={{ fontSize: 14 }}>{j.title}</div>
              <div className={`status ${j.status === 'error' ? 'err' : j.status === 'done' ? 'ok' : 'cost'}`}>
                {TEMPLATES[j.template].name} · {label[j.status]}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
};

// ---------- motion & navigation parts ----------

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Runs `change`, then animates the element from its old height to its new one. */
const animateHeight = (el: HTMLElement, change: () => void) => {
  const from = el.getBoundingClientRect().height;
  change();
  if (reduceMotion()) return;
  const to = el.getBoundingClientRect().height;
  el.style.overflow = 'hidden';
  el.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }).onfinish = () => (el.style.overflow = '');
};

/** Makes every `.panel > h2` inside `root` a header that folds its panel open and shut. */
const usePanelAccordion = (root: React.RefObject<HTMLElement | null>) => {
  useEffect(() => {
    root.current?.querySelectorAll<HTMLElement>('.panel > h2:not([role])').forEach((h) => {
      h.setAttribute('role', 'button');
      h.tabIndex = 0;
      // Every section starts closed so the editor isn't a wall of options; tap a heading to open it.
      h.parentElement!.classList.add('shut');
      h.setAttribute('aria-expanded', 'false');
    });
  });
  // Listens on document because the panels mount after the first render (the job loads first).
  useEffect(() => {
    const toggle = (e: Event) => {
      const t = e.target as HTMLElement;
      const h = t.closest<HTMLElement>('.panel > h2[role=button]');
      if (!h || !root.current?.contains(h)) return;
      if (t.closest('button, input, select, a')) return;
      if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const panel = h.parentElement!;
      animateHeight(panel, () => panel.classList.toggle('shut'));
      h.setAttribute('aria-expanded', String(!panel.classList.contains('shut')));
    };
    document.addEventListener('click', toggle);
    document.addEventListener('keydown', toggle);
    return () => (document.removeEventListener('click', toggle), document.removeEventListener('keydown', toggle));
  }, []);
};

/** Pages opened inside the app this session, so Back can return instead of leaving (a cold start from a link or notification has none). */
let inAppSteps = 0;
addEventListener('hashchange', () => inAppSteps++);
/** Back: the previous page when there is one in the app, else `fallback` (one level up). */
const goBack = (fallback = '#/') => (inAppSteps > 0 ? (inAppSteps -= 2, history.back()) : (location.hash = fallback));

/** The round back button every sub-page starts with. */
const BackButton: React.FC<{ fallback?: string; label?: string }> = ({ fallback, label }) => (
  <button className="backbtn" onClick={() => goBack(fallback)} aria-label={tr("戻る")}>
    <Glyph d={G.back} size={20} />
    {label ? <span>{label}</span> : null}
  </button>
);

/** Back button + where you are. Every sub-page has one. */
const Crumbs: React.FC<{ items: { label: string; href?: string }[] }> = ({ items }) => (
  <nav className="crumbs" aria-label={tr("現在地")}>
    <BackButton fallback={[...items].reverse().find((c, i) => i > 0 && c.href)?.href ?? '#/'} />
    <ol>
      {items.map((c, i) => (
        <li key={i}>{c.href && i < items.length - 1 ? <a href={c.href}>{c.label}</a> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{c.label}</span>}</li>
      ))}
    </ol>
  </nav>
);

const Accordion: React.FC<{ items: { q: string; a: React.ReactNode }[] }> = ({ items }) => {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="accordion">
      {items.map((it, i) => (
        <div key={i} className={`acc ${open === i ? 'open' : ''}`}>
          <button className="acchead" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
            {it.q}
            <span className="chev" aria-hidden />
          </button>
          <div className="accbody">
            <div>
              <p>{it.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/** Bottom sheet (phone) / dialog (desktop) that animates out before it unmounts; drag the handle down to close. */
const Sheet: React.FC<{ onClose: () => void; className?: string; children: (close: () => void) => React.ReactNode }> = ({ onClose, className = '', children }) => {
  const [closing, setClosing] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const close = () => {
    if (reduceMotion()) return onClose();
    setClosing(true);
    setTimeout(onClose, 220);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, dy: 0 };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    box.current!.style.transition = 'none';
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    box.current!.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onUp = () => {
    const dy = drag.current?.dy ?? 0;
    drag.current = null;
    box.current!.style.transition = '';
    box.current!.style.transform = '';
    if (dy > 90) close();
  };
  // Portal to <body> so a transformed ancestor (page transition) never traps the fixed overlay.
  return createPortal(
    <div className={`sheet ${closing ? 'closing' : ''}`} onClick={close}>
      <div ref={box} className={`sheetbox ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden>
          <span />
        </div>
        <div className="sheetbar">
          <button className="sheetclose" onClick={close} aria-label={tr("閉じる")}>
            <Glyph d={G.close} size={20} />
          </button>
        </div>
        {children(close)}
      </div>
    </div>,
    document.body,
  );
};

/** Counts up to `to` when it first appears. */
const CountUp: React.FC<{ to: number; format?: (n: number) => string }> = ({ to, format = (n) => String(n) }) => {
  const [n, setN] = useState(reduceMotion() ? to : 0);
  useEffect(() => {
    if (reduceMotion()) return setN(to);
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 900);
      setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{format(n)}</>;
};

/** Snap carousel: the centred slide plays its real render, the rest show posters. Advances by itself until touched. */
const Carousel: React.FC<{ items: CatalogItem[]; onOpen: (it: CatalogItem) => void }> = ({ items, onOpen }) => {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const paused = useRef(0);
  const to = (i: number) => {
    const el = track.current?.children[i] as HTMLElement | undefined;
    if (!el || !track.current) return;
    track.current.scrollTo({ left: el.offsetLeft - (track.current.clientWidth - el.clientWidth) / 2, behavior: reduceMotion() ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const t = track.current!;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mid = t.scrollLeft + t.clientWidth / 2;
        let best = 0;
        [...t.children].forEach((c, i) => {
          const el = c as HTMLElement;
          const best0 = t.children[best] as HTMLElement;
          if (Math.abs(el.offsetLeft + el.clientWidth / 2 - mid) < Math.abs(best0.offsetLeft + best0.clientWidth / 2 - mid)) best = i;
        });
        setActive(best);
      });
    };
    t.addEventListener('scroll', onScroll, { passive: true });
    return () => t.removeEventListener('scroll', onScroll);
  }, [items.length]);
  useEffect(() => {
    if (reduceMotion()) return;
    const id = setInterval(() => {
      if (Date.now() - paused.current < 8000 || document.hidden) return;
      setActive((a) => {
        const n = (a + 1) % items.length;
        to(n);
        return n;
      });
    }, 4500);
    return () => clearInterval(id);
  }, [items.length]);
  const hold = () => (paused.current = Date.now());
  return (
    <div className="carousel" onPointerDown={hold} onMouseEnter={hold} onWheel={hold}>
      <div className="ctrack" ref={track}>
        {items.map((it, i) => (
          <button key={it.key} className={`cslide ${i === active ? 'on' : ''}`} onClick={() => (i === active ? onOpen(it) : (hold(), to(i)))}>
            {i === active ? <ShowVideo k={it.key} /> : <img src={showcase(it.key).poster} alt="" loading="lazy" />}
            <div className="ccap">
              <span className="tag">{GROUPS.find((g) => g.id === it.group)!.name}</span>
              <b>{it.name}</b>
              <small>{it.desc}</small>
            </div>
          </button>
        ))}
      </div>
      <button className="carr prev" aria-label={tr("前へ")} onClick={() => (hold(), to(Math.max(0, active - 1)))}>
        ‹
      </button>
      <button className="carr next" aria-label={tr("次へ")} onClick={() => (hold(), to(Math.min(items.length - 1, active + 1)))}>
        ›
      </button>
      <div className="dots">
        {items.map((it, i) => (
          <button key={it.key} className={i === active ? 'on' : ''} aria-label={it.name} onClick={() => (hold(), to(i))} />
        ))}
      </div>
    </div>
  );
};

// ---------- catalog: base templates + each effect as its own pattern ----------

type Group = 'base' | 'mix' | 'behind' | 'camera' | 'ui' | 'craft' | 'motion';
const GROUPS: { id: Group; name: string; note: string }[] = [
  { id: 'base', name: tr("テンプレート"), note: tr("商品・サービス・トーク") },
  { id: 'mix', name: tr("ミックス"), note: tr("エフェクトを掛け合わせた完成形") },
  { id: 'behind', name: tr("人物の後ろに出す"), note: tr("単体エフェクト（ミックスの部品）") },
  { id: 'camera', name: tr("カメラワーク"), note: tr("単体エフェクト（ミックスの部品）") },
  { id: 'ui', name: tr("画面・UI"), note: tr("単体エフェクト（ミックスの部品）") },
  { id: 'craft', name: tr("手描き・コラージュ"), note: tr("単体エフェクト（ミックスの部品）") },
  { id: 'motion', name: tr("3D・モーション"), note: tr("単体エフェクト（ミックスの部品）") },
];

const EFFECT_GROUP: Record<EffectId, Group> = {
  orbit: 'behind', couchWall: 'behind', headlineWall: 'behind', chartGrow: 'behind', coverStory: 'behind', glassType: 'behind', kineticType: 'behind',
  frameBreak: 'camera', digitalZoom: 'camera', zoomThrough: 'camera', pullBack: 'camera', vertigo: 'camera',
  uiWorld: 'ui', phoneMockup: 'ui', checklist: 'ui', greenScreen: 'ui', infographic: 'ui', notifications: 'ui', tiles: 'ui', sourceCard: 'ui',
  paperCut: 'craft', doodleBoil: 'craft',
  object3d: 'motion', particles3d: 'motion', textReveal: 'motion', uiLayers: 'motion', isoGrid: 'motion', lineIcons: 'motion', flatBoard: 'motion',
};

const EFFECT_DESC: Record<EffectId, string> = {
  orbit: tr("SNS投稿のカードが人物の周りを3Dで回る"),
  couchWall: tr("後ろの壁にリールのカードが次々に貼られる"),
  uiWorld: tr("アプリ画面に動画が飛び込み、入力が進む"),
  frameBreak: tr("画面がインスタ投稿のカードに縮み、人物がはみ出す"),
  digitalZoom: tr("話の途中で一気にパンチイン、キーワードが浮かぶ"),
  phoneMockup: tr("横に浮かぶスマホの中でチャットが進む"),
  checklist: tr("ガラスのカードにチェック項目が増えていく"),
  headlineWall: tr("新聞の見出しや付箋が後ろに貼られていく"),
  zoomThrough: tr("被写体に突っ込んで次のカットへ抜ける"),
  chartGrow: tr("後ろで光るグラフが右肩上がりに伸びる"),
  pullBack: tr("引いて編集画面の中のプレビューになる"),
  greenScreen: tr("人物の背景をアプリ画面に差し替える"),
  paperCut: tr("紙の切り抜き風、文字が1つずつ貼られる"),
  doodleBoil: tr("輪郭と落書きが手描きでうごめく（人気）"),
  vertigo: tr("人物はそのまま背景だけが伸びるめまいズーム"),
  coverStory: tr("雑誌の表紙のように大きな文字が頭の後ろに"),
  glassType: tr("立体のガラス文字が後ろで光る"),
  kineticType: tr("話す言葉が1語ずつ大きく飛び込み、ポスターのように積み上がる"),
  infographic: tr("数字がカウントアップし、円グラフと棒グラフが伸びる"),
  notifications: tr("スマホの通知が1枚ずつ積み重なり、キーワードが大きく出る"),
  tiles: tr("アイコンのタイルが並び、1つずつチェックが付く"),
  sourceCard: tr("「出典」カードに名前が出て、数字がカウントアップ"),
  object3d: tr("光沢のある3Dの物体が光を受けて回り、下にキーワード"),
  particles3d: tr("無数の粒子が銀河のように渦を巻き、カメラが中心へ飛び込む"),
  textReveal: tr("文字が1行ずつマスクから立ち上がる、制作会社風の演出"),
  uiLayers: tr("サイトの画面が奥行きを持って重なり、1枚の中で人物が話す"),
  isoGrid: tr("立体ブロックが波打ち、文字がタイプされていく"),
  lineIcons: tr("線画のアイコンが描かれ、色が入って弾む"),
  flatBoard: tr("番号付きの柱が立ち上がるフラットなイラスト図解"),
};

type CatalogItem = { key: string; template: TemplateId; effect?: EffectId; mix?: string; name: string; desc: string; group: Group; href?: string; premium?: boolean; tags?: string[]; kicker?: string };

/** Finishing options the user picks after the AI has made the reel. Each value has a real render at showcase/<prefix>-<value>. */
type LockAxis = 'caption' | 'camera' | 'transition' | 'grade' | 'texture';
const LOCKS: { prefix: string; axis: LockAxis; name: string; values: readonly string[] }[] = [
  { prefix: 'cap', axis: 'caption', name: tr("字幕"), values: captionStyles },
  { prefix: 'cam', axis: 'camera', name: tr("カメラ"), values: cameraMoves },
  { prefix: 'tr', axis: 'transition', name: tr("切り替え"), values: transitions },
  { prefix: 'gr', axis: 'grade', name: tr("色味"), values: grades },
  { prefix: 'tx', axis: 'texture', name: tr("質感"), values: textures },
];

const CATALOG: CatalogItem[] = [
  { key: 'ProductShine', template: 'ProductShine', name: TEMPLATES.ProductShine.name, desc: TEMPLATES.ProductShine.desc, group: 'base' },
  { key: 'SaaSPromo', template: 'SaaSPromo', name: TEMPLATES.SaaSPromo.name, desc: TEMPLATES.SaaSPromo.desc, group: 'base' },
  { key: 'TalkCaptions', template: 'TalkCaptions', name: TEMPLATES.TalkCaptions.name, desc: TEMPLATES.TalkCaptions.desc, group: 'base' },
  { key: 'EffectsReel', template: 'EffectsReel', name: tr("エフェクトおまかせ"), desc: TEMPLATES.EffectsReel.desc, group: 'base' },
  { key: 'FivePass', template: 'FivePass', name: TEMPLATES.FivePass.name, desc: TEMPLATES.FivePass.desc, group: 'base' },
  ...recipes.map((r) => ({ key: `mix-${r.id}`, template: 'EffectsReel' as TemplateId, mix: r.id, name: tr(r.name), desc: tr(r.desc), group: 'mix' as Group })),
  ...effectIds.map((fx) => ({
    key: fx,
    template: 'EffectsReel' as TemplateId,
    effect: fx,
    name: EFFECT_NAMES[fx].replace(/^\d+\s*/, '').replace(/\s*[（(].*[）)]/, ''),
    desc: EFFECT_DESC[fx],
    group: EFFECT_GROUP[fx],
  })),
];


/** Real render of this template (public/showcase, built by scripts/make-showcase.py). */
const showcase = (key: string) => {
  const k = localized(key);
  return { video: media(`showcase/${k}.mp4`), poster: media(`showcase/${k}.jpg`) };
};
/** Showcase renders may exist per language as <key>.<lang>; English stands in for languages without one. */
let showcaseList: Set<string> | null = null;
const localized = (key: string) => {
  if (!showcaseList) return key;
  if (lang !== 'ja' && showcaseList.has(`${key}.${lang}`)) return `${key}.${lang}`;
  if (lang !== 'ja' && showcaseList.has(`${key}.en`)) return `${key}.en`;
  return key;
};

/**
 * A sample render. Plain (`hover`): plays at once, for a desktop mouse resting on a card. With `controls`:
 * the poster and a play button until tapped (nothing starts by itself), then a quiet sound toggle.
 */
const ShowVideo: React.FC<{ k: string; controls?: boolean }> = ({ k, controls }) => {
  const s = showcase(k);
  const [sound, setSound] = useState(false);
  const v = <video src={s.video} poster={s.poster} autoPlay muted={!sound} loop playsInline preload={controls ? 'auto' : 'metadata'} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }} />;
  if (!controls) return v;
  return (
    <div className="showvideo">
      <LivePreview poster={s.poster}>
        {v}
        <button className="feedsound" onClick={(e) => (e.stopPropagation(), setSound((x) => !x))} aria-label={tr("音")} aria-pressed={sound}>
          <Glyph d={sound ? G.sound : G.mute} size={18} />
        </button>
      </LivePreview>
    </div>
  );
};

/** Poster in the grid; plays while hovered (desktop). Tap opens the full preview. */
const TemplateCard: React.FC<{ it: CatalogItem; onOpen: () => void; i?: number }> = ({ it, onOpen, i = 0 }) => {
  const [hover, setHover] = useState(false);
  return (
    <button className="tcard" style={{ "--i": Math.min(i, 11) } as React.CSSProperties} onClick={onOpen} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(true)} onPointerLeave={() => setHover(false)}>
      <div className="tthumb">
        {hover ? <ShowVideo k={it.key} /> : <img src={showcase(it.key).poster} alt="" loading="lazy" onLoad={(e) => e.currentTarget.classList.add("loaded")} />}
        <span className="tplay" aria-hidden>
          ▶
        </span>
        {it.premium ? <span className="tprem">{tr("プレミアム")}</span> : null}
        {it.effect ? <span className="tnum">{String(effectIds.indexOf(it.effect) + 1).padStart(2, '0')}</span> : null}
      </div>
      {it.kicker ? <div className="tkick">{it.kicker}</div> : null}
      <div className="tname">{it.name}</div>
    </button>
  );
};

const PreviewSheet: React.FC<{ it: CatalogItem; onClose: () => void; onUse: () => void }> = ({ it, onClose, onUse }) => (
  <Sheet onClose={onClose}>
    {(close) => (
      <>
        <div className="sheetplayer">
          <ShowVideo k={it.key} controls />
        </div>
        <div className="sheetinfo">
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {it.premium ? <span className="tag premiumtag">{tr("プレミアム")}</span> : null}
            {(it.tags ?? [GROUPS.find((g) => g.id === it.group)!.name]).map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
          <div className="name">{it.name}</div>
          <div className="desc">{it.desc}</div>
          <p className="cost">
            {it.effect
              ? tr("エフェクト単体の実際の書き出しです。実際の動画は1本の中で複数のエフェクトを掛け合わせます。このエフェクトは必ず入り、ほかのカットはAIが話に合わせて組み合わせます。")
              : it.mix
                ? tr("このミックスで実際に書き出した見本です。カットごとにエフェクト・字幕・カメラ・切り替えが変わります（1カットあたり{0}）。", MIX_COUNT)
                : tr("この見本は、このテンプレートでAIが実際に作って書き出した動画です。")}
          </p>
          <div className="row">
            <button className="btn" onClick={onUse}>
              {tr("このテンプレートで作る")}
            </button>
            <button className="btn ghost" onClick={close}>
              {tr("閉じる")}
            </button>
          </div>
        </div>
      </>
    )}
  </Sheet>
);

const useCatalogPicker = (go: (h: string) => void) => {
  const [open, setOpen] = useState<CatalogItem | null>(null);
  const sheet = open ? (
    <PreviewSheet it={open} onClose={() => setOpen(null)} onUse={() => go(open.href ? open.href : open.effect ? `#/new/EffectsReel/${open.effect}` : open.mix ? `#/new/EffectsReel/mix-${open.mix}` : `#/new/${open.template}`)} />
  ) : null;
  return { setOpen, sheet };
};

// ---------- template catalog: video, photo and service templates by combination ----------

type CatalogKind = 'video' | 'photo' | 'service' | 'product';
type CatalogEntry = { id: string; kind: CatalogKind; ja: string; en: string; categories: string[]; premium?: boolean; count?: number; sample?: string; uses: number; added: string };
type CatalogData = { entries: CatalogEntry[]; categories: Partial<Record<CatalogKind, { id: string; ja: string; en: string }[]>> };
const KINDS: { id: CatalogKind; name: string }[] = [
  { id: 'video', name: tr("動画") },
  { id: 'photo', name: tr("写真") },
  { id: 'service', name: tr("サービス紹介") },
  { id: 'product', name: tr("商品") },
];
const HREF: Record<CatalogKind, (id: string) => string> = {
  video: (id) => `#/new/EffectsReel/tpl-${id}`,
  photo: (id) => `#/new/PhotoReel/tpl-${id}`,
  service: (id) => `#/new/ServiceReel/tpl-${id}`,
  product: (id) => (id === 'experience-film' ? '#/new/ExperienceFilm/tpl-experience-film' : id === 'photo-ad' ? '#/new/PhotoAdFilm/tpl-photo-ad' : '#/new/ProductShine'),
};
/** The app's own starting points (each its own generator), filed under the same kinds as the catalog. */
const FEATURED_KIND: Partial<Record<TemplateId, CatalogKind>> = { TalkCaptions: 'video', EffectsReel: 'video', FivePass: 'video', SaaSPromo: 'service', ProductShine: 'product' };
const PAGE = 24;

/** The catalog from the server (with use counts and server-added templates); the bundled lists stand in offline. */
let catalogData: Promise<CatalogData> | null = null;
const loadCatalog = () =>
  (catalogData ??= api<CatalogData>('/api/catalog').catch(() => ({
    entries: [
      ...videoTemplates.map((v) => ({ id: v.id, kind: 'video' as const, ja: v.ja, en: v.en, categories: v.categories as string[], premium: v.premium, uses: 0, added: '', sample: `tpl-${v.id}` })),
      ...photoTemplates.map((t) => ({ id: t.id, kind: 'photo' as const, ja: t.nameJa, en: t.nameEn, categories: t.categories as string[], count: t.count, uses: 0, added: '', sample: `tpl-${t.id}` })),
      ...serviceTemplates.map((t) => ({ id: t.id, kind: 'service' as const, ja: t.nameJa, en: t.nameEn, categories: t.industries as string[], uses: 0, added: '', sample: `tpl-${t.id}` })),
      { id: 'experience-film', kind: 'product' as const, ja: '体験を映画のように', en: 'Experience film', categories: ['experience'], uses: 0, added: '', sample: 'tpl-experience-film' },
      { id: 'photo-ad', kind: 'product' as const, ja: '写真1枚で広告動画', en: 'One photo to an ad film', categories: ['ad'], uses: 0, added: '', sample: 'tpl-photo-ad' },
    ],
    categories: {
      video: videoCategories,
      photo: photoCategories,
      service: serviceIndustries,
      product: [
        { id: 'experience', ja: '体験・ツアー', en: 'Experiences & tours' },
        { id: 'ad', ja: '商品の広告', en: 'Product ads' },
      ],
    },
  })));

/** Same order for everyone on a given day, different the next: "おすすめ" keeps changing without being random per tap. */
const dayRank = (id: string) => {
  let h = 2166136261 ^ Number(new Date().toISOString().slice(0, 10).replace(/-/g, ''));
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

/**
 * "Start from an example": one gallery for everything that can be made. The app's own templates come first,
 * then every catalog template, all as the same 9:16 card. Only templates with a real render are shown, and
 * each card opens the generator that made that render.
 */
const TemplateBrowser: React.FC<{ onOpen: (it: CatalogItem) => void; featured: CatalogItem[] }> = ({ onOpen, featured }) => {
  const [data, setData] = useState<CatalogData | null>(null);
  const keys = useShowcaseKeys();
  const [kind, setKind] = useState<CatalogKind | 'all'>('all');
  const [sort, setSort] = useState<'pick' | 'popular' | 'new'>('pick');
  const [cat, setCat] = useState<string>('');
  const [count, setCount] = useState<number>(0);
  const [shown, setShown] = useState(PAGE);
  const more = useRef<HTMLDivElement>(null);
  useEffect(() => void loadCatalog().then(setData), []);
  useEffect(() => setShown(PAGE), [kind, sort, cat, count]);
  const nm = (x: { ja: string; en: string }) => (lang === 'ja' ? x.ja : x.en);
  // Only templates with a real render are shown: the sample must be what the template actually makes.
  const all = (data?.entries ?? []).filter((e) => e.sample && keys?.has(e.sample));
  const feat = featured.filter((f) => FEATURED_KIND[f.template]);
  const kindOf = (it: CatalogItem) => FEATURED_KIND[it.template]!;
  // A kind with nothing rendered yet gets no tab.
  const kinds = KINDS.filter((k) => all.some((e) => e.kind === k.id) || feat.some((f) => kindOf(f) === k.id));
  const cur: CatalogKind | 'all' = kind === 'all' || kinds.some((k) => k.id === kind) ? kind : 'all';
  const cats = cur === 'all' ? [] : (data?.categories[cur] ?? []);
  const list = all
    .filter((e) => (cur === 'all' || e.kind === cur) && (!cat || e.categories.includes(cat)) && (!count || e.count === count))
    .sort((a, b) => (sort === 'popular' ? b.uses - a.uses : sort === 'new' ? b.added.localeCompare(a.added) : 0) || dayRank(a.id) - dayRank(b.id));
  useEffect(() => {
    const el = more.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + PAGE), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [list.length > shown]);
  if (!all.length && !feat.length) return null;
  const catName = (k: CatalogKind, id: string) => nm((data?.categories[k] ?? []).find((c) => c.id === id) ?? { ja: id, en: id });
  const kindName = (k: CatalogKind) => KINDS.find((x) => x.id === k)!.name;
  const head = feat.filter((f) => (cur === 'all' || kindOf(f) === cur) && !cat && !count).map((f) => ({ ...f, kicker: kindName(kindOf(f)) }));
  const items: CatalogItem[] = [...head, ...list.slice(0, shown).map((e): CatalogItem => ({
    key: e.sample!,
    template: 'EffectsReel',
    mix: e.id,
    name: nm(e),
    desc: e.categories.map((c) => catName(e.kind, c)).join(' ・ '),
    group: 'mix',
    href: HREF[e.kind](e.id),
    premium: e.premium,
    kicker: kindName(e.kind),
    tags: [kindName(e.kind), ...e.categories.slice(0, 3).map((c) => catName(e.kind, c)), ...(e.count ? [tr("{0}枚", e.count)] : [])],
  }))];
  return (
    <section className="tsection tbrowser">
      <div className="thead quiet">
        <h2>{tr("テンプレートから選ぶ")}</h2>
        <span className="cost">{tr("{0}種", fmtN(all.length + feat.length))}</span>
      </div>
      <div className="kindtabs" role="tablist" style={{ '--n': kinds.length + 1 } as React.CSSProperties}>
        <button role="tab" aria-selected={cur === 'all'} className={cur === 'all' ? 'on' : ''} onClick={() => (setKind('all'), setCat(''), setCount(0))}>
          {tr("すべて")}
        </button>
        {kinds.map((k) => (
          <button key={k.id} role="tab" aria-selected={cur === k.id} className={cur === k.id ? 'on' : ''} onClick={() => (setKind(k.id), setCat(''), setCount(0))}>
            {k.name}
          </button>
        ))}
      </div>
      <div className="chipbar">
        {([['pick', tr("おすすめ")], ['popular', tr("人気")], ['new', tr("新着")]] as const).map(([id, name]) => (
          <button key={id} className={`fchip ${sort === id ? 'on' : ''}`} onClick={() => setSort(id)}>
            {name}
          </button>
        ))}
        {cats.length ? <span className="chipsep" /> : null}
        {cats.length ? (
          <button className={`fchip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>
            {tr("すべて")}
          </button>
        ) : null}
        {cats
          .filter((c) => all.some((e) => e.kind === cur && e.categories.includes(c.id)))
          .map((c) => (
            <button key={c.id} className={`fchip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(cat === c.id ? '' : c.id)}>
              {nm(c)}
            </button>
          ))}
      </div>
      {cur === 'photo' ? (
        <div className="chipbar">
          {[0, 1, 3, 5, 10].map((n) => (
            <button key={n} className={`fchip ${count === n ? 'on' : ''}`} onClick={() => setCount(n)}>
              {n ? tr("{0}枚", n) : tr("枚数すべて")}
            </button>
          ))}
        </div>
      ) : null}
      {items.length ? <Grid items={items} onOpen={onOpen} /> : <p className="cost">{tr("この条件のテンプレートは準備中です。")}</p>}
      {list.length > shown ? <div ref={more} className="tmore" /> : null}
    </section>
  );
};

/** Keys with a real render in public/showcase (index.json, written by scripts/make-showcase.py). */
let showcaseKeys: Promise<Set<string> | null> | null = null;
const useShowcaseKeys = () => {
  const [keys, setKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    showcaseKeys ??= fetch(media('showcase/index.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((k) => (k ? (showcaseList = new Set<string>(k)) : null))
      .catch(() => null);
    showcaseKeys.then(setKeys);
  }, []);
  return keys;
};

const Grid: React.FC<{ items: CatalogItem[]; onOpen: (it: CatalogItem) => void }> = ({ items, onOpen }) => (
  <div className="tgrid">
    {items.map((it, i) => (
      <TemplateCard key={it.key} it={it} i={i} onOpen={() => onOpen(it)} />
    ))}
  </div>
);

// Home stays short: templates and mixes to start from; single effects sit behind one chip row.
/** The big "put your video here" tile: tap (or drop) a video, it uploads right away. */
const UploadTile: React.FC<{ value?: { file: string; url: string; name: string }; onChange: (v: { file: string; url: string; name: string }) => void }> = ({ value, onChange }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState('');
  const take = async (f?: File | null) => {
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      onChange({ ...(await uploadFile(f)), name: f.name });
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };
  return (
    <>
      <button
        className={`uptile ${over ? 'over' : ''} ${value ? 'has' : ''}`}
        onClick={() => (isNative ? pickFromLibrary('video/*').then(take, (e) => setErr(e?.message ?? String(e))) : ref.current?.click())}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files[0]))}
      >
        {value ? <video src={`${media(value.url)}#t=0.5`} muted playsInline preload="metadata" /> : null}
        <span className="upplus">{busy ? <span className="spin" /> : <Glyph d={value ? G.similar : 'M12 5v14M5 12h14'} size={28} />}</span>
        <b>{busy ? tr("アップロード中…") : value ? tr("別の動画にする") : tr("動画を載せる")}</b>
        {value ? null : <small>{tr("話している動画、お店や商品の動画。3分以内のMP4 / MOV")}</small>}
      </button>
      <input ref={ref} type="file" accept="video/*" hidden onChange={(e) => take(e.target.files?.[0])} />
      {err ? <div className="err">{err}</div> : null}
    </>
  );
};

/** Upload, then one button. Everything else is a pick after the AI has made the takes. */
const Start: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [video, setVideo] = useState<{ file: string; url: string; name: string } | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // 話して伝える on the home screen lands here with the upload already open.
  const goal = goalOfHash();
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const j = await api<Job>('/api/jobs', { method: 'POST', body: JSON.stringify({ template: 'EffectsReel', input: { video: video!.file, recipe: 'all', lang: '', goal } }) });
      enablePush(registerPushToken);
      go(`#/job/${j.id}`);
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };
  const [open, setOpen] = useState<string | null>(goal === 'talk' ? 'video' : null);
  const fold = (id: string, title: string, note: string, body: React.ReactNode) => (
    <section className={`fold ${open === id ? 'open' : ''}`}>
      <button className="foldhead" aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
        <span>
          <b>{title}</b>
          <small>{note}</small>
        </span>
        <Glyph d={G.down} />
      </button>
      {open === id ? <div className="foldbody">{body}</div> : null}
    </section>
  );
  return (
    <div className="start">
      <h1>{tr("動画を作る")}</h1>
      <p className="sub">{tr("作り方を選んでください。")}</p>
      {fold(
        'video',
        tr("動画を載せる"),
        tr("話している動画、お店や商品の動画から"),
        <>
          <UploadTile value={video} onChange={setVideo} />
          <div className="pickcta">
            <button className="btn big" disabled={!video || busy || !!DEMO} onClick={submit}>
              <Glyph d={G.sparkle} size={20} /> {busy ? tr("送信中…") : tr("案をつくる")}
            </button>
          </div>
          <p className="cost" style={{ textAlign: 'center' }}>
            {tr("消費:")} <b>{fmtN(tokensFor('EffectsReel', { video }))}{tr("トークン")}</b>
          </p>
          {err ? <div className="err">{err}</div> : null}
          {DEMO ? <div className="warn">{DEMO_BLOCKED}</div> : null}
        </>,
      )}
      {fold(
        'product',
        tr("商品を見せる"),
        tr("商品写真1枚から"),
        <button className="btn big" onClick={() => go('#/new/ProductShine')}>
          {TEMPLATES.ProductShine.name}
        </button>,
      )}
      {fold(
        'service',
        tr("サービス紹介"),
        tr("画面のスクリーンショットから"),
        <button className="btn big" onClick={() => go('#/new/SaaSPromo')}>
          {TEMPLATES.SaaSPromo.name}
        </button>,
      )}
    </div>
  );
};

/** The last few reels, newest first, as small posters (still images: nothing decodes on the home screen). */
const RecentReels: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    api<Job[]>('/api/jobs').then((list) => setJobs(list.filter((j) => j.status !== 'error').slice(0, 3)), () => setJobs([]));
  }, []);
  if (!jobs?.length) return null;
  return (
    <section className="tsection">
      <div className="thead">
        <h2>{tr("つくった動画")}</h2>
        <button className="linkbtn" onClick={() => go('#/reels')}>
          {tr("すべて見る")}
        </button>
      </div>
      <div className="recent">
        {jobs.map((j) => {
          const poster = jobPoster(j);
          return (
            <button key={j.id} onClick={() => go(`#/job/${j.id}`)} aria-label={j.title}>
              {poster ? <img src={poster} alt="" loading="lazy" /> : <span className="feedblank">{STATUS_LABEL[j.status]}</span>}
              <small>{j.title}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
};

/**
 * What the reel is for, in the customer's words. Each goal opens the upload step of the template that fits it
 * best and carries `goal` along, so the AI writes the copy for that purpose (server/goals.ts).
 */
type GoalId = 'launch' | 'visit' | 'sale' | 'experience' | 'talk' | 'service';
const GOAL_CHOICES: { id: GoalId; name: string; note: string; href: string; icon: string }[] = [
  { id: 'launch', name: tr("新商品を知らせる"), note: tr("商品写真1枚から"), href: '#/new/ProductShine', icon: G.sparkle },
  { id: 'visit', name: tr("来店・予約を増やす"), note: tr("お店や人の写真から"), href: '#/new/ServiceReel/tpl-svc-voice-none-clean', icon: 'M4 9h16M5.5 5h13L20 9H4zM5 9v10h14V9M10 19v-5h4v5' },
  { id: 'sale', name: tr("セール・キャンペーン"), note: tr("写真と割引の内容から"), href: '#/new/ServiceReel/tpl-svc-kinetic-none-vivid', icon: 'M3.5 12.5V4h8.5l8.5 8.5-8 8zM8 8.2h.01' },
  { id: 'experience', name: tr("体験・ツアーを伝える"), note: tr("写真がなくても作れます"), href: '#/new/ExperienceFilm/tpl-experience-film', icon: 'M3 19l6-10 4 6 3-4 5 8z' },
  { id: 'talk', name: tr("話して伝える"), note: tr("話している動画から"), href: '#/start', icon: 'M4 5h16v11H9l-5 4z' },
  { id: 'service', name: tr("サービスを紹介する"), note: tr("写真やスクショから"), href: '#/new/ServiceReel/tpl-svc-features-none-clean', icon: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' },
];
const isGoalId = (g: unknown): g is GoalId => GOAL_CHOICES.some((c) => c.id === g);
/** The goal carried in the address (#/new/…?goal=launch). */
const goalOfHash = (): GoalId | undefined => {
  const g = new URLSearchParams(location.hash.split('?')[1] ?? '').get('goal');
  return isGoalId(g) ? g : undefined;
};

const GoalPicker: React.FC<{ go: (h: string) => void }> = ({ go }) => (
  <section className="goals" aria-labelledby="goals-h">
    <h2 id="goals-h">{tr("何を伝えたいですか？")}</h2>
    <div className="goalgrid">
      {GOAL_CHOICES.map((g) => (
        <button key={g.id} className={`goal goal-${g.id}`} onClick={() => go(`${g.href}?goal=${g.id}`)}>
          <span className="goalicon" aria-hidden>
            <Glyph d={g.icon} size={22} />
          </span>
          <b>{g.name}</b>
          <small>{g.note}</small>
        </button>
      ))}
    </div>
  </section>
);

const Home: React.FC<{ go: (h: string) => void; initialGroup?: string }> = ({ go, initialGroup }) => {
  const [group, setGroupState] = useState<Group | 'all'>(GROUPS.some((g) => g.id === initialGroup) ? (initialGroup as Group) : 'all');
  const setGroup = (g: Group | 'all') => {
    setGroupState(g);
    history.replaceState(null, '', g === 'all' ? '#/' : `#/?g=${g}`);
    window.scrollTo({ top: 0 });
  };
  const { setOpen, sheet } = useCatalogPicker(go);
  const keys = useShowcaseKeys();
  const catalog = keys ? CATALOG.filter((c) => keys.has(c.key)) : CATALOG.filter((c) => c.group !== 'mix');
  const has = (g: Group) => catalog.some((c) => c.group === g);
  const effectGroups = GROUPS.filter((g) => g.id !== 'base' && g.id !== 'mix' && has(g.id));
  const section = (g: (typeof GROUPS)[number]) => (
    <section key={g.id} className="tsection">
      <div className="thead">
        <h2>{g.name}</h2>
        <span className="cost">{g.note}</span>
      </div>
      <Grid items={catalog.filter((c) => c.group === g.id)} onOpen={setOpen} />
    </section>
  );
  if (group !== 'all')
    return (
      <>
        <Crumbs items={[{ label: tr("ホーム"), href: '#/' }, { label: GROUPS.find((g) => g.id === group)!.name }]} />
        {section(GROUPS.find((g) => g.id === group)!)}
        {sheet}
      </>
    );
  return (
    <>
      <div className="hero">
        <h1>{tr("載せたら、あとは選ぶだけ。")}</h1>
        <p className="sub">{tr("編集しない、動画編集アプリ。")}</p>
      </div>
      <GoalPicker go={go} />
      <RecentReels go={go} />
      <TemplateBrowser onOpen={setOpen} featured={catalog.filter((c) => c.group === 'base')} />
      {effectGroups.length ? (
        <section className="tsection">
          <div className="thead">
            <h2>{tr("エフェクト")}</h2>
            <span className="cost">{tr("{0}種", catalog.filter((c) => effectGroups.some((g) => g.id === c.group)).length)}</span>
          </div>
          <div className="chipbar">
            {effectGroups.map((g) => (
              <button key={g.id} className="fchip" onClick={() => setGroup(g.id)}>
                {g.name} <small>{catalog.filter((c) => c.group === g.id).length}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {sheet}
    </>
  );
};

const Search: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [q, setQ] = useState('');
  const { setOpen, sheet } = useCatalogPicker(go);
  const keys = useShowcaseKeys();
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = CATALOG.filter((c) => (keys ? keys.has(c.key) : c.group !== 'mix')).filter((c) => {
    const hay = `${c.name} ${c.desc} ${GROUPS.find((g) => g.id === c.group)!.name} ${c.effect ?? ''} ${c.template}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const ideas = [tr("ミックス"), tr("ズーム"), tr("グラフ"), tr("スマホ"), tr("文字"), tr("落書き"), tr("商品"), tr("字幕")];
  return (
    <>
      <Crumbs items={[{ label: tr("ホーム"), href: '#/' }, { label: tr("検索") }]} />
      <div className="searchbox">
        <span aria-hidden>⌕</span>
        <input id="q" type="search" placeholder={tr("テンプレートやエフェクトを検索")} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="chipbar">
        {ideas.map((w) => (
          <button key={w} className={`fchip ${q === w ? 'on' : ''}`} onClick={() => setQ(w)}>
            {w}
          </button>
        ))}
      </div>
      <p className="cost">{hits.length}{tr("件")}</p>
      <Grid items={hits} onOpen={setOpen} />
      {sheet}
    </>
  );
};

const STATUS_LABEL = { generating: tr("作成中"), ready: tr("編集できます"), rendering: tr("書き出し中"), done: tr("書き出し済み"), error: tr("エラー") } as const;

/** A job's still: its exported reel, else its talking video, else its first photo (server: /api/jobs poster). */
const jobPoster = (j: Job) => (j.poster ? media(j.poster) : j.video ? posterOf(j.video) : j.props ? propsPoster(j.props) : j.thumb ? media(j.thumb) : undefined);

/**
 * One reel per screen, as a card with room around it (not edge to edge). Every reel is a still image with a
 * play button; a tap plays it (its exported MP4 when there is one, which is far lighter than a live
 * composition), scrolling on or starting another stops it. A list of live compositions here is what ran
 * the iPhone out of memory and looped the app through reloads.
 */
const ReelsFeed: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    api<Job[]>('/api/jobs').then((list) => setJobs(list.filter((j) => j.status !== 'error')), () => setJobs([]));
  }, []);
  if (!jobs) return <div className="feed"><div className="feeditem"><div className="feedcard"><div className="feedvideo skeleton" /></div></div></div>;
  if (!jobs.length)
    return (
      <div className="empty">
        <h1>{tr("まだリールがありません")}</h1>
        <p className="sub">{tr("ホームでテンプレートを選んで、最初の1本を作りましょう。")}</p>
        <button className="btn" onClick={() => go('#/')}>
          {tr("テンプレートを見る")}
        </button>
      </div>
    );
  return (
    <div className="feed">
      {jobs.map((j) => (
        <FeedItem key={j.id} job={j} onEdit={() => go(`#/job/${j.id}`)} />
      ))}
    </div>
  );
};

const FeedItem: React.FC<{ job: Job; onEdit: () => void }> = ({ job: row, onEdit }) => {
  // The list has no props; a reel that has not been exported loads them when it is played.
  const [full, setFull] = useState<Job | null>(null);
  const [sound, setSound] = useState(false);
  const solo = useSolo();
  const [playing] = solo;
  useEffect(() => {
    if (playing && !row.video && !full) api<Job>(`/api/jobs/${row.id}`).then(setFull, () => null);
  }, [playing]);
  const job = full ? { ...row, ...full } : row;
  const t = TEMPLATES[job.template];
  const poster = jobPoster(job);
  const playable = Boolean(job.video || job.props || (!row.video && job.status !== 'generating'));
  return (
    <div className="feeditem">
      <div className="feedcard">
        <div className="feedvideo">
          {playable ? (
            <LivePreview poster={poster ?? <div className="feedblank">{STATUS_LABEL[job.status]}</div>} solo={solo} label={tr("再生")}>
              {job.video ? (
                <video className="feedmedia" src={media(job.video)} poster={poster} autoPlay loop muted={!sound} playsInline preload="auto" />
              ) : job.props ? (
                <Player component={t.component} inputProps={job.props} durationInFrames={Math.max(1, t.frames(job.props))} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: '100%', height: '100%' }} autoPlay loop initiallyMuted errorFallback={playerError} acknowledgeRemotionLicense />
              ) : (
                <img className="feedmedia" src={poster} alt="" />
              )}
            </LivePreview>
          ) : poster ? (
            <img className="feedmedia" src={poster} alt="" loading="lazy" />
          ) : (
            <div className="feedblank">{STATUS_LABEL[job.status]}</div>
          )}
          {playing && job.video ? (
            <button className="feedsound" onClick={() => setSound((x) => !x)} aria-label={tr("音")} aria-pressed={sound}>
              <Glyph d={sound ? G.sound : G.mute} size={18} />
            </button>
          ) : null}
        </div>
        <div className="feedinfo">
          <div className="feedmeta">
            <div className="name">{job.title}</div>
            <div className="cost">
              {t.name} · {STATUS_LABEL[job.status]}
            </div>
          </div>
          <div className="feedactions">
            <button className="btn small ghost" onClick={onEdit}>
              {tr("選び直す")}
            </button>
            {job.video ? <ShareButton job={job} compact /> : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const PLANS = [
  { id: 'starter', name: tr("スターター"), price: tr("9,800円"), yen: 9800, tokens: 60, note: tr("週3投稿の目安") },
  { id: 'standard', name: tr("スタンダード"), price: tr("29,800円"), yen: 29800, tokens: 200, note: tr("毎日投稿の目安") },
  { id: 'pro', name: tr("プロ"), price: tr("79,800円"), yen: 79800, tokens: 600, note: tr("複数ブランド・優先書き出し") },
] as const;
/** The cheapest reel (2 tokens, own footage with captions) on a plan, rounded to 10 yen. */
const perReel = (p: { yen: number; tokens: number }) => Math.round(((p.yen / p.tokens) * 2) / 10) * 10;
const MIN_PER_REEL = Math.min(...PLANS.map(perReel));
/** Yen per `unit` tokens on a plan, to set pay as you go against. */
const perUnit = (p: { yen: number; tokens: number }, unit: number) => Math.round((p.yen / p.tokens) * unit);

const FAQ = [
  { q: tr("トークンとは？"), a: tr("リールを1本作るときに使う単位です。ふつうの動画は5、自分の素材だけなら2、AI動画を入れると12使います。書き出しは1回1です。足りないときは、必要な分だけいつでも買い足せます。") },
  { q: tr("同じテンプレートでも毎回ちがう動画になりますか？"), a: tr("はい。ミックスはカットごとにエフェクト・字幕・カメラ・切り替えを組み合わせるので、シャッフルするたびに別の組み合わせになります。") },
  { q: tr("書き出した動画は商用で使えますか？"), a: tr("使えます。インスタのリール、TikTok、YouTubeショート、広告にそのまま使える縦型MP4です。") },
  { q: tr("書き出した後でも直せますか？"), a: tr("直せます。字幕・色・カットの演出を変えて、何度でも書き出し直せます。書き出しは1回につき1トークンです。") },
  { q: tr("無料でできることは？"), a: tr("BGMの作り直しや音楽の種類の変更、投稿文（キャプション・ハッシュタグ）の作成は無料です。電話番号を確認したアカウントは、最初の商品動画（商品を魅せる・体験を映画のように）も1本無料で作れます。") },
  { q: tr("解約はいつでもできますか？"), a: tr("できます。アカウントの「お支払い・解約の管理」から、いつでも手続きできます。") },
];

const jobTokens = (j: Job) => j.tokens ?? (j.template === 'ExperienceFilm' || j.template === 'PhotoAdFilm' ? 12 : j.template === 'ProductShine' ? (j.props?.clip ? 12 : 5) : j.template === 'EffectsReel' || j.template === 'FivePass' || j.template === 'SaaSPromo' ? 5 : 2);

type Me = { freeFirst?: 'available' | 'needs_phone' | 'used'; admin?: boolean; email?: string; plan: 'free' | 'starter' | 'standard' | 'pro'; tokens: number; extra: number; balance: number; billing: boolean; subscribed: boolean; store?: 'stripe' | 'app_store' | 'play_store'; pastDue?: boolean; pendingPlan?: 'starter' | 'standard' | 'pro'; pendingPlanAt?: string; freePending?: boolean; displayName?: string; avatar?: string; auth: boolean };
const PLAN_NAMES: Record<Me['plan'], string> = { free: tr("無料"), starter: tr("スターター"), standard: tr("スタンダード"), pro: tr("プロ") };

// Free tokens are claimed once per phone number: SMS code, then the server checks the number is new.
const phoneError = (e: any) => {
  const c = String(e?.code ?? '');
  if (c === 'auth/invalid-phone-number') return tr("電話番号の形を確認してください。");
  if (c === 'auth/invalid-verification-code') return tr("確認コードがちがいます。");
  if (c === 'auth/credential-already-in-use' || c === 'auth/account-exists-with-different-credential') return tr("この電話番号はすでに別のアカウントで使われています。");
  if (c === 'auth/too-many-requests') return tr("回数が多すぎます。しばらくしてからもう一度お試しください。");
  return e?.message ?? String(e);
};

const FreeClaim: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(phoneError(e));
    }
    setBusy(false);
  };
  const claim = async () => (await api('/api/free-tokens', { method: 'POST' }), onDone());
  const n = fmtN(appConfig?.freeTokens ?? 10);
  return (
    <div className="okmsg">
      <b>{tr("電話番号を確認すると、{0}トークンを無料でもらえます。", n)}</b>
      <div className="cost" style={{ margin: '4px 0 10px' }}>{tr("SMSで届く6桁のコードを入れるだけです。1つの電話番号につき1回までです。")}</div>
      {linkedPhone() ? (
        <button className="btn small" disabled={busy} onClick={run(claim)}>
          {tr("{0}トークンを受け取る", n)}
        </button>
      ) : !sent ? (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="inp" style={{ flex: '1 1 180px', width: 'auto' }} type="tel" autoComplete="tel" placeholder="090-1234-5678" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label={tr("電話番号")} />
          <button id="sms-send" className="btn small" disabled={busy || phone.replace(/\D/g, '').length < 9} onClick={run(async () => (await sendPhoneCode(phone, 'sms-send'), setSent(true)))}>
            {tr("コードを送る")}
          </button>
        </div>
      ) : (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input className="inp" style={{ flex: '1 1 140px', width: 'auto' }} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} aria-label={tr("確認コード")} />
          <button className="btn small" disabled={busy || code.trim().length < 6} onClick={run(async () => (await confirmPhoneCode(code), await claim()))}>
            {tr("確認して受け取る")}
          </button>
          <button className="linkbtn" disabled={busy} onClick={() => (setSent(false), setCode(''))}>
            {tr("番号を入れ直す")}
          </button>
        </div>
      )}
      {err ? <div className="err" style={{ marginTop: 8 }}>{err}</div> : null}
    </div>
  );
};

const Avatar: React.FC<{ me: Me | null; size?: number }> = ({ me, size = 64 }) => (
  <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
    {me?.avatar ? <img src={media(me.avatar.slice(1))} alt="" /> : (me?.displayName || me?.email || '◎').slice(0, 1).toUpperCase()}
  </div>
);

/** Edit name and photo, like CapCut's profile screen: tap the photo to change it, type a name, save. */
const ProfileSheet: React.FC<{ me: Me; onClose: () => void; onSaved: () => void }> = ({ me, onClose, onSaved }) => {
  const [name, setName] = useState(me.displayName ?? '');
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = useRef<HTMLInputElement>(null);
  const take = async (f?: File) => {
    if (!f) return;
    setBusy(true);
    setErr('');
    try {
      setAvatar((await uploadFile(f)).url);
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose}>
      {(close) => (
        <div className="profileedit">
          <h2>{tr("プロフィールを編集")}</h2>
          <button className="avatarpick" onClick={() => (isNative ? pickFromLibrary('image/*').then((f) => take(f ?? undefined), (e) => setErr(e?.message ?? String(e))) : pick.current?.click())} disabled={busy} aria-label={tr("写真を変更")}>
            <Avatar me={{ ...me, avatar, displayName: name }} size={96} />
            <span>{busy ? tr("アップロード中…") : tr("写真を変更")}</span>
          </button>
          <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => take(e.target.files?.[0])} />
          <div className="field">
            <label htmlFor="pname">{tr("名前")}</label>
            <input id="pname" className="inp" maxLength={30} value={name} placeholder={me.email ?? ''} onChange={(e) => setName(e.target.value)} />
          </div>
          {err ? <div className="err">{err}</div> : null}
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api('/api/me', { method: 'PUT', body: JSON.stringify({ displayName: name, avatar: avatar ?? null }) });
                onSaved();
                close();
              } catch (e: any) {
                setErr(e.message);
                setBusy(false);
              }
            }}
          >
            {tr("保存")}
          </button>
        </div>
      )}
    </Sheet>
  );
};

/** The brand kit on the account page: name, Instagram handle, main colour and logo, filled into every new reel. */
const BrandKit: React.FC = () => {
  const [b, setB] = useState<Brand | null>(null);
  const [saved, setSaved] = useState<Brand | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => void loadBrand().then((x) => (setB(x), setSaved(x))), []);
  if (!b) return null;
  const set = (k: keyof Brand) => (v: string | undefined) => (setB({ ...b, [k]: v }), setMsg(''));
  const dirty = JSON.stringify(b) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true);
    setMsg('');
    try {
      const x = await saveBrand(b);
      setB(x);
      setSaved(x);
      setMsg(tr("保存しました"));
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  };
  return (
    <section className="brandkit">
      <div className="thead">
        <h2>{tr("ブランド")}</h2>
        <span className="cost">{tr("新しい動画に自動で入ります")}</span>
      </div>
      <div className="grid2">
        <Field label={tr("ブランド名・お店の名前")} max={24} value={b.name ?? ''} onChange={set('name')} placeholder="Lumina" />
        <Field label={tr("Instagramのアカウント名")} max={30} value={b.handle ?? ''} onChange={set('handle')} placeholder="@lumina" />
      </div>
      <div className="brandrow">
        <div className="field">
          <label>{tr("メインカラー")}</label>
          <div className="brandcolor">
            <input type="color" value={b.color ?? '#DFFF4F'} onChange={(e) => set('color')(e.target.value.toUpperCase())} aria-label={tr("メインカラー")} />
            <span>{b.color ?? tr("未設定")}</span>
            {b.color ? (
              <button className="linkbtn" onClick={() => set('color')(undefined)}>
                {tr("消す")}
              </button>
            ) : null}
          </div>
        </div>
        <Drop label={tr("ロゴ（任意）")} hint={tr("透過PNGがおすすめ")} accept="image/png,image/jpeg,image/webp" value={logoInput(b.logo)} onChange={(v: { url: string }) => set('logo')(v?.url)} />
      </div>
      {b.logo ? (
        <button className="linkbtn" onClick={() => set('logo')(undefined)}>
          {tr("ロゴを外す")}
        </button>
      ) : null}
      <div className="row" style={{ gap: 10, marginTop: 10 }}>
        <button className="btn small" disabled={busy || !dirty} onClick={save}>
          {busy ? tr("保存中…") : tr("保存")}
        </button>
        {msg ? <span className="cost">{msg}</span> : null}
      </div>
    </section>
  );
};

const Account: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);
  const loadMe = () => api<Me>('/api/me').then(setMe).catch(() => null);
  useEffect(() => {
    api<Job[]>('/api/jobs').then(async (list) => setJobs(await Promise.all(list.map((j) => api<Job>(`/api/jobs/${j.id}`).catch(() => j)))));
    if (!DEMO) loadMe();
  }, []);
  const made = jobs.filter((j) => j.props);
  const used = made.reduce((a, j) => a + jobTokens(j), 0);
  const paid = new URLSearchParams(location.hash.split('?')[1] ?? '').get('paid');
  // Stripe pages: checkout for a plan or a top-up, the portal for changing plan, card or cancelling.
  const open = async (what: string, tokens?: number) => {
    setBusy(what);
    setErr('');
    try {
      const { url } = await api<{ url: string }>(what === 'portal' ? '/api/billing/portal' : '/api/billing/checkout', { method: 'POST', body: JSON.stringify({ what, tokens }) });
      location.href = url;
    } catch (e: any) {
      setErr(e.message);
      setBusy('');
    }
  };
  const billing = !!me?.billing;
  /** A plan bought in the app is billed by Apple / Google; the website can't change it, and the app can't change a web plan. */
  const inStore = me?.store === 'app_store' || me?.store === 'play_store';
  return (
    <>
      <Crumbs items={[{ label: tr("ホーム"), href: '#/' }, { label: tr("アカウント") }]} />
      <div className="profile">
        <Avatar me={me} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="name">{me?.displayName || me?.email || tr("マイアカウント")}</div>
          <div className="cost">{me ? tr("プラン: {0}", PLAN_NAMES[me.plan]) : tr("β版・課金はまだつながっていません")}</div>
        </div>
      </div>
      {me ? (
        <div className="row" style={{ gap: 8, marginBottom: 18 }}>
          <button className="btn ghost small" style={{ flex: 1 }} onClick={() => setEditing(true)}>
            {tr("プロフィールを編集")}
          </button>
          {me.auth ? (
            <button className="btn ghost small" onClick={() => signOut()}>
              {tr("ログアウト")}
            </button>
          ) : null}
        </div>
      ) : null}
      {me?.admin ? (
        <button className="btn ghost small admlink" onClick={() => go('#/admin')}>
          {tr("経営ダッシュボードを開く")}
        </button>
      ) : null}
      {editing && me ? <ProfileSheet me={me} onClose={() => setEditing(false)} onSaved={loadMe} /> : null}
      {me?.freePending ? <FreeClaim onDone={loadMe} /> : null}
      {paid ? <div className="okmsg">{tr("お支払いありがとうございます。トークンは数秒で反映されます。")}</div> : null}
      {me?.pastDue && !isNative && !inStore ? (
        <div className="err">
          {tr("今月のお支払いができませんでした。カードを更新してください。")}{' '}
          <button className="linkbtn" disabled={!!busy} onClick={() => open('portal')}>
            {tr("お支払い方法を更新")}
          </button>
        </div>
      ) : null}
      <div className="stats3">
        <div>
          <b><CountUp to={me ? me.balance : made.length} format={fmtN} /></b>
          <span>{me ? tr("残りのトークン") : tr("作ったリール")}</span>
        </div>
        <div>
          <b><CountUp to={used} format={fmtN} /></b>
          <span>{tr("使ったトークン")}</span>
        </div>
        <div>
          <b><CountUp to={jobs.filter((j) => j.video).length} /></b>
          <span>{tr("書き出した動画")}</span>
        </div>
      </div>
      {me ? <BrandKit /> : null}
      <h2>{tr("プラン")}</h2>
      {me && me.freeFirst && me.freeFirst !== 'used' ? (
        <div className="okmsg freefirstmsg">
          <b>{tr("初回の商品動画は無料")}</b>
          <div className="cost" style={{ margin: '2px 0 0' }}>
            {me.freeFirst === 'available' ? tr("「商品を魅せる」「体験を映画のように」の最初の1本は0トークンで作れます。") : tr("電話番号を確認すると、「商品を魅せる」「体験を映画のように」の最初の1本を0トークンで作れます。")}
          </div>
        </div>
      ) : null}
      {isNative ? (
        <StorePlans me={me} onChanged={loadMe} />
      ) : (
      <>
      <p className="lead-price">
        {tr("リール1本")} <b>{tr("約{0}円", MIN_PER_REEL)}</b> {tr("から")}
      </p>
      <p className="cost" style={{ marginTop: -6, marginBottom: 12 }}>{tr("※プロプランで字幕リール（2トークン）を作った場合")}</p>
      <div className="plans">
        {PLANS.map((p) => {
          const current = me?.plan === p.id;
          return (
            <div key={p.id} className={`plan ${current ? 'on' : ''}`}>
              <div className="name">{p.name}</div>
              <div className="price">
                {tr("約{0}円", perReel(p))}
                <small>{tr("/本から")}</small>
              </div>
              <div className="cost">
                {tr("月{0}・毎月{1}トークン", p.price, fmtN(p.tokens))}
                <br />
                {p.note}
              </div>
              {inStore ? (
                <button className="btn ghost small" disabled>
                  {current ? tr("利用中") : tr("App Storeで契約中")}
                </button>
              ) : !billing ? (
                <button className="btn ghost small" disabled title={tr("課金の接続後に選べます")}>
                  {tr("準備中")}
                </button>
              ) : current ? (
                <button className="btn ghost small" disabled>
                  {tr("利用中")}
                </button>
              ) : (
                <button className="btn small" disabled={!!busy} onClick={() => open(me!.subscribed ? 'portal' : p.id)}>
                  {busy === p.id ? tr("移動中…") : me!.subscribed ? tr("このプランに変更") : tr("このプランにする")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {inStore ? <p className="cost">{tr("このプランはiPhoneのアプリで契約しています。変更・解約はiPhoneの「設定」→ Apple ID →「サブスクリプション」からできます。")}</p> : null}
      <p className="cost">{tr("消費トークン: 自分の素材だけ 2 ／ AI写真・エフェクト 5 ／ AI動画あり 12 ／ 書き出し 1")}</p>
      {billing && appConfig?.payg ? <PayAsYouGo payg={appConfig.payg} busy={busy} onBuy={(tokens) => open('topup', tokens)} /> : null}
      {billing && me?.subscribed ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {me?.subscribed ? (
            <button className="btn ghost small" disabled={!!busy} onClick={() => open('portal')}>
              {tr("お支払い・解約の管理")}
            </button>
          ) : null}
        </div>
      ) : null}
      </>
      )}
      {err ? <div className="err">{err}</div> : null}
      <h2 style={{ marginTop: 24 }}>{tr("言語")}</h2>
      <div className="langgrid">
        {langs.map((l) => (
          <button key={l} className={`fchip ${l === lang ? 'on' : ''}`} onClick={() => l !== lang && setLang(l)}>
            {LANG_NAMES[l].native}
          </button>
        ))}
      </div>
      <h2 style={{ marginTop: 24 }}>{tr("よくある質問")}</h2>
      <Accordion items={FAQ} />
      <p className="legal">
        <a href="/legal/terms.html" target="_blank" rel="noreferrer">{tr("利用規約")}</a>
        <a href="/legal/privacy.html" target="_blank" rel="noreferrer">{tr("プライバシーポリシー")}</a>
        <a href="/legal/tokushoho.html" target="_blank" rel="noreferrer">{tr("特定商取引法に基づく表記")}</a>
      </p>
      <h2 style={{ marginTop: 24 }}>{tr("履歴")}</h2>
      <History onOpen={(id) => go(`#/job/${id}`)} />
      {me?.auth ? <DeleteAccount me={me} /> : null}
    </>
  );
};

// ---------- owner dashboard (#/admin) ----------
// Revenue, costs and profit for the owner. The server answers /api/admin/metrics only for ADMIN_EMAILS / ADMIN_UIDS,
// so this page shows nothing to anyone else; it is the one place AI cost is shown, and never to customers.

type MoneyRow = { key: string; gross: number; fee: number; tax: number; net: number; count: number; tokens: number };
type MonthSummary = { month: string; gross: number; fees: number; tax: number; net: number; aiCost: number; serverCost: number; grossProfit: number; profit: number; margin: number | null; salesCount: number; refunds: number; refundJpy: number; testSales: number; reels: number };
type Metrics = {
  month: string;
  currentMonth: string;
  assumptions: { usdJpy: number; serverCostMonth: number; serverCostShare: number; serverCostSince: string; feesEstimated: boolean };
  summary: MonthSummary & { mrr: number; payingUsers: number; pastDue: number };
  byChannel: MoneyRow[];
  byProduct: MoneyRow[];
  payingByPlan: { plan: string; users: number; mrr: number; stripe: number; app_store: number; play_store: number; pastDue: number }[];
  users: { total: number; newInMonth: number; freeClaims: number; freeClaimsTotal: number; paying: number };
  reels: { made: number; failed: number; exports: number; byTemplate: { template: string; reels: number; failed: number; exports: number; aiCost: number; avgAiCost: number | null }[] };
  tokens: { sold: number; consumed: number; refunded: number; free: number; granted?: number; freeFirst?: number; outstanding: number };
  trend: MonthSummary[];
  health?: Health;
};
type HealthWin = { ok: number; failed: number; rate: number | null };
type Health = {
  day: HealthWin & { exportsFailed: number };
  week: HealthWin & { exportsFailed: number };
  byTemplate: { template: string; day: HealthWin; week: HealthWin; lastFailAt?: string }[];
  recentErrors: { at: string; jobId: string; template: string; kind: 'generate' | 'export'; message: string }[];
  alert: boolean;
};

const whenShort = (iso: string) => new Date(iso).toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const rateTxt = (r: number | null) => (r === null ? '—' : `${r}%`);
const tplName = (t: string) => TEMPLATES[t as TemplateId]?.name ?? t;

/** Generation health for the owner: is making reels working right now, and if not, what is the error. */
const HealthPanel: React.FC<{ h: Health }> = ({ h }) => (
  <section className={`admhealth ${h.alert ? 'alert' : ''}`}>
    <div className="thead">
      <h2>{tr("生成の状態")}</h2>
      <span className={`admstate ${h.alert ? 'bad' : 'good'}`}>{h.alert ? tr("失敗が続いています") : tr("正常")}</span>
    </div>
    <div className="admcards admhealthcards">
      {([[tr("直近24時間"), h.day], [tr("直近7日"), h.week]] as const).map(([label, w]) => (
        <div key={label} className={`admcard ${w.rate !== null && w.rate >= 30 && w.failed >= 3 ? 'bad' : ''}`}>
          <span>{label}</span>
          <b>{tr("失敗率 {0}", rateTxt(w.rate))}</b>
          <small>
            {tr("成功 {0}・失敗 {1}", fmtN(w.ok), fmtN(w.failed))}
            {w.exportsFailed ? ` · ${tr("書き出し失敗 {0}", fmtN(w.exportsFailed))}` : ''}
          </small>
        </div>
      ))}
    </div>
    {h.byTemplate.length ? (
      <div className="admtable">
        <table>
          <thead>
            <tr><th>{tr("テンプレート")}</th><th>{tr("24時間 成功/失敗")}</th><th>{tr("7日 成功/失敗")}</th><th>{tr("失敗率(7日)")}</th><th>{tr("最後の失敗")}</th></tr>
          </thead>
          <tbody>
            {h.byTemplate.map((r) => (
              <tr key={r.template}>
                <td>{tplName(r.template)}</td>
                <td>{fmtN(r.day.ok)} / <span className={r.day.failed ? 'neg' : ''}>{fmtN(r.day.failed)}</span></td>
                <td>{fmtN(r.week.ok)} / <span className={r.week.failed ? 'neg' : ''}>{fmtN(r.week.failed)}</span></td>
                <td className={(r.week.rate ?? 0) >= 30 ? 'neg' : ''}>{rateTxt(r.week.rate)}</td>
                <td>{r.lastFailAt ? whenShort(r.lastFailAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="cost">{tr("直近7日の生成はまだありません")}</p>
    )}
    {h.recentErrors.length ? (
      <>
        <h3 className="admsub">{tr("最近のエラー")}</h3>
        <ul className="admerrors">
          {h.recentErrors.map((e) => (
            <li key={e.jobId + e.at}>
              <div>
                <b>{tplName(e.template)}</b>
                <small>
                  {e.kind === 'export' ? tr("書き出し") : tr("生成")} · {whenShort(e.at)} · {e.jobId}
                </small>
              </div>
              <code>{e.message}</code>
            </li>
          ))}
        </ul>
      </>
    ) : null}
  </section>
);

const yen = (n: number): string => (n < 0 ? `−${yen(-n)}` : tr("{0}円", fmtN(n)));
const CHANNEL_NAMES: Record<string, string> = { stripe: 'Stripe (Web)', app_store: 'App Store', play_store: 'Google Play' };
const productName = (k: string) =>
  ({ payg: tr("都度購入"), topup: tr("トークンパック"), topup_small: tr("トークンパック（小）"), refund: tr("返金"), subscription: tr("サブスク（プラン不明）") } as Record<string, string>)[k] ??
  PLAN_NAMES[k as Me['plan']] ??
  k;
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
};

/** Net revenue against AI + server cost, month by month. Plain SVG; each bar names its value on hover. */
const TrendChart: React.FC<{ trend: MonthSummary[] }> = ({ trend }) => {
  const W = 600, H = 200, padL = 8, padB = 24, padT = 12;
  const cost = (m: MonthSummary) => m.aiCost + m.serverCost;
  const max = Math.max(1, ...trend.flatMap((m) => [m.net, cost(m)]));
  const slot = (W - padL * 2) / trend.length;
  const bw = Math.min(26, slot / 3);
  const h = (v: number) => (Math.max(0, v) / max) * (H - padB - padT);
  const base = H - padB;
  return (
    <figure className="admchart">
      <div className="admlegend">
        <span><i className="sw net" />{tr("純売上")}</span>
        <span><i className="sw cost" />{tr("AI原価＋サーバー代")}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("直近6か月の推移")}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padL} x2={W - padL} y1={base - f * (H - padB - padT)} y2={base - f * (H - padB - padT)} className="gl" />
        ))}
        <line x1={padL} x2={W - padL} y1={base} y2={base} className="axis" />
        {trend.map((m, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={m.month}>
              <rect className="admbar net" x={cx - bw - 1} y={base - h(m.net)} width={bw} height={Math.max(h(m.net), 0.5)} rx={3}>
                <title>{`${m.month} ${tr("純売上")}: ${yen(m.net)}`}</title>
              </rect>
              <rect className="admbar cost" x={cx + 1} y={base - h(cost(m))} width={bw} height={Math.max(h(cost(m)), 0.5)} rx={3}>
                <title>{`${m.month} ${tr("AI原価＋サーバー代")}: ${yen(cost(m))}`}</title>
              </rect>
              <text x={cx} y={H - 5} textAnchor="middle" className="lbl">{m.month.slice(2).replace('-', '/')}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="cost">{tr("最大 {0}", yen(max))}</figcaption>
    </figure>
  );
};

const Admin: React.FC = () => {
  const [month, setMonth] = useState('');
  const [data, setData] = useState<Metrics | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    setErr('');
    api<Metrics>(`/api/admin/metrics${month ? `?month=${month}` : ''}`).then(
      (d) => (setData(d), month || setMonth(d.month)),
      (e) => setErr(e.message),
    );
  }, [month]);
  if (err && !data) return <div className="err">{err === 'not found' ? tr("このページはオーナーだけが見られます。") : err}</div>;
  if (!data) return <p className="cost">{tr("読み込み中…")}</p>;
  const s = data.summary;
  const isCurrent = data.month === data.currentMonth;
  const cards: { label: string; value: string; note?: string; tone?: 'good' | 'bad' }[] = [
    { label: isCurrent ? tr("今月の売上") : tr("売上"), value: yen(s.gross), note: tr("{0}件・返金{1}件", fmtN(s.salesCount), fmtN(s.refunds)) },
    { label: tr("手数料"), value: yen(s.fees), note: data.assumptions.feesEstimated ? tr("推定を含む") : undefined },
    { label: tr("純売上"), value: yen(s.net), note: s.tax ? tr("税{0}を除く", yen(s.tax)) : undefined },
    { label: tr("AI原価"), value: yen(s.aiCost), note: tr("1ドル={0}円で換算", data.assumptions.usdJpy) },
    { label: tr("サーバー代(概算)"), value: yen(s.serverCost), note: data.assumptions.serverCostShare < 1 ? tr("月{0}を経過日数で按分", yen(data.assumptions.serverCostMonth)) : tr("月{0}", yen(data.assumptions.serverCostMonth)) },
    { label: tr("利益"), value: yen(s.profit), tone: s.profit >= 0 ? 'good' : 'bad', note: tr("粗利 {0}", yen(s.grossProfit)) },
    { label: tr("利益率"), value: s.margin === null ? '—' : `${s.margin}%`, tone: s.margin === null ? undefined : s.margin >= 0 ? 'good' : 'bad' },
    { label: 'MRR', value: yen(s.mrr), note: tr("現在の契約から") },
    { label: tr("有料ユーザー"), value: fmtN(s.payingUsers), note: s.pastDue ? tr("支払い遅延 {0}", fmtN(s.pastDue)) : undefined },
  ];
  const MoneyTable: React.FC<{ rows: MoneyRow[]; name: (k: string) => string }> = ({ rows, name }) =>
    rows.length ? (
      <div className="admtable">
        <table>
          <thead>
            <tr><th>{tr("項目")}</th><th>{tr("件数")}</th><th>{tr("売上")}</th><th>{tr("手数料")}</th><th>{tr("純売上")}</th><th>{tr("トークン")}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}><td>{name(r.key)}</td><td>{fmtN(r.count)}</td><td>{yen(r.gross)}</td><td>{yen(r.fee)}</td><td>{yen(r.net)}</td><td>{fmtN(r.tokens)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <p className="cost">{tr("この月の売上はまだありません")}</p>
    );
  return (
    <div className="admin">
      <Crumbs items={[{ label: tr("ホーム"), href: '#/' }, { label: tr("アカウント"), href: '#/me' }, { label: tr("経営ダッシュボード") }]} />
      <div className="admhead">
        <h1>{tr("経営ダッシュボード")}</h1>
        <div className="row admmonth">
          <button className="btn ghost small" onClick={() => setMonth(shiftMonth(data.month, -1))} aria-label={tr("前の月")}>‹</button>
          <input className="inp" type="month" value={month} max={data.currentMonth} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label={tr("月")} />
          <button className="btn ghost small" disabled={data.month >= data.currentMonth} onClick={() => setMonth(shiftMonth(data.month, 1))} aria-label={tr("次の月")}>›</button>
        </div>
      </div>
      {err ? <div className="err">{err}</div> : null}
      {data.health ? <HealthPanel h={data.health} /> : null}
      <div className="admcards">
        {cards.map((c) => (
          <div key={c.label} className={`admcard ${c.tone ?? ''}`}>
            <span>{c.label}</span>
            <b>{c.value}</b>
            {c.note ? <small>{c.note}</small> : null}
          </div>
        ))}
      </div>
      {s.testSales ? <p className="cost">{tr("テスト決済{0}件は集計から除いています。", fmtN(s.testSales))}</p> : null}

      <h2>{tr("直近6か月の推移")}</h2>
      <TrendChart trend={data.trend} />
      <div className="admtable">
        <table>
          <thead>
            <tr><th>{tr("月")}</th><th>{tr("売上")}</th><th>{tr("手数料")}</th><th>{tr("純売上")}</th><th>{tr("AI原価")}</th><th>{tr("サーバー代(概算)")}</th><th>{tr("利益")}</th><th>{tr("利益率")}</th><th>{tr("作ったリール")}</th></tr>
          </thead>
          <tbody>
            {data.trend.map((m) => (
              <tr key={m.month} className={m.month === data.month ? 'on' : ''}>
                <td>{m.month}</td><td>{yen(m.gross)}</td><td>{yen(m.fees)}</td><td>{yen(m.net)}</td><td>{yen(m.aiCost)}</td><td>{yen(m.serverCost)}</td>
                <td className={m.profit < 0 ? 'neg' : ''}>{yen(m.profit)}</td><td>{m.margin === null ? '—' : `${m.margin}%`}</td><td>{fmtN(m.reels)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{tr("プラン・商品別の売上")}</h2>
      <MoneyTable rows={data.byProduct} name={productName} />
      <h2>{tr("チャネル別の売上")}</h2>
      <MoneyTable rows={data.byChannel} name={(k) => CHANNEL_NAMES[k] ?? k} />

      <h2>{tr("有料ユーザー（現在）")}</h2>
      {data.payingByPlan.length ? (
        <div className="admtable">
          <table>
            <thead>
              <tr><th>{tr("プラン")}</th><th>{tr("人数")}</th><th>MRR</th><th>Web</th><th>App Store</th><th>Google Play</th><th>{tr("支払い遅延")}</th></tr>
            </thead>
            <tbody>
              {data.payingByPlan.map((r) => (
                <tr key={r.plan}><td>{PLAN_NAMES[r.plan as Me['plan']] ?? r.plan}</td><td>{fmtN(r.users)}</td><td>{yen(r.mrr)}</td><td>{fmtN(r.stripe)}</td><td>{fmtN(r.app_store)}</td><td>{fmtN(r.play_store)}</td><td>{fmtN(r.pastDue)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="cost">{tr("有料プランの契約はまだありません")}</p>
      )}

      <h2>{tr("テンプレート別のリール")}</h2>
      {data.reels.byTemplate.length ? (
        <div className="admtable">
          <table>
            <thead>
              <tr><th>{tr("テンプレート")}</th><th>{tr("作成")}</th><th>{tr("失敗")}</th><th>{tr("書き出し")}</th><th>{tr("AI原価")}</th><th>{tr("1本あたりAI原価")}</th></tr>
            </thead>
            <tbody>
              {data.reels.byTemplate.map((r) => (
                <tr key={r.template}><td>{TEMPLATES[r.template as TemplateId]?.name ?? r.template}</td><td>{fmtN(r.reels)}</td><td>{fmtN(r.failed)}</td><td>{fmtN(r.exports)}</td><td>{yen(r.aiCost)}</td><td>{r.avgAiCost === null ? '—' : yen(r.avgAiCost)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="cost">{tr("この月のリールはまだありません")}</p>
      )}

      <div className="admgrid">
        <div className="admpanel">
          <h2>{tr("リール")}</h2>
          <dl>
            <dt>{tr("作ったリール")}</dt><dd>{fmtN(data.reels.made)}</dd>
            <dt>{tr("書き出し")}</dt><dd>{fmtN(data.reels.exports)}</dd>
            <dt>{tr("失敗したジョブ")}</dt><dd>{fmtN(data.reels.failed)}</dd>
            <dt>{tr("返金")}</dt><dd>{tr("{0}件", fmtN(s.refunds))} / {yen(s.refundJpy)}</dd>
          </dl>
        </div>
        <div className="admpanel">
          <h2>{tr("トークン")}</h2>
          <dl>
            <dt>{tr("販売したトークン")}</dt><dd>{fmtN(data.tokens.sold)}</dd>
            <dt>{tr("使われたトークン")}</dt><dd>{fmtN(data.tokens.consumed)}</dd>
            <dt>{tr("失敗で返したトークン")}</dt><dd>{fmtN(data.tokens.refunded)}</dd>
            <dt>{tr("無料で配ったトークン")}</dt><dd>{fmtN(data.tokens.free)}</dd>
            <dt>{tr("オーナーが付与したトークン")}</dt><dd>{fmtN(data.tokens.granted ?? 0)}</dd>
            <dt>{tr("初回無料の商品動画")}</dt><dd>{tr("{0}本", fmtN(data.tokens.freeFirst ?? 0))}</dd>
            <dt>{tr("未使用の残高（全ユーザー）")}</dt><dd>{fmtN(data.tokens.outstanding)}</dd>
          </dl>
        </div>
        <div className="admpanel">
          <h2>{tr("ユーザー")}</h2>
          <dl>
            <dt>{tr("総ユーザー")}</dt><dd>{fmtN(data.users.total)}</dd>
            <dt>{tr("新規登録")}</dt><dd>{fmtN(data.users.newInMonth)}</dd>
            <dt>{tr("無料トークン受け取り")}</dt><dd>{fmtN(data.users.freeClaims)} <small className="cost">({tr("累計{0}", fmtN(data.users.freeClaimsTotal))})</small></dd>
            <dt>{tr("有料ユーザー")}</dt><dd>{fmtN(data.users.paying)}</dd>
          </dl>
        </div>
      </div>
      <GrantTokens />
      <p className="cost admnote">{tr("この画面はオーナーだけが見られます。手数料はStripe・ストアが金額を返さないときは推定（Stripe 3.6%・ストア30%）、サーバー代は概算です。月は日本時間で区切っています。")}</p>
    </div>
  );
};

// Owner only: give tokens to an account by its email (own testing, App Review). Never counted as a sale.
const GrantTokens: React.FC = () => {
  const [email, setEmail] = useState('');
  const [n, setN] = useState(100);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const go = async () => {
    setBusy(true);
    setMsg('');
    try {
      const r = await api<{ email: string; granted: number; balance: number }>('/api/admin/grant', { method: 'POST', body: JSON.stringify({ email, tokens: n }) });
      setMsg(tr("{0} に {1} トークンを付与しました（残高 {2}）", r.email, fmtN(r.granted), fmtN(r.balance)));
    } catch (e) {
      setMsg((e as Error).message);
    }
    setBusy(false);
  };
  return (
    <div className="admpanel admgrant">
      <h2>{tr("トークンを付与")}</h2>
      <p className="cost">{tr("テストや審査用に、メールアドレスのアカウントへトークンを付けます。売上には入りません。")}</p>
      <div className="admgrantrow">
        <input type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="number" min={1} max={10000} value={n} onChange={(e) => setN(Number(e.target.value))} />
        <button className="btn" disabled={busy || !email.includes('@') || !(n >= 1)} onClick={go}>{tr("付与する")}</button>
      </div>
      {msg && <p className="cost">{msg}</p>}
    </div>
  );
};

const PAYG_PRESETS = [5, 10, 30, 100];

/**
 * Pay as you go on the website: any amount of tokens, any time, no plan needed. A unit costs a little more
 * than on a plan, and the card says how much a plan saves, so steady users still move to one.
 */
const PayAsYouGo: React.FC<{ payg: NonNullable<NonNullable<typeof appConfig>['payg']>; busy: string; onBuy: (tokens: number) => void }> = ({ payg, busy, onBuy }) => {
  const min = payg.min * payg.unit;
  const max = payg.max * payg.unit;
  const [tokens, setTokens] = useState(10);
  const units = Math.round(tokens / payg.unit);
  const ok = units >= payg.min && units <= payg.max;
  const yen = units * payg.unitYen;
  const planRange = PLANS.map((p) => perUnit(p, payg.unit));
  return (
    <div className="payg">
      <div className="name">{tr("トークンを都度購入")}</div>
      <p className="cost">{tr("プランなしでも、好きなときに好きな量だけ買えます（{0}トークンあたり{1}円・期限なし）。", fmtN(payg.unit), fmtN(payg.unitYen))}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
        {PAYG_PRESETS.filter((n) => n >= min && n <= max).map((n) => (
          <button key={n} className={`fchip ${tokens === n ? 'on' : ''}`} onClick={() => setTokens(n)}>
            {fmtN(n)}
          </button>
        ))}
        <input
          className="inp"
          style={{ flex: '1 1 120px', width: 'auto' }}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={payg.unit}
          value={tokens}
          onChange={(e) => setTokens(Number(e.target.value) || 0)}
          aria-label={tr("トークン数")}
        />
      </div>
      <button className="btn small" style={{ marginTop: 10 }} disabled={!ok || !!busy} onClick={() => onBuy(units * payg.unit)}>
        {busy === 'topup' ? tr("移動中…") : tr("{0}トークンを{1}円で購入", fmtN(units * payg.unit), fmtN(yen))}
      </button>
      {!ok ? <div className="cost">{tr("{0}〜{1}トークンの間で選んでください", fmtN(min), fmtN(max))}</div> : null}
      <p className="cost">{tr("月額プランなら{0}トークンあたり約{1}〜{2}円でおトクです。", fmtN(payg.unit), Math.min(...planRange), Math.max(...planRange))}</p>
    </div>
  );
};

/**
 * Plans and token packs in the app, sold through the App Store (RevenueCat). Prices are the store's own.
 * Tokens land on the same account as the website, through the server's RevenueCat webhook.
 */
const StorePlans: React.FC<{ me: Me | null; onChanged: () => Promise<unknown> }> = ({ me, onChanged }) => {
  const auth = useAuth();
  const [products, setProducts] = useState<Partial<Record<'topup' | 'small' | 'starter' | 'standard' | 'pro', IapProduct>> | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const iap = appConfig?.iap;
  useEffect(() => {
    if (iap && auth.uid) iapProducts(iap, auth.uid).then(setProducts, (e) => (setProducts({}), setMsg(e?.message ?? String(e))));
  }, [auth.uid]);
  const webPlan = me?.store === 'stripe' || (me?.subscribed && !me?.store);
  /** The webhook usually lands within seconds; watch the balance until it moves. */
  const waitForTokens = async (before: number, plan?: string) => {
    let moved = false;
    for (let i = 0; i < 15 && !moved; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const m = await api<Me>('/api/me').catch(() => null);
      moved = !!m && (m.balance !== before || (!!plan && m.plan === plan));
    }
    await onChanged();
    return moved;
  };
  const buy = (key: 'topup' | 'small' | 'starter' | 'standard' | 'pro') => async () => {
    const p = products?.[key];
    if (!p) return;
    setBusy(key);
    setMsg('');
    try {
      const before = me?.balance ?? 0;
      const plan = PLANS.find((x) => x.id === key);
      const cur = PLANS.find((x) => x.id === me?.plan);
      // Apple switches to a smaller plan at the next renewal, so nothing arrives now: say so instead of waiting.
      const later = !!plan && !!cur && plan.tokens < cur.tokens && (me?.store === 'app_store' || me?.store === 'play_store');
      if (await iapBuy(p)) {
        if (later) {
          setMsg(tr("次の更新日から{0}に切り替わります。今のトークンはそのまま使えます。", plan!.name));
          await new Promise((r) => setTimeout(r, 3000));
          await onChanged();
        } else {
          setMsg(tr("お支払いありがとうございます。トークンは数秒で反映されます。"));
          if (!(await waitForTokens(before, plan ? key : undefined))) setMsg(tr("反映に少し時間がかかっています。しばらくしてからこの画面を開き直してください。"));
        }
      }
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
    setBusy('');
  };
  const restore = async () => {
    setBusy('restore');
    setMsg('');
    try {
      await iapRestore();
      await waitForTokens(me?.balance ?? 0);
      setMsg(tr("購入を復元しました。"));
    } catch (e: any) {
      setMsg(e?.message ?? String(e));
    }
    setBusy('');
  };
  if (!iap) return <p className="cost">{tr("アプリ内のご購入は準備中です。")}</p>;
  return (
    <>
      <div className="plans">
        {PLANS.map((p) => {
          const prod = products?.[p.id];
          const current = me?.plan === p.id;
          return (
            <div key={p.id} className={`plan ${current ? 'on' : ''}`}>
              <div className="name">{p.name}</div>
              <div className="price">{prod ? prod.price : products ? '—' : '…'}<small>{tr("/月")}</small></div>
              <div className="cost">
                {tr("毎月{0}トークン", fmtN(p.tokens))}
                <br />
                {p.note}
              </div>
              {current ? (
                <button className="btn ghost small" disabled>{tr("利用中")}</button>
              ) : me?.pendingPlan === p.id ? (
                <button className="btn ghost small" disabled>{tr("次の更新日から")}</button>
              ) : webPlan ? (
                <button className="btn ghost small" disabled>{tr("アプリ以外で契約中")}</button>
              ) : (
                <button className="btn small" disabled={!prod || !!busy} onClick={buy(p.id)}>
                  {busy === p.id ? tr("処理中…") : me?.store === 'app_store' || me?.store === 'play_store' ? tr("このプランに変更") : tr("このプランにする")}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {webPlan ? <p className="cost">{tr("このプランはアプリ以外で契約しています。")}</p> : null}
      <p className="cost">{tr("消費トークン: 自分の素材だけ 2 ／ AI写真・エフェクト 5 ／ AI動画あり 12 ／ 書き出し 1")}</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
        {products?.small ? (
          <button className="btn ghost small" disabled={!!busy} onClick={buy('small')}>
            {busy === 'small' ? tr("処理中…") : tr("トークンを{0}追加する", fmtN(iap.smallTokens ?? 3))} ({products.small.price})
          </button>
        ) : null}
        <button className="btn ghost small" disabled={!products?.topup || !!busy} onClick={buy('topup')}>
          {busy === 'topup' ? tr("処理中…") : tr("トークンを{0}追加する", fmtN(iap.topupTokens ?? 10))}
          {products?.topup ? ` (${products.topup.price})` : ''}
        </button>
        {me?.store === 'app_store' || me?.store === 'play_store' ? (
          <button className="btn ghost small" onClick={() => manageStoreSubscription()}>
            {tr("サブスクリプションの管理")}
          </button>
        ) : null}
        <button className="linkbtn" disabled={!!busy} onClick={restore}>
          {busy === 'restore' ? tr("処理中…") : tr("購入を復元")}
        </button>
      </div>
      {msg ? <div className="okmsg" style={{ marginTop: 10 }}>{msg}</div> : null}
      <p className="cost" style={{ marginTop: 10 }}>
        {platform === 'android'
          ? tr("プランは1か月ごとの自動更新です。Google Playの定期購入からいつでも解約できます。")
          : tr("プランは1か月ごとの自動更新です。お支払いはApple IDに請求されます。期間終了の24時間前までに解約しない限り自動で更新され、解約はiPhoneの「設定」→ Apple ID →「サブスクリプション」からいつでもできます。")}
      </p>
    </>
  );
};

/** Delete the account from inside the app (App Store guideline 5.1.1(v)); the website has the same. */
const DeleteAccount: React.FC<{ me: Me }> = ({ me }) => {
  const [step, setStep] = useState<'closed' | 'confirm' | 'busy'>('closed');
  const [err, setErr] = useState('');
  const inStore = me.store === 'app_store' || me.store === 'play_store';
  if (step === 'closed')
    return (
      <p style={{ marginTop: 32, textAlign: 'center' }}>
        <button className="linkbtn" style={{ color: 'var(--danger)' }} onClick={() => setStep('confirm')}>
          {tr("アカウントを削除")}
        </button>
      </p>
    );
  return (
    <div className="err" style={{ marginTop: 24, display: 'grid', gap: 10 }}>
      <b>{tr("アカウントを削除しますか？")}</b>
      <span>{tr("作ったリール、アップロードした素材、残りのトークン、ログイン情報がすべて削除され、元に戻せません。Webで契約中のプランは解約されます。")}</span>
      {inStore ? (
        <span>
          {tr("App Storeのサブスクリプションは自動では止まりません。先にiPhoneの「設定」→ Apple ID →「サブスクリプション」で解約してください。")}{' '}
          {isNative ? (
            <button className="linkbtn" onClick={() => manageStoreSubscription()}>
              {tr("サブスクリプションの管理")}
            </button>
          ) : null}
        </span>
      ) : null}
      <div className="row" style={{ gap: 8 }}>
        <button
          className="btn small"
          style={{ background: 'var(--danger)', color: '#fff' }}
          disabled={step === 'busy'}
          onClick={async () => {
            setStep('busy');
            setErr('');
            try {
              await deleteAccount();
              location.hash = '#/';
            } catch (e: any) {
              setErr(String(e?.code ?? '').includes('cancel') ? '' : e?.message ?? String(e));
              setStep('confirm');
            }
          }}
        >
          {step === 'busy' ? tr("削除中…") : tr("削除する")}
        </button>
        <button className="btn ghost small" disabled={step === 'busy'} onClick={() => setStep('closed')}>
          {tr("やめる")}
        </button>
      </div>
      {err ? <span>{err}</span> : null}
    </div>
  );
};

const Globe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
  </svg>
);

const LangSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Sheet onClose={onClose} className="list">
    {() => (
      <>
        <h2>{tr("言語")}</h2>
        {langs.map((l) => (
          <button key={l} className={`listrow ${l === lang ? 'on' : ''}`} onClick={() => (l === lang ? onClose() : setLang(l))}>
            <span className="tag">{l.toUpperCase()}</span>
            <b>{LANG_NAMES[l].native}</b>
            {l === lang ? <span className="check">✓</span> : null}
          </button>
        ))}
      </>
    )}
  </Sheet>
);

const Icon: React.FC<{ name: 'home' | 'reels' | 'plus' | 'search' | 'me' }> = ({ name }) => {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden>
      {name === 'home' ? <path {...p} d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /> : null}
      {name === 'reels' ? (
        <>
          <rect {...p} x="3.5" y="3.5" width="17" height="17" rx="5" />
          <path {...p} d="M10 9v6l5-3z" />
        </>
      ) : null}
      {name === 'plus' ? <path {...p} d="M12 5v14M5 12h14" /> : null}
      {name === 'search' ? (
        <>
          <circle {...p} cx="11" cy="11" r="6.5" />
          <path {...p} d="m16 16 4 4" />
        </>
      ) : null}
      {name === 'me' ? (
        <>
          <circle {...p} cx="12" cy="9" r="4" />
          <path {...p} d="M4.5 20c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
        </>
      ) : null}
    </svg>
  );
};

// ---------- app shell (hash routing) ----------

const useHash = () => {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return hash;
};

const App = () => {
  const hash = useHash();
  const [sel, setSel] = useState<number | null>(null);
  const [langOpen, setLangOpen] = useState(false);
  const go = (h: string) => (location.hash = h);
  const [, route, arg, arg2] = hash.split('?')[0].split('/');
  const query = new URLSearchParams(hash.split('?')[1] ?? '');
  const tab = route === 'reels' || route === 'job' ? 'reels' : route === 'me' || route === 'history' || route === 'admin' ? 'me' : route === 'new' || route === 'start' ? 'new' : 'home';
  const tabs = [
    { id: 'home', label: tr("ホーム"), icon: 'home', onClick: () => go('#/') },
    { id: 'new', label: tr("作成"), icon: 'plus', onClick: () => go('#/start') },
    { id: 'reels', label: tr("マイ動画"), icon: 'reels', onClick: () => go('#/reels') },
    { id: 'me', label: tr("アカウント"), icon: 'me', onClick: () => go('#/me') },
  ] as const;
  // While picking, the reel takes the whole screen.
  const immersive = route === 'job';
  // Pages sized to the screen (the feed) need the header's height, which includes the notch.
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = top.current;
    if (!el) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--toph', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <SelContext.Provider value={{ sel, setSel }}>
      <div className={`top ${immersive ? 'away' : ''}`} ref={top}>
        <div className="logo" onClick={() => go('#/')}>
          <img className="mark" src="/icons/icon.svg" alt="" /> Edit<span>less</span>
        </div>
        <div className="nav">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={t.onClick}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <ThemeButton />
        <button className="langbtn" onClick={() => go('#/search')} aria-label={tr("検索")}>
          <Icon name="search" />
        </button>
        <button className="langbtn" onClick={() => setLangOpen(true)} aria-label={tr("言語")}>
          <Globe /> <span className="lname">{LANG_NAMES[lang].native}</span>
        </button>
      </div>
      <main className={route === 'reels' ? 'wide' : immersive ? 'immersive' : ''}>
        <div className="page" key={`${route ?? ''}/${arg ?? ''}`}>
        {route === 'new' && arg in TEMPLATES ? (
          <NewJob key={hash} template={arg as TemplateId} fx={effectIds.includes(arg2 as EffectId) ? (arg2 as EffectId) : undefined} mixArg={arg2?.startsWith('mix-') ? arg2.slice(4) : undefined} tplArg={arg2?.startsWith('tpl-') ? arg2 : undefined} onBack={() => history.back()} onStarted={(j) => go(`#/job/${j.id}`)} />
        ) : route === 'job' && arg ? (
          <Editor key={arg} id={arg} />
        ) : route === 'admin' ? (
          <Admin />
        ) : route === 'history' || route === 'me' ? (
          <Account go={go} />
        ) : route === 'reels' ? (
          <ReelsFeed go={go} />
        ) : route === 'search' ? (
          <Search go={go} />
        ) : route === 'start' ? (
          <Start go={go} />
        ) : (
          <Home go={go} initialGroup={query.get('g') ?? undefined} />
        )}
        </div>
      </main>
      <nav className={`tabbar ${immersive ? 'away' : ''}`} aria-label={tr("メニュー")} style={{ '--tab': tabs.findIndex((t) => t.id === tab) } as React.CSSProperties}>
        <span className="tabglow" aria-hidden />
        {tabs.map((t) => (
          <button key={t.id} className={`${tab === t.id ? 'on' : ''} ${t.id === 'new' ? 'make' : ''}`} onClick={t.onClick} aria-label={t.label}>
            <Icon name={t.icon} />
          </button>
        ))}
      </nav>
      {langOpen ? <LangSheet onClose={() => setLangOpen(false)} /> : null}
    </SelContext.Provider>
  );
};

const AppleLogo = () => (
  <svg width="16" height="18" viewBox="0 0 814 1000" aria-hidden fill="currentColor">
    <path d="M788 341c-6 4-108 62-108 190 0 149 131 202 135 203-1 3-21 72-69 142-43 62-88 124-156 124s-86-40-164-40c-77 0-104 41-166 41s-106-57-156-127C46 792 0 667 0 548 0 357 124 256 247 256c65 0 120 43 161 43 39 0 100-45 174-45 28 0 129 2 196 87zM555 160c31-37 53-88 53-139 0-7-1-14-2-20-50 2-110 34-146 76-28 32-55 83-55 135 0 8 1 16 2 18 3 1 9 2 14 2 45 0 102-30 134-72z" />
  </svg>
);

/** Splits a line into words or phrases that animate in one by one and never break inside. */
const splitWords = (text: string) => {
  // Japanese and Chinese break only after punctuation (編集しない、｜動画編集アプリ。); other languages between words.
  const parts = lang === 'ja' || lang === 'zh' ? text.split(/(?<=[、。，！？])/) : text.split(/(\s+)/);
  // spaces stay plain text, so a line never starts with one
  return parts.map((w, i) =>
    /^\s+$/.test(w) ? (
      w
    ) : (
      <span key={i} className="w" style={{ '--i': i } as React.CSSProperties}>
        {w}
      </span>
    ),
  );
};

/** The three steps of the app, lit one after another. */
const SignInSteps = () => {
  const steps = [tr("素材を入れる"), tr("AIが編集"), tr("選ぶだけ")];
  const [on, setOn] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setOn((i) => (i + 1) % steps.length), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="signsteps" aria-hidden>
      {steps.map((s, i) => (
        <span key={i} className={i === on ? 'on' : ''}>
          <b>{i + 1}</b>
          {s}
        </span>
      ))}
    </div>
  );
};

/** Real renders behind the sign-in form: tilted columns of reels drifting past, and a phone playing the samples. */
const STAGE_FEATURED = [
  { key: 'film-sushi', name: () => tr("商品を魅せる") },
  { key: 'film-matcha', name: () => tr("商品を魅せる") },
  { key: 'SaaSPromo', name: () => tr("サービス紹介") },
  { key: 'TalkCaptions', name: () => tr("トーク動画＋字幕") },
  { key: 'mix-hype', name: () => tr("ミックス") },
];
const SignInStage = () => {
  const keys = useShowcaseKeys();
  const featured = STAGE_FEATURED.filter((f) => keys?.has(f.key));
  const [cur, setCur] = useState(0);
  if (!keys) return <div className="signstage" aria-hidden />;
  // base keys only (per-language copies are picked by showcase()), templates and mixes first
  // the older product sample stays out once a product film exists
  const base = [...keys].filter((k) => !/\.[a-z]{2}$/.test(k) && !(k === 'ProductShine' && featured.length && featured[0].key.startsWith('film-')));
  const ranked = [...featured.map((f) => f.key).filter((k) => base.includes(k)), ...base.filter((k) => k.startsWith('mix-')), ...effectIds.filter((k) => keys.has(k))];
  const pool = [...new Set(ranked)];
  const cols = [0, 1, 2].map((c) => {
    const list = pool.filter((_, i) => i % 3 === c);
    return list.length ? [...list, ...list, ...list].slice(0, 6) : [];
  });
  const f = featured.length ? featured[cur % featured.length] : null;
  return (
    <div className="signstage" aria-hidden>
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="cols">
        {cols.map((list, c) => (
          <div key={c} className={`col c${c}`}>
            {/* the list twice, so the loop wraps without a seam */}
            {[...list, ...list].map((k, i) => (
              <img key={i} src={showcase(k).poster} alt="" loading="lazy" />
            ))}
          </div>
        ))}
      </div>
      {f ? (
        <div className="phone">
          {LITE ? (
            // phones: nothing plays by itself; the samples change as stills
            <img key={f.key} src={showcase(f.key).poster} alt="" onLoad={() => setTimeout(() => setCur((i) => i + 1), 4000)} />
          ) : (
            <video key={f.key} src={showcase(f.key).video} poster={showcase(f.key).poster} autoPlay muted playsInline onEnded={() => setCur((i) => i + 1)} />
          )}
          <span key={`l${cur}`} className="phonetag">
            {f.name()}
          </span>
        </div>
      ) : null}
    </div>
  );
};

/** Shown instead of the app while login is on and nobody is signed in. */
const SignIn: React.FC = () => {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<unknown>) => async () => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e: any) {
      const code = String(e?.code ?? '');
      setMsg(
        code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')
          ? tr("メールアドレスかパスワードが違います。")
          : code.includes('email-already-in-use')
            ? tr("このメールアドレスはすでに登録されています。ログインしてください。")
            : code.includes('weak-password')
              ? tr("パスワードは6文字以上にしてください。")
              : code.includes('popup-closed') || /cancel/i.test(String(e?.message ?? '')) || code === '1001'
                ? ''
                : tr("うまくいきませんでした。もう一度お試しください。"),
      );
    }
    setBusy(false);
  };
  return (
    <div className="signwrap">
      <SignInStage />
      <div className="signin">
      <div className="logo">
        <img className="mark" src="/icons/icon.svg" alt="" /> Edit<span>less</span>
      </div>
      <h1 className="splith">{splitWords(tr("編集しない、動画編集アプリ。"))}</h1>
      <p className="sub">{tr("素材を入れるだけで、AIが編集まで仕上げます。あなたは出てきた案から選ぶだけ。")}</p>
      <SignInSteps />
      {isNative || appConfig?.appleWeb ? (
        <button className="btn apple" disabled={busy} onClick={run(signInApple)}>
          <AppleLogo /> {tr("Appleでサインイン")}
        </button>
      ) : null}
      <button className="btn google" disabled={busy} onClick={run(signInGoogle)}>
        <b>G</b> {tr("Googleで続ける")}
      </button>
      <div className="or">{tr("またはメールで")}</div>
      <input className="inp" type="email" autoComplete="email" placeholder={tr("メールアドレス")} value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="inp" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} placeholder={tr("パスワード（6文字以上）")} value={pw} onChange={(e) => setPw(e.target.value)} />
      <button className="btn" disabled={busy || !email || pw.length < 6} onClick={run(() => (mode === 'in' ? signInEmail(email, pw) : signUpEmail(email, pw)))}>
        {mode === 'in' ? tr("ログイン") : tr("新規登録")}
      </button>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="linkbtn" onClick={() => (setMode(mode === 'in' ? 'up' : 'in'), setMsg(''))}>
          {mode === 'in' ? tr("はじめての方は新規登録") : tr("登録済みの方はログイン")}
        </button>
        {mode === 'in' ? (
          <button className="linkbtn" disabled={!email} onClick={run(async () => (await resetPassword(email), setMsg(tr("パスワード再設定のメールを送りました。"))))}>
            {tr("パスワードを忘れた")}
          </button>
        ) : null}
      </div>
      {msg ? <div className="cost">{msg}</div> : null}
      <p className="cost">{tr("登録して電話番号を確認すると、{0}トークン分を無料で試せます。", fmtN(appConfig?.freeTokens ?? 10))}</p>
      <p className="legal">
        <a href="/legal/terms.html" target="_blank" rel="noreferrer">{tr("利用規約")}</a>
        <a href="/legal/privacy.html" target="_blank" rel="noreferrer">{tr("プライバシーポリシー")}</a>
        <a href="/legal/tokushoho.html" target="_blank" rel="noreferrer">{tr("特定商取引法に基づく表記")}</a>
      </p>
      <label className="langbtn" style={{ justifySelf: 'center' }}>
        <Globe />
        <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={tr("言語")}>
          {langs.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l].native}
            </option>
          ))}
        </select>
      </label>
      </div>
    </div>
  );
};

/** Email sign-ups land here until they click the link in the confirmation mail. */
const VerifyEmail: React.FC<{ email?: string | null }> = ({ email }) => {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string>) => async () => {
    setBusy(true);
    setMsg('');
    try {
      setMsg(await fn());
    } catch {
      setMsg(tr("うまくいきませんでした。もう一度お試しください。"));
    }
    setBusy(false);
  };
  return (
    <div className="signin">
      <div className="logo">
        <img className="mark" src="/icons/icon.svg" alt="" /> Edit<span>less</span>
      </div>
      <h1>{tr("メールアドレスを確認してください")}</h1>
      <p className="sub">{tr("{0} に確認メールを送りました。メールのリンクを押してから、下のボタンを押してください。", email ?? '')}</p>
      <button className="btn" disabled={busy} onClick={run(async () => ((await checkVerified()) ? '' : tr("まだ確認できていません。メールのリンクを押してください。")))}>
        {tr("確認しました")}
      </button>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="linkbtn" disabled={busy} onClick={run(async () => (await resendVerification(), tr("確認メールをもう一度送りました。")))}>
          {tr("メールを再送する")}
        </button>
        <button className="linkbtn" onClick={() => signOut()}>
          {tr("ログアウト")}
        </button>
      </div>
      {msg ? <div className="cost">{msg}</div> : null}
    </div>
  );
};

/** Login gate: the app itself once signed in (or when login is off, or in the static preview). */
const Gate = () => {
  const auth = useAuth();
  // The static preview opens the sign-in page at #/signin, to show it without a login server.
  if (DEMO) return location.hash === '#/signin' ? <SignIn /> : <App />;
  if (!auth.ready) return null;
  if (auth.enabled && !auth.signedIn) return <SignIn />;
  if (auth.enabled && !auth.verified) return <VerifyEmail email={auth.email} />;
  return <App key={auth.email ?? ''} />;
};

/** iPhone Safari only (not the home-screen app, not Chrome or Instagram's browser): how to add it to the home screen. */
const showInstallHint = (() => {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV|Line\//.test(ua);
  let hidden = false;
  try {
    hidden = localStorage.getItem('reels-install-hint') === 'hidden';
  } catch {}
  return ios && safari && (navigator as any).standalone !== true && !(window as any).Capacitor && !hidden;
})();

const ShareGlyph = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3v12M8 7l4-4 4 4" />
    <path d="M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1" />
  </svg>
);

const InstallHint = () => {
  const [open, setOpen] = useState(showInstallHint);
  if (!open) return null;
  const [before, after] = tr("共有ボタン {0} をタップして「ホーム画面に追加」を選んでください", '\u0000').split('\u0000');
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem('reels-install-hint', 'hidden');
    } catch {}
  };
  return (
    <div className="installhint" role="note">
      <img src="/favicon.svg" alt="" />
      <div>
        <b>{tr("ホーム画面に追加すると、アプリのように使えます")}</b>
        <span>
          {before}
          <ShareGlyph />
          {after}
        </span>
      </div>
      <button onClick={close} aria-label={tr("閉じる")}>×</button>
    </div>
  );
};

const Root = () => (
  <>
    <Gate />
    <InstallHint />
  </>
);

if (!DEMO) startAuth();
createRoot(document.getElementById('root')!).render(<Root />);
