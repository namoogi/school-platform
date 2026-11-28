// 136차(ADR 0052): 템플릿을 세 축으로 나눈다 — 메뉴 구조 · 첫 화면 구성 · 내용(목적).
// 근거: docs/research/site-structures-2026-11.md (학교·템플릿 마켓 구조 조사). 마켓 대부분은 업종·스타일로만 거르고,
// 구조(레이아웃)로 거르는 곳은 드물다 — 학교가 '모양'으로도 고를 수 있게 구조 축을 따로 둔다.
// 이름은 관리 화면 이름표(site.facet.*)로 보인다. 값 목록을 늘리면 이름표와 en.json도 함께 늘린다.

/** 메뉴 구조: 방문자가 쪽을 오가는 방식(공개 화면의 머리글·옆 메뉴·차례). SiteProfile.layout과 같은 값 */
export const NAV_LAYOUTS = ['top', 'side', 'onepage'] as const;
export type NavLayout = (typeof NAV_LAYOUTS)[number];
export const isNavLayout = (v: unknown): v is NavLayout => NAV_LAYOUTS.includes(v as NavLayout);

/** 첫 화면 구성: 홈 첫 화면이 무엇을 앞세우는가 */
export const FIRST_SCREENS = ['board', 'magazine', 'landing', 'gallery', 'hero', 'tiles'] as const;
export type FirstScreen = (typeof FIRST_SCREENS)[number];

/** 내용(목적): 학교 유형·홈페이지의 목적. 템플릿 하나가 여러 개를 가질 수 있다 */
export const CONTENT_KINDS = ['notice', 'story', 'admission', 'project', 'mission', 'international', 'kinder', 'small'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export type TemplateFacets = { nav: NavLayout; first: FirstScreen; contents: ContentKind[] };
export type FacetFilter = { nav?: string; first?: string; content?: string };

/** 고르기 화면의 거르기: 비운 칸은 거르지 않는다. 알 수 없는 값도 거르지 않는다(잘못된 주소로 빈 목록이 되지 않게) */
export function filterTemplates<T extends TemplateFacets>(list: T[], f: FacetFilter): T[] {
  const nav = NAV_LAYOUTS.includes(f.nav as NavLayout) ? f.nav : undefined;
  const first = FIRST_SCREENS.includes(f.first as FirstScreen) ? f.first : undefined;
  const content = CONTENT_KINDS.includes(f.content as ContentKind) ? (f.content as ContentKind) : undefined;
  return list.filter((t) => (!nav || t.nav === nav) && (!first || t.first === first) && (!content || t.contents.includes(content)));
}

/** 칸마다 값별 템플릿 수(다른 칸의 거르기를 적용한 뒤). 0개인 값도 보여 주되 누를 수 없게 하는 데 쓴다 */
export function facetCounts<T extends TemplateFacets>(list: T[], f: FacetFilter) {
  const count = <K extends 'nav' | 'first' | 'content'>(k: K, values: readonly string[]) =>
    Object.fromEntries(values.map((v) => [v, filterTemplates(list, { ...f, [k]: v }).length])) as Record<string, number>;
  return { nav: count('nav', NAV_LAYOUTS), first: count('first', FIRST_SCREENS), content: count('content', CONTENT_KINDS) };
}
