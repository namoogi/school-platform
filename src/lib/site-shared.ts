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
export const SECTION_VARIANTS = ['split', 'portrait', 'index', 'moments', 'overview', 'emblem', 'rows', 'questions', 'aside', 'faq', 'prep', 'half'] as const;
export type SectionVariant = (typeof SECTION_VARIANTS)[number];
export const VARIANT_LABEL: Record<SectionVariant, string> = {
  split: '두 단(제목 | 글)', portrait: '대표 사진(무지개 호)', index: '번호 상자', moments: '사진 셋(번호 이름표)', overview: '사진 + 정보 줄',
  emblem: '작은 로고 + 글', rows: '사진–글 줄', questions: '제목 | 질문 목록', aside: '제목 | 목록', faq: '제목 | 접는 질문', prep: '안내 상자 + 포스터', half: '반 폭',
};
export type SectionItem = { title?: LText; body?: LText; asset?: string; alt?: LText; href?: string };
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
) & { hidden?: boolean };

/** 사이트 머리·바닥 정보. 'home' 쪽 내용에 두어 판·공개 흐름을 그대로 따른다(로고 그림도 공개된 판이 가리킬 때만 보임). */
export type SiteProfile = {
  logo?: string; tagline?: LText; address?: LText; phone?: string[]; facebook?: string; footer?: LText; visit?: Button;
};
/** 쪽 머리 꾸밈(dawn): 작은 머리말과 화면 모양. 42차: 여는 머리의 링크(link)와 표지 사진 날짜표(note) */
export type PageHead = { eyebrow?: LText; layout?: 'editorial' | 'opening'; link?: Button; note?: LText };
export type Content = { title: LText; summary?: LText; cover?: string; blocks: Block[]; site?: SiteProfile; head?: PageHead };
export type EntryKind = 'page' | 'news' | 'story';
export const KIND_LABEL: Record<EntryKind, string> = { page: '쪽', news: '소식', story: '성품 동화' };
export const BLOCK_LABEL: Record<Block['type'], string> = {
  heading: '제목', text: '글', notice: '알림', image: '그림', gallery: '사진 묶음', video: '영상', story_page: '동화 한 쪽',
  section: '잡지형 구역', news_list: '최근 소식', download: 'PDF 내려받기',
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
] as const;
export type SiteTheme = (typeof SITE_THEMES)[number]['key'];
export const isSiteTheme = (v: unknown): v is SiteTheme => SITE_THEMES.some((t) => t.key === v);

export type SiteSettings = {
  school_id: string; public_slug: string; default_lang: Lang; langs: Lang[]; theme: SiteTheme;
  site_title: LText; is_open: boolean; updated_at: string;
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
