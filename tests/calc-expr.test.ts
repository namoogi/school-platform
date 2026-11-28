/** ADR 0040: 계산식 판의 식 — 검사·계산·빈 값·반올림 경계·견본 (DB 없이) */
import { describe, expect, it } from 'vitest';
import { checkSpec, evaluate, PRESETS, roundBy, weightedScore, sanitizeInput, type CalcSpec } from '@/lib/calc/expr';

describe('검사', () => {
  it('견본은 모두 통과', () => {
    for (const [k, p] of Object.entries(PRESETS)) expect(checkSpec(p.spec), k).toEqual([]);
  });
  it('쓸 수 없는 연산·변수·칸, 정하지 않은 중간값, 개수 틀림을 잡는다', () => {
    const msgs = (s: unknown) => checkSpec(s).map((i) => i.message).join(' | ');
    expect(msgs({ outputs: { score: { op: 'eval', args: ['1'] } } })).toMatch(/쓸 수 없는 연산/);
    expect(msgs({ outputs: { score: { var: 'process.env.SECRET' } } })).toMatch(/쓸 수 없는 변수/);
    expect(msgs({ outputs: { score: 1, grade: 2 } })).toMatch(/score·passed·level/);
    expect(msgs({ outputs: { score: { var: 'let.x' } } })).toMatch(/정하지 않은 중간값/);
    expect(msgs({ outputs: { passed: { op: '>=', args: [1] } } })).toMatch(/값 2개/);
    expect(msgs({ outputs: {} })).toMatch(/score 나 passed/);
    expect(msgs({ outputs: { score: { op: 'round', args: [1], digits: 9 } } })).toMatch(/digits/);
  });
  it('수업에 없는 평가 항목 참조를 알린다', () => {
    expect(checkSpec(PRESETS.pass_fail_project.spec, ['product']).map((i) => i.message).join()).toMatch(/presentation/);
  });
  it('너무 큰 식은 거부', () => {
    let e: unknown = 1;
    for (let i = 0; i < 30; i++) e = { op: '+', args: [e, 1] };
    expect(checkSpec({ outputs: { score: e } }).map((i) => i.message).join()).toMatch(/깊습니다/);
  });
});

describe('계산', () => {
  it('가중 평균: 만점 환산, 점수 있는 항목만, 가중치 합으로 나눔(합이 100이 아니어도)', () => {
    expect(weightedScore({ a: { score: 80, weight: 40 }, b: { score: 90, weight: 60 } })).toBe(86);
    expect(weightedScore({ a: { score: 8, max: 10, weight: 1 }, b: { score: 45, max: 50, weight: 1 } })).toBe(85);
    expect(weightedScore({ a: { score: 80, weight: 40 }, b: { score: null, weight: 60 } })).toBe(80);
    expect(weightedScore({})).toBeNull();
  });
  it('반올림 경계(부동소수 오차 포함)와 방식', () => {
    expect(roundBy(89.45, 1)).toBe(89.5);
    expect(roundBy(1.005, 2)).toBe(1.01);
    expect(roundBy(79.995, 2)).toBe(80);
    expect(roundBy(2.5, 0, 'half_even')).toBe(2);
    expect(roundBy(3.5, 0, 'half_even')).toBe(4);
    expect(roundBy(89.99, 0, 'floor')).toBe(89);
    expect(roundBy(-2.5, 0)).toBe(-3);
  });
  it('일반형 가중 평균: 점수·이수', () => {
    const r = evaluate(PRESETS.weighted_average.spec, { items: { a: { score: 70, weight: 50 }, b: { score: 49.9, weight: 50 } }, attendance: { rate: 0.7 } });
    expect(r).toEqual({ score: 60, passed: true, level: null });
    expect(evaluate(PRESETS.weighted_average.spec, { items: { a: { score: 90, weight: 1 } }, attendance: { rate: 0.5 } }).passed).toBe(false);
  });
  it('역량 도달 개수', () => {
    expect(evaluate(PRESETS.competency_mastery.spec, { competencies: ['M', 'E', 'M', 'D', 'M', 'M'] })).toEqual({ score: 5, passed: true, level: null });
    expect(evaluate(PRESETS.competency_mastery.spec, { competencies: ['M', 'D', 'D'] }).passed).toBe(false);
  });
  it('통과/미통과: 산출물 미제출이면 F', () => {
    const base = { attendance: { rate: 0.9 }, items: { presentation: { score: 3.5, weight: 0 }, product: { score: null, weight: 0, submitted: true } } };
    expect(evaluate(PRESETS.pass_fail_project.spec, base)).toEqual({ score: null, passed: true, level: 'P' });
    expect(evaluate(PRESETS.pass_fail_project.spec, { ...base, items: { ...base.items, product: { score: null, weight: 0, submitted: false } } }).level).toBe('F');
  });
  it('빈 값은 자료 없음(3값): 산술 null, 비교 null, and/or/if 도 null 을 지킨다 — 미달·통과로 접히지 않는다', () => {
    const r = evaluate(PRESETS.peer_teacher_mix.spec, { items: { teacher: { score: 90, weight: 0 } } });
    expect(r).toEqual({ score: null, passed: null, level: null });
    const s: CalcSpec = { outputs: { score: { op: '/', args: [1, 0] }, passed: { op: 'missing', args: [{ var: 'attendance.rate' }] } } };
    expect(evaluate(s, {})).toEqual({ score: null, passed: true, level: null });
    const g = (passed: unknown) => evaluate({ outputs: { passed } } as CalcSpec, { attendance: { rate: null } }).passed;
    const nul = { op: '>=', args: [{ var: 'attendance.rate' }, 0.8] };
    expect(g(nul)).toBeNull();
    expect(g({ op: 'and', args: [nul, true] })).toBeNull();
    expect(g({ op: 'and', args: [nul, false] })).toBe(false);
    expect(g({ op: 'or', args: [nul, true] })).toBe(true);
    expect(g({ op: 'not', args: [nul] })).toBeNull();
    expect(g({ op: 'coalesce', args: [nul, false] })).toBe(false); // 자료 없음을 미달로 접을 때는 이렇게 적는다
  });
});

