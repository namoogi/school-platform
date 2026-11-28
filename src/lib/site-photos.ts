/**
 * 121차: 판(Content) 안의 사진 id 모으기 (DB·브라우저 의존 없음).
 * 공개 창의 '사진 공개 허가 확인'에 쓴다. PDF 내려받기(download) 블록은 사진이 아니므로 뺀다.
 * 형식(그림인지)은 서버가 site_assets.mime 으로 다시 거른다.
 */
import type { Block, Content } from './site-shared';

export function photoAssetIds(content: Content | null | undefined): string[] {
  if (!content) return [];
  const out: string[] = [];
  const add = (v: unknown) => { if (typeof v === 'string' && v && !out.includes(v)) out.push(v); };
  add(content.cover);
  add(content.site?.logo);
  for (const b of content.blocks ?? []) {
    if ((b as Block).type === 'download') continue;
    const x = b as Record<string, unknown>;
    add(x.asset);
    if (Array.isArray(x.assets)) x.assets.forEach(add);
    if (Array.isArray(x.items)) for (const it of x.items) add((it as Record<string, unknown> | null)?.asset);
  }
  return out;
}
