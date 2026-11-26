import type { Content, LText, SectionItem } from './site-shared';
import type { SiteTemplate, Slot } from './site-templates';

/**
 * 66차 ADR 0031 — 학교 자료로 템플릿 빈 칸 채우기(규칙 기반 1차 배치). DB·외부 API 없음.
 * 자료 글을 '제목 + 본문' 묶음으로 나누고, 빈 칸의 단서 낱말로 맞는 묶음을 찾아 제안한다. 확인은 사람이, 넣기는 새 시안 판으로.
 * 자료 안의 문구는 내용으로만 다루고 지시로 해석하지 않는다.
 */
export type Doc = { name: string; text: string };
export type Proposal = {
  slotId: string; page: string; label: string; kind: Slot['kind'];
  value: string | { title: string; body: string }[];
  source: { file: string; heading: string | null; excerpt: string } | null;
  confidence: 'high' | 'low';
};
type Section = { file: string; heading: string | null; lines: string[] };

const SENTENCE_END = /[.。!?]$|다\.?$|요\.?$/;
const BULLET = /^\s*(?:[-•·▪■□●○◦*]|\d{1,2}[.)]|[①-⑳]|[가-하][.)])\s*/;
const YEAR = /^\s*((?:19|20)\d{2})(?:년|\.|\s|-)/;