describe('드리미포털 규칙 표현(회신 2026-11-27)', () => {
  const spec = PRESETS.rounded_twice_bands.spec;
  const one = (score: number, extra: object = {}) => evaluate(spec, { items: { a: { score, max: 100, weight: 100 } }, ...extra });
  it('두 번 반올림: 89.5 → 원점수 90 → A, 79.995 → 80.00 → 80 → B, 59.4 → 59 → E', () => {
    expect(one(89.5)).toMatchObject({ score: 90, level: 'A' });
    expect(one(79.995)).toMatchObject({ score: 80, level: 'B' });
    expect(one(59.4)).toMatchObject({ score: 59, level: 'E' });
  });
  it('가중치 합이 100이 아니어도 정규화하지 않는다(Σ 점수÷만점×비율), 결측은 재배분하지 않는다', () => {
    const r = evaluate(spec, { items: { a: { score: 80, max: 100, weight: 60 }, b: { score: null, max: 50, weight: 40 } } });
    expect(r).toMatchObject({ score: 48, level: 'E' });
  });
  it('만점 0 이하 영역은 합에서 빠지지만 점수 있음으로 센다', () => {
    expect(evaluate(spec, { items: { a: { score: 5, max: 0, weight: 100 } } })).toMatchObject({ score: 0, level: 'E' });
    expect(evaluate(spec, { items: {} })).toMatchObject({ score: null, level: null });
  });
  it('P/F(정정): 과목 속성 또는 학생 판정 P·F — 원점수만 비우고 성취도 P·F 는 남긴다', () => {
    // 학생 한 명만 P: A~E 과목 안에 섞인 P 학생(이번 입력 행의 성취도)
    expect(one(95, { entry: { exists: true, level: 'P' } })).toEqual({ score: null, passed: null, level: 'P' });
    expect(one(40, { entry: { exists: true, level: 'F' } })).toEqual({ score: null, passed: null, level: 'F' });
    // 과목이 P/F 여도 학생 판정이 없으면 성취도는 점수 잣대, 원점수만 빈칸(포털 확인 ①)
    expect(one(85, { course: { pass_fail: true } })).toEqual({ score: null, passed: null, level: 'B' });
    // 입력 행의 성취도가 비었으면 보통 과목처럼
    expect(one(85, { entry: { exists: true, level: null } })).toEqual({ score: 85, passed: null, level: 'B' });
  });
  it('계승(포털 정정 ②③): 입력 행이 없을 때만 이전 기록의 P 를 이어받고, 입력 행이 생기면 끊긴다', () => {
    expect(one(85, { entry: { exists: false }, prior: { level: 'P' } })).toEqual({ score: null, passed: null, level: 'P' });
    expect(one(85, { entry: { exists: true, level: null }, prior: { level: 'P' } })).toEqual({ score: 85, passed: null, level: 'B' });
    // 읽을 때 정리: ' p ' 도 P(옛 값이 계승으로 들어와도 같은 판정)
    expect(one(85, { entry: { exists: true, level: ' p ' } }).level).toBe('P');
    expect(one(85, { entry: { exists: false }, prior: { level: 'p' } }).level).toBe('P');
  });
  it('빈 성취도(사고 ④): 빈 글자·공백만은 자료 없음 — 밴드·비교에서 null 로 남고 조용히 통과하지 않는다', () => {
    for (const blank of ['', '   ', null]) {
      // 입력 행의 성취도가 비면 P/F 아님 → 점수 잣대
      expect(one(85, { entry: { exists: true, level: blank } })).toEqual({ score: 85, passed: null, level: 'B' });
      const s: CalcSpec = { outputs: { passed: { op: '==', args: [{ var: 'entry.level' }, 'A'] }, level: { op: 'band', args: [{ var: 'let.none' }], bands: [[90, 'A']], else: 'E' } }, lets: { none: { var: 'entry.level' } } };
      expect(evaluate(s, { entry: { exists: true, level: blank } })).toEqual({ score: null, passed: null, level: null });
    }
  });
  it('band: 하한 큰 순서·빈 값 null·검사', () => {
    expect(checkSpec({ outputs: { level: { op: 'band', args: [1], bands: [[60, 'D'], [90, 'A']] }, score: 1 } }).map((i) => i.message).join()).toMatch(/큰 것부터/);
  });
});

