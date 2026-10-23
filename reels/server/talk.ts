// Talking video → TalkCaptions props: Gemini transcribes the audio with phrase timings, then the timings
// are snapped to the speech the audio actually contains (ffmpeg silencedetect), so silence cuts land cleanly.
import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { talkCaptionsSchema, type TalkCaptionsProps } from '../src/schemas.ts';
import { LANG_NAMES, fit, isCJK, type Lang } from '../src/lang.ts';
import { askJson } from './gemini.ts';
import { Usage } from './usage.ts';
import { derived } from './derived.ts';

const run = promisify(execFile);
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

export const DEFAULT_FILLERS = ['えー', 'えーと', 'えっと', 'あの', 'あのー', 'まあ', 'うーん', 'um', 'uh', 'erm'];

const transcriptSchema = z.object({
  language: z.string().describe('ISO code of the spoken language, e.g. ja or en'),
  words: z
    .array(z.object({ text: z.string(), start: z.number(), end: z.number() }))
    .describe(
      'Every spoken unit in order with start/end in seconds. English: one entry per word, punctuation attached. Japanese: one entry per short phrase (文節, 2-8 characters) with 。、！？ attached where a sentence or clause ends. Fillers (えー, あの, um) are their own entries.',
    ),
  title: z.string().describe('a catchy title card for the clip in its language, max 20 characters'),
  emphasis: z.array(z.string()).describe('2-5 key words or phrases copied exactly from the words, to highlight in captions'),
});

type Probe = { duration: number; width: number; height: number };

async function probe(file: string): Promise<Probe> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]);
  const j = JSON.parse(stdout);
  return { duration: Number(j.format.duration), width: j.streams[0].width, height: j.streams[0].height };
}

type Streams = {
  v?: { codec_name: string; pix_fmt?: string; width: number; height: number; color_transfer?: string; color_primaries?: string; side_data_list?: { rotation?: number }[]; tags?: { rotate?: string } };
  a?: { codec_name: string; profile?: string; sample_rate?: string };
};

async function streams(file: string): Promise<Streams> {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', file]);
  const s = (JSON.parse(stdout).streams ?? []) as any[];
  return { v: s.find((x) => x.codec_type === 'video'), a: s.find((x) => x.codec_type === 'audio') };
}

/** HLG / PQ footage (iPhone records HDR by default): tone-mapped to SDR BT.709 so the reel keeps its brightness and colour. */
const isHdr = (v: NonNullable<Streams['v']>) => /arib-std-b67|smpte2084/.test(v.color_transfer ?? '') || v.color_primaries === 'bt2020';
const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=tv';

/**
 * The editor's and renderer's copy of an upload (source.mp4): never worse than what was filmed.
 *  - picture: an H.264 8-bit SDR upload up to 1080×1920 (long side ≤ 1920, no rotation flag) is kept as it is;
 *    anything else (HEVC, HDR, 4K, rotated) is made H.264 once, long side ≤ 1920, CRF 16 / preset medium,
 *    HDR tone-mapped, keyframe every second so seeking in the editor stays quick.
 *  - sound: kept as recorded (AAC is copied, other codecs become AAC 256k). No noise reduction or compression
 *    here: the free export only normalises loudness, and 高音質 cleans the voice from the original at export.
 */
export async function sourceCopy(original: string, out: string) {
  const { v, a } = await streams(original);
  if (!v) throw new Error('動画が読み込めませんでした');
  const rotated = Boolean(v.side_data_list?.some((d) => d.rotation && d.rotation % 360 !== 0) || (v.tags?.rotate && v.tags.rotate !== '0'));
  const keep = v.codec_name === 'h264' && (v.pix_fmt === 'yuv420p' || v.pix_fmt === 'yuvj420p') && !isHdr(v) && !rotated && Math.max(v.width, v.height) <= 1920;
  const fit = "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))':flags=lanczos";
  const vargs = keep
    ? ['-c:v', 'copy']
    : [
        '-vf', [isHdr(v) ? TONEMAP : '', fit, 'format=yuv420p'].filter(Boolean).join(','),
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-g', '30',
        '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      ];
  const aargs = !a ? [] : a.codec_name === 'aac' ? ['-c:a', 'copy'] : ['-c:a', 'aac', '-b:a', '256k', '-ar', '48000'];
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', original, '-map', '0:v:0', ...(a ? ['-map', '0:a:0'] : []), ...vargs, ...aargs, '-movflags', '+faststart', out], {
    maxBuffer: 32 << 20,
  });
  return { copied: keep };
}

