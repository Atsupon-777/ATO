// UI language. Every Japanese UI string in main.tsx goes through tr(), keyed by the Japanese text;
// the other languages live in i18n/<lang>.json. Changing language reloads the page, so strings
// built at module load (template names, effect labels) pick it up too.
import { isLang, type Lang } from '../../src/lang';
import en from './i18n/en.json';
import es from './i18n/es.json';
import fr from './i18n/fr.json';
import id from './i18n/id.json';
import ta from './i18n/ta.json';
import zh from './i18n/zh.json';

const DICTS: Partial<Record<Lang, Record<string, string>>> = { en, fr, id, zh, es, ta };
const KEY = 'reels-lang';

const pick = (): Lang => {
  try {
    const saved = localStorage.getItem(KEY);
    if (isLang(saved)) return saved;
  } catch {}
  const nav = (navigator.language || 'ja').slice(0, 2);
  return isLang(nav) ? nav : 'ja';
};

export const lang: Lang = pick();
document.documentElement.lang = lang;

/** Translates a Japanese UI string; {0}, {1}… are replaced by the extra arguments. */
export const tr = (ja: string, ...args: unknown[]) => (DICTS[lang]?.[ja] ?? ja).replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)]));

export const setLang = (l: Lang) => {
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  location.reload();
};
