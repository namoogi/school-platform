/** 27차 홈페이지: 서버·브라우저 공용 상수·타입·언어 고르기 (DB 의존 없음). ADR 0008 */
export const LANGS = ['ko', 'en', 'th'] as const;
export type Lang = (typeof LANGS)[number];
export type LText = Partial<Record<Lang, string>>;
/** 언어별 그림은 선택 사항. 비어 있으면 기존 asset 원본을 사용한다. */
export type LanguageImages = Partial<Record<Lang, { asset: string }>>;
export const LANG_LABEL: Record<Lang, string> = { ko: '한국어', en: 'English', th: 'ไทย' };

/**
 * 31차: 새벽빛 매거진(dawn)·이전 블록 (ADR 0008 이전 2단계)
 * - section: 잡지형 구역. 템플릿 하나에 칸(제목·글·사진·항목·단추)을 담는다.
 * - gallery.items: 사진마다 대체 글·묶음(분류). 묶음이 있으면 거르기 단추와 크게 보기를 단다.
 * - news_list: 공개된 소식 N개를 불러온다(방문자 입력 없음).
 * 링크(href)는 사이트 안 경로('/p/about', '/news')나 https 주소만 받는다.
 */
export const SECTION_TEMPLATES = ['text', 'media-left', 'media-right', 'banner', 'cards', 'photos', 'facts', 'steps', 'quote', 'cta'] as const;
export type SectionTemplate = (typeof SECTION_TEMPLATES)[number];
export const SECTION_LABEL: Record<SectionTemplate, string> = {
  text: '글 구역', 'media-left': '사진 왼쪽 + 글', 'media-right': '글 + 사진 오른쪽', banner: '넓은 사진', cards: '카드 묶음',
  photos: '사진 줄', facts: '항목–내용', steps: '차례(번호)', quote: '인용', cta: '안내 단추',
};
/**
 * 42차: 새벽빛(dawn) 구역 모양. 옛 룽아룬숙사 사이트의 고정 구역을 그대로 그리는 모양 이름이다(다른 테마는 무시하고 템플릿대로 그림).
 * 템플릿은 칸(제목·글·사진·항목)을, 모양은 그 칸의 배치를 정한다. 짝이 맞지 않으면 템플릿 기본 모양으로 그린다.
 */
export const SECTION_VARIANTS = ['split', 'portrait', 'index', 'moments', 'overview', 'emblem', 'rows', 'questions', 'aside', 'faq', 'prep', 'half',
  // 90차: 템플릿 골격(docs/design/homepage-commercial-plan.md 3절)
  'editorial', 'mosaic', 'mask', 'filter', 'timeline', 'tiles', 'curriculum', 'mentors', 'feature-filter', 'portfolio', 'daybook',
  // 107차: 학교 홈페이지 공통 구역(docs/design/template-reference-board.md 3절)
  'quicklinks', 'stages', 'stats', 'events', 'voices'] as const;
export type SectionVariant = (typeof SECTION_VARIANTS)[number];
export const VARIANT_LABEL: Record<SectionVariant, string> = {
  split: '두 단(제목 | 글)', portrait: '대표 사진(무지개 호)', index: '번호 상자', moments: '사진 셋(번호 이름표)', overview: '사진 + 정보 줄',
  emblem: '작은 로고 + 글', rows: '사진–글 줄', questions: '제목 | 질문 목록', aside: '제목 | 목록', faq: '제목 | 접는 질문', prep: '안내 상자 + 포스터', half: '반 폭',
  curriculum: '과정 비교표', mentors: '멘토 소개', 'feature-filter': '대표 프로젝트 + 분류', portfolio: '작품 기록 목록 + 분류', daybook: '하루 수첩',
  editorial: '글 | 사진 반반 + 겹친 카드', mosaic: '큰·작은 사진 콜라주', mask: '둥글게 오린 사진', filter: '분류로 거르기', timeline: '시간 띠(하루 일과)', tiles: '크기가 다른 색 타일',
  quicklinks: '겹친 바로가기', stages: '학년 단계 카드', stats: '숫자 띠', events: '행사(날짜 배지)', voices: '목소리(인용 카드)',
};
/** 90차: tag = 분류(분류로 거르기 모양에서 단추가 됨, 예: 과학·예술) */
export type SectionItem = { title?: LText; body?: LText; asset?: string; alt?: LText; href?: string; tag?: LText };
export type Button = { label: LText; href: string };
export type GalleryItem = { asset: string; alt?: LText; category?: string; file_name?: string; size_bytes?: number };
export type GalleryFilter = { key: string; label: LText };

