/** 27차 홈페이지: 서버·브라우저 공용 상수·타입·언어 고르기 (DB 의존 없음). ADR 0008 */
export const LANGS = ['ko', 'en', 'th'] as const;
export type Lang = (typeof LANGS)[number];
export type LText = Partial<Record<Lang, string>>;
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
export type SectionItem = { title?: LText; body?: LText; asset?: string; alt?: LText; href?: string };
export type Button = { label: LText; href: string };
export type GalleryItem = { asset: string; alt?: LText; category?: string; file_name?: string; size_bytes?: number };
export type GalleryFilter = { key: string; label: LText };

/** 35차(ADR 0011): 어느 블록이든 hidden 이면 방문자 화면에 그리지 않는다(화면 편집의 '숨기기'). 판에 남아 다시 보이게 할 수 있다. */
export type Block = (
  | { type: 'heading'; text: LText }
  | { type: 'text'; text: LText }
  | { type: 'notice'; text: LText }
  | { type: 'image'; asset: string; alt?: LText; caption?: LText }
  | { type: 'gallery'; assets: string[]; caption?: LText; items?: GalleryItem[]; filters?: GalleryFilter[]; download?: 'png'; scene?: number }
  | { type: 'video'; url: LText }
  | { type: 'story_page'; asset?: string; text: LText }
  | { type: 'section'; template: SectionTemplate; eyebrow?: LText; title?: LText; body?: LText; asset?: string; alt?: LText; items?: SectionItem[]; button?: Button }
  | { type: 'news_list'; title?: LText; body?: LText; count: number; style: 'cards' | 'list' }
  /** 34차: 파일(PDF) 내려받기. 파일 이름·크기는 저장할 때 서버가 그 학교 자산에서 채운다(판 스냅샷에 남음) */
  | { type: 'download'; asset: string; label?: LText; note?: LText; file_name?: string; size_bytes?: number }
) & { hidden?: boolean };

/** 사이트 머리·바닥 정보. 'home' 쪽 내용에 두어 판·공개 흐름을 그대로 따른다(로고 그림도 공개된 판이 가리킬 때만 보임). */
export type SiteProfile = {
  logo?: string; tagline?: LText; address?: LText; phone?: string[]; facebook?: string; footer?: LText; visit?: Button;
};
/** 쪽 머리 꾸밈(dawn): 작은 머리말과 화면 모양 */
export type PageHead = { eyebrow?: LText; layout?: 'editorial' | 'opening' };
export type Content = { title: LText; summary?: LText; cover?: string; blocks: Block[]; site?: SiteProfile; head?: PageHead };
export type EntryKind = 'page' | 'news' | 'story';
export const KIND_LABEL: Record<EntryKind, string> = { page: '쪽', news: '소식', story: '성품 동화' };
export const BLOCK_LABEL: Record<Block['type'], string> = {
  heading: '제목', text: '글', notice: '알림', image: '그림', gallery: '사진 묶음', video: '영상', story_page: '동화 한 쪽',
  section: '잡지형 구역', news_list: '최근 소식', download: 'PDF 내려받기',
};

export type SiteSettings = {
  school_id: string; public_slug: string; default_lang: Lang; langs: Lang[]; theme: 'campus' | 'dawn';
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
