import { CATALOG, type MsgKey } from './catalog';
import type { Vars } from './format';

/**
 * ADR 0039: DB 함수가 낸 고정 문구 → 이름표. 'db.'·'err.' 이름표의 기준 문구가 DB 문구와 글자까지 같을 때 바꾼다.
 * 값이 든 문구('db.v.*')는 기준 문구의 {v1}·{v2} 자리를 DB의 % 값으로 보고 맞춰, 값은 그대로 옮겨 싣는다.
 * 'db.v.' 문구가 마이그레이션과 같은지는 tests/server-errors.test.ts 가 본다. 서버(오류 응답)와 화면(미리보기 이유 등)이 같이 쓴다.
 */
let dbKeys: { exact: Map<string, MsgKey>; withValues: { re: RegExp; key: MsgKey; names: string[] }[] } | null = null;
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function dbMessage(text: string): { key: MsgKey; vars?: Vars } | undefined {
  if (!dbKeys) {
    const keys = (Object.keys(CATALOG) as MsgKey[]).filter((k) => k.startsWith('err.') || k.startsWith('db.'));
    dbKeys = {
      exact: new Map(keys.filter((k) => !k.startsWith('db.v.')).map((k) => [CATALOG[k] as string, k])),
      withValues: keys.filter((k) => k.startsWith('db.v.')).map((k) => {
        const ko = CATALOG[k] as string;
        const names = [...ko.matchAll(/\{(v\d)\}/g)].map((m) => m[1]);
        return { key: k, names, re: new RegExp(`^${ko.split(/\{v\d\}/).map(esc).join('(.+?)')}$`, 's') };
      }),
    };
  }
  const exact = dbKeys.exact.get(text);
  if (exact) return { key: exact };
  for (const { re, key, names } of dbKeys.withValues) {
    const m = text.match(re);
    if (m) return { key, vars: Object.fromEntries(names.map((n, i) => [n, m[i + 1]])) };
  }
  return undefined;
}
export const dbMessageKey = (text: string): MsgKey | undefined => dbMessage(text)?.key;

type Tr = (key: MsgKey, vars?: Vars) => string;

/** 값 자체가 DB 고정 문구(권한 이름 '읽기', 파기 불가 이유 등)면 그 언어 문구로. 아니면 값 그대로(사람이 넣은 값) */
export function localizeDbVars(vars: Vars | undefined, tr: Tr): Vars | undefined {
  if (!vars) return vars;
  return Object.fromEntries(Object.entries(vars).map(([k, v]) => [k, typeof v === 'string' ? localizeDbText(v, tr, false) : v]));
}

/** DB가 만든 한국어 글 한 줄을 그 언어로(맞는 이름표가 없으면 그대로). deep=false 면 값 안은 다시 보지 않는다 */
export function localizeDbText(text: string, tr: Tr, deep = true): string {
  const hit = dbMessage(text);
  if (!hit) return text;
  return tr(hit.key, deep ? localizeDbVars(hit.vars, tr) : hit.vars);
}
