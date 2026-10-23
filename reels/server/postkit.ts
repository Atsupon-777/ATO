// 投稿文: the Instagram caption, hashtags and a good time to post, written for a finished reel. Free for the
// customer (no tokens), kept on the job so asking again costs nothing, and limited per owner so it can't be farmed.
import { z } from 'zod';
import { LANG_NAMES, isLang, type Lang } from '../src/lang.ts';
import { askJson } from './gemini.ts';
import { goalLine } from './goals.ts';
import { Usage } from './usage.ts';

export type PostKit = { caption: string; hashtags: string[]; when: { day: string; time: string; why: string }; lang: Lang; at: string };

/** Where the reel's language is mostly read on Instagram, for the posting time. */
const MARKET: Record<Lang, string> = {
  ja: 'Japan (Japan Standard Time)',
  en: 'the United States and other English-speaking markets (give the time in US Eastern Time)',
  fr: 'France (Central European Time)',
  id: 'Indonesia (Western Indonesia Time, WIB)',
  zh: 'Chinese-speaking Instagram users in Taiwan, Hong Kong, Singapore and Malaysia (give the time in Taiwan time)',
  es: 'Spain and Latin America (give the time in Spain, CET, and mention Mexico City time)',
  ta: 'Tamil Nadu, India (India Standard Time)',
};

const schema = z.object({
  caption: z.string().describe('the Instagram caption: a hook line, 2-4 short lines that sell, a clear call to action; line breaks allowed; no hashtags here'),
  hashtags: z.array(z.string()).describe('5 to 10 hashtags, each starting with #, no spaces, a mix of broad and niche ones people really search'),
  day: z.string().describe('the best day or days of the week to post, in the UI language'),
  time: z.string().describe('the best time window with its time zone, in the UI language, e.g. 19:00〜21:00 (日本時間)'),
  why: z.string().describe('one short sentence in the UI language: why this time works for this audience'),
});

/** Every line of copy in a reel's props: titles, hooks, captions, features… (not file paths, colours or ids). */
export function copyOf(props: unknown, out: string[] = []): string[] {
  if (typeof props === 'string') {
    const s = props.trim();
    if (s && !/^(jobs|uploads|https?:|blob:|data:)/.test(s) && !/^#[0-9a-f]{3,8}$/i.test(s) && !/\.(mp4|webm|png|jpe?g|webp|mp3|wav)$/i.test(s) && /\s|[^\x00-\x7f]/.test(s)) out.push(s);
  } else if (Array.isArray(props)) for (const v of props) copyOf(v, out);
  else if (props && typeof props === 'object')
    for (const [k, v] of Object.entries(props)) if (!['words', 'speech', 'video', 'matte', 'music', 'src', 'image', 'photo', 'logo'].includes(k)) copyOf(v, out);
  return out;
}

const RATE = { perHour: 12, perDay: 40 };
const asked = new Map<string, number[]>();
/** True when this owner may have one more kit written now (cached kits do not count). */
export function takePostKitTurn(uid: string) {
  const now = Date.now();
  const list = (asked.get(uid) ?? []).filter((t) => now - t < 24 * 3600_000);
  if (list.filter((t) => now - t < 3600_000).length >= RATE.perHour || list.length >= RATE.perDay) return false;
  list.push(now);
  asked.set(uid, list);
  if (asked.size > 10_000) asked.clear();
  return true;
}

export async function writePostKit(o: {
  template: string;
  title: string;
  props: unknown;
  goal?: string;
  brand?: { name?: string; handle?: string };
  uiLang: Lang;
}): Promise<{ kit: PostKit; usage: Usage }> {
  const p = o.props as { lang?: unknown } | undefined;
  const lang: Lang = isLang(p?.lang) ? p!.lang : 'ja';
  const copy = [...new Set(copyOf(o.props))].join(' / ').slice(0, 1800);
  const usage = new Usage();
  const raw = await askJson({
    images: [],
    usage,
    step: 'postkit',
    temperature: 0.7,
    jsonSchema: z.toJSONSchema(schema),
    prompt: [
      'You are a social media manager writing the post for a finished Instagram Reel.',
      `Reel: "${o.title}" (${o.template}). Words on screen and spoken in it: ${copy || '(none)'}`,
      o.brand?.name || o.brand?.handle
        ? `The poster's saved brand: ${[o.brand.name, o.brand.handle].filter(Boolean).join(', ')}. When the reel is about this brand, end by pointing to ${o.brand.handle ?? 'the account'} or the link in bio; when the reel names a different business, write for that business and only point to the link in bio.`
        : 'End by pointing to the link in bio.',
      goalLine(o.goal),
      `Write the caption and hashtags in ${LANG_NAMES[lang].english}. Natural, warm, not salesy; 2-4 fitting emoji at most. Use only facts that appear in the reel; never invent prices, dates, offers or claims.`,
      `Then suggest when to post this Reel for its audience in ${MARKET[lang]}: the day(s) and a time window, based on when that audience is on Instagram and what this kind of business sells. Write day, time and why in ${LANG_NAMES[o.uiLang].english}.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  const r = schema.parse(raw);
  const tags = [...new Set(r.hashtags.map((t) => `#${t.replace(/^#+/, '').replace(/\s+/g, '')}`).filter((t) => t.length > 1))].slice(0, 10);
  return {
    kit: { caption: r.caption.replace(/(^|\s)#\S+/g, '').trim().slice(0, 2000), hashtags: tags, when: { day: r.day.slice(0, 80), time: r.time.slice(0, 80), why: r.why.slice(0, 240) }, lang, at: new Date().toISOString() },
    usage,
  };
}
