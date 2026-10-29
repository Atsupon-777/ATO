// 高画質・高音質 export: the speaker's voice cleaned like a studio recording, and the frame rate to keep.
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
// The "somnolent-hogwash" RNNoise model (speech recorded with background noise), from
// github.com/GregorR/rnnoise-models (somnolent-hogwash-2018-09-01/sh.rnnn; stated there to be not subject to copyright).
const MODEL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'models', 'rnnoise-sh.rnnn');

let rnnoise: Promise<boolean> | undefined;
/** ffmpeg's RNNoise filter (arnndn) is in Debian's build; anything without it falls back to afftdn. */
const hasRnnoise = () =>
  (rnnoise ??= run('ffmpeg', ['-hide_banner', '-filters'], { maxBuffer: 8 << 20 }).then(
    ({ stdout }) => /\barnndn\b/.test(stdout),
    () => false,
  ));

/** Escapes a path for use as a filter option value. */
const esc = (p: string) => p.replace(/[\\:',;[\]=]/g, (c) => `\\${c}`);

/**
 * Studio voice, tuned on speech with room noise and hum, aiming to sound recorded well rather than processed:
 * rumble cut at 80 Hz → RNNoise (speech model, 10% of the original left in so it never sounds gated; its 10 ms
 * delay trimmed so lips stay in sync) → gentle de-esser → a little less boom at 250 Hz and +2 dB presence at
 * 3.5 kHz → 2:1 soft-knee compression. Loudness (-14 LUFS) is set after the mix (loudnorm.ts finish()).
 */
export async function studioChain() {
  const denoise = (await hasRnnoise())
    ? [`arnndn=m=${esc(MODEL)}:mix=0.9`, 'atrim=start_sample=480', 'asetpts=PTS-STARTPTS']
    : ['afftdn=nr=12:nf=-42:tn=1'];
  return [
    'aresample=48000',
    'highpass=f=80',
    ...denoise,
    'deesser=i=0.3:m=0.5:f=0.5:s=o',
    'equalizer=f=250:t=q:w=1:g=-1',
    'equalizer=f=3500:t=q:w=1.2:g=2',
    'acompressor=threshold=-18dB:ratio=2:attack=10:release=200:knee=6',
  ].join(',');
}

const hasAudio = async (file: string) => {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]).catch(() => ({ stdout: '' }));
  return stdout.trim().length > 0;
};

/**
 * A copy of a job's source.mp4 whose sound is the studio voice, for the 高音質 render: the picture is copied,
 * the voice is taken from the untouched upload (original.*) when it has one, and kept as PCM so the export's
 * final AAC is its only encode. Undefined when the footage has no sound.
 */
export async function studioVoice(source: string, out: string) {
  const dir = path.dirname(source);
  const original = (await readdir(dir)).find((f) => /^original\.\w+$/.test(f));
  const voice = original && (await hasAudio(path.join(dir, original))) ? path.join(dir, original) : (await hasAudio(source)) ? source : undefined;
  if (!voice) return undefined;
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error', '-i', source, '-i', voice,
    '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', await studioChain(), '-c:a', 'pcm_s16le', '-ar', '48000', out,
  ], { maxBuffer: 32 << 20, timeout: 20 * 60_000 });
  return out;
}

/** Frames per second of a video (avg_frame_rate), 0 when unknown. */
export async function videoFps(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', file]).catch(() => ({ stdout: '' }));
  const [n, d] = stdout.trim().split('/').map(Number);
  return n && d ? n / d : 0;
}
