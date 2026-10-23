// Light copies of job videos for the app's live previews (see derived()).
import { execFile } from 'node:child_process';
import { rename, rm, stat } from 'node:fs/promises';
import { promisify } from 'node:util';

/**
 * Derived media for the app's live previews, next to the job video they come from:
 *   <name>.preview.mp4  720p, small keyframe interval: what phones decode in the editor instead of the full source
 *   matte.preview.webm  the person matte at 540×960 for live previews (the export reads the full-resolution matte.webm)
 *   <name>.poster.jpg   one frame, for the My videos feed and posters in grids
 *   <name>.t<ds>.jpg    one frame at <ds> tenths of a second, for the pick screen's scene thumbnails
 *   <name>.t<ds>s.jpg   the same, 180px wide, for its timeline
 * Made once (concurrent requests share the work), written atomically.
 */
const runFile = promisify(execFile);
const deriving = new Map<string, Promise<void>>();
export function derived(src: string, kind: 'preview' | 'poster', at?: number, small = false) {
  const webm = /\.webm$/.test(src);
  const out = src.replace(/\.(mp4|webm)$/, kind === 'preview' ? (webm ? '.preview.webm' : '.preview.mp4') : at === undefined ? '.poster.jpg' : `.t${Math.round(at * 10)}${small ? 's' : ''}.jpg`);
  let job = deriving.get(out);
  if (job) return job;
  const tmp = `${out}.${process.pid}.tmp${kind === 'poster' ? '.jpg' : webm ? '.webm' : '.mp4'}`;
  const ff = (args: string[]) => runFile('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { timeout: 10 * 60_000 });
  const scale = small ? "scale='min(180,iw)':-2" : "scale='min(720,iw)':-2";
  job = (async () => {
    if (kind === 'poster') {
      await ff(['-ss', String(at ?? 0.8), '-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4', tmp]).catch(() => null);
      if (!(await stat(tmp).catch(() => null))) await ff(['-i', src, '-frames:v', '1', '-vf', scale, '-q:v', '4', tmp]);
    } else if (webm) {
      // transparent VP9: decoded with libvpx so the alpha survives
      await ff([
        '-c:v', 'libvpx-vp9', '-i', src, '-vf', "scale=-2:'min(960,ih)'",
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '32', '-row-mt', '1', '-deadline', 'realtime', '-cpu-used', '8', '-auto-alt-ref', '0', tmp,
      ]);
    } else {
      await ff([
        '-i', src,
        '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-g', '15',
        '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', tmp,
      ]);
    }
    await rename(tmp, out);
  })().finally(() => {
    deriving.delete(out);
    rm(tmp, { force: true }).catch(() => null);
  });
  deriving.set(out, job);
  return job;
}