describe('한국식 A–E · 미국식 A–D·F (E 와 F 는 같은 맨 아래 등급)', () => {
  const kr = PRESETS.rounded_twice_bands.spec;
  const us = PRESETS.us_letter_pf.spec;
  const at = (spec: CalcSpec, score: number, extra: object = {}) => evaluate(spec, { items: { a: { score, max: 100, weight: 100 } }, ...extra });
  it('같은 59점이 한국식은 E, 미국식은 F', () => {
    expect(at(kr, 59).level).toBe('E');
    expect(at(us, 59)).toEqual({ score: 59, passed: false, level: 'F' });
    expect(at(us, 90)).toEqual({ score: 90, passed: true, level: 'A' });
  });
  it('미국식: 학생 판정 F 는 성적 등급이라 P/F 로 읽지 않는다(점수를 지우지 않음)', () => {
    expect(at(us, 55, { entry: { exists: true, level: 'F' } })).toEqual({ score: 55, passed: false, level: 'F' });
    // 한국식(드리미)은 학생 판정 F 가 P/F 의 미통과 → 원점수를 비운다
    expect(at(kr, 55, { entry: { exists: true, level: 'F' } })).toEqual({ score: null, passed: null, level: 'F' });
  });
  it('미국식 P/F: 과목이 P/F 면 P·NP, 학생 판정 P·NP 는 그대로', () => {
    expect(at(us, 75, { course: { pass_fail: true } })).toEqual({ score: null, passed: true, level: 'P' });
    expect(at(us, 40, { course: { pass_fail: true } })).toEqual({ score: null, passed: false, level: 'NP' });
    expect(at(us, 95, { entry: { exists: true, level: 'np' } })).toEqual({ score: null, passed: false, level: 'NP' });
  });
});

