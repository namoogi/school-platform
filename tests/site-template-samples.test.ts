/** 86차 — 템플릿 예시 내용(가상 학교)·썸네일 검사(DB 없음) */
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITE_TEMPLATES } from '@/lib/site-templates';
import { placeholders, samplePages, TEMPLATE_SAMPLES } from '@/lib/site-template-samples';
import { validateContent } from '@/lib/site';

describe('템플릿 예시 내용', () => {
  it('모든 템플릿에 예시가 있고, 채운 뒤 안내 자리 [ ]가 남지 않으며 블록 검사를 통과한다', () => {
    for (const t of SITE_TEMPLATES) {
      expect(TEMPLATE_SAMPLES[t.key], t.key).toBeTruthy();
      const filled = samplePages(t);
      for (const p of t.pages) {
        expect(placeholders(filled[p.key]), `${t.key}/${p.key}`).toEqual([]);
        expect(() => validateContent(filled[p.key])).not.toThrow();
      }
    }
  });
  it('예시 사전에 쓰이지 않는 항목이 없다(템플릿을 고치면 예시도 함께 고친다)', () => {
    for (const t of SITE_TEMPLATES) {
      const used = new Set(t.pages.flatMap((p) => placeholders(p.content)));
      for (const k of Object.keys(TEMPLATE_SAMPLES[t.key].text)) expect(used.has(k), `${t.key}: ${k}`).toBe(true);
    }
  });
  it('원본 템플릿은 바뀌지 않는다(적용하면 안내 자리가 그대로 들어간다)', () => {
    const t = SITE_TEMPLATES.find((x) => x.key === 'story')!;
    samplePages(t);
    expect(JSON.stringify(t.pages[0].content)).toContain('[학교 이름]');
  });
  it('같은 안내 자리가 여러 번 나오면 차례대로 다른 값을 쓴다', () => {
    const t = SITE_TEMPLATES.find((x) => x.key === 'story')!;
    const items = (samplePages(t).philosophy.blocks[1] as { items: { body: { ko: string } }[] }).items.map((i) => i.body.ko);
    expect(new Set(items).size).toBe(3);
  });
  it('예시는 가상 연락처만 쓴다(예약 도메인 example.org, 0으로 채운 전화)', () => {
    const all = JSON.stringify(TEMPLATE_SAMPLES);
    for (const m of all.matchAll(/[\w.-]+@[\w.-]+/g)) expect(m[0]).toMatch(/@example\.org$/);
    for (const m of all.matchAll(/\d{2,4}-\d{3,4}-\d{4}/g)) expect(m[0]).toMatch(/^0+-0+-0+$/);
  });
  it('모든 템플릿에 썸네일이 있다(npm run templates:thumbs)', () => {
    for (const t of SITE_TEMPLATES) expect(existsSync(`public/site-templates/${t.key}.jpg`), t.key).toBe(true);
  });
});
