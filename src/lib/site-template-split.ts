// 133차: 여러 쪽 템플릿의 하위 메뉴는 '쪽 안의 구역'이 아니라 별도 쪽으로 간다(2026-11-28 선생님 결정).
// 템플릿 원본은 구역에 메뉴 주소(anchor)를 단 채로 쓰고, 이 함수가 메뉴 주소가 있는 구역마다
// 상위 쪽(menu.parent)을 가리키는 하위 쪽을 만든다. 상위 쪽에는 메뉴 주소 없는 구역과 '하위 쪽 바로 가기'가 남는다.
// 홈·이미 하위인 쪽(한 단계만)은 쪽을 나누지 않고 메뉴 주소만 뗀다. 한 쪽 구조 템플릿(single)은 이 함수를 쓰지 않는다.
import type { Block, Content, LText } from './site-shared';

export type SplitPage = { kind: 'page'; key: string; sort: number; content: Content };
/** 옛 위치 `쪽:구역 번호` → 새 위치 [쪽, 구역 번호] (빈 칸·예시 사진 경로를 옮길 때 쓴다) */
export type Moves = Map<string, [string, number]>;

const titleOf = (b: Block): LText | undefined =>
  b.type === 'heading' ? b.text : 'title' in b ? (b.title as LText | undefined) : undefined;
const withoutAnchor = (b: Block): Block => { const { anchor: _drop, ...rest } = b as Block & { anchor?: string }; void _drop; return rest as Block; };

export function splitSubmenuPages(pages: SplitPage[]): { pages: SplitPage[]; moves: Moves } {
  const taken = new Set(pages.map((p) => p.key));
  const moves: Moves = new Map();
  const hrefOf = new Map<string, string>(); // '/p/쪽#주소' → '/p/새 쪽'
  const out: SplitPage[] = [];
  let sort = 0;
  for (const p of pages) {
    const blocks = p.content.blocks;
    const anchored = blocks.map((b, i) => ({ b, i })).filter(({ b }) => (b as { anchor?: string }).anchor);
    const nested = p.key === 'home' || Boolean(p.content.menu?.parent);
    if (!anchored.length || nested) {
      blocks.forEach((_, i) => moves.set(`${p.key}:${i}`, [p.key, i]));
      out.push({ ...p, sort: (sort += 10), content: { ...p.content, blocks: blocks.map(withoutAnchor) } });
      continue;
    }
    const children = anchored.map(({ b, i }) => {
      const anchor = (b as { anchor: string }).anchor;
      const key = taken.has(anchor) ? `${p.key}-${anchor}` : anchor;
      taken.add(key);
      hrefOf.set(`/p/${p.key}#${anchor}`, `/p/${key}`);
      moves.set(`${p.key}:${i}`, [key, 0]);
      // 구역 제목은 쪽 제목이 된다(같은 제목을 쪽 머리와 구역에 두 번 쓰지 않게 구역 제목은 뗀다. 제목 글 블록은 그대로)
      const moved = withoutAnchor(b) as Block & { title?: LText };
      const body = b.type === 'section' || b.type === 'inquiry' || b.type === 'news_list' ? (({ title: _t, ...r }) => { void _t; return r as Block; })(moved) : moved;
      return { kind: 'page' as const, key, sort: 0, content: { title: titleOf(b) ?? p.content.title, blocks: [body], menu: { parent: p.key } } as Content };
    });
    // 상위 쪽: 메뉴 주소 없는 구역은 그대로 두고, 맨 앞에 하위 쪽 바로 가기를 둔다(상위 메뉴를 누른 사람이 길을 잃지 않게)
    const rest = blocks.map((b, i) => ({ b, i })).filter(({ b }) => !(b as { anchor?: string }).anchor);
    const links: Block = { type: 'section', template: 'cards', variant: 'quicklinks',
      items: [...children, ...pages.filter((x) => x.content.menu?.parent === p.key)] // 원래부터 하위였던 쪽도 함께
        .map((c) => ({ title: c.content.title, href: `/p/${c.key}` })) };
    rest.forEach(({ i }, k) => moves.set(`${p.key}:${i}`, [p.key, k + 1]));
    out.push({ ...p, sort: (sort += 10), content: { ...p.content, blocks: [links, ...rest.map(({ b }) => b)] } });
    for (const c of children) out.push({ ...c, sort: (sort += 10) });
  }
  // 옛 '쪽#구역' 링크를 새 쪽 주소로
  const fix = (v: unknown, key?: string): unknown => {
    if (typeof v === 'string') return key === 'href' ? (hrefOf.get(v) ?? v) : v;
    if (Array.isArray(v)) return v.map((x) => fix(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x, k)]));
    return v;
  };
  return { pages: out.map((p) => ({ ...p, content: fix(p.content) as Content })), moves };
}

/** ['쪽', 'blocks', 번호, ...] 경로를 나눈 뒤 위치로 옮긴다(나누지 않은 경로는 그대로) */
export function movePath(moves: Moves, page: string, path: (string | number)[]): [string, (string | number)[]] {
  if (path[0] !== 'blocks' || typeof path[1] !== 'number') return [page, path];
  const to = moves.get(`${page}:${path[1]}`);
  return to ? [to[0], ['blocks', to[1], ...path.slice(2)]] : [page, path];
}
