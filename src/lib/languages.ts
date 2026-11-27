import type { Db } from './db';
import { ValidationError } from './services';
import { CATALOG, CATALOG_KEYS } from './i18n/catalog';
import { forgetI18nCache } from './i18n/server';
import { sameShape } from './i18n/format';

/** ADR 0037: 언어·번역 관리(전체 관리자). 쓰기는 DB 명령 함수(app.save_language·app.save_ui_messages)가 권한을 다시 확인한다 */
export type LanguageRow = { code: string; native_name: string; direction: 'ltr' | 'rtl'; fallback: string | null; active: boolean; sort: number; translated: number };

export async function listLanguages(db: Db): Promise<{ rows: LanguageRow[]; total: number }> {
  const { rows } = await db.query(
    `select l.code, l.native_name, l.direction, l.fallback, l.active, l.sort,
            (select count(*)::int from public.ui_messages m where m.lang = l.code and m.key = any($1::text[])) as translated
       from public.languages l order by l.sort, l.code`, [CATALOG_KEYS]);
  return { rows: rows as LanguageRow[], total: CATALOG_KEYS.length };
}

export async function saveLanguage(db: Db, input: Record<string, unknown>) {
  const code = String(input.code ?? '').trim();
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(code)) throw new ValidationError('언어 코드는 BCP 47 꼴입니다(예: en, th, zh-Hant).');
  const name = String(input.native_name ?? '').trim();
  if (!name || name.length > 60) throw new ValidationError('언어 이름을 1~60자로 적어 주세요.');
  const direction = input.direction === 'rtl' ? 'rtl' : 'ltr';
  const fallback = input.fallback ? String(input.fallback) : null;
  const { rows: [r] } = await db.query('select app.save_language($1) as code', [JSON.stringify({
    code, native_name: name, direction, fallback, active: input.active !== false, sort: Number(input.sort) || 100,
  })]);
  forgetI18nCache();
  return { code: r.code as string };
}

/** 번역 넣기. 목록에 없는 이름표는 받지 않는다(오타가 사전에 쌓이지 않게) */
export async function saveMessages(db: Db, lang: unknown, messages: unknown, overwrite: unknown) {
  if (typeof lang !== 'string' || !lang) throw new ValidationError('언어를 골라 주세요.');
  if (!messages || typeof messages !== 'object' || Array.isArray(messages)) throw new ValidationError('번역은 {"이름표": "번역"} 꼴의 JSON입니다.');
  const known = new Set<string>(CATALOG_KEYS);
  const entries = Object.entries(messages as Record<string, unknown>);
  const unknown = entries.filter(([k]) => !known.has(k)).length;
  const usable = entries.filter(([k, v]) => known.has(k) && typeof v === 'string' && v.trim() && v.length <= 4000) as [keyof typeof CATALOG, string][];
  // 채우기 자리({name}·복수형)가 기준 문구와 다르면 받지 않는다(화면에 {name} 이 그대로 보이거나 빈칸이 되지 않게)
  const invalid = usable.filter(([k, v]) => !sameShape(CATALOG[k], v)).map(([k]) => k);
  const clean = Object.fromEntries(usable.filter(([k]) => !invalid.includes(k)));
  const { rows: [r] } = await db.query('select app.save_ui_messages($1, $2, $3) as n', [lang, JSON.stringify(clean), overwrite === true]);
  forgetI18nCache();
  return { saved: r.n as number, skippedUnknown: unknown, skippedInvalid: invalid };
}

/** 내보내기: 기준 문구(한국어)와 그 언어의 지금 번역을 나란히. 학교 AI·관제 세션이 빈 칸을 채워 다시 넣는다 */
export async function exportMessages(db: Db, lang: string) {
  const { rows } = await db.query('select key, text from public.ui_messages where lang = $1', [lang]);
  const have = new Map(rows.map((r) => [r.key as string, r.text as string]));
  return {
    lang,
    base: 'ko',
    messages: Object.fromEntries(CATALOG_KEYS.map((k) => [k, have.get(k) ?? ''])),
    source: CATALOG,
  };
}
