/** 65차 ADR 0031 — 템플릿 목록 검사(DB 없음): 모든 쪽이 블록 검사를 통과, 빈 칸 경로가 실제 자리를 가리킴, 안내 문구 표시, 공통 바닥 연락처 */
import { describe, expect, it } from 'vitest';
import { SITE_TEMPLATES, slotMatchesContent, slotTarget, templateByKey } from '@/lib/site-templates';
import { validateContent } from '@/lib/site';

describe('템플릿 목록', () => {
  it('8종, 키가 겹치지 않고 모두 홈 쪽이 있다', () => {
    expect(SITE_TEMPLATES.map((t) => t.key)).toEqual(['notice', 'story', 'admissions', 'project', 'mission', 'international', 'kinder', 'single']);
    for (const t of SITE_TEMPLATES) {
      expect(t.pages[0].key).toBe('home');
      expect(new Set(t.pages.map((p) => p.key)).size).toBe(t.pages.length);
      expect(t.mustHave.length).toBeGreaterThan(0);
    }
    expect(() => templateByKey('nope')).toThrow('템플릿');
  });

  it('모든 쪽 내용이 기존 블록 검사(validateContent)를 그대로 통과한다', () => {
    for (const t of SITE_TEMPLATES) for (const p of t.pages) {
      expect(() => validateContent(p.content), `${t.key}/${p.key}`).not.toThrow();
      expect(validateContent(p.content).blocks.length).toBe(p.content.blocks.length);
    }
  });

  it('빈 칸은 실제 쪽·블록을 가리키고 id가 겹치지 않으며 단서 낱말이 있다', () => {
    for (const t of SITE_TEMPLATES) {
      expect(new Set(t.slots.map((s) => s.id)).size, t.key).toBe(t.slots.length);
      for (const s of t.slots) {
        expect(slotTarget(t, s), `${t.key}:${s.id}`).not.toBeNull();
        expect(s.clues.length).toBeGreaterThan(0);
      }
      // 바닥 연락처 빈 칸은 모든 템플릿에 있다(자동 배치·이전이 채울 자리)
      expect(t.slots.map((s) => s.id)).toEqual(expect.arrayContaining(['tagline', 'address', 'footer']));
    }
  });

  it('안내 자리는 [ ]로 표시되어 사람이 바꿀 곳을 알 수 있다', () => {
    for (const t of SITE_TEMPLATES) expect(JSON.stringify(t.pages[0].content)).toMatch(/\[[^\]]+\]/);
  });

  it('112차: 빈 칸은 같은 구역(종류·모양)일 때만 채운다 — 예전 판 쪽에서 구역 순서가 다르면 그대로 둔다', () => {
    for (const t of SITE_TEMPLATES) for (const s of t.slots) {
      const pg = t.pages.find((p) => p.key === s.page)!;
      expect(slotMatchesContent(t, s, pg.content), `${t.key}/${s.id}`).toBe(true);
    }
    const t = templateByKey('admissions');
    const slot = t.slots.find((s) => s.id === 'differences')!;
    const home = t.pages[0].content;
    // 예전 판(v3)처럼 바로가기·숫자 띠 없이 [첫 화면, 차별점, 소식] 순서였던 쪽
    const old = { ...home, blocks: [home.blocks[0], home.blocks[2], home.blocks.at(-1)!] };
    expect(slotMatchesContent(t, slot, old)).toBe(false);
    const k = templateByKey('kinder');
    const classes = k.slots.find((s) => s.id === 'classes')!;
    const kh = k.pages[0].content;
    // 예전 판(v4): blocks[2]는 하루 일과(steps)였다 → 반 목록을 덮지 않는다
    expect(slotMatchesContent(k, classes, { ...kh, blocks: [kh.blocks[0], kh.blocks[2], kh.blocks[3]] })).toBe(false);
  });
});
