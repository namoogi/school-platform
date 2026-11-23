/** 27차 홈페이지: 서버·브라우저 공용 상수·타입·언어 고르기 (DB 의존 없음). ADR 0008 */
export const LANGS = ['ko', 'en', 'th'] as const;
export type Lang = (typeof LANGS)[number];
export type LText = Partial<Record<Lang, string>>;
export const LANG_LABEL: Record<Lang, string> = { ko: '한국어', en: 'English', th: 'ไทย' };

export type Block =
  | { type: 'heading'; text: LText }
  | { type: 'text'; text: LText }
  | { type: 'notice'; text: LText }
  | { type: 'image'; asset: string; alt?: LText; caption?: LText }
  | { type: 'gallery'; assets: string[]; caption?: LText }
  | { type: 'video'; url: LText }
  | { type: 'story_page'; asset?: string; text: LText };
export type Content = { title: LText; summary?: LText; cover?: string; blocks: Block[] };
export type EntryKind = 'page' | 'news' | 'story';
export const KIND_LABEL: Record<EntryKind, string> = { page: '쪽', news: '소식', story: '성품 동화' };
export const BLOCK_LABEL: Record<Block['type'], string> = {
  heading: '제목', text: '글', notice: '알림', image: '그림', gallery: '사진 묶음', video: '영상', story_page: '동화 한 쪽',
};

export type SiteSettings = {
  school_id: string; public_slug: string; default_lang: Lang; langs: Lang[]; theme: 'campus' | 'dawn';
  site_title: LText; is_open: boolean; updated_at: string;
};
export type EntryStatus = 'draft' | 'live' | 'changed' | 'hidden';
export type EntrySummary = {
  id: string; kind: EntryKind; key: string; visibility: 'public' | 'unlisted'; sort: number; meta: Record<string, unknown>;
  latest_version: number; latest_title: LText; updated_at: string; live_version: number | null; status: EntryStatus;
};

/** 언어 고르기: 요청 언어 → 사이트 기본 언어 → 있는 아무 언어 */
export function pick(t: LText | null | undefined, lang: Lang, fallback: Lang): string {
  if (!t) return '';
  return t[lang] || t[fallback] || Object.values(t).find(Boolean) || '';
}