/** 35차(ADR 0011): 어느 블록이든 hidden 이면 방문자 화면에 그리지 않는다(화면 편집의 '숨기기'). 판에 남아 다시 보이게 할 수 있다. */
export type Block = (
  | { type: 'heading'; text: LText }
  | { type: 'text'; text: LText }
  | { type: 'notice'; text: LText }
  | { type: 'image'; asset: string; images?: LanguageImages; alt?: LText; caption?: LText }
  | { type: 'gallery'; assets: string[]; caption?: LText; items?: GalleryItem[]; filters?: GalleryFilter[]; download?: 'png'; scene?: number }
  | { type: 'video'; url: LText }
  | { type: 'story_page'; asset?: string; images?: LanguageImages; text: LText }
  | { type: 'section'; template: SectionTemplate; variant?: SectionVariant; eyebrow?: LText; title?: LText; body?: LText; asset?: string; alt?: LText; caption?: LText; items?: SectionItem[]; button?: Button }
  | { type: 'news_list'; eyebrow?: LText; title?: LText; body?: LText; count: number; style: 'cards' | 'list' }
  /** 34차: 파일(PDF) 내려받기. 파일 이름·크기는 저장할 때 서버가 그 학교 자산에서 채운다(판 스냅샷에 남음) */
  | { type: 'download'; asset: string; label?: LText; note?: LText; file_name?: string; size_bytes?: number }
  /** 91차(ADR 0036): 방문·상담 신청 칸. 학교가 설정에서 '신청 받기'를 켰을 때만 방문자에게 보인다 */
  | { type: 'inquiry'; title?: LText; body?: LText }
  /** 133차: 이 쪽 아래 공개된 하위 쪽 바로 가기(그릴 때 메뉴에서 찾음 — 공개 안 된 쪽·다른 묶음 쪽은 나오지 않는다) */
  | { type: 'subpages' }
) & { hidden?: boolean;
  /** 126차(ADR 0046): 메뉴 주소. 있으면 이 구역이 그 쪽 상위 메뉴 아래 하위 메뉴로 보이고 `/p/쪽#주소`로 바로 간다 */
  anchor?: string };

/** 사이트 머리·바닥 정보. 'home' 쪽 내용에 두어 판·공개 흐름을 그대로 따른다(로고 그림도 공개된 판이 가리킬 때만 보임). */
export type SiteProfile = {
  logo?: string; tagline?: LText; address?: LText; phone?: string[]; facebook?: string; footer?: LText; visit?: Button;
};
/** 쪽 머리 꾸밈(dawn): 작은 머리말과 화면 모양. 42차: 여는 머리의 링크(link)와 표지 사진 날짜표(note) */
export type PageHead = { eyebrow?: LText; layout?: 'editorial' | 'opening'; link?: Button; note?: LText };
/** 126차(ADR 0046): 이 쪽이 들어갈 상위 메뉴. 다른 쪽의 주소 이름이나 'news'(소식). 비우면 상위 메뉴 자신 */
export type PageMenu = { parent?: string };
export type Content = { title: LText; summary?: LText; cover?: string; blocks: Block[]; site?: SiteProfile; head?: PageHead; menu?: PageMenu };

/** 공개 사이트 메뉴 재료: 공개된 쪽 하나(홈 제외)와 그 쪽의 상위 메뉴·메뉴 주소가 있는 구역 */
export type NavEntry = { key: string; title: LText; parent?: string | null; sections?: { anchor: string; title: LText }[] };
export type NavNode = { key: string; href: string; title: LText; children: { key: string; href: string; title: LText }[] };
/** 쪽 내용들에서 메뉴 재료를 만든다(템플릿 미리보기처럼 DB 없이 그릴 때). 공개 사이트는 app.public_site가 같은 규칙으로 만든다 */
/** 한 쪽 내용에서 메뉴에 실을 구역. app.public_site(private.site_menu_sections)와 같은 규칙:
 *  숨김·방문자에게 그려지지 않는 구역(닫힌 신청 칸, 소식 없는 소식 목록)은 빼고, 제목이 있는 것만 */
