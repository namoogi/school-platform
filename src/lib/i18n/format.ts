/**
 * ADR 0037: 화면 문구 채우기. DB·서버 의존 없음(브라우저·서버 공용).
 * - `{name}` → 값
 * - `{count, plural, one {…} other {…}}` → 그 언어의 복수 규칙(Intl.PluralRules)으로 고른다. `=0` 같은 정확한 값도 된다.
 * 언어마다 규칙이 다르므로(영어 one/other, 아랍어 zero~many) 코드에 언어별 분기를 두지 않는다.
 */
export type Vars = Record<string, string | number | null | undefined>;

export function formatMessage(template: string, vars: Vars = {}, lang = 'ko'): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const open = template.indexOf('{', i);
    if (open < 0) { out += template.slice(i); break; }
    out += template.slice(i, open);
    const close = matchBrace(template, open);
    if (close < 0) { out += template.slice(open); break; }
    out += expand(template.slice(open + 1, close), vars, lang);
    i = close + 1;
  }
  return out;
}

function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return j;
  }
  return -1;
}

function expand(body: string, vars: Vars, lang: string): string {
  const parts = body.split(',');
  const name = parts[0].trim();
  if (parts.length >= 3 && parts[1].trim() === 'plural') {
    const n = Number(vars[name] ?? 0);
    const rest = body.slice(body.indexOf(',', body.indexOf(',') + 1) + 1);
    const options = parseOptions(rest);
    let rule = 'other';
    try { rule = new Intl.PluralRules(lang).select(n); } catch { /* 모르는 언어 코드면 other */ }
    const chosen = options[`=${n}`] ?? options[rule] ?? options.other ?? '';
    return formatMessage(chosen.replace(/#/g, String(n)), vars, lang);
  }
  const v = vars[name];
  return v == null ? `{${name}}` : String(v);
}

function parseOptions(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    const start = i;
    while (i < s.length && s[i] !== '{' && !/\s/.test(s[i])) i++;
    const key = s.slice(start, i);
    while (i < s.length && s[i] !== '{') i++;
    if (i >= s.length) break;
    const close = matchBrace(s, i);
    if (close < 0) break;
    out[key] = s.slice(i + 1, close);
    i = close + 1;
  }
  return out;
}

/** 대체 순서: 고른 언어 → (그 언어의 fallback 사슬) → 영어 → 한국어(기준 문구) */
export function fallbackChain(lang: string, langs: { code: string; fallback: string | null }[]): string[] {
  const by = new Map(langs.map((l) => [l.code, l.fallback]));
  const chain: string[] = [];
  let cur: string | null | undefined = lang;
  while (cur && !chain.includes(cur) && chain.length < 8) { chain.push(cur); cur = by.get(cur) ?? null; }
  for (const last of ['en', 'ko']) if (!chain.includes(last)) chain.push(last);
  return chain;
}

/** Accept-Language 머리에서 쓸 수 있는 언어 하나 고르기(정확히 맞는 코드 → 앞부분 코드) */
export function pickFromAcceptLanguage(header: string | null | undefined, available: string[]): string | null {
  if (!header) return null;
  const wanted = header.split(',').map((p) => {
    const [tag, q] = p.trim().split(';q=');
    return { tag: tag.trim(), q: q ? Number(q) : 1 };
  }).filter((x) => x.tag && x.q > 0).sort((a, b) => b.q - a.q);
  for (const { tag } of wanted) {
    const exact = available.find((a) => a.toLowerCase() === tag.toLowerCase());
    if (exact) return exact;
    const base = available.find((a) => a.toLowerCase() === tag.split('-')[0].toLowerCase());
    if (base) return base;
  }
  return null;
}
