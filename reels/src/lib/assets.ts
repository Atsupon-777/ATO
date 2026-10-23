import { createContext, useContext, useState } from 'react';
import { getRemotionEnvironment, staticFile } from 'remotion';

/**
 * The iPhone / Android app loads a user's own job and upload media from the server with a signed key
 * (app/web/native.ts sets it); the website and the renderer never set it.
 */
const mediaKey = (src: string) => {
  const k = typeof globalThis !== 'undefined' ? (globalThis as { reels_mediaKey?: string }).reels_mediaKey : undefined;
  return k && /^\/?(jobs|uploads)\//.test(src) ? `?k=${k}` : '';
};

const rendering = () => {
  try {
    return getRemotionEnvironment().isRendering;
  } catch {
    return false;
  }
};

/**
 * In the app's live previews (app/web/main.tsx sets reels_preview), a job's talking video plays from a
 * light 720p copy the server makes next to it (source.preview.mp4). A phone then decodes a third of the
 * pixels per copy of the footage, which is what keeps the web view under its memory limit. The person matte
 * likewise plays from matte.preview.webm (540×960). Renders and Remotion Studio always read the full files.
 */
const previewCopy = (src: string) =>
  !rendering() && (globalThis as { reels_preview?: boolean }).reels_preview && /^\/?jobs\/[\w-]+\/(source\.mp4|matte\.webm)$/.test(src) ? src.replace(/\.(mp4|webm)$/, '.preview.$1') : src;

/** Template props may reference files in `public/` ("samples/watch.jpg") or full URLs. */
export const asset = (src: string) => {
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  const s = previewCopy(src);
  return staticFile(s) + mediaKey(s);
};

/** The full-quality address, for when the preview copy fails to load. */
export const assetFull = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src) + mediaKey(src));

/**
 * A still frame of a job video (the server cuts it on first request), for posters and cheap thumbnails.
 * `at` (seconds into the source) asks for that moment, rounded to half a second so a reel's cuts share files;
 * `small` a 180px-wide copy (timeline strips).
 */
export const posterOf = (src?: string, at?: number, small?: boolean) =>
  src && /^\/?jobs\/[\w-]+\/[\w.-]+\.mp4$/.test(src) && !/^(https?:|data:|blob:)/.test(src) ? (() => {
    const p = src.replace(/\.mp4$/, at === undefined ? '.poster.jpg' : `.t${Math.max(0, Math.round(at * 2) * 5)}${small ? 's' : ''}.jpg`);
    return staticFile(p) + mediaKey(p);
  })() : undefined;

/**
 * Transparent WebM (VP9 with alpha, the person matte) only plays with its alpha in Chromium and Firefox.
 * Every iPhone browser is WebKit, which shows it on black or not at all, covering the footage; there the
 * live preview leaves the matte out and the effects use their no-cutout layout. The export (Chromium) keeps it.
 */
export const alphaVideoOk = () => {
  if (rendering() || typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const safari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
  return !(ios || safari);
};

/**
 * Preview settings from the app around a <Player> or <Thumbnail>:
 * still = a one-frame poster: footage is drawn from a still image and 3D scenes are skipped, so a grid of
 * posters decodes no video at all.
 */
export const PreviewMode = createContext<{ still?: boolean }>({});
export const usePreviewMode = () => useContext(PreviewMode);

/**
 * Source for a preview <video>: the light copy first, the full file if that fails. Outside renders only;
 * a render keeps Remotion's own error (a broken source must fail the render, not export black frames).
 */
export const useMediaSrc = (src: string) => {
  const [full, setFull] = useState(false);
  const url = full ? assetFull(src) : asset(src);
  const onError = rendering() ? undefined : () => setFull(true);
  return { url, onError };
};