export function menuSectionsOf(content: Content, shown: { inquiry: boolean; news: boolean }): { anchor: string; title: LText }[] {
  const visible = (b: Block) => b.anchor && !b.hidden && (b.type !== 'inquiry' || shown.inquiry) && (b.type !== 'news_list' || shown.news)
    && Object.values(anchorTitle(b) ?? {}).some(Boolean);
  return content.blocks.filter(visible).map((b) => ({ anchor: b.anchor!, title: anchorTitle(b)! }));
}
export function navEntriesOf(pages: { key: string; content: Content }[], shown: { inquiry: boolean; news: boolean }): NavEntry[] {
  return pages.filter((p) => p.key !== 'home').map((p) => ({
    key: p.key, title: p.content.title, parent: p.content.menu?.parent ?? null, sections: menuSectionsOf(p.content, shown),
  }));
}
/** 메뉴 주소를 달 수 있는 블록(제목이 있고 화면 요소로 그려지는 것)과 그 메뉴 이름 */
export const ANCHOR_BLOCKS = ['section', 'heading', 'news_list', 'inquiry'] as const;
export function anchorTitle(b: Block): LText | undefined {
  if (b.type === 'heading') return b.text;
  if (b.type === 'section' || b.type === 'news_list' || b.type === 'inquiry') return b.title;
  return undefined;
}
/** 메뉴 주소로 쓸 수 없는 이름(화면에 이미 있는 id) */
export const RESERVED_ANCHORS = ['site-main'];

/**
 * 126차(ADR 0046): 두 단계 메뉴 나무. 상위 = 상위 메뉴가 없는(또는 없는 쪽을 가리키는) 쪽, 'news'(소식이 있을 때).
 * 하위 = 그 쪽의 메뉴 주소 구역(쪽 안 순서) 다음에 그 쪽을 상위로 둔 쪽들(메뉴 순서). 한 단계만: 하위 쪽의 구역·하위는 펴지 않는다.
 * pageHref(key, anchor?)로 링크를 만든다. news는 소식 목록 링크와 제목을 받는다.
 */
/** 133차: 한 쪽 아래 공개된 하위 쪽('하위 쪽 바로 가기' 블록 재료). 메뉴는 한 단계라, 이미 하위인 쪽은 하위 쪽을 갖지 않는다 */
export function subpagesOf(nav: NavEntry[], key: string): { href: string; title: LText }[] {
  if (nav.find((n) => n.key === key)?.parent) return [];
  return nav.filter((n) => n.parent === key && n.key !== key).map((n) => ({ href: `/p/${n.key}`, title: n.title }));
}
export function buildNavTree(entries: NavEntry[], pageHref: (key: string, anchor?: string) => string, news?: { href: string; title: LText }): NavNode[] {
  // 'news'는 늘 소식 목록(상위 '소식')을 뜻한다. 주소 이름이 news인 쪽이 있어도 그 쪽은 상위 메뉴가 되지 못한다(한 쪽 = 한 부모)
  const keys = new Set(entries.map((e) => e.key).filter((k) => k !== 'news'));
  const parentOf = (e: NavEntry) => {
    if (!e.parent || e.parent === e.key) return null;
    if (e.parent === 'news') return news ? 'news' : null;
    return keys.has(e.parent) && !entries.find((x) => x.key === e.parent)?.parent ? e.parent : null;
  };
  const childPages = (k: string) => entries.filter((e) => parentOf(e) === k).map((e) => ({ key: `p:${e.key}`, href: pageHref(e.key), title: e.title }));
  const tops: NavNode[] = entries.filter((e) => !parentOf(e)).map((e) => ({
    key: `p:${e.key}`, href: pageHref(e.key), title: e.title,
    children: [...(e.sections ?? []).map((s) => ({ key: `p:${e.key}#${s.anchor}`, href: pageHref(e.key, s.anchor), title: s.title })), ...(e.key === 'news' ? [] : childPages(e.key))],
  }));
  if (news) tops.push({ key: 'news', href: news.href, title: news.title, children: childPages('news') });
  return tops;
}
export type EntryKind = 'page' | 'news' | 'story';
export const KIND_LABEL: Record<EntryKind, string> = { page: '쪽', news: '소식', story: '성품 동화' };
export const BLOCK_LABEL: Record<Block['type'], string> = {
  heading: '제목', text: '글', notice: '알림', image: '그림', gallery: '사진 묶음', video: '영상', story_page: '동화 한 쪽',
  section: '잡지형 구역', news_list: '최근 소식', download: 'PDF 내려받기', inquiry: '방문·상담 신청', subpages: '하위 쪽 바로 가기',
};