/** Non-silent ranges of the audio track. */
async function speechRanges(file: string, duration: number) {
  const { stderr } = await run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'silencedetect=noise=-32dB:d=0.2', '-f', 'null', '-'], { maxBuffer: 32 << 20 });
  const ranges: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const m of stderr.matchAll(/silence_(start|end): ([\d.]+)/g)) {
    const t = Number(m[2]);
    if (m[1] === 'start') {
      if (t > cursor) ranges.push({ start: cursor, end: t });
    } else cursor = t;
  }
  if (cursor < duration) ranges.push({ start: cursor, end: duration });
  return ranges;
}

/** Moves word edges that fall in silence onto the nearest speech, and keeps the list monotonic. */
export function snapWords(words: { text: string; start: number; end: number }[], speech: { start: number; end: number }[], duration: number) {
  const inSpeech = (t: number) => speech.some((r) => t >= r.start && t <= r.end);
  const out: typeof words = [];
  let prevEnd = 0;
  for (const w of words) {
    let { start, end } = w;
    start = Math.max(prevEnd, Math.min(duration, start));
    end = Math.min(duration, Math.max(start + 0.08, end));
    if (!inSpeech(start)) {
      const next = speech.find((r) => r.start >= start);
      if (next && next.start < end) start = next.start;
    }
    if (!inSpeech(end)) {
      const prev = [...speech].reverse().find((r) => r.end <= end);
      if (prev && prev.end > start) end = prev.end;
    }
    out.push({ text: w.text.trim(), start: round(start), end: round(end) });
    prevEnd = end;
  }
  return out.filter((w) => w.text);
}

const round = (n: number) => Math.round(n * 100) / 100;

type Word = { text: string; start: number; end: number };

/** Groups timed words into sentences (split on sentence punctuation or pauses over 0.7s). */
export function sentences(words: Word[]) {
  const out: Word[][] = [];
  let cur: Word[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (!next || /[。！？.!?]$/.test(w.text) || next.start - w.end > 0.7) (out.push(cur), (cur = []));
  });
  return out;
}

/** Splits a translated sentence into caption units: words for spaced scripts, 2-6 character chunks for CJK. */
export function units(text: string, lang: Lang) {
  if (!isCJK(lang)) return text.split(/\s+/).filter(Boolean);
  return text.match(/[^、。，！？,.!?]{1,6}[、。，！？,.!?]*/g) ?? [text];
}

/** Spreads translated units over the sentence's time span in proportion to their length. */
export function spread(sentence: Word[], parts: string[]): Word[] {
  const start = sentence[0].start;
  const end = sentence[sentence.length - 1].end;
  const total = parts.reduce((a, p) => a + p.length + 1, 0);
  let t = start;
  return parts.map((text) => {
    const d = ((end - start) * (text.length + 1)) / total;
    const w = { text, start: round(t), end: round(t + d) };
    t += d;
    return w;
  });
}

const translationSchema = z.object({
  sentences: z.array(z.string()).describe('one translation per input sentence, same order and count'),
  title: z.string(),
  emphasis: z.array(z.string()).describe('2-5 key words copied exactly from the translations'),
});

export type TalkBrief = {
  video: string;
  /** Caption language. When it differs from the spoken language, captions are translated (default: as spoken). */
  lang?: Lang;
  jobId?: string;
  onStep?: (step: number, total: number, label: string) => void;
};

