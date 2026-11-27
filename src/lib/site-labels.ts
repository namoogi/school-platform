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

/** 편집기 구조 목록·구역 막대의 블록 이름(관리 화면 언어). 잡지형 구역은 모양 이름, 장면 캐릭터 PNG는 따로 */
export function blockLabel(t: (k: MsgKey) => string, b: { type: string; template?: string; download?: string }, fallback: string): string {
  if (b.type === 'gallery' && b.download === 'png') return t('site.block.characterPng');
  if (b.type === 'section' && b.template) return siteLabel(t, 'section', b.template, fallback);
  return siteLabel(t, 'block', b.type, fallback);
}

/** 팔레트 칸 이름·설명(관리 화면 언어). id: 'section:media-left' · 'heading' · 'character_png' … */
export function paletteText(t: (k: MsgKey) => string, p: { id: string; label: string; hint: string }): { label: string; hint: string } {
  const [head, rest] = p.id.split(':');
  const label = head === 'section' && rest ? siteLabel(t, 'section', rest, p.label)
    : p.id === 'character_png' ? t('site.block.characterPng') : siteLabel(t, 'block', p.id, p.label);
  const hk = `site.pal.hint.${p.id.replace(':', '_').replace(/-/g, '_')}`;
  return { label, hint: Object.prototype.hasOwnProperty.call(CATALOG, hk) ? t(hk as MsgKey) : p.hint };
}

/**
 * 편집기 칸 이름: 공개 렌더러(SiteRenderer)는 편집 모드에서 칸 이름을 한국어로 넘긴다(공개 화면은 학교 언어를 따르는 별도 영역).
 * 편집기는 그 이름을 'site.field.*' 기준 문구와 맞춰 관리 화면 언어로 바꿔 보인다. '{n}번 …'처럼 번호가 든 이름도 맞춘다. 맞는 이름표가 없으면 그대로.
 */
let fields: { exact: Map<string, MsgKey>; numbered: { re: RegExp; key: MsgKey }[] } | null = null;
export function fieldLabel(t: (k: MsgKey, v?: Record<string, string | number>) => string, label: string): string {
  if (!fields) {
    const keys = (Object.keys(CATALOG) as MsgKey[]).filter((k) => k.startsWith('site.field.'));
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    fields = {
      exact: new Map(keys.filter((k) => !k.startsWith('site.field.n.')).map((k) => [CATALOG[k] as string, k])),
      numbered: keys.filter((k) => k.startsWith('site.field.n.')).map((k) => ({ re: new RegExp(`^${esc(CATALOG[k] as string).replace('\\{n\\}', '(\\d+)')}$`), key: k })),
    };
  }
  const hit = fields.exact.get(label);
  if (hit) return t(hit);
  for (const { re, key } of fields.numbered) { const m = label.match(re); if (m) return t(key, { n: Number(m[1]) }); }
  return label;
}
