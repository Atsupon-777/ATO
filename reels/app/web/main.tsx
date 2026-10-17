import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, Thumbnail, type PlayerRef } from '@remotion/player';
import { accentColors, accents, cameraMoves, captionStyles, combinationCount, fontChoices, grades, textures, transitions } from '../../src/effects/axes';
import { recipeById, recipes, rollStyles } from '../../src/effects/recipes';
import { ProductShine, productShineBeats } from '../../src/templates/ProductShine';
import { SaaSPromo, saasPromoBeats } from '../../src/templates/SaaSPromo';
import { TalkCaptions, talkCaptionsDuration } from '../../src/templates/TalkCaptions';
import { EffectsReel, effectsReelDuration } from '../../src/templates/EffectsReel';
import { FPS, beatFrames } from '../../src/lib/timing';
import { keepSegments, paginate, placeWords } from '../../src/lib/edit';
import { effectIds, type BeatStyle, type EffectId, type EffectsReelProps, type ProductShineProps, type SaaSPromoProps, type TalkCaptionsProps } from '../../src/schemas';
import productSample from '../../props/product-watch.json';
import saasSample from '../../props/saas-ato.json';
import talkSample from '../../props/talk-ato.json';
import effectsSample from '../../props/effects-demo.json';

type TemplateId = 'ProductShine' | 'SaaSPromo' | 'TalkCaptions' | 'EffectsReel';

const TEMPLATES: Record<
  TemplateId,
  { name: string; tag: string; desc: string; component: React.FC<any>; frames: (p: any) => number; sample: any }
> = {
  ProductShine: {
    name: '商品を魅せる',
    tag: '写真1枚から',
    desc: '商品写真を自動で切り抜き、AIでスタジオ撮影風に。光の反射とディテールのアップで高級感のあるリールに。',
    component: ProductShine,
    frames: (p) => Math.round(productShineBeats(p) * beatFrames(p.bpm)),
    sample: productSample,
  },
  SaaSPromo: {
    name: 'サービス紹介',
    tag: 'スクショから',
    desc: 'PC・スマホの画面を3Dで動かし、機能・実績の数字・CTAまでテンポよく見せるサービス紹介リール。',
    component: SaaSPromo,
    frames: () => Math.round(saasPromoBeats * beatFrames(128)),
    sample: saasSample,
  },
  TalkCaptions: {
    name: 'トーク動画＋字幕',
    tag: '動画から',
    desc: '話している動画をアップすると、文字起こし・無音カット・言い淀みカット・テロップまで自動。字幕は1つずつ直せます。',
    component: TalkCaptions,
    frames: (p) => talkCaptionsDuration(p, FPS),
    sample: talkSample,
  },
  EffectsReel: {
    name: 'トーク＋動画エフェクト',
    tag: '動画から',
    desc: '話している動画を、カットごとに違うエフェクト・字幕・カメラ・切り替えで仕上げます。17種のエフェクトと演出の掛け合わせで、1カットあたり約962億通り。ミックスを選ぶと全体の雰囲気がそろいます。',
    component: EffectsReel,
    frames: (p) => effectsReelDuration(p, FPS),
    sample: effectsSample,
  },
};

/** Japanese names for the 17 effects (catalog: notes/video-effects.md). */
const EFFECT_NAMES: Record<(typeof effectIds)[number], string> = {
  orbit: '01 オービット（カードが周回）',
  couchWall: '02 壁一面のカード',
  uiWorld: '03 アプリ画面の世界',
  frameBreak: '04 フレームを破る',
  digitalZoom: '05 デジタルズーム',
  phoneMockup: '06 スマホモック',
  checklist: '07 チェックリスト',
  headlineWall: '08 見出しの壁',
  zoomThrough: '09 ズームスルー',
  chartGrow: '10 グラフが伸びる',
  pullBack: '11 引いて見せる',
  greenScreen: '12 背景差し替え',
  paperCut: '13 紙の切り抜き',
  doodleBoil: '14 落書きアニメ',
  vertigo: '15 めまいズーム',
  coverStory: '16 雑誌の表紙',
  glassType: '17 ガラス文字',
};

type Job = {
  id: string;
  template: TemplateId;
  title: string;
  createdAt: string;
  status: 'generating' | 'ready' | 'rendering' | 'done' | 'error';
  step?: { n: number; total: number; label: string };
  renderProgress?: number;
  props?: any;
  usage?: { totalUsd: number; lines: { step: string; model: string; units: string; usd: number }[] };
  video?: string;
  error?: string;
  thumb?: string;
};

// Static preview build (no server): jobs come from window.ATO_DEMO, edits stay in memory,
// and generation/export explain that they need the server.
const DEMO = (window as any).ATO_DEMO as { jobs: Job[] } | undefined;
const BASE: string = (window as any).remotion_staticBase ?? '';
const media = (p: string) => (/^(blob:|https?:)/.test(p) ? p : `${BASE}/${p}`);
const DEMO_BLOCKED = 'このプレビューでは生成と書き出しは動きません（サーバー版で動作確認済み）。編集とプレビューは試せます。';

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
  const r = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? r.statusText);
  return j;
};