describe('Codex 지적(1801f25): 자료 없음은 합·평균·최소·최대에서도 null, 견본 모양이 틀려도 터지지 않음', () => {
  const out = (e: object, input: object = {}) => evaluate({ outputs: { score: e } } as CalcSpec, input).score;
  it('sum·avg·min·max 는 하나라도 없으면 null, 건너뛰려면 coalesce', () => {
    const rate = { op: '*', args: [{ var: 'attendance.rate' }, 100] };
    expect(out({ op: 'sum', args: [rate, 60] })).toBeNull();
    expect(out({ op: 'avg', args: [rate, 60] })).toBeNull();
    expect(out({ op: 'min', args: [rate, 60] })).toBeNull();
    expect(out({ op: 'max', args: [rate, 60] })).toBeNull();
    expect(out({ op: 'sum', args: [{ op: 'coalesce', args: [rate, 0] }, 60] })).toBe(60);
    expect(out({ op: 'avg', args: [rate, 60] }, { attendance: { rate: 0.8 } })).toBe(70);
  });
  it('모양이 틀린 입력은 자료 없음으로 계산한다', () => {
    const ws = { outputs: { score: { op: 'weighted_score' }, level: { op: 'count_levels', in: ['M'] } } } as CalcSpec;
    for (const bad of [{ items: null }, { items: [1, 2] }, { items: { a: null } }, { competencies: 'M' }, { attendance: 'x' }, null, 'x']) {
      expect(() => evaluate(ws, bad as never)).not.toThrow();
    }
    expect(evaluate(ws, { items: null, competencies: 'M' } as never)).toEqual({ score: null, passed: null, level: '0' });
    expect(sanitizeInput({ items: { a: { score: '90', weight: 50 } } })).toEqual({ items: { a: { score: null, max: null, weight: 50 } } });
  });
  it('만점이 모두 0 이하이면 정규화 가중 평균은 NaN 이 아니라 null', () => {
    expect(out({ op: 'weighted_score' }, { items: { a: { score: 3, max: 0, weight: 50 } } })).toBeNull();
  });
});

describe('Codex 지적(12b816e): 칸 값의 종류와 모르는 칸', () => {
  const msgs = (spec: unknown) => checkSpec(spec).map((i) => i.message).join(' | ');
  it('normalize 는 참거짓만(글자 "false" 는 거부)', () => {
    expect(msgs({ outputs: { score: { op: 'weighted_score', normalize: 'false' } } })).toMatch(/normalize/);
    expect(checkSpec({ outputs: { score: { op: 'weighted_score', normalize: false } } })).toEqual([]);
  });
  it('식 마디의 모르는 칸은 거부, count_levels in 은 30개·8자 이하', () => {
    expect(msgs({ outputs: { score: { op: 'abs', args: [1], payload: 'x' } } })).toMatch(/알 수 없는 칸/);
    expect(msgs({ outputs: { score: { op: 'count_levels', in: Array(31).fill('M') } } })).toMatch(/30개/);
    expect(msgs({ outputs: { score: { op: 'count_levels', in: ['TOO_LONG_LEVEL'] } } })).toMatch(/1~8자/);
  });
});

describe('106차: 중간값은 적힌 순서가 아니라 서로 가리키는 관계로 계산한다(jsonb 는 칸 순서를 바꾼다)', () => {
  it('칸 순서를 뒤집어도 같은 결과, 서로 가리키면 검사가 막는다', () => {
    for (const [code, { spec }] of Object.entries(PRESETS)) {
      const flipped = { ...spec, lets: Object.fromEntries(Object.entries(spec.lets ?? {}).reverse()) };
      const input = { items: { a: { score: 39.5, max: 100, weight: 60 }, b: { score: 88, max: 100, weight: 40 } }, attendance: { rate: 0.9 }, support: { achievement: true } };
      expect([code, evaluate(flipped, input)]).toEqual([code, evaluate(spec, input)]);
      expect([code, checkSpec(flipped)]).toEqual([code, []]);
    }
    const cyc = { lets: { a: { op: '+', args: [{ var: 'let.b' }, 1] }, b: { op: '+', args: [{ var: 'let.a' }, 1] } }, outputs: { score: { var: 'let.a' } } };
    expect(checkSpec(cyc).map((i) => i.message).join()).toMatch(/서로를 가리킵니다/);
    expect(checkSpec({ lets: { a: { var: 'let.a' } }, outputs: { score: 1 } }).map((i) => i.message).join()).toMatch(/서로를 가리킵니다/);
  });
});
