/** 65차 ADR 0031 — 템플릿 목록 검사(DB 없음): 모든 쪽이 블록 검사를 통과, 빈 칸 경로가 실제 자리를 가리킴, 안내 문구 표시, 공통 바닥 연락처 */
import { describe, expect, it } from 'vitest';
import { SITE_TEMPLATES, slotTarget, templateByKey } from '@/lib/site-templates';
import { validateContent } from '@/lib/site';

describe('템플릿 목록', () => {
  it('7종, 키가 겹치지 않고 모두 홈 쪽이 있다', () => {
    expect(SITE_TEMPLATES.map((t) => t.key)).toEqual(['notice', 'story', 'admissions', 'project', 'mission', 'international', 'single']);
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
});
