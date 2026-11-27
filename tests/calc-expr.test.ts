/** ADR 0040: 계산식 판의 식 — 검사·계산·빈 값·반올림 경계·견본 (DB 없이) */
import { describe, expect, it } from 'vitest';
import { checkSpec, evaluate, PRESETS, roundBy, weightedScore, type CalcSpec } from '@/lib/calc/expr';

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
    // 학생 한 명만 P: A~E 과목 안에 섞인 P 학생
    expect(one(95, { student: { manual_level: 'P' } })).toEqual({ score: null, passed: null, level: 'P' });
    expect(one(40, { student: { manual_level: 'F' } })).toEqual({ score: null, passed: null, level: 'F' });
    // 과목이 P/F 여도 학생 판정이 없으면 원점수는 비우고 성취도는 점수 잣대(드리미 reflect.ts 의 대체 경로)
    expect(one(95, { course: { pass_fail: true } })).toEqual({ score: null, passed: null, level: 'A' });
    // 학생 판정이 P·F 가 아니면(비어 있거나 다른 값) 보통 과목처럼
    expect(one(85, { student: { manual_level: null } })).toEqual({ score: 85, passed: null, level: 'B' });
  });
  it('band: 하한 큰 순서·빈 값 null·검사', () => {
    expect(checkSpec({ outputs: { level: { op: 'band', args: [1], bands: [[60, 'D'], [90, 'A']] }, score: 1 } }).map((i) => i.message).join()).toMatch(/큰 것부터/);
  });
});
