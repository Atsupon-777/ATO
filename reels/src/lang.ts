// Languages the app UI and the generated videos support.
export const langs = ['ja', 'en', 'fr', 'id', 'zh', 'es', 'ta'] as const;
export type Lang = (typeof langs)[number];

export const LANG_NAMES: Record<Lang, { native: string; english: string }> = {
  ja: { native: '日本語', english: 'Japanese' },
  en: { native: 'English', english: 'English' },
  fr: { native: 'Français', english: 'French' },
  id: { native: 'Bahasa Indonesia', english: 'Indonesian' },
  zh: { native: '中文', english: 'Simplified Chinese' },
  es: { native: 'Español', english: 'Spanish' },
  ta: { native: 'தமிழ்', english: 'Tamil' },
};

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (langs as readonly string[]).includes(v);

/** Japanese and Chinese pack a word into one or two characters; other scripts need about twice the length. */
export const isCJK = (l: Lang) => l === 'ja' || l === 'zh';

/** Length limit for on-screen copy: `n` characters in CJK, about 1.8× in alphabetic scripts. */
export const fit = (l: Lang, n: number) => (isCJK(l) ? n : Math.round(n * 1.8));

/** Prompt line telling the model which language to write in and how to count length. */
export const copyLanguage = (l: Lang) =>
  `Write every piece of on-screen copy in ${LANG_NAMES[l].english}. Length limits below are given for Japanese; ${
    isCJK(l) ? 'count each character as one' : 'in this language you may use up to 1.8 times as many characters, but stay as short as you can'
  }. Short English kicker labels stay in English.`;