/**
 * 화면 모양(테마). campus·dawn은 처음부터 있던 것, 나머지는 89차(ADR 0034) 템플릿 완성 디자인.
 * 색·글꼴·첫 화면 모양만 다르고 블록·쪽 구조는 같다 — 학교가 언제든 바꿀 수 있다.
 */
export const SITE_THEMES = [
  { key: 'campus', name: '학사 기본', note: '차분한 기본 모양' },
  { key: 'dawn', name: '새벽빛 매거진', note: '잡지처럼 넓은 여백과 명조 제목' },
  { key: 'clear', name: '맑은 하늘', note: '파란 알림 띠와 카드, 공지가 많은 학교' },
  { key: 'bold', name: '힘찬 시작', note: '사진 위 큰 제목과 붉은 단추, 모집 중심' },
  { key: 'studio', name: '작업실', note: '노란 강조와 굵은 선, 프로젝트·작품 중심' },
  { key: 'lamp', name: '등불', note: '따뜻한 갈색과 명조 제목, 사명·후원 중심' },
  { key: 'horizon', name: '지평', note: '청록과 넓은 사진, 여러 언어 학교' },
  { key: 'seed', name: '씨앗', note: '둥근 모서리와 연두, 작은 모임의 한 쪽 소개' },
  { key: 'ivory', name: '아이보리 편집', note: '아이보리 바탕·명조 제목·글과 사진 반반, 일반 학교' },
  { key: 'play', name: '놀이터', note: '복숭아색·노랑, 둥글게 오린 사진, 유치원·저학년' },
] as const;
export type SiteTheme = (typeof SITE_THEMES)[number]['key'];
export const isSiteTheme = (v: unknown): v is SiteTheme => SITE_THEMES.some((t) => t.key === v);

export type SiteSettings = {
  school_id: string; public_slug: string; default_lang: Lang; langs: Lang[]; theme: SiteTheme;
  site_title: LText; is_open: boolean; updated_at: string;
  /** 91차: 방문·상담 신청 받기 */ inquiry_open: boolean;
};
export type EntryStatus = 'draft' | 'live' | 'changed' | 'hidden';
export type EntrySummary = {
  id: string; kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; sort: number; meta: Record<string, unknown>;
  latest_version: number; latest_title: LText; updated_at: string; live_version: number | null; status: EntryStatus;
  /** 38차: 보관(소프트 삭제)한 때. 보관함에만 보이고 방문자에게는 안 보인다 */
  archived_at: string | null;
};

/** 파일 크기 표시 (1.2MB · 340KB) */
export function fileSize(n: number | undefined): string {
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`;
}

/** 언어 고르기: 요청 언어 → 사이트 기본 언어 → 있는 아무 언어 */
export function pick(t: LText | null | undefined, lang: Lang, fallback: Lang): string {
  if (!t) return '';
  return t[lang] || t[fallback] || Object.values(t).find(Boolean) || '';
}

/** 관제 D-4(2026-11-23 사용자 결정): 사진 공개 허가는 기록·게시 막기 대신 올리는 화면의 안내 한 줄로 둔다(학교 관리자 책임). */
export const PHOTO_CONSENT = '학생이 나오는 사진은 학생·보호자 공개 허가를 받은 것만 올립니다. (확인은 학교 관리자 책임)';