const uploadFile = async (f: File) => {
  if (DEMO) return { file: f.name, url: URL.createObjectURL(f) };
  const r = await fetch(`/api/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error);
  return j as { file: string; url: string };
};

// Tokens per reel, from the pricing plan (A: own material 2, B: AI photo 5, C: AI video 12).
const tokensFor = (t: TemplateId, input: Record<string, any>) =>
  t === 'ProductShine' ? (input.video ? 12 : 5) : t === 'EffectsReel' ? 5 : 2;

const STEP_LABELS: Record<string, string> = {
  'cut-out': '商品を切り抜き',
  'studio shot': 'スタジオ撮影風の写真を生成',
  'plan and copy': '構成とコピーを作成',
  'motion clip (Veo)': 'AI動画クリップを生成（1〜3分）',
  'on-skin model shot': 'モデル使用シーンを生成',
  'build props': '動画を組み立て',
  render: '動画を組み立て',
  'copy and layout': '画面を読み取り、コピーと見せ場を作成',
  audio: '音声を抽出',
  transcribe: '文字起こし',
  matte: '人物を切り抜き（数分かかります）',
  'plan effects': '話に合わせてエフェクトを選ぶ',
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
        onClick={() => ref.current?.click()}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), setOver(false), take(e.dataTransfer.files[0]))}
      >
        {value ? isVideo ? <video src={value.url} muted /> : <img src={value.url} /> : <div style={{ width: 72, height: 72, borderRadius: 8, background: 'var(--panel2)', display: 'grid', placeItems: 'center', fontSize: 24 }}>＋</div>}
        <div>
          <div>{busy ? 'アップロード中…' : value ? value.name : 'クリックまたはドラッグ＆ドロップ'}</div>
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

const Preview: React.FC<{ template: TemplateId; props: any; playerRef?: React.RefObject<PlayerRef | null>; autoPlay?: boolean; controls?: boolean; children?: React.ReactNode }> = ({
  template,
  props,
  playerRef,
  autoPlay,
  controls = true,
  children,
}) => {
  const t = TEMPLATES[template];
  const frames = Math.max(1, t.frames(props));
  return (
    <div className="player">
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
        autoPlay={autoPlay}
        initiallyMuted={autoPlay}
        acknowledgeRemotionLicense
      />
      {children}
    </div>
  );
};

// ---------- screens ----------

const STYLE_OPTIONS = [
  { id: 'luxury', name: 'ラグジュアリー', note: '黒大理石・金色の光' },
  { id: 'clean', name: 'クリーン', note: '白背景・やわらかい光' },
  { id: 'cosmetic', name: 'コスメ', note: 'ピンク・水しぶき' },
  { id: 'natural', name: 'ナチュラル', note: '木目・木漏れ日' },
];

const NewJob: React.FC<{ template: TemplateId; fx?: EffectId; mixArg?: string; onStarted: (job: Job) => void; onBack: () => void }> = ({ template, fx, mixArg, onStarted, onBack }) => {
  const [input, setInput] = useState<Record<string, any>>({ style: 'luxury', cta: '詳しくはプロフィールへ', effects: fx ? [fx] : [], recipe: mixArg ?? 'all' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: any) => setInput((s) => ({ ...s, [k]: v }));
  const t = TEMPLATES[template];
  const ready =
    template === 'ProductShine' ? input.photo && input.brand && input.name : template === 'SaaSPromo' ? input.desktop && input.name : input.video;
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      const body = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v && typeof v === 'object' ? v.file : v]));
      onStarted(await api<Job>('/api/jobs', { method: 'POST', body: JSON.stringify({ template, input: body }) }));
    } catch (e: any) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="editor">
      <div className="stage">
        <div className="player">
          <div style={{ aspectRatio: '9 / 16' }}>
            <ShowVideo k={fx ?? template} controls />
          </div>
        </div>
        <p className="cost" style={{ textAlign: 'center' }}>このテンプレートで実際に作った見本</p>
      </div>
      <div>
        <button className="btn ghost small" onClick={onBack}>← テンプレート一覧</button>
        <h1 style={{ marginTop: 16 }}>{t.name}</h1>
        <p className="sub">{t.desc}</p>
        <div className="form">
          {template === 'ProductShine' ? (
            <>
              <Drop label="商品写真" hint="スマホで撮った写真でOK。商品全体が写っているもの" accept="image/*" value={input.photo} onChange={set('photo')} />
              <div className="grid2">
                <Field label="ブランド名" max={16} value={input.brand ?? ''} onChange={set('brand')} placeholder="FUJI ASAHIEN" />
                <Field label="商品名" max={24} value={input.name ?? ''} onChange={set('name')} placeholder="静寂" />
              </div>
              <Field
                label="商品の特徴（コピーはここに書いたことだけを使います）"
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder="例: 静岡県産の一番茶、石臼挽き、濃茶向け"
              />
              <div className="field">
                <label>撮影スタイル</label>
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
                  AI動画クリップを入れる（Veo・8秒）
                  <small>カメラがゆっくり回り込む映像が入り、ぐっと高級感が出ます。生成に1〜3分ほどかかります。</small>
                </span>
              </label>
              {input.style === 'cosmetic' && input.video ? (
                <label className="check">
                  <input type="checkbox" checked={!!input.onSkin} onChange={(e) => set('onSkin')(e.target.checked)} />
                  <span>
                    モデルが使っているシーンにする
                    <small>化粧品向け。AIが生成したモデルが商品を肌にのせる映像になります。</small>
                  </span>
                </label>
              ) : null}
              <div className="grid2">
                <Field label="最後のひとこと（CTA）" max={16} value={input.cta ?? ''} onChange={set('cta')} />
                <Field label="アカウント名" max={30} value={input.handle ?? ''} onChange={set('handle')} placeholder="@ato_sns" />
              </div>
            </>
          ) : template === 'SaaSPromo' ? (
            <>
              <Drop label="PC画面のスクリーンショット" hint="サービスのトップや管理画面など" accept="image/*" value={input.desktop} onChange={set('desktop')} />
              <Drop label="スマホ画面のスクリーンショット（任意）" hint="あるとスマホのモックアップも動きます" accept="image/*" value={input.mobile} onChange={set('mobile')} />
              <Drop label="ロゴ（任意）" hint="透過PNGがおすすめ" accept="image/*" value={input.logo} onChange={set('logo')} />
              <div className="grid2">
                <Field label="サービス名" max={20} value={input.name ?? ''} onChange={set('name')} placeholder="ATO" />
                <Field label="URL" max={40} value={input.url ?? ''} onChange={set('url')} placeholder="ato-sns.com" />
              </div>
              <Field label="どんなサービスか" multiline value={input.description ?? ''} onChange={set('description')} placeholder="例: 写真1枚から広告リールを自動で作るSNS運用ツール" />
              <Field
                label="実績の数字（動画で使う数字はここからだけ）"
                multiline
                value={input.facts ?? ''}
                onChange={set('facts')}
                placeholder="例: 総再生回数 9939万回、総フォロワー 377万人、導入社数 120社"
              />
            </>
          ) : (
            <>
              <Drop label="トーク動画" hint="3分以内のMP4 / MOV。縦でも横でもOK" accept="video/*" value={input.video} onChange={set('video')} />
              {template === 'EffectsReel' ? <MixPicker value={input.recipe} onChange={set('recipe')} /> : null}
              <p className="cost">
                {template === 'EffectsReel'
                  ? '文字起こし → 人物の切り抜き → 話の内容に合わせて、選んだミックスの中でカットごとにエフェクト・字幕・カメラ・切り替えを組み合わせます。'
                  : '文字起こし → 無音・言い淀み（えー、あの）のカット → 単語ごとのテロップまで自動で行います。'}
              </p>
            </>
          )}
          <div className="actions">
            <button className="btn" disabled={!ready || busy || !!DEMO} onClick={submit}>
              {busy ? '送信中…' : 'AIで作成する'}
            </button>
            <span className="cost">
              消費: <b>{tokensFor(template, input)}トークン</b>
            </span>
          </div>
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

const Generating: React.FC<{ job: Job }> = ({ job }) => {
  const steps =
    job.template === 'ProductShine'
      ? ['cut-out', 'studio shot', 'plan and copy', 'motion clip (Veo)', 'build props']
      : job.template === 'SaaSPromo'
        ? ['copy and layout', 'build props']
        : job.template === 'EffectsReel'
          ? ['audio', 'transcribe', 'matte', 'plan effects']
          : ['audio', 'transcribe', 'build props'];
  const cur = job.step?.label;
  const curIdx = steps.findIndex((s) => s === cur || (cur === 'on-skin model shot' && s === 'motion clip (Veo)'));
  return (
    <div style={{ maxWidth: 520, margin: '40px auto' }}>
      <h1>AIが作成しています</h1>
      <p className="sub">このページを閉じても作成は続きます。履歴からいつでも開けます。</p>
      <div className="bar">
        <div style={{ width: `${job.step ? (job.step.n / (job.step.total + 0.5)) * 100 : 5}%` }} />
      </div>
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

const Cost: React.FC<{ job: Job }> = ({ job }) =>
  job.usage ? (
    <details className="cost">
      <summary>
        原価 <b>${job.usage.totalUsd.toFixed(2)}</b>（約{Math.round(job.usage.totalUsd * 150)}円） ・ 消費 {job.template === 'ProductShine' ? (job.props?.clip ? 12 : 5) : job.template === 'EffectsReel' ? 5 : 2}トークン
      </summary>
      <div style={{ marginTop: 8, display: 'grid', gap: 4 }}>
        {job.usage.lines.map((l, i) => (
          <div key={i}>
            {l.step}: {l.model} · {l.units} · ${l.usd.toFixed(3)}
          </div>
        ))}
      </div>
    </details>
  ) : null;

const Editor: React.FC<{ id: string }> = ({ id }) => {
  const [job, setJob, refreshJob] = useJob(id);
  const [props, setProps] = useState<any>(null);
  const [saveErr, setSaveErr] = useState('');
  const [saved, setSaved] = useState(true);
  const playerRef = useRef<PlayerRef | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    if (job?.props && !props) setProps(job.props);
  }, [job?.props]);

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

  if (!job) return <p className="sub">読み込み中…</p>;
  if (job.status === 'generating') return <Generating job={job} />;
  if (job.status === 'error' && !job.props)
    return (
      <div style={{ maxWidth: 520, margin: '40px auto' }}>
        <h1>作成できませんでした</h1>
        <p className="err">{job.error}</p>
      </div>
    );
  if (!props) return null;

  const render = async () => {
    try {
      const j = await api<Job>(`/api/jobs/${id}/render`, { method: 'POST' });
      setJob({ ...j, props });
      refreshJob();
    } catch (e: any) {
      setSaveErr(e.message);
    }
  };

  const t = TEMPLATES[job.template];
  const isTalk = job.template === 'TalkCaptions';
  return (
    <div className="editor">
      <div className="stage">
        {isTalk ? <TalkStage props={props} update={update} playerRef={playerRef} /> : <Preview template={job.template} props={props} playerRef={playerRef} />}
        <div className="actions" style={{ justifyContent: 'center' }}>
          {job.status === 'rendering' ? (
            <div style={{ width: '100%' }}>
              <div className="cost" style={{ marginBottom: 6 }}>書き出し中… {Math.round((job.renderProgress ?? 0) * 100)}%</div>
              <div className="bar">
                <div style={{ width: `${(job.renderProgress ?? 0) * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <button className="btn" disabled={!saved || !!DEMO} onClick={render} title={DEMO ? DEMO_BLOCKED : undefined}>
                MP4を書き出す
              </button>
              {job.status === 'done' && job.video ? (
                <a className="btn ghost" href={media(job.video)} download={`${job.title}.mp4`} target="_blank">
                  {DEMO ? '書き出し済みのMP4を見る' : 'ダウンロード'}
                </a>
              ) : null}
            </>
          )}
        </div>
        {job.status === 'done' && job.video ? <p className="cost ok" style={{ textAlign: 'center' }}>書き出し完了。編集すると再書き出しできます。</p> : null}
        {job.error ? <p className="err">{job.error}</p> : null}
        {saveErr ? <p className="err">{saveErr}</p> : null}
      </div>
      <div>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <span className="tag">{t.name}</span>
            <h1>{job.title}</h1>
          </div>
          <span className="pill">{saved ? '保存済み' : '保存中…'}</span>
        </div>
        <Cost job={job} />
        <div style={{ height: 16 }} />
        {job.template === 'ProductShine' ? (
          <ProductPanel p={props} update={update} />
        ) : job.template === 'SaaSPromo' ? (
          <SaasPanel p={props} update={update} />
        ) : job.template === 'EffectsReel' ? (
          <EffectsPanel p={props} update={update} playerRef={playerRef} />
        ) : (
          <TalkPanel p={props} update={update} playerRef={playerRef} />
        )}
      </div>
    </div>
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
        <h2>テキスト</h2>
        <div className="form" style={{ maxWidth: 'none' }}>
          <div className="grid2">
            <Field label="ブランド名" max={16} value={p.brand} onChange={(v) => set((x) => void (x.brand = v))} />
            <Field label="商品名" max={24} value={p.productName} onChange={(v) => set((x) => void (x.productName = v))} />
          </div>
          <Field label="キャッチコピー" max={22} value={p.tagline} onChange={(v) => set((x) => void (x.tagline = v))} />
          <div className="grid2">
            <Field label="CTA" max={16} value={p.cta} onChange={(v) => set((x) => void (x.cta = v))} />
            <Field label="アカウント名" max={30} value={p.handle} onChange={(v) => set((x) => void (x.handle = v))} />
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>ディテールのアップ（3カット）</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.details.map((d, i) => (
            <div key={i} className="grid2">
              <Field label={`${i + 1}. 英字ラベル`} max={24} value={d.kicker} onChange={(v) => set((x) => void (x.details[i].kicker = v))} />
              <Field label={`${i + 1}. 見出し`} max={14} value={d.title} onChange={(v) => set((x) => void (x.details[i].title = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>色とテンポ</h2>
        <Colors
          value={p.palette}
          labels={{ accent: 'アクセント', glow: '光', base: '背景' }}
          onChange={(v) => set((x) => void (x.palette = v as any))}
        />
        <div className="field" style={{ marginTop: 14 }}>
          <label>
            <span>テンポ（BPM）</span>
            <span>{p.bpm}</span>
          </label>
          <input type="range" min={90} max={150} value={p.bpm} onChange={(e) => set((x) => void (x.bpm = Number(e.target.value)))} />
        </div>
        {p.clip !== undefined ? (
          <label className="check" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={!!p.clip} onChange={(e) => set((x) => void (e.target.checked ? null : delete x.clip))} disabled={!p.clip} />
            <span>AI動画クリップを使う</span>
          </label>
        ) : null}
      </div>
    </>
  );
};

// ---------- effect mixing: labels, mix picker, per-beat style ----------

const AXIS_LABELS: Record<string, Record<string, string>> = {
  caption: { pop: 'ポップ', blur: 'ぼかしから', spaced: '字間ひろめ', upper: '大文字', script: '筆記体ゴールド', outline: '袋文字', box: '黒帯', highlighter: 'マーカー', typewriter: 'タイプ', stack: '縦積み', bounce: 'バウンド', neon: 'ネオン' },
  camera: { still: '固定', push: 'ゆっくり寄る', pull: 'ゆっくり引く', drift: '横に流れる', punch: 'パンチイン', shake: '衝撃ゆれ', tilt: '傾き', spinIn: '回転イン', handheld: '手持ち風', rack: 'ピント送り' },
  transition: { cut: 'カット', zoomBlur: 'ズームブラー', whipLeft: '横スワイプ', whipUp: '縦スワイプ', flash: 'フラッシュ', glitch: 'グリッチ', slide: 'スライド', dip: '暗転', iris: '丸ワイプ', split: '左右から閉じる', spin: '回転', blurDissolve: 'ぼかしディゾルブ' },
  grade: { natural: 'ナチュラル', warm: 'あたたかい', cool: 'クール', mono: 'モノクロ', film: 'フィルム', tealOrange: 'ティール＆オレンジ', pastel: 'パステル', punchy: 'くっきり', faded: '色あせ', neon: 'ネオン', sepia: 'セピア', night: 'ナイト' },
  texture: { none: 'なし', grain: 'フィルム粒子', lightLeak: '光漏れ', vignette: '周辺減光', halftone: '網点', scanlines: '走査線', dust: 'ほこり', paper: '紙' },
  accent: { sparkles: 'キラキラ', outline: '人物の白フチ', arrows: '手描き矢印', underline: '下線', emoji: '絵文字', beatFlash: 'ビートで光る', letterbox: 'シネマ帯', progress: '進行バー', stickers: 'ステッカー', glow: '人物の後光' },
  font: { display: '太ゴシック（欧文）', sansJP: 'ゴシック', serif: 'セリフ', mincho: '明朝' },
};
const lbl = (axis: string, v?: string) => (v ? AXIS_LABELS[axis]?.[v] ?? v : '—');

/** 約963億通り: scenes × every style axis × accent subsets (src/effects/axes.ts). */
const MIX_COUNT = `約${Math.floor(combinationCount(effectIds.length) / 1e8).toLocaleString()}億通り`;

const MixPicker: React.FC<{ value: string; onChange: (id: string) => void }> = ({ value, onChange }) => (
  <div className="field">
    <label>
      <span>ミックス（エフェクトの組み合わせ方）</span>
      <span>1カットあたり{MIX_COUNT}</span>
    </label>
    <div className="mixgrid">
      {recipes.map((r) => (
        <button key={r.id} className={`mix ${value === r.id ? 'on' : ''}`} onClick={() => onChange(r.id)}>
          <b>{r.name}</b>
          <small>{r.desc}</small>
        </button>
      ))}
    </div>
  </div>
);

const Select: React.FC<{ label: string; axis: string; options: readonly string[]; value?: string; onChange: (v: string) => void }> = ({ label, axis, options, value, onChange }) => (
  <div className="field">
    <label>{label}</label>
    <select className="sel" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {value ? null : <option value="">標準</option>}
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
  const shuffle = (id = p.recipe) =>
    update((x) => {
      const looks = rollStyles(recipeById(id), x.segments.length, Math.floor(Math.random() * 1e5), { hasMatte: !!x.matte });
      x.recipe = id;
      x.segments.forEach((s, i) => {
        s.effect = looks[i].scene;
        s.style = looks[i].style;
      });
      return x;
    });
  return (
    <div className="panel">
      <h2>
        ミックス
        <button className="btn small" onClick={() => shuffle()}>
          🎲 シャッフル
        </button>
      </h2>
      <p className="cost" style={{ marginTop: -4 }}>
        各カットは「エフェクト × 字幕 × カメラ × 切り替え × 色味 × 質感 × 飾り」の掛け合わせです（1カットあたり{MIX_COUNT}）。シャッフルすると、いまのミックスの中で全カットの組み合わせを引き直します。文字の内容はそのままです。
      </p>
      <MixPicker value={recipe.id} onChange={(id) => shuffle(id)} />
      <div className="grid4" style={{ marginTop: 12 }}>
        <Select label="色味（全体）" axis="grade" options={grades} value={first.grade} onChange={(v) => setAll({ grade: v as never })} />
        <Select label="質感（全体）" axis="texture" options={textures} value={first.texture} onChange={(v) => setAll({ texture: v as never })} />
        <Select label="フォント（全体）" axis="font" options={fontChoices} value={first.font} onChange={(v) => setAll({ font: v as never })} />
        <div className="field">
          <label>差し色（全体）</label>
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

const BeatStyleEditor: React.FC<{ seg: EffectsReelProps['segments'][number]; hasMatte: boolean; onChange: (s: BeatStyle) => void }> = ({ seg, hasMatte, onChange }) => {
  const st = seg.style ?? {};
  const set = (patch: Partial<BeatStyle>) => onChange({ ...st, ...patch });
  const on = new Set(st.accents ?? []);
  return (
    <div className="beatstyle">
      <div className="grid3s">
        <Select label="字幕" axis="caption" options={captionStyles} value={st.caption} onChange={(v) => set({ caption: v as never })} />
        <Select label="カメラ" axis="camera" options={cameraMoves} value={st.camera} onChange={(v) => set({ camera: v as never })} />
        <Select label="入りの切り替え" axis="transition" options={transitions} value={st.transition} onChange={(v) => set({ transition: v as never })} />
      </div>
      <div className="accentchips">
        {accents.map((a) => {
          const disabled = !hasMatte && (a === 'outline' || a === 'glow');
          return (
            <button
              key={a}
              disabled={disabled}
              title={disabled ? '人物の切り抜きがある動画で使えます' : undefined}
              className={`fchip ${on.has(a) ? 'on' : ''}`}
              onClick={() => {
                const next = new Set(on);
                next.has(a) ? next.delete(a) : next.add(a);
                set({ accents: [...next] as never });
              }}
            >
              {lbl('accent', a)}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const EffectsPanel: React.FC<PanelProps<EffectsReelProps> & { playerRef: React.RefObject<PlayerRef | null> }> = ({ p, update, playerRef }) => {
  const set = (fn: (p: EffectsReelProps) => void) => mut(update, fn)();
  // Segments play back to back, so a segment's place on the timeline is the sum of the ones before it.
  const startFrame = (i: number) => p.segments.slice(0, i).reduce((a, s) => a + Math.max(1, Math.round((s.end - s.start) * FPS)), 0);
  return (
    <>
      <MixPanel p={p} update={update} />
      <div className="panel">
        <h2>カットごとの演出</h2>
        {!p.matte ? <p className="cost">人物の切り抜きがないため、「人物の後ろ」に出る系のエフェクトは前面に重なって表示されます。</p> : null}
        <div style={{ display: 'grid', gap: 18 }}>
          {p.segments.map((seg, i) => (
            <div key={i} style={{ display: 'grid', gap: 8, paddingBottom: 14, borderBottom: '1px solid var(--line, #e5e5e5)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <select className="sel" style={{ flex: 1, minWidth: 0 }} value={seg.effect} onChange={(e) => set((x) => void (x.segments[i].effect = e.target.value as never))}>
                  {effectIds.map((id) => (
                    <option key={id} value={id}>
                      {EFFECT_NAMES[id]}
                    </option>
                  ))}
                </select>
                <button className="btn ghost small" onClick={() => playerRef.current?.seekTo(startFrame(i))}>
                  {seg.start.toFixed(1)}–{seg.end.toFixed(1)}秒 ▶
                </button>
              </div>
              <BeatStyleEditor seg={seg} hasMatte={!!p.matte} onChange={(st) => set((x) => void (x.segments[i].style = st))} />
              <Field label="字幕" max={60} value={seg.caption ?? ''} onChange={(v) => set((x) => void (x.segments[i].caption = v))} />
              <div className="grid2">
                <Field label="強調する言葉（空白区切り）" value={seg.emphasis.join(' ')} onChange={(v) => set((x) => void (x.segments[i].emphasis = v.split(/\s+/).filter(Boolean)))} />
                <Field label="エフェクトの文字" max={40} value={seg.text ?? ''} onChange={(v) => set((x) => void (x.segments[i].text = v || undefined))} />
              </div>
              <Field
                label="項目（1行に1つ：チェックリスト・見出し・カードなど）"
                multiline
                value={seg.items.join('\n')}
                onChange={(v) => set((x) => void (x.segments[i].items = v.split('\n').filter((l) => l.trim()).slice(0, 12)))}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>色</h2>
        <Colors value={p.palette} labels={{ accent: 'アクセント', ink: '文字', paper: '紙' }} onChange={(v) => set((x) => void (x.palette = v as any))} />
        <label className="check" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={p.counter} onChange={(e) => set((x) => void (x.counter = e.target.checked))} />
          <span>番号（01/17）を表示</span>
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
        <h2>冒頭のフック</h2>
        <div className="grid2">
          {p.hook.map((h, i) => (
            <Field key={i} label={`${i + 1}行目`} max={12} value={h} onChange={(v) => set((x) => void (x.hook[i] = v))} />
          ))}
          <Field label="強調する言葉" max={10} value={p.hookEmphasis} onChange={(v) => set((x) => void (x.hookEmphasis = v))} />
        </div>
      </div>
      <div className="panel">
        <h2>機能（3カット）</h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.features.map((f, i) => (
            <div key={i} className="grid2">
              <Field label={`${i + 1}. 英字ラベル`} max={16} value={f.kicker} onChange={(v) => set((x) => void (x.features[i].kicker = v))} />
              <Field label={`${i + 1}. 見出し`} max={16} value={f.title} onChange={(v) => set((x) => void (x.features[i].title = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>
          実績の数字 {missingStats ? <span className="warn">空欄があります。数字を入れてください</span> : null}
        </h2>
        <div style={{ display: 'grid', gap: 12 }}>
          {p.stats.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1.4fr', gap: 10 }}>
              <div className="field">
                <label>数値</label>
                <input type="number" value={s.value} onChange={(e) => set((x) => void (x.stats[i].value = Number(e.target.value)))} />
              </div>
              <Field label="単位" max={6} value={s.suffix} onChange={(v) => set((x) => void (x.stats[i].suffix = v))} />
              <Field label="ラベル" max={14} value={s.label} onChange={(v) => set((x) => void (x.stats[i].label = v))} />
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <h2>そのほか</h2>
        <div className="grid2">
          <Field label="サービス名" max={20} value={p.name} onChange={(v) => set((x) => void (x.name = v))} />
          <Field label="URL" max={40} value={p.url} onChange={(v) => set((x) => void (x.url = v))} />
          <Field label="CTA" max={14} value={p.cta} onChange={(v) => set((x) => void (x.cta = v))} />
          <Field label="タグ（カンマ区切り）" value={p.chips.join(',')} onChange={(v) => set((x) => void (x.chips = v.split(/[,、]/).map((c) => c.trim().slice(0, 14)).filter(Boolean).slice(0, 4)))} />
        </div>
        <div style={{ marginTop: 14 }}>
          <Colors
            value={p.palette}
            labels={{ bg: '背景', ink: '文字', accent: 'メイン', accent2: 'サブ', panel: 'パネル' }}
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
            ドラッグで移動
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
          テロップ（{pages.length}）
          <span className="cost">
            {fmt(totalSrc)} → {fmt(totalOut)}（{Math.round((1 - totalOut / totalSrc) * 100)}%カット）
          </span>
        </h2>
        <p className="cost" style={{ marginTop: -4 }}>
          文字をクリックして直接修正。↕で選ぶとプレビュー上でドラッグして位置を動かせます。
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
                  title="位置を動かす"
                  onClick={() => {
                    setSel(sel === pg.index ? null : pg.index);
                    playerRef.current?.pause();
                    playerRef.current?.seekTo(Math.round(pg.outStart * FPS) + 8);
                  }}
                >
                  ↕
                </button>
                <button className="iconbtn" title={o?.hidden ? '表示する' : '消す'} onClick={() => setOv(pg.index, { hidden: !o?.hidden })}>
                  {o?.hidden ? '戻す' : '消す'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="panel">
        <h2>カット</h2>
        <label className="check">
          <input type="checkbox" checked={p.cutSilence.enabled} onChange={(e) => update((x) => ((x.cutSilence.enabled = e.target.checked), x))} />
          <span>無音と言い淀みを自動でカット</span>
        </label>
        <div className="field" style={{ marginTop: 12 }}>
          <label>
            <span>この長さ以上の無音をカット</span>
            <span>{p.cutSilence.minGap.toFixed(2)}秒</span>
          </label>
          <input type="range" min={0.2} max={1.5} step={0.05} value={p.cutSilence.minGap} onChange={(e) => update((x) => ((x.cutSilence.minGap = Number(e.target.value)), x))} />
        </div>
        <Field label="カットする言葉（カンマ区切り）" value={p.fillers.join(',')} onChange={(v) => update((x) => ((x.fillers = v.split(/[,、]/).map((s) => s.trim()).filter(Boolean)), x))} />
      </div>
      <div className="panel">
        <h2>デザイン</h2>
        <div className="grid2">
          <Field label="タイトル" max={30} value={p.title ?? ''} onChange={(v) => update((x) => ((x.title = v || undefined), x))} />
          <Field label="強調する言葉（カンマ区切り）" value={p.emphasis.join(',')} onChange={(v) => update((x) => ((x.emphasis = v.split(/[,、]/).map((s) => s.trim()).filter(Boolean)), x))} />
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>
              <span>文字の大きさ</span>
              <span>{c.fontSize}</span>
            </label>
            <input type="range" min={48} max={130} value={c.fontSize} onChange={(e) => setC({ fontSize: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>
              <span>テロップの高さ</span>
              <span>{Math.round(c.y * 100)}%</span>
            </label>
            <input type="range" min={0.1} max={0.92} step={0.01} value={c.y} onChange={(e) => setC({ y: Number(e.target.value) })} />
          </div>
          <div className="field">
            <label>
              <span>1枚の文字数</span>
              <span>{c.maxChars}</span>
            </label>
            <input type="range" min={6} max={30} value={c.maxChars} onChange={(e) => setC({ maxChars: Number(e.target.value) })} />
          </div>
          <label className="check" style={{ alignSelf: 'end' }}>
            <input type="checkbox" checked={c.box} onChange={(e) => setC({ box: e.target.checked })} />
            <span>黒い帯を敷く</span>
          </label>
        </div>
        <div style={{ marginTop: 14 }}>
          <Colors
            value={{ color: c.color, highlight: c.highlight, stroke: c.stroke, accent: p.accent }}
            labels={{ color: '文字', highlight: '話している語', stroke: 'ふち', accent: '強調' }}
            onChange={(v) => update((x) => ((x.captions = { ...x.captions, color: v.color, highlight: v.highlight, stroke: v.stroke }), (x.accent = v.accent), x))}
          />
        </div>
        <label className="check" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={p.layout === 'fit-blur'} onChange={(e) => update((x) => ((x.layout = e.target.checked ? 'fit-blur' : 'cover'), x))} />
          <span>
            横動画を全体表示（背景はぼかし）
            <small>オフにすると縦にトリミングします</small>
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
  if (!jobs) return <p className="sub">読み込み中…</p>;
  const label = { generating: '作成中', ready: '編集できます', rendering: '書き出し中', done: '書き出し済み', error: 'エラー' };
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

// ---------- catalog: base templates + each effect as its own pattern ----------

type Group = 'base' | 'mix' | 'behind' | 'camera' | 'ui' | 'craft';
const GROUPS: { id: Group; name: string; note: string }[] = [
  { id: 'base', name: 'テンプレート', note: '商品・サービス・トーク' },
  { id: 'mix', name: 'ミックス', note: 'エフェクトを掛け合わせた完成形' },
  { id: 'behind', name: '人物の後ろに出す', note: '単体エフェクト（ミックスの部品）' },
  { id: 'camera', name: 'カメラワーク', note: '単体エフェクト（ミックスの部品）' },
  { id: 'ui', name: '画面・UI', note: '単体エフェクト（ミックスの部品）' },
  { id: 'craft', name: '手描き・コラージュ', note: '単体エフェクト（ミックスの部品）' },
];

const EFFECT_GROUP: Record<EffectId, Group> = {
  orbit: 'behind', couchWall: 'behind', headlineWall: 'behind', chartGrow: 'behind', coverStory: 'behind', glassType: 'behind',
  frameBreak: 'camera', digitalZoom: 'camera', zoomThrough: 'camera', pullBack: 'camera', vertigo: 'camera',
  uiWorld: 'ui', phoneMockup: 'ui', checklist: 'ui', greenScreen: 'ui',
  paperCut: 'craft', doodleBoil: 'craft',
};

const EFFECT_DESC: Record<EffectId, string> = {
  orbit: 'SNS投稿のカードが人物の周りを3Dで回る',
  couchWall: '後ろの壁にリールのカードが次々に貼られる',
  uiWorld: 'アプリ画面に動画が飛び込み、入力が進む',
  frameBreak: '画面がインスタ投稿のカードに縮み、人物がはみ出す',
  digitalZoom: '話の途中で一気にパンチイン、キーワードが浮かぶ',
  phoneMockup: '横に浮かぶスマホの中でチャットが進む',
  checklist: 'ガラスのカードにチェック項目が増えていく',
  headlineWall: '新聞の見出しや付箋が後ろに貼られていく',
  zoomThrough: '被写体に突っ込んで次のカットへ抜ける',
  chartGrow: '後ろで光るグラフが右肩上がりに伸びる',
  pullBack: '引いて編集画面の中のプレビューになる',
  greenScreen: '人物の背景をアプリ画面に差し替える',
  paperCut: '紙の切り抜き風、文字が1つずつ貼られる',
  doodleBoil: '輪郭と落書きが手描きでうごめく（人気）',
  vertigo: '人物はそのまま背景だけが伸びるめまいズーム',
  coverStory: '雑誌の表紙のように大きな文字が頭の後ろに',
  glassType: '立体のガラス文字が後ろで光る',
};

type CatalogItem = { key: string; template: TemplateId; effect?: EffectId; mix?: string; name: string; desc: string; group: Group };

const CATALOG: CatalogItem[] = [
  { key: 'ProductShine', template: 'ProductShine', name: TEMPLATES.ProductShine.name, desc: TEMPLATES.ProductShine.desc, group: 'base' },
  { key: 'SaaSPromo', template: 'SaaSPromo', name: TEMPLATES.SaaSPromo.name, desc: TEMPLATES.SaaSPromo.desc, group: 'base' },
  { key: 'TalkCaptions', template: 'TalkCaptions', name: TEMPLATES.TalkCaptions.name, desc: TEMPLATES.TalkCaptions.desc, group: 'base' },
  { key: 'EffectsReel', template: 'EffectsReel', name: 'エフェクトおまかせ', desc: TEMPLATES.EffectsReel.desc, group: 'base' },
  ...recipes.map((r) => ({ key: `mix-${r.id}`, template: 'EffectsReel' as TemplateId, mix: r.id, name: r.name, desc: r.desc, group: 'mix' as Group })),
  ...effectIds.map((fx) => ({
    key: fx,
    template: 'EffectsReel' as TemplateId,
    effect: fx,
    name: EFFECT_NAMES[fx].replace(/^\d+\s*/, '').replace(/（.*）/, ''),
    desc: EFFECT_DESC[fx],
    group: EFFECT_GROUP[fx],
  })),
];


/** Real render of this template (public/showcase, built by scripts/make-showcase.py). */
const showcase = (key: string) => ({ video: media(`showcase/${key}.mp4`), poster: media(`showcase/${key}.jpg`) });

const ShowVideo: React.FC<{ k: string; controls?: boolean }> = ({ k, controls }) => {
  const s = showcase(k);
  return <video src={s.video} poster={s.poster} autoPlay muted loop playsInline controls={controls} preload="auto" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }} />;
};

/** Poster in the grid; plays while hovered (desktop). Tap opens the full preview. */
const TemplateCard: React.FC<{ it: CatalogItem; onOpen: () => void }> = ({ it, onOpen }) => {
  const [hover, setHover] = useState(false);
  return (
    <button className="tcard" onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="tthumb">
        {hover ? <ShowVideo k={it.key} /> : <img src={showcase(it.key).poster} alt="" loading="lazy" />}
        <span className="tplay" aria-hidden>
          ▶
        </span>
        {it.effect ? <span className="tnum">{String(effectIds.indexOf(it.effect) + 1).padStart(2, '0')}</span> : null}
      </div>
      <div className="tname">{it.name}</div>
    </button>
  );
};

const PreviewSheet: React.FC<{ it: CatalogItem; onClose: () => void; onUse: () => void }> = ({ it, onClose, onUse }) => {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, []);
  return (
    <div className="sheet" onClick={onClose}>
      <div className="sheetbox" onClick={(e) => e.stopPropagation()}>
        <div className="sheetplayer">
          <ShowVideo k={it.key} controls />
        </div>
        <div className="sheetinfo">
          <span className="tag">{GROUPS.find((g) => g.id === it.group)!.name}</span>
          <div className="name">{it.name}</div>
          <div className="desc">{it.desc}</div>
          <p className="cost">
            {it.effect
              ? 'エフェクト単体の実際の書き出しです。実際の動画は1本の中で複数のエフェクトを掛け合わせます。このエフェクトは必ず入り、ほかのカットはAIが話に合わせて組み合わせます。'
              : it.mix
                ? `このミックスで実際に書き出した見本です。カットごとにエフェクト・字幕・カメラ・切り替えが変わります（1カットあたり${MIX_COUNT}）。`
                : 'この見本は、このテンプレートでAIが実際に作って書き出した動画です。'}
          </p>
          <div className="row">
            <button className="btn" onClick={onUse}>
              このテンプレートで作る
            </button>
            <button className="btn ghost" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const useCatalogPicker = (go: (h: string) => void) => {
  const [open, setOpen] = useState<CatalogItem | null>(null);
  const sheet = open ? (
    <PreviewSheet it={open} onClose={() => setOpen(null)} onUse={() => go(open.effect ? `#/new/EffectsReel/${open.effect}` : open.mix ? `#/new/EffectsReel/mix-${open.mix}` : `#/new/${open.template}`)} />
  ) : null;
  return { setOpen, sheet };
};

/** Keys with a real render in public/showcase (index.json, written by scripts/make-showcase.py). */
let showcaseKeys: Promise<Set<string> | null> | null = null;
const useShowcaseKeys = () => {
  const [keys, setKeys] = useState<Set<string> | null>(null);
  useEffect(() => {
    showcaseKeys ??= fetch(media('showcase/index.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((k) => (k ? new Set<string>(k) : null))
      .catch(() => null);
    showcaseKeys.then(setKeys);
  }, []);
  return keys;
};

const Grid: React.FC<{ items: CatalogItem[]; onOpen: (it: CatalogItem) => void }> = ({ items, onOpen }) => (
  <div className="tgrid">
    {items.map((it) => (
      <TemplateCard key={it.key} it={it} onOpen={() => onOpen(it)} />
    ))}
  </div>
);

const Home: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [group, setGroup] = useState<Group | 'all'>('all');
  const { setOpen, sheet } = useCatalogPicker(go);
  const keys = useShowcaseKeys();
  const catalog = keys ? CATALOG.filter((c) => keys.has(c.key)) : CATALOG.filter((c) => c.group !== 'mix');
  const shown = (group === 'all' ? GROUPS : GROUPS.filter((g) => g.id === group)).filter((g) => catalog.some((c) => c.group === g.id));
  return (
    <>
      <div className="hero">
        <h1>何を作りますか？</h1>
        <p className="sub">テンプレートかエフェクトを選んで素材を入れるだけ。AIが構成・コピー・演出まで作ります。</p>
      </div>
      <div className="chipbar" role="tablist">
        <button className={`fchip ${group === 'all' ? 'on' : ''}`} onClick={() => setGroup('all')}>
          すべて <small>{catalog.length}</small>
        </button>
        {GROUPS.filter((g) => catalog.some((c) => c.group === g.id)).map((g) => (
          <button key={g.id} className={`fchip ${group === g.id ? 'on' : ''}`} onClick={() => setGroup(g.id)}>
            {g.name} <small>{catalog.filter((c) => c.group === g.id).length}</small>
          </button>
        ))}
      </div>
      {shown.map((g) => (
        <section key={g.id} className="tsection">
          <div className="thead">
            <h2>{g.name}</h2>
            <span className="cost">{g.note}</span>
          </div>
          <Grid items={catalog.filter((c) => c.group === g.id)} onOpen={setOpen} />
        </section>
      ))}
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
  const ideas = ['ミックス', 'ズーム', 'グラフ', 'スマホ', '文字', '落書き', '商品', '字幕'];
  return (
    <>
      <div className="searchbox">
        <span aria-hidden>⌕</span>
        <input id="q" type="search" placeholder="テンプレートやエフェクトを検索" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <div className="chipbar">
        {ideas.map((w) => (
          <button key={w} className={`fchip ${q === w ? 'on' : ''}`} onClick={() => setQ(w)}>
            {w}
          </button>
        ))}
      </div>
      <p className="cost">{hits.length}件</p>
      <Grid items={hits} onOpen={setOpen} />
      {sheet}
    </>
  );
};

const STATUS_LABEL = { generating: '作成中', ready: '編集できます', rendering: '書き出し中', done: '書き出し済み', error: 'エラー' } as const;

/** One reel per screen, like Reels: the one in view plays. */
const ReelsFeed: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  useEffect(() => {
    api<Job[]>('/api/jobs').then(async (list) => {
      const full = await Promise.all(list.filter((j) => j.status !== 'error').map((j) => api<Job>(`/api/jobs/${j.id}`).catch(() => j)));
      setJobs(full);
    });
  }, []);
  if (!jobs) return <p className="sub">読み込み中…</p>;
  if (!jobs.length)
    return (
      <div className="empty">
        <h1>まだリールがありません</h1>
        <p className="sub">ホームでテンプレートを選んで、最初の1本を作りましょう。</p>
        <button className="btn" onClick={() => go('#/')}>
          テンプレートを見る
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

const FeedItem: React.FC<{ job: Job; onEdit: () => void }> = ({ job, onEdit }) => {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.intersectionRatio > 0.6), { threshold: [0, 0.6, 1] });
    io.observe(box.current!);
    return () => io.disconnect();
  }, []);
  const t = TEMPLATES[job.template];
  return (
    <div className="feeditem" ref={box}>
      <div className="feedvideo">
        {job.props && visible ? (
          <Player component={t.component} inputProps={job.props} durationInFrames={Math.max(1, t.frames(job.props))} fps={FPS} compositionWidth={1080} compositionHeight={1920} style={{ width: '100%', height: '100%' }} autoPlay loop initiallyMuted acknowledgeRemotionLicense />
        ) : job.props ? (
          <Thumbnail component={t.component} inputProps={job.props} durationInFrames={Math.max(1, t.frames(job.props))} fps={FPS} compositionWidth={1080} compositionHeight={1920} frameToDisplay={20} style={{ width: '100%', height: '100%' }} />
        ) : (
          <div className="feedblank">{STATUS_LABEL[job.status]}</div>
        )}
        <div className="feedmeta">
          <div className="name">{job.title}</div>
          <div className="cost">
            {t.name} · {STATUS_LABEL[job.status]}
          </div>
        </div>
        <div className="feedactions">
          <button onClick={onEdit} aria-label="編集">
            <span>✎</span>編集
          </button>
          {job.video ? (
            <a href={media(job.video)} target="_blank" aria-label="MP4">
              <span>⤓</span>MP4
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
};

const PLANS = [
  { name: 'スターター', price: '9,800円', tokens: 60, note: '週3投稿の目安' },
  { name: 'スタンダード', price: '29,800円', tokens: 200, note: '毎日投稿の目安' },
  { name: 'プロ', price: '79,800円', tokens: 600, note: '複数ブランド・優先書き出し' },
];

const jobTokens = (j: Job) => (j.template === 'ProductShine' ? (j.props?.clip ? 12 : 5) : j.template === 'EffectsReel' ? 5 : 2);

const Account: React.FC<{ go: (h: string) => void }> = ({ go }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  useEffect(() => {
    api<Job[]>('/api/jobs').then(async (list) => setJobs(await Promise.all(list.map((j) => api<Job>(`/api/jobs/${j.id}`).catch(() => j)))));
  }, []);
  const made = jobs.filter((j) => j.props);
  const used = made.reduce((a, j) => a + jobTokens(j), 0);
  const cost = jobs.reduce((a, j) => a + (j.usage?.totalUsd ?? 0), 0);
  return (
    <>
      <div className="profile">
        <div className="avatar">A</div>
        <div>
          <div className="name">ATO</div>
          <div className="cost">β版・課金はまだつながっていません</div>
        </div>
      </div>
      <div className="stats3">
        <div>
          <b>{made.length}</b>
          <span>作ったリール</span>
        </div>
        <div>
          <b>{used}</b>
          <span>使ったトークン</span>
        </div>
        <div>
          <b>{Math.round(cost * 150).toLocaleString()}円</b>
          <span>AIの原価</span>
        </div>
      </div>
      <h2>プラン</h2>
      <div className="plans">
        {PLANS.map((p) => (
          <div key={p.name} className="plan">
            <div className="name">{p.name}</div>
            <div className="price">
              {p.price}
              <small>/月</small>
            </div>
            <div className="cost">
              毎月 {p.tokens}トークン ・ {p.note}
            </div>
            <button className="btn ghost small" disabled title="課金の接続後に選べます">
              準備中
            </button>
          </div>
        ))}
      </div>
      <p className="cost">消費トークン: 自分の素材だけ 2 ／ AI写真・エフェクト 5 ／ AI動画あり 12</p>
      <h2 style={{ marginTop: 24 }}>履歴</h2>
      <History onOpen={(id) => go(`#/job/${id}`)} />
    </>
  );
};

const CreateSheet: React.FC<{ go: (h: string) => void; onClose: () => void }> = ({ go, onClose }) => (
  <div className="sheet" onClick={onClose}>
    <div className="sheetbox list" onClick={(e) => e.stopPropagation()}>
      <h2>新しく作る</h2>
      {CATALOG.filter((c) => !c.effect).map((c) => (
        <button key={c.key} className="listrow" onClick={() => (onClose(), go(`#/new/${c.template}`))}>
          <span className="tag">{TEMPLATES[c.template].tag}</span>
          <b>{c.name}</b>
        </button>
      ))}
      <button className="listrow" onClick={() => (onClose(), go('#/'))}>
        <span className="tag">17種</span>
        <b>エフェクトから選ぶ</b>
      </button>
    </div>
  </div>
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
  const [creating, setCreating] = useState(false);
  const go = (h: string) => (location.hash = h);
  const [, route, arg, arg2] = hash.split('?')[0].split('/');
  const tab = route === 'reels' || route === 'job' ? 'reels' : route === 'search' ? 'search' : route === 'me' ? 'me' : route === 'new' ? 'new' : 'home';
  const tabs = [
    { id: 'home', label: 'ホーム', icon: 'home', onClick: () => go('#/') },
    { id: 'reels', label: 'リール', icon: 'reels', onClick: () => go('#/reels') },
    { id: 'new', label: '作成', icon: 'plus', onClick: () => setCreating(true) },
    { id: 'search', label: '検索', icon: 'search', onClick: () => go('#/search') },
    { id: 'me', label: 'アカウント', icon: 'me', onClick: () => go('#/me') },
  ] as const;
  return (
    <SelContext.Provider value={{ sel, setSel }}>
      <div className="top">
        <div className="logo" onClick={() => go('#/')}>
          ATO <span>Reels</span>
        </div>
        <div className="nav">
          {tabs.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={t.onClick}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <span className="pill">β版</span>
      </div>
      <main className={route === 'reels' ? 'wide' : ''}>
        {route === 'new' && arg in TEMPLATES ? (
          <NewJob key={hash} template={arg as TemplateId} fx={effectIds.includes(arg2 as EffectId) ? (arg2 as EffectId) : undefined} mixArg={arg2?.startsWith('mix-') ? arg2.slice(4) : undefined} onBack={() => history.back()} onStarted={(j) => go(`#/job/${j.id}`)} />
        ) : route === 'job' && arg ? (
          <Editor key={arg} id={arg} />
        ) : route === 'history' || route === 'me' ? (
          <Account go={go} />
        ) : route === 'reels' ? (
          <ReelsFeed go={go} />
        ) : route === 'search' ? (
          <Search go={go} />
        ) : (
          <Home go={go} />
        )}
      </main>
      <nav className="tabbar" aria-label="メニュー">
        {tabs.map((t) => (
          <button key={t.id} className={`${tab === t.id ? 'on' : ''} ${t.id === 'new' ? 'make' : ''}`} onClick={t.onClick} aria-label={t.label}>
            <Icon name={t.icon} />
          </button>
        ))}
      </nav>
      {creating ? <CreateSheet go={go} onClose={() => setCreating(false)} /> : null}
    </SelContext.Provider>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
