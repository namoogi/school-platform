/** 86차 — 템플릿 예시 내용(가상 학교)·썸네일 검사(DB 없음) */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { recommendTemplates, SITE_TEMPLATES } from '@/lib/site-templates';
import { placeholders, sampleAssetUrl, samplePages, SAMPLE_PHOTOS, TEMPLATE_SAMPLES } from '@/lib/site-template-samples';
import { isSiteTheme, validateContent } from '@/lib/site';

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
  it('89·90차: 모든 템플릿 디자인이 화면 모양 목록에 있고 서로 다르다(새벽빛은 룽아룬숙사 등 기존 학교용으로 남김)', () => {
    for (const t of SITE_TEMPLATES) expect(isSiteTheme(t.theme), t.key).toBe(true);
    expect(new Set(SITE_TEMPLATES.map((t) => t.theme)).size).toBe(SITE_TEMPLATES.length);
    expect(SITE_TEMPLATES.filter((t) => t.theme === 'dawn' || t.theme === 'campus')).toEqual([]);
  });
  it('89차: 예시 그림이 실제 칸에 놓이고 그림 파일이 있다', () => {
    for (const t of SITE_TEMPLATES) {
      const pages = samplePages(t);
      for (const img of TEMPLATE_SAMPLES[t.key].images ?? []) {
        const [pg, ...path] = img.at;
        let node: unknown = pages[String(pg)];
        for (const k of path) node = (node as Record<string | number, unknown>)?.[k];
        expect(typeof node, `${t.key}: ${img.name}`).toBe('string');
        const url = sampleAssetUrl(node as string);
        expect(url, img.name).toMatch(new RegExp(`/site-templates/img/${img.name}\\.(svg|jpg)$`));
        expect(existsSync(`public${url}`), url).toBe(true);
      }
    }
  });
  it('90차: 대표 3종은 골격(배치)이 서로 다르다 — 편집형·작품 거르기·둥근 오리기', () => {
    const variants = (key: string) => SITE_TEMPLATES.find((t) => t.key === key)!.pages[0].content.blocks.map((b) => (b.type === 'section' ? b.variant ?? '' : b.type));
    expect(variants('story')).toContain('editorial');
    expect(variants('story')).toContain('mosaic');
    expect(variants('project')).toContain('filter');
    expect(variants('kinder')).toEqual(expect.arrayContaining(['mask', 'timeline', 'faq']));
  });
  it('90차: 유치원 자료면 유치원형을 추천한다(이관 추천 단서)', () => {
    const fits = recommendTemplates([{ name: '/', text: '햇님 유치원 · 만 3세 새싹반, 만 4세 꽃잎반 · 놀이 중심 · 등원 시간 9시' }], {});
    expect(fits[0].key).toBe('kinder');
  });
  it('#143: 대표 3종의 모든 쪽이 등록된 JPG와 설명을 쓰며 사진은 실제 학교에 자동 적용되지 않는다', () => {
    expect(SAMPLE_PHOTOS.size).toBe(22);
    const assets = (value: unknown): { asset: string; alt?: { ko?: string } }[] => {
      if (!value || typeof value !== 'object') return [];
      const obj = value as Record<string, unknown>;
      return [...(typeof obj.asset === 'string' ? [obj as { asset: string; alt?: { ko?: string } }] : []), ...Object.values(obj).flatMap(assets)];
    };
    for (const key of ['story', 'project', 'kinder']) {
      const template = SITE_TEMPLATES.find((t) => t.key === key)!;
      expect(assets(template.pages), '실제 적용 템플릿에 예시 자산을 넣지 않음').toEqual([]);
      for (const [page, content] of Object.entries(samplePages(template))) {
        const photos = assets(content);
        expect(photos.length, `${key}/${page}`).toBeGreaterThan(0);
        for (const photo of photos) {
          expect(sampleAssetUrl(photo.asset)).toMatch(/\.jpg$/);
          expect(photo.alt?.ko).toContain('AI 예시 사진');
        }
      }
    }
    for (const name of SAMPLE_PHOTOS) {
      const file = `public/site-templates/img/${name}.jpg`;
      expect([...readFileSync(file).subarray(0, 3)]).toEqual([255, 216, 255]);
      expect(statSync(file).size).toBeLessThanOrEqual(300000);
    }
  });

});
