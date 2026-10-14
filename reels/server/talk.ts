// Talking video → TalkCaptions props: Gemini transcribes the audio with phrase timings, then the timings
// are snapped to the speech the audio actually contains (ffmpeg silencedetect), so silence cuts land cleanly.
import { execFile } from 'node:child_process';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';
import { talkCaptionsSchema, type TalkCaptionsProps } from '../src/schemas.ts';
import { askJson } from './gemini.ts';
import { Usage } from './usage.ts';

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

export type TalkBrief = {
  video: string;
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
  // iPhone HEVC/MOV does not play in every browser, so the editor and renderer get an H.264 copy
  // (long side ≤ 1920, keyframe every second so seeking in the editor is instant).
  const video = path.join(dir, 'source.mp4');
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', original,
    '-vf', "scale='if(gt(iw,ih),min(1920,iw),-2)':'if(gt(iw,ih),-2,min(1920,ih))'",
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-g', '30',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', video,
  ]);
  const info = await probe(video);
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
  const words = snapWords(t.words, speech, info.duration);

  brief.onStep?.(3, 3, 'build props');
  const vertical = info.height > info.width * 1.2;
  const ja = t.language.startsWith('ja');
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
    title: t.title.slice(0, 30),
    titleY: 0.16,
    accent: '#FFD84D',
  });
  await writeFile(path.join(dir, 'props.json'), JSON.stringify(props, null, 2));
  await writeFile(path.join(dir, 'usage.json'), JSON.stringify(usage, null, 2));
  return { jobId, dir, props, usage: usage.toJSON(), language: t.language };
}
