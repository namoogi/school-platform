import { CATALOG, type MsgKey } from './i18n/catalog';

/**
 * 103차(ADR 0037): 홈페이지 공용 값(종류·구역·블록·테마)을 관리 화면 언어로 보일 때 쓰는 이름표.
 * 공개 홈페이지는 학교 언어를 따르므로 site-shared 의 한국어 목록을 그대로 쓰고, 관리 화면만 이 이름표를 쓴다.
 * 이름표에는 '-'를 쓰지 않으므로 '_'로 바꾼다(media-left → site.section.media_left).
 */
export function siteLabelKey(area: 'kind' | 'section' | 'block' | 'variant' | 'theme' | 'themeNote', value: string): MsgKey | null {
  const key = `site.${area}.${value.replace(/-/g, '_')}`;
  return Object.prototype.hasOwnProperty.call(CATALOG, key) ? (key as MsgKey) : null;
}

/** 이름표가 있으면 그 언어 문구, 없으면 원래 값(fallback) */
export function siteLabel(t: (k: MsgKey) => string, area: Parameters<typeof siteLabelKey>[0], value: string, fallback: string): string {
  const key = siteLabelKey(area, value);
  return key ? t(key) : fallback;
}

/** 템플릿 고르기 화면의 이름·설명·맞는 학교(관리 화면 언어). 이름표가 없는 템플릿은 원래 글 */
export function templateText(t: (k: MsgKey) => string, key: string, field: 'name' | 'summary' | 'fits', fallback: string): string {
  const k = `site.tpl.t.${key}.${field}`;
  return Object.prototype.hasOwnProperty.call(CATALOG, k) ? t(k as MsgKey) : fallback;
}
