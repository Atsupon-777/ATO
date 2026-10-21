import { staticFile } from 'remotion';

/** Template props may reference files in `public/` ("samples/watch.jpg") or full URLs. */
export const asset = (src: string) => (/^(https?:|data:|blob:)/.test(src) ? src : staticFile(src));
