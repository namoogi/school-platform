/**
 * 35차(ADR 0011 1단계): 화면 편집용 순수 함수 (DB·브라우저 의존 없음).
 * 편집기는 Content 를 고친 사본만 만들고, 저장은 기존 판 저장 API(validateContent)로만 한다.
 * 2단계(대화형 편집)도 같은 함수로 "블록 변경 제안"을 Content 에 적용한 뒤 같은 검사·시안 저장을 거친다.
 */
import { BLOCK_LABEL, SECTION_LABEL, type Block, type Content, type EntryKind, type LText, type SectionTemplate } from './site-shared';

export type EditPath = (string | number)[];

export function getAt(root: unknown, path: EditPath): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

/** 고친 사본: 길에 있는 객체·배열만 새로 만들고 나머지는 그대로 둔다. 중간이 비어 있으면 객체를 만든다. */
export function setAt<T>(root: T, path: EditPath, value: unknown): T {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  const base = (root ?? (typeof k === 'number' ? [] : {})) as Record<string | number, unknown>;
  const next = Array.isArray(base) ? [...base] : { ...base };
  (next as Record<string | number, unknown>)[k] = setAt((base as Record<string | number, unknown>)[k], rest, value);
  return next as T;
}

/** 한 언어 글 바꾸기. 빈 글이면 그 언어를 뺀다(서버 검사도 빈 칸을 지운다). */
export function setLangText(content: Content, path: EditPath, lang: keyof LText, text: string): Content {
  const cur = (getAt(content, path) ?? {}) as LText;
  const next: LText = { ...cur };
  if (text) next[lang] = text; else delete next[lang];
  return setAt(content, path, next);
}

export function moveBlock(content: Content, from: number, to: number): Content {
  const n = content.blocks.length;
  if (from < 0 || from >= n || to < 0 || to >= n || from === to) return content;
  const blocks = [...content.blocks];
  const [x] = blocks.splice(from, 1);
  blocks.splice(to, 0, x);
  return { ...content, blocks };
}

export function insertBlock(content: Content, at: number, b: Block): Content {
  const blocks = [...content.blocks];
  blocks.splice(Math.max(0, Math.min(at, blocks.length)), 0, b);
  return { ...content, blocks };
}

export function removeBlock(content: Content, i: number): Content {
  return { ...content, blocks: content.blocks.filter((_, j) => j !== i) };
}

export function toggleHidden(content: Content, i: number): Content {
  return {
    ...content,
    blocks: content.blocks.map((b, j) => {
      if (j !== i) return b;
      if (b.hidden) { const { hidden: _h, ...rest } = b; void _h; return rest as Block; }
      return { ...b, hidden: true };
    }),
  };
}

// ── 블록 팔레트 ───────────────────────────────────────────
/** 팔레트 한 칸. needsPhoto 면 사진을 먼저 고른 뒤 넣는다(그림 없는 그림 블록은 검사를 통과하지 못함). */
export type PaletteItem = { id: string; label: string; hint: string; needsPhoto?: boolean; make: (photo?: string) => Block };

const sec = (template: SectionTemplate, extra: Partial<Extract<Block, { type: 'section' }>> = {}): Block =>
  ({ type: 'section', template, title: { ko: '' }, body: {}, ...extra }) as Block;

const LAYOUT_HINT: Record<SectionTemplate, string> = {
  text: '제목과 글', 'media-left': '사진을 왼쪽에, 글을 오른쪽에', 'media-right': '글을 왼쪽에, 사진을 오른쪽에', banner: '넓은 사진 아래에 글',
  cards: '카드 여러 장(사진·제목·글)', photos: '사진 여러 장 한 줄', facts: '항목과 내용 짝', steps: '번호가 붙는 차례', quote: '인용 문장과 말한 사람', cta: '안내 글과 단추',
};

/** '레이아웃': 잡지형 구역 10종 */
export const LAYOUT_PALETTE: PaletteItem[] = (Object.keys(SECTION_LABEL) as SectionTemplate[]).map((t) => ({
  id: `section:${t}`, label: SECTION_LABEL[t], hint: LAYOUT_HINT[t],
  make: () => sec(t, {
    ...(t === 'cards' || t === 'photos' || t === 'facts' || t === 'steps' ? { items: [{}, {}, {}] } : {}),
    ...(t === 'cta' ? { button: { label: {}, href: '/p/contact' } } : {}),
  }),
}));

