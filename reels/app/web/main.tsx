import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, type PlayerRef } from '@remotion/player';
import { ProductShine, productShineBeats } from '../../src/templates/ProductShine';
import { SaaSPromo, saasPromoBeats } from '../../src/templates/SaaSPromo';
import { TalkCaptions, talkCaptionsDuration } from '../../src/templates/TalkCaptions';
import { FPS, beatFrames } from '../../src/lib/timing';
import { keepSegments, paginate, placeWords } from '../../src/lib/edit';
import type { ProductShineProps, SaaSPromoProps, TalkCaptionsProps } from '../../src/schemas';
import productSample from '../../props/product-watch.json';
import saasSample from '../../props/saas-ato.json';
import talkSample from '../../props/talk-ato.json';

type TemplateId = 'ProductShine' | 'SaaSPromo' | 'TalkCaptions';

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
const tokensFor = (t: TemplateId, input: Record<string, any>) => (t === 'ProductShine' ? (input.video ? 12 : 5) : 2);

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

const Home: React.FC<{ onPick: (t: TemplateId) => void }> = ({ onPick }) => {
  const [hover, setHover] = useState<TemplateId | null>(null);
  return (
    <>
      <h1>テンプレートを選んでください</h1>
      <p className="sub">素材を入れるだけで、AIが構成・コピー・演出まで自動で作ります。できあがった後に文字や色を直して書き出せます。</p>
      <div className="grid3">
        {(Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
          const t = TEMPLATES[id];
          return (
            <button key={id} className="card" onClick={() => onPick(id)} onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
              <div className="thumb">
                <Player
                  component={t.component}
                  inputProps={t.sample}
                  durationInFrames={t.frames(t.sample)}
                  fps={FPS}
                  compositionWidth={1080}
                  compositionHeight={1920}
                  style={{ width: '100%', height: '100%' }}
                  autoPlay
                  loop
                  initiallyMuted
                  key={hover === id ? 'h' : 'n'}
                  acknowledgeRemotionLicense
                />
              </div>
              <div className="body">
                <span className="tag">{t.tag}</span>
                <div className="name">{t.name}</div>
                <div className="desc">{t.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
};

const STYLE_OPTIONS = [
  { id: 'luxury', name: 'ラグジュアリー', note: '黒大理石・金色の光' },
  { id: 'clean', name: 'クリーン', note: '白背景・やわらかい光' },
  { id: 'cosmetic', name: 'コスメ', note: 'ピンク・水しぶき' },
  { id: 'natural', name: 'ナチュラル', note: '木目・木漏れ日' },
];

const NewJob: React.FC<{ template: TemplateId; onStarted: (job: Job) => void; onBack: () => void }> = ({ template, onStarted, onBack }) => {
  const [input, setInput] = useState<Record<string, any>>({ style: 'luxury', cta: '詳しくはプロフィールへ' });
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
        <Preview template={template} props={t.sample} autoPlay />
        <p className="cost" style={{ textAlign: 'center' }}>サンプル: {t.name}</p>
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
              <p className="cost">文字起こし → 無音・言い淀み（えー、あの）のカット → 単語ごとのテロップまで自動で行います。</p>
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
        原価 <b>${job.usage.totalUsd.toFixed(2)}</b>（約{Math.round(job.usage.totalUsd * 150)}円） ・ 消費 {job.template === 'ProductShine' ? (job.props?.clip ? 12 : 5) : 2}トークン
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
      <h1>作成したリール</h1>
      <p className="sub">{jobs.length}本</p>
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
  const go = (h: string) => (location.hash = h);
  const [, route, arg] = hash.split('?')[0].split('/');
  return (
    <SelContext.Provider value={{ sel, setSel }}>
      <div className="top">
        <div className="logo" onClick={() => go('#/')}>
          ATO <span>Reels</span>
        </div>
        <div className="nav">
          <button className={!route || route === 'new' ? 'on' : ''} onClick={() => go('#/')}>
            新規作成
          </button>
          <button className={route === 'history' || route === 'job' ? 'on' : ''} onClick={() => go('#/history')}>
            履歴
          </button>
        </div>
        <div className="spacer" />
        <span className="pill">β版</span>
      </div>
      <main>
        {route === 'new' && arg in TEMPLATES ? (
          <NewJob template={arg as TemplateId} onBack={() => go('#/')} onStarted={(j) => go(`#/job/${j.id}`)} />
        ) : route === 'job' && arg ? (
          <Editor key={arg} id={arg} />
        ) : route === 'history' ? (
          <History onOpen={(id) => go(`#/job/${id}`)} />
        ) : (
          <Home onPick={(t) => go(`#/new/${t}`)} />
        )}
      </main>
    </SelContext.Provider>
  );
};

createRoot(document.getElementById('root')!).render(<App />);