export async function buildTalkProps(brief: TalkBrief) {
  const usage = new Usage();
  const jobId = brief.jobId ?? `job-${Date.now().toString(36)}`;
  const dir = path.join(publicDir, 'jobs', jobId);
  await mkdir(dir, { recursive: true });
  const original = path.join(dir, `original${path.extname(brief.video) || '.mp4'}`);
  await copyFile(brief.video, original);

  brief.onStep?.(1, 3, 'audio');
  const src = await probe(original);
  if (src.duration > 180) throw new Error('動画は3分以内にしてください');
  // iPhone HEVC/MOV does not play in every browser, so the editor and renderer get an H.264 copy (see sourceCopy()).
  const video = path.join(dir, 'source.mp4');
  await sourceCopy(original, video);
  const info = await probe(video);
  // The phone previews play a 720p copy; start it now so it is ready when the takes are.
  derived(video, 'preview').catch((e) => console.error('preview copy', e));
  const audio = path.join(dir, 'audio.mp3');
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k', audio]);
  const speech = await speechRanges(audio, info.duration);

  brief.onStep?.(2, 3, 'transcribe');
  const raw = await askJson({
    images: [],
    media: [{ file: audio, mimeType: 'audio/mp3' }],
    jsonSchema: z.toJSONSchema(transcriptSchema),
    usage,
    step: 'transcribe',
    temperature: 0,
    prompt: [
      `Transcribe this ${info.duration.toFixed(1)}-second recording verbatim, with accurate timestamps in seconds from the start.`,
      'Do not correct grammar and do not drop fillers. Timestamps must increase and stay within the recording.',
    ].join('\n'),
  });
  const t = transcriptSchema.parse(raw);
  let words = snapWords(t.words, speech, info.duration);
  const lang: Lang | undefined = brief.lang && !t.language.toLowerCase().startsWith(brief.lang) ? brief.lang : undefined;
  if (lang) {
    // Translate sentence by sentence and keep each sentence on its original time span, so cuts and timing still match the speech.
    brief.onStep?.(3, 3, 'translate');
    const groups = sentences(words.filter((w) => !DEFAULT_FILLERS.includes(w.text.replace(/[、。,.!?！？]/g, ''))));
    const tr = translationSchema.parse(
      await askJson({
        images: [],
        jsonSchema: z.toJSONSchema(translationSchema),
        usage,
        step: 'translate',
        temperature: 0.2,
        prompt: [
          `Translate these ${groups.length} spoken sentences into natural, casual ${LANG_NAMES[lang].english} subtitles. Keep each one short enough to read at speaking speed.`,
          `Also translate the title (max ${fit(lang, 20)} characters) and pick 2-5 emphasis words from your translations.`,
          `Title: ${t.title}`,
          ...groups.map((g, i) => `${i + 1}. ${g.map((w) => w.text).join(isCJK(t.language.startsWith('zh') ? 'zh' : t.language.startsWith('ja') ? 'ja' : 'en') ? '' : ' ')}`),
        ].join('\n'),
      }),
    );
    words = groups.flatMap((g, i) => spread(g, units(tr.sentences[i] ?? '', lang)));
    t.title = tr.title;
    t.emphasis = tr.emphasis;
    t.language = lang;
  }

  brief.onStep?.(3, 3, 'build props');
  const vertical = info.height > info.width * 1.2;
  const ja = t.language.startsWith('ja') || t.language.startsWith('zh');
  const props: TalkCaptionsProps = talkCaptionsSchema.parse({
    video: `jobs/${jobId}/${path.basename(video)}`,
    sourceDuration: round(info.duration),
    layout: vertical ? 'cover' : 'fit-blur',
    focusX: 0.5,
    words,
    cutSilence: { enabled: true, minGap: 0.45, pad: 0.12 },
    fillers: DEFAULT_FILLERS,
    captions: {
      x: 0.5,
      y: vertical ? 0.7 : 0.74,
      fontSize: ja ? 76 : 84,
      maxChars: ja ? 14 : 22,
      color: '#FFFFFF',
      highlight: '#FFD84D',
      stroke: '#000000',
      box: false,
      uppercase: false,
    },
    overrides: [],
    // Caption emphasis matches whole words, so map each suggestion to the word that contains it.
    emphasis: [...new Set(t.emphasis.map((e) => words.find((w) => w.text.includes(e))?.text.replace(/[、。！？,.!?]/g, '')).filter(Boolean) as string[])].slice(0, 5),
    title: t.title.slice(0, 54),
    titleY: 0.16,
    accent: '#FFD84D',
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId, dir, props, usage: usage.toJSON(), language: t.language };
}
