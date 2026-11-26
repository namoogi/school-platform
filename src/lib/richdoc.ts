/**
 * 81차: 연구소 본문 서식(마크다운 일부 + 인포그래픽 블록) 해석기. 순수 함수 — 화면·테스트 공용.
 * HTML을 그대로 넣지 않는다(React 요소로만 그림). 링크는 http(s)만.
 *
 * 지원
 * - 제목 `#`~`####`, 문단, 목록(`-`·`1.`), 인용(`>` → 강조 상자, 첫 줄이 **결정**·**주의**·**위험**이면 색 구분), 가로줄 `---`
 * - 표: `| 칸 | 칸 |` + 구분 줄 `|---|---|`
 * - 인라인: **굵게**, `코드`, [글](https://주소)
 * - 인포그래픽 블록(```종류 … ```)
 *   - kpi    : `라벨 | 값 | 설명(선택)` 한 줄에 타일 하나
 *   - steps  : `단계 | 설명(선택)` 한 줄에 단계 하나 → 화살표 흐름도
 *   - bars   : `라벨 | 숫자 | 표시 글(선택)` → 가로 막대(가장 큰 값 기준)
 *   - tiers  : `이름 | 설명 | 꼬리표(선택)` → 아래에서 위로 쌓이는 계단(등급·단계)
 *   - 그 밖  : 코드 상자
 */
export type Inline = { t: 'text' | 'b' | 'code'; v: string } | { t: 'a'; v: string; href: string };
export type Block =
  | { k: 'h'; level: number; text: Inline[]; id: string }
  | { k: 'p'; text: Inline[] }
  | { k: 'ul' | 'ol'; items: Inline[][] }
  | { k: 'quote'; tone: 'decide' | 'warn' | 'note'; lines: Inline[][] }
  | { k: 'hr' }
  | { k: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { k: 'kpi'; items: { label: string; value: string; hint: string }[] }
  | { k: 'steps'; items: { title: string; hint: string }[] }
  | { k: 'bars'; items: { label: string; value: number; text: string }[] }
  | { k: 'tiers'; items: { name: string; hint: string; tag: string }[] }
  | { k: 'code'; lang: string; text: string };

export function inline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'b', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else out.push({ t: 'a', v: m[3], href: m[4] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
  return out;
}
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const slug = (s: string, n: number) => `s${n}-${s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40)}`;

export function parseRich(md: string): Block[] {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0; let hn = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^```\s*([\w-]*)\s*$/);
    if (fence) {
      const lang = fence[1].toLowerCase(); const body: string[] = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
      i++;
      const rows = body.filter((l) => l.trim()).map(cells);
      if (lang === 'kpi') out.push({ k: 'kpi', items: rows.map(([label = '', value = '', hint = '']) => ({ label, value, hint })) });
      else if (lang === 'steps') out.push({ k: 'steps', items: rows.map(([title = '', hint = '']) => ({ title, hint })) });
      else if (lang === 'bars') out.push({ k: 'bars', items: rows.map(([label = '', value = '0', text = '']) => ({ label, value: Number(String(value).replace(/[^\d.-]/g, '')) || 0, text: text || value })) });
      else if (lang === 'tiers') out.push({ k: 'tiers', items: rows.map(([name = '', hint = '', tag = '']) => ({ name, hint, tag })) });
      else out.push({ k: 'code', lang, text: body.join('\n') });
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push({ k: 'h', level: h[1].length, text: inline(h[2]), id: slug(h[2], hn++) }); i++; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { out.push({ k: 'hr' }); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line).map(inline); i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]).map(inline));
      out.push({ k: 'table', head, rows }); continue;
    }
    if (/^\s*>/.test(line)) {
      const qs: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) qs.push(lines[i++].replace(/^\s*>\s?/, ''));
      const first = qs[0] ?? '';
      const tone = /^\*\*(결정|선택)/.test(first) ? 'decide' : /^\*\*(주의|위험|경고)/.test(first) ? 'warn' : 'note';
      // 첫 줄 맨 앞의 **결정**·**주의** 낱말은 꼬리표로 보이므로 본문에서 뺀다(같은 말 두 번 방지)
      if (tone !== 'note') qs[0] = first.replace(/^\*\*[^*]+\*\*\s*/, '');
      out.push({ k: 'quote', tone, lines: qs.filter((l, n) => n > 0 || l.trim()).map(inline) }); continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line); const items: Inline[][] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, '')));
      out.push({ k: ordered ? 'ol' : 'ul', items }); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|\s*>|\s*\||\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++].trim());
    if (!para.length) { para.push(line.trim()); i++; }
    out.push({ k: 'p', text: inline(para.join(' ')) });
  }
  return out;
}

const plain = (xs: Inline[]) => xs.map((x) => x.v).join('');
/** 카드에 보일 요약: 첫 문단(없으면 첫 목록)에서 140자 */
export function summarize(md: string, max = 140) {
  const b = parseRich(md).find((x) => x.k === 'p' || x.k === 'ul' || x.k === 'ol');
  const s = !b ? '' : b.k === 'p' ? plain(b.text) : b.k === 'ul' || b.k === 'ol' ? b.items.map(plain).join(' · ') : '';
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
/** 목차: ##·### 제목 */
export function outline(md: string) {
  return parseRich(md).flatMap((b) => (b.k === 'h' && b.level >= 2 && b.level <= 3 ? [{ id: b.id, level: b.level, text: plain(b.text) }] : []));
}
/** 카드 꼬리: 본문에 든 표·도식 수 */
export function shapes(md: string) {
  const bs = parseRich(md);
  return { tables: bs.filter((b) => b.k === 'table').length, visuals: bs.filter((b) => ['kpi', 'steps', 'bars', 'tiers'].includes(b.k)).length };
}
