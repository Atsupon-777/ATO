import { staticFile } from 'remotion';

/**
 * The iPhone / Android app loads a user's own job and upload media from the server with a signed key
 * (app/web/native.ts sets it); the website and the renderer never set it.
 */
const mediaKey = (src: string) => {
  const k = typeof globalThis !== 'undefined' ? (globalThis as { reels_mediaKey?: string }).reels_mediaKey : undefined;
  return k && /^\/?(jobs|uploads)\//.test(src) ? `?k=${k}` : '';
};

/** Template props may reference files in `public/` ("samples/watch.jpg") or full URLs. */
export const asset = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src) + mediaKey(src));
