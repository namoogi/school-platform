/** 127차: 학교 AI 맞춤 지시문 — 학교 사본 요약·절차·저장할 화면 주소·지킬 것이 들어가고 토큰·실명 자리는 없다 */
import { describe, expect, it } from 'vitest';
import { buildTemplateGuideText, GRADE_INTAKE_URL } from '@/lib/template-ai-guide';

const base = {
  schoolName: '드리미 예시학교', baseUrl: 'https://example.test/',
  template: { key: 'kr_alternative', version: 2, title: '한국 대안학교(프로젝트·P/F)' },
  scheme: 'kr', levels: ['초등', '중등'], periods: ['1학기', '2학기'], scales: [{ code: 'pass_fail', kind: 'pass_fail', version: 2, bands: [{ code: 'P', min: 60 }, { code: 'F', min: 0, earns_credit: false }] }],
  policy: { version: 3, policy: { score_digits: 1, narrative_limit: 500 } },
  calcSamples: ['pass_fail_project'], outputs: ['kr_alt_record'],
  calcRules: [{ code: 'school_pf', version: 2, spec: { outputs: { passed: true } } }],
  outputProfiles: [{ code: 'record_main', format: 'kr_alt_record', version: 3, settings: { blind: true } }], hidden: ['gpa', 'rank'],
};

describe('학교 AI 맞춤 지시문', () => {
  it('학교 사본 요약과 템플릿 판을 담는다', () => {
    const s = buildTemplateGuideText(base);
    expect(s).toContain('"드리미 예시학교"');
    expect(s).toContain('한국 대안학교(프로젝트·P/F) (kr_alternative 2판)');
    expect(s).toContain('학년 체계: 한국식 · 학교급: 초등, 중등');
    // 척도는 코드만이 아니라 지금 판의 구간까지, 성적 정책은 지금 판 값까지(Codex 220번 PR 검토)
    expect(s).toContain('pass_fail 2판 (pass_fail): P:60 F:0/이수 아님');
    expect(s).toContain('성적 정책: 3판 {"score_digits":1,"narrative_limit":500}');
    // 계산식·출력 프로필도 템플릿 견본이 아니라 학교가 저장한 지금 판
    expect(s).toContain('school_pf 2판: {"outputs":{"passed":true}}');
    expect(s).toContain('record_main (kr_alt_record) 3판: {"blind":true}');
    expect(s).toContain('숨기는 구획: 평점(GPA), 석차');
  });

  it('절차 문서와 저장할 화면 주소를 끝 / 없이 붙인다', () => {
    const s = buildTemplateGuideText(base);
    expect(s).toContain(GRADE_INTAKE_URL);
    expect(s).toContain('https://example.test/academics?tab=terms');
    expect(s).toContain('https://example.test/grades');
    expect(s).not.toContain('example.test//');
  });

  it('작업 토큰이 못 읽는 주소로 보내지 않고, 견본은 지시문 안에 담는다(Codex 220번 PR 검토)', () => {
    const s = buildTemplateGuideText(base);
    // 학교 AI 토큰은 로그인 쿠키 전용 /api/calc-rules 를 읽지 못하고, /records 에는 출력 프로필 저장이 없다
    expect(s).not.toContain('/api/calc-rules');
    expect(s).not.toContain('/records');
    expect(s).toContain('weighted_average — ');
    expect(s).toContain('pass_fail_project (이 템플릿 견본)');
    expect(s).toMatch(/- pass_fail_project: \{"lets"|- pass_fail_project: \{"outputs"/);
    // 화면이 없는 계산식 판·출력 프로필은 대화창 → 관제가 저장
    expect(s).toContain("대화창의 '새 대화'로 초안을 관제에 보내면");
    // 화면이 받는 것은 견본 추가·정책 세 칸뿐 — 맞춤 척도 구간·그 밖의 정책 칸은 관제 묶음
    expect(s).toMatch(/척도 견본 추가\(정해진 견본만, 구간은 못 고침\)/);
    expect(s).toMatch(/나\. [\s\S]*맞춤 척도\(구간 경계·평점·이수 여부\), 위 세 칸 밖의 성적 정책/);
  });

  it('지킬 것(실명 금지·추측 금지·학교 값 유지·유료 분석 없음)이 있고 토큰은 담지 않는다', () => {
    const s = buildTemplateGuideText(base);
    for (const w of ['실제 학생 이름', '지어내지 않는다', '학교 값을 지키고', '유료 분석']) expect(s).toContain(w);
    expect(s).not.toMatch(/SCHOOL_AGENT_TOKEN=|x-agent-token/);
  });

  it('빈 값은 "없음"·"정하지 않음"으로 적는다', () => {
    const s = buildTemplateGuideText({ ...base, scheme: null, levels: [], periods: [], hidden: [], scales: [], policy: null, calcRules: [], outputProfiles: [] });
    expect(s).toContain('학년 체계: 정하지 않음 · 학교급: 없음');
    expect(s).toContain('학기 구조: 없음');
    expect(s).toContain('숨기는 구획: 없음');
    expect(s).toContain('- 척도: 없음');
    expect(s).toContain('성적 정책: 없음(기본값)');
    expect(s).toContain('학교 계산식 판: 없음');
    expect(s).toContain('학교 출력 프로필: 없음');
  });
});