/** 제목처럼 보이는 줄: 짧고, 문장으로 끝나지 않거나, 번호·기호로 시작하는 짧은 줄, ':'로 끝나는 줄 */
function isHeading(line: string): boolean {
  const s = line.trim();
  if (!s || s.length > 32) return false;
  if (/[:：]$/.test(s)) return true;
  if (/[:：]\s*\S/.test(s)) return false; // '3월: 입학식'처럼 이름–값 줄은 본문
  if (/[@]|https?:\/\//.test(s)) return false;
  if (/^(?:[IVX]+\.|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.?|\d{1,2}\.|[<【\[■●◆▶])\s*\S/.test(s) && !SENTENCE_END.test(s)) return true;
  return !SENTENCE_END.test(s) && !BULLET.test(s) && !YEAR.test(s) && !/\d{2,4}-\d{3,4}-\d{4}/.test(s) && s.split(/\s+/).length <= 5;
}
const cleanHeading = (s: string) => s.trim().replace(/^(?:[IVX]+\.|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]\.?|\d{1,2}\.|[<【\[■●◆▶])\s*/, '').replace(/[>】\]:：]\s*$/, '').trim();

export function sections(docs: Doc[]): Section[] {
  const out: Section[] = [];
  for (const d of docs) {
    let cur: Section = { file: d.name, heading: null, lines: [] };
    for (const raw of d.text.replace(/\r/g, '').split('\n')) {
      const line = raw.replace(/\s+/g, ' ').trim();
      if (!line) continue;
      if (isHeading(line)) {
        if (cur.heading || cur.lines.length) out.push(cur);
        cur = { file: d.name, heading: cleanHeading(line), lines: [] };
      } else cur.lines.push(line);
    }
    if (cur.heading || cur.lines.length) out.push(cur);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');
function score(sec: Section, clues: string[]) {
  const h = norm(sec.heading ?? '');
  const b = norm(sec.lines.join(' '));
  let head = 0; let body = 0;
  for (const c of clues.map(norm)) {
    if (h && h.includes(c)) head += 3;
    if (b.includes(c)) body += 1;
  }
  return { total: head + Math.min(body, 2), head };
}
function best(secs: Section[], slot: Slot) {
  let top: { sec: Section; total: number; head: number } | null = null;
  for (const sec of secs) {
    if (!sec.lines.length) continue;
    const s = score(sec, slot.clues);
    if (s.total >= 2 && (!top || s.total > top.total)) top = { sec, ...s };
  }
  return top;
}
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…`);
const firstSentence = (s: string) => (s.match(/^.+?(?:[.。!?]|다\.|요\.)(?=\s|$)/)?.[0] ?? s).trim();

/** 목록 칸: 글머리·번호·연도로 시작하는 줄을 항목으로. '제목: 설명'·'제목 - 설명'은 나눈다 */
export function listItems(lines: string[], max = 8): { title: string; body: string }[] {
  const items: { title: string; body: string }[] = [];
  for (const raw of lines) {
    const y = raw.match(YEAR);
    let s = raw.replace(BULLET, '').trim();
    if (!s) continue;
    if (y) { items.push({ title: y[1], body: s.replace(YEAR, '').replace(/^[\s.:-]+/, '').trim() || s }); }
    else {
      const m = s.match(/^(.{1,30}?)\s*(?:[:：]|\s[-–—]\s)\s*(.+)$/);
      if (m) items.push({ title: m[1].trim(), body: m[2].trim() });
      else if (BULLET.test(raw) || lines.length <= max) items.push({ title: clip(s, 40), body: s.length > 40 ? s : '' });
      else continue;
    }
    s = '';
    if (items.length >= max) break;
  }
  return items.map((i) => ({ title: clip(i.title, 80), body: clip(i.body, 400) }));
}

const PHONE = /(?:\+?\d{1,3}[- ]?)?0?\d{1,3}[-. )]\d{3,4}[-. ]\d{4}/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const ADDRESS = /(?:[가-힣]+(?:특별시|광역시|특별자치시|특별자치도|도)\s)?[가-힣]+(?:시|군|구)\s[^\n]{0,30}?[가-힣0-9]+(?:로|길)\s?\d+(?:-\d+)?[^\n,]{0,25}/;

/** 템플릿 빈 칸마다 자료에서 찾은 제안. 못 찾은 칸은 빼고 돌려준다 */
export function proposeFills(t: SiteTemplate, docs: Doc[], opts: { schoolName?: string; images?: { id: string; name: string }[] } = {}): Proposal[] {
  const secs = sections(docs);
  const all = docs.map((d) => d.text).join('\n');
  const out: Proposal[] = [];
  const images = [...(opts.images ?? [])];
  for (const slot of t.slots) {
    const base = { slotId: slot.id, page: slot.page, label: slot.label, kind: slot.kind };
    if (slot.kind === 'contact') {
      if (slot.id === 'address') {
        const m = all.match(ADDRESS);
        if (m) out.push({ ...base, value: m[0].trim(), source: { file: docs.find((d) => d.text.includes(m[0]))?.name ?? '', heading: null, excerpt: m[0].trim() }, confidence: 'high' });
      } else {
        const phone = all.match(PHONE)?.[0]; const email = all.match(EMAIL)?.[0];
        if (phone || email) {
          const v = [opts.schoolName, phone, email].filter(Boolean).join(' · ');
          out.push({ ...base, value: v, source: { file: '', heading: null, excerpt: [phone, email].filter(Boolean).join(' · ') }, confidence: 'high' });
        }
      }
      continue;
    }
    if (slot.kind === 'image') {
      const img = images.shift();
      if (img) out.push({ ...base, value: img.id, source: { file: img.name, heading: null, excerpt: img.name }, confidence: 'low' });
      continue;
    }
    const hit = best(secs, slot);
    if (!hit) continue;
    const body = hit.sec.lines.join('\n');
    const source = { file: hit.sec.file, heading: hit.sec.heading, excerpt: clip(hit.sec.lines.join(' '), 160) };
    const confidence = hit.head > 0 ? 'high' as const : 'low' as const;
    if (slot.kind === 'list') {
      const items = listItems(hit.sec.lines);
      if (items.length) out.push({ ...base, value: items, source, confidence });
      continue;
    }
    const field = slot.path[slot.path.length - 1];
    const value = field === 'title' || slot.id === 'tagline' ? clip(firstSentence(hit.sec.lines[0]), 120) : clip(body.replace(/\n/g, ' '), 900);
    out.push({ ...base, value, source, confidence });
  }
  return out;
}

// ── 쪽 내용에 넣기(빈 칸이거나 아직 안내 자리 '[ … ]'일 때만) ──
const isPlaceholderText = (v: unknown) => {
  if (v == null) return true;
  if (typeof v === 'string') return !v.trim() || /^\[[^\]]*\]$/.test(v.trim());
  if (typeof v === 'object' && !Array.isArray(v)) return Object.values(v as Record<string, string>).every((x) => !x || /\[[^\]]*\]/.test(x));
  return false;
};
export const isPlaceholder = (v: unknown): boolean => {
  if (Array.isArray(v)) return v.every((it) => it && typeof it === 'object' && Object.values(it as Record<string, unknown>).every((x) => typeof x === 'string' ? !x || /^https?:|^\//.test(x) : isPlaceholderText(x)));
  return isPlaceholderText(v);
};

export function langOf(s: string): 'ko' | 'en' | 'th' {
  if (/[฀-๿]/.test(s)) return 'th';
  return /[가-힣]/.test(s) ? 'ko' : 'en';
}

/** 제안 하나를 쪽 내용 복사본에 넣는다. 넣었으면 true(이미 학교가 채운 칸이면 넣지 않음) */
export function putProposal(content: Content, slot: Slot, value: Proposal['value']): boolean {
  let parent: unknown = content;
  for (const step of slot.path.slice(0, -1)) {
    if (parent == null || typeof parent !== 'object') return false;
    const next = (parent as Record<string | number, unknown>)[step];
    if (next == null && step === 'site') { (parent as Record<string, unknown>).site = {}; }
    parent = (parent as Record<string | number, unknown>)[step];
  }
  if (parent == null || typeof parent !== 'object') return false;
  const field = slot.path[slot.path.length - 1];
  const cur = (parent as Record<string | number, unknown>)[field];
  if (!isPlaceholder(cur)) return false;
  const p = parent as Record<string | number, unknown>;
  if (slot.kind === 'image') {
    if (field === 'items') p.items = [{ asset: String(value) } satisfies SectionItem];
    else p[field] = String(value);
    return true;
  }
  if (Array.isArray(value)) {
    p[field] = value.map((i) => {
      const l = langOf(`${i.title} ${i.body}`);
      const it: SectionItem = { title: { [l]: i.title } as LText };
      if (i.body) it.body = { [l]: i.body } as LText;
      return it;
    });
    return true;
  }
  p[field] = { [langOf(value)]: value } as LText;
  return true;
}
