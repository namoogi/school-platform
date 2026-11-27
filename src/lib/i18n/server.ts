import { cookies, headers } from 'next/headers';
import { asPublic, type Db } from '@/lib/db';
import { BASE_LANG, CATALOG, type MsgKey } from './catalog';
import { fallbackChain, formatMessage, pickFromAcceptLanguage, type Vars } from './format';

/**
 * ADR 0037: 화면 언어. 언어 목록·번역 사전은 DB(languages·ui_messages)에서 읽는다.
 * 언어를 더할 때 코드는 바뀌지 않는다. 서버 인스턴스마다 30초 동안 기억했다가 다시 읽는다(관리 화면에서 고친 번역이 곧 보인다).
 */
export type Language = { code: string; native_name: string; direction: 'ltr' | 'rtl'; fallback: string | null; active: boolean; sort: number };
export type Dictionary = Record<string, string>;
export type I18n = { lang: string; dir: 'ltr' | 'rtl'; languages: Language[]; dict: Dictionary; t: (key: MsgKey, vars?: Vars) => string };

export const LANG_COOKIE = 'lang';
const TTL = 30_000;
// Next 는 경로마다 모듈을 따로 묶으므로, 관리 API 가 비운 기억이 화면 쪽에도 보이게 프로세스 전역에 둔다
type Cache = { lang: { at: number; rows: Language[] } | null; dict: Map<string, { at: number; dict: Dictionary }> };
const g = globalThis as { __i18nCache?: Cache };
const cache: Cache = (g.__i18nCache ??= { lang: null, dict: new Map() });

export function forgetI18nCache() { cache.lang = null; cache.dict.clear(); }

async function read<T>(fn: (db: Db) => Promise<T>, fallback: T): Promise<T> {
  try { return await asPublic(fn); } catch { return fallback; } // DB를 못 읽어도 기준 문구(한국어)로 화면은 뜬다
}

export async function getLanguages(): Promise<Language[]> {
  if (cache.lang && Date.now() - cache.lang.at < TTL) return cache.lang.rows;
  const rows = await read(async (db) => (await db.query(
    'select code, native_name, direction, fallback, active, sort from public.languages order by sort, code')).rows as Language[],
  [{ code: 'ko', native_name: '한국어', direction: 'ltr', fallback: null, active: true, sort: 10 }] as Language[]);
  cache.lang = { at: Date.now(), rows };
  return rows;
}

/** 그 언어로 보일 문구 전체: 대체 순서대로 처음 있는 번역, 끝은 기준 문구 */
export async function getDictionary(lang: string): Promise<Dictionary> {
  const hit = cache.dict.get(lang);
  if (hit && Date.now() - hit.at < TTL) return hit.dict;
  const langs = await getLanguages();
  // 기준 언어(한국어)에 닿으면 거기서 멈춘다: 그 뒤 언어는 볼 필요가 없고, 기준 문구는 코드 목록에 있다
  const full = fallbackChain(lang, langs);
  const chain = full.slice(0, full.indexOf(BASE_LANG));
  const rows = chain.length ? await read(async (db) => (await db.query(
    'select lang, key, text from public.ui_messages where lang = any($1::text[])', [chain])).rows as { lang: string; key: string; text: string }[], []) : [];
  const by = new Map<string, Map<string, string>>();
  for (const r of rows) { if (!by.has(r.lang)) by.set(r.lang, new Map()); by.get(r.lang)!.set(r.key, r.text); }
  const dict: Dictionary = {};
  for (const key of Object.keys(CATALOG)) {
    let text: string | undefined;
    for (const c of chain) { text = by.get(c)?.get(key); if (text) break; }
    dict[key] = text ?? CATALOG[key as MsgKey];
  }
  cache.dict.set(lang, { at: Date.now(), dict });
  return dict;
}

/** 화면 언어 정하기: 사용자 설정 → 쿠키 → 학교 기본 언어 → 브라우저 언어 → 한국어. 꺼진 언어·없는 언어는 건너뛴다 */
export async function resolveLang(userPref?: string | null, schoolLang?: string | null): Promise<string> {
  const langs = (await getLanguages()).filter((l) => l.active);
  const ok = (c?: string | null) => (c && langs.some((l) => l.code === c) ? c : null);
  const fromUser = ok(userPref);
  if (fromUser) return fromUser;
  const store = await cookies();
  const fromCookie = ok(store.get(LANG_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  const fromSchool = ok(schoolLang);
  if (fromSchool) return fromSchool;
  const fromBrowser = pickFromAcceptLanguage((await headers()).get('accept-language'), langs.map((l) => l.code));
  return fromBrowser ?? BASE_LANG;
}

export async function getI18n(userPref?: string | null, schoolLang?: string | null): Promise<I18n> {
  const lang = await resolveLang(userPref, schoolLang);
  const languages = await getLanguages();
  const dict = await getDictionary(lang);
  const dir = languages.find((l) => l.code === lang)?.direction ?? 'ltr';
  return { lang, dir, languages, dict, t: (key, vars) => formatMessage(dict[key] ?? CATALOG[key] ?? key, vars, lang) };
}
