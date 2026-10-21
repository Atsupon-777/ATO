// The template catalog the app browses: every video, photo and service template, with how often each is used
// and when it first appeared. Templates added to DATA_DIR/templates.json show up without an app update.
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extraRecipes, type Recipe } from '../src/effects/recipes.ts';
import { videoCategories, videoTemplates } from '../src/effects/video-catalog.ts';
import { dataDir, publicDir } from './paths.ts';

export type CatalogKind = 'video' | 'photo' | 'service';
export type CatalogEntry = {
  id: string;
  kind: CatalogKind;
  ja: string;
  en: string;
  categories: string[];
  premium?: boolean;
  /** Photo templates: how many photos the template is made for. */
  count?: number;
  /** Showcase key of a real render of this template, when one exists. */
  sample?: string;
  /** Times a reel was started from it. */
  uses: number;
  /** ISO date it first appeared in the catalog. */
  added: string;
};

/** Templates pushed from the server: full mixes for the video planner, plus their catalog rows. */
type Extra = { recipes?: Recipe[] };

const usesFile = path.join(dataDir, 'template-uses.json');
const seenFile = path.join(dataDir, 'template-seen.json');
const extraFile = path.join(dataDir, 'templates.json');
let uses: Record<string, number> = {};
let seen: Record<string, string> = {};
let loaded: Promise<void> | null = null;

const readJson = async <T,>(f: string, fallback: T): Promise<T> => (existsSync(f) ? JSON.parse(await readFile(f, 'utf8')) : fallback);
const save = async (f: string, data: unknown) => {
  await mkdir(path.dirname(f), { recursive: true });
  await writeFile(f + '.tmp', JSON.stringify(data));
  await rename(f + '.tmp', f);
};

async function load() {
  uses = await readJson(usesFile, {});
  seen = await readJson(seenFile, {});
  const extra = await readJson<Extra>(extraFile, {});
  extraRecipes.splice(0, extraRecipes.length, ...(extra.recipes ?? []));
}

/** Kinds other than video register their rows here once their catalog module exists. */
const sources: (() => Omit<CatalogEntry, 'uses' | 'added' | 'sample'>[])[] = [
  () =>
    videoTemplates.map((v) => ({ id: v.id, kind: 'video' as const, ja: v.ja, en: v.en, categories: v.categories, premium: v.premium })),
  () =>
    extraRecipes.map((r) => ({ id: r.id, kind: 'video' as const, ja: r.name, en: r.en ?? r.name, categories: r.categories ?? [], premium: r.premium })),
];
export const addCatalogSource = (f: (typeof sources)[number]) => sources.push(f);

export async function catalog(): Promise<{ entries: CatalogEntry[]; categories: Record<CatalogKind, { id: string; ja: string; en: string }[]> }> {
  await (loaded ??= load());
  const showcase = new Set<string>(await readJson(path.join(publicDir, 'showcase/index.json'), []));
  const today = new Date().toISOString().slice(0, 10);
  let fresh = false;
  const entries = sources.flatMap((s) => s()).map((e) => {
    if (!seen[e.id]) (seen[e.id] = today), (fresh = true);
    return { ...e, uses: uses[e.id] ?? 0, added: seen[e.id], sample: showcase.has(`tpl-${e.id}`) ? `tpl-${e.id}` : undefined };
  });
  if (fresh) await save(seenFile, seen);
  return { entries, categories: { video: videoCategories, photo: categoryRows.photo, service: categoryRows.service } };
}
export const categoryRows: Record<'photo' | 'service', { id: string; ja: string; en: string }[]> = { photo: [], service: [] };

/** Counts a reel started from a template, for the 人気 sort. */
export async function countUse(id: string) {
  await (loaded ??= load());
  uses[id] = (uses[id] ?? 0) + 1;
  await save(usesFile, uses);
}