/** '기능': 구역이 아닌 블록 */
export function featurePalette(kind: EntryKind): PaletteItem[] {
  const story: PaletteItem[] = [
    { id: 'story_page', label: '동화 한 쪽', hint: '그림과 그 쪽 글', make: () => ({ type: 'story_page', text: {} }) },
  ];
  const common: PaletteItem[] = [
    { id: 'heading', label: '제목', hint: '구역을 나누는 제목 한 줄', make: () => ({ type: 'heading', text: {} }) },
    { id: 'text', label: '글', hint: '문단 글 (빈 줄로 문단 나눔)', make: () => ({ type: 'text', text: {} }) },
    { id: 'image', label: '그림', hint: '사진 한 장과 설명', needsPhoto: true, make: (a) => ({ type: 'image', asset: a ?? '', alt: {}, caption: {} }) },
    { id: 'gallery', label: '사진 묶음', hint: '여러 장을 눌러 크게 보기', needsPhoto: true, make: (a) => ({ type: 'gallery', assets: a ? [a] : [] }) },
    { id: 'news_list', label: '최근 소식', hint: '공개한 소식을 자동으로 보여 줌', make: () => ({ type: 'news_list', count: 3, style: 'cards' }) },
    { id: 'notice', label: '알림', hint: '눈에 띄는 안내 한 줄', make: () => ({ type: 'notice', text: {} }) },
    { id: 'video', label: '영상', hint: 'YouTube·Vimeo·Google Drive 주소', make: () => ({ type: 'video', url: {} }) },
  ];
  if (kind === 'story') return [...story, common[1], common[6]];
  return common;
}

/**
 * 블록 이름 (구조 목록·구역 막대): 잡지형 구역은 모양 이름까지, 나머지는 공용 BLOCK_LABEL.
 * 새 블록 종류(예: download)가 생기면 BLOCK_LABEL 로 이름이 바로 보이고, 렌더러가 그리면 편집 화면에서도 옮기기·숨기기·지우기가 된다.
 * 팔레트로 새로 넣게 하려면 featurePalette 에 한 칸(기본값을 만드는 make)을 더한다.
 */
export function blockName(b: Block): string {
  return b.type === 'section' ? SECTION_LABEL[b.template] : (BLOCK_LABEL[b.type] ?? b.type);
}

/** 구조 목록에 보일 짧은 미리 글 */
export function blockSnippet(b: Block, pickText: (t: LText | undefined) => string): string {
  const x = b as Record<string, unknown>;
  const first = [x.title, x.text, x.body, x.caption].map((v) => pickText(v as LText | undefined)).find(Boolean) ?? '';
  return first.length > 40 ? `${first.slice(0, 40)}…` : first;
}

/** 비교용: 빈 글·빈 묶음·undefined 를 빼고 비교한다(서버 검사가 빈 칸을 정리하므로) */
export function clean(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const c = clean(x);
      if (c === undefined || c === '' || (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)) continue;
      o[k] = c;
    }
    return o;
  }
  return v;
}
export const sameContent = (a: Content, b: Content) => JSON.stringify(clean(a)) === JSON.stringify(clean(b));

/**
 * 번역 표시 (언어별 글 칸):
 * - 'missing' 이 언어 글이 비어 있어 다른 언어 글(기본 언어 먼저)을 흐리게 대신 보여 주는 중 (점선)
 * - 'stale'   원문(기본 언어)이 기준 판과 달라졌는데 이 언어 글은 그대로 (물결)
 */
export function translationState(cur: LText | undefined, base: LText | undefined, lang: keyof LText, def: keyof LText): 'missing' | 'stale' | null {
  const own = cur?.[lang] ?? '';
  if (!own) return Object.values(cur ?? {}).some(Boolean) ? 'missing' : null;
  if (lang === def) return null;
  if ((cur?.[def] ?? '') !== (base?.[def] ?? '') && own === (base?.[lang] ?? '')) return 'stale';
  return null;
}
