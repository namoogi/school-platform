/** 122차: 학교 AI 맞춤 지시문 — 학교 사본 요약·절차·저장할 화면 주소·지킬 것이 들어가고 토큰·실명 자리는 없다 */
import { describe, expect, it } from 'vitest';
import { buildTemplateGuideText, GRADE_INTAKE_URL } from '@/lib/template-ai-guide';

const base = {
  schoolName: '드리미 예시학교', baseUrl: 'https://example.test/',
  template: { key: 'kr_alternative', version: 2, title: '한국 대안학교(프로젝트·P/F)' },
  scheme: 'kr', levels: ['초등', '중등'], periods: ['1학기', '2학기'], scales: ['pass_fail'],
  calcSamples: ['pass_fail_project'], outputs: ['kr_alt_record'], hidden: ['gpa', 'rank'],
};

describe('학교 AI 맞춤 지시문', () => {
  it('학교 사본 요약과 템플릿 판을 담는다', () => {
    const s = buildTemplateGuideText(base);
    expect(s).toContain('"드리미 예시학교"');
    expect(s).toContain('한국 대안학교(프로젝트·P/F) (kr_alternative 2판)');
    expect(s).toContain('학년 체계: 한국식 · 학교급: 초등, 중등');
    expect(s).toContain('척도: pass_fail');
    expect(s).toContain('숨기는 구획: 평점(GPA), 석차');
  });

  it('절차 문서와 저장할 화면 주소를 끝 / 없이 붙인다', () => {
    const s = buildTemplateGuideText(base);
    expect(s).toContain(GRADE_INTAKE_URL);
    expect(s).toContain('https://example.test/academics?tab=terms');
    expect(s).toContain('https://example.test/grades');
    expect(s).toContain('https://example.test/records');
    expect(s).not.toContain('example.test//');
  });

  it('지킬 것(실명 금지·추측 금지·학교 값 유지·유료 분석 없음)이 있고 토큰은 담지 않는다', () => {
    const s = buildTemplateGuideText(base);
    for (const w of ['실제 학생 이름', '지어내지 않는다', '학교 값을 지키고', '유료 분석']) expect(s).toContain(w);
    expect(s).not.toMatch(/SCHOOL_AGENT_TOKEN=|x-agent-token/);
  });

  it('빈 값은 "없음"·"정하지 않음"으로 적는다', () => {
    const s = buildTemplateGuideText({ ...base, scheme: null, levels: [], periods: [], hidden: [] });
    expect(s).toContain('학년 체계: 정하지 않음 · 학교급: 없음');
    expect(s).toContain('학기 구조: 없음');
    expect(s).toContain('숨기는 구획: 없음');
  });
});
