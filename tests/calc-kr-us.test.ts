/** ADR 0041: 국가 기준 견본(한국 기재요령 2026 · 미국 흔한 관행)과 모집단 계산(석차등급·과목평균·분포·GPA). DB 없이 */
import { describe, expect, it } from 'vitest';
import { checkSpec, evaluate, PRESETS, type CalcInput } from '@/lib/calc/expr';
import { gpa, KR_GRADE5, levelDistribution, populationStdev, rankGrades, rankLabel, subjectMean, US_POINTS_PLUS_MINUS } from '@/lib/calc/population';

/** 반영비율 두 영역(60·40). 환산점수 합계 = a×0.6 + b×0.4 */
const two = (a: number, b: number, extra: Partial<CalcInput> = {}): CalcInput => ({
  items: { exam: { score: a, max: 100, weight: 60 }, task: { score: b, max: 100, weight: 40 } }, attendance: { rate: 1 }, ...extra,
});
const run = (code: string, input: CalcInput) => evaluate(PRESETS[code].spec, input);

describe('국가 견본은 모두 검사를 통과한다', () => {
  it.each(Object.keys(PRESETS))('%s', (code) => { expect(checkSpec(PRESETS[code].spec)).toEqual([]); });
});

describe('한국 고등 공통과목(kr_high_common)', () => {
  it('성취도 경계: 89.5 → 원점수 90 → A, 59.99 → 60 → D, 40 → E', () => {
    expect(run('kr_high_common', two(89.5, 89.5))).toEqual({ score: 90, passed: true, level: 'A' });
    expect(run('kr_high_common', two(59.99, 59.99))).toEqual({ score: 60, passed: true, level: 'D' });
    expect(run('kr_high_common', two(40, 40))).toEqual({ score: 40, passed: true, level: 'E' });
  });
  it('40% 미도달: 보장지도 전에는 I·미이수, 마치면 E·이수(원점수는 그대로 — 기재요령 예시 39/70 E)', () => {
    expect(run('kr_high_common', two(39, 39))).toEqual({ score: 39, passed: false, level: 'I' });
    expect(run('kr_high_common', two(39, 39, { support: { achievement: true } }))).toEqual({ score: 39, passed: true, level: 'E' });
  });
  it('과목 출석률 2/3: 정확히 2/3 은 이수, 미달은 추가학습을 마쳐야 이수(성취도는 학생이 받은 그대로)', () => {
    expect(run('kr_high_common', two(93, 93, { attendance: { rate: 32 / 48 } })).passed).toBe(true);
    expect(run('kr_high_common', two(93, 93, { attendance: { rate: 0.6 } }))).toEqual({ score: 93, passed: false, level: 'A' });
    expect(run('kr_high_common', two(93, 93, { attendance: { rate: 0.6 }, support: { attendance: true } })).passed).toBe(true);
  });
  it('출석 자료가 없으면 이수 여부는 null(통과로 접지 않음)', () => {
    expect(run('kr_high_common', { items: two(80, 80).items }).passed).toBeNull();
  });
});

describe('한국 고등 그 밖의 과목', () => {
  it('선택과목: 60 미만은 E 이고 40 기준 없음', () => {
    expect(run('kr_high_elective', two(30, 30))).toEqual({ score: 30, passed: true, level: 'E' });
  });
  it('교양(과목 P/F): P, 원점수 빈칸', () => {
    expect(run('kr_high_elective', two(70, 70, { course: { pass_fail: true } }))).toEqual({ score: null, passed: true, level: 'P' });
  });
  it('과학탐구실험: 80 A·60 B·40 C, 40 미만 보장지도 이수 시 C', () => {
    expect(run('kr_high_science_lab', two(79.5, 79.5)).level).toBe('A');
    expect(run('kr_high_science_lab', two(45, 45)).level).toBe('C');
    expect(run('kr_high_science_lab', two(30, 30)).level).toBe('I');
    expect(run('kr_high_science_lab', two(30, 30, { support: { achievement: true } })).level).toBe('C');
  });
  it('체육·예술: 80 A·60 B, 그 밖 C', () => {
    expect(run('kr_high_arts_pe', two(80, 80)).level).toBe('A');
    expect(run('kr_high_arts_pe', two(59, 59)).level).toBe('C');
  });
});

describe('한국 중학교', () => {
  it('기재요령 예시: 합계 92.57 → 원점수 93 → A, 74.33 → 74 → C. 이수 판정은 없음', () => {
    const r = run('kr_middle', { items: { a: { score: 92.57, max: 100, weight: 100 } } });
    expect(r).toEqual({ score: 93, passed: null, level: 'A' });
    expect(run('kr_middle', { items: { a: { score: 74.33, max: 100, weight: 100 } } }).level).toBe('C');
  });
  it('자유학기(과목 P/F): P, 원점수 빈칸', () => {
    expect(run('kr_middle', two(88, 88, { course: { pass_fail: true } }))).toEqual({ score: null, passed: null, level: 'P' });
  });
  it('체육·예술: A 80·B 60·C', () => {
    expect(run('kr_middle_arts_pe', two(65, 65)).level).toBe('B');
  });
});

describe('미국 ± 글자 성적(us_letter_plus_minus)', () => {
  it('경계: 96.5 → 97 A+, 92 A-, 89.5 → 90 A-, 60 D-, 59 F', () => {
    const at = (x: number) => run('us_letter_plus_minus', { items: { a: { score: x, max: 100, weight: 1 } } });
    expect(at(96.5).level).toBe('A+');
    expect(at(92).level).toBe('A-');
    expect(at(89.5).level).toBe('A-');
    expect(at(60)).toEqual({ score: 60, passed: true, level: 'D-' });
    expect(at(59)).toEqual({ score: 59, passed: false, level: 'F' });
  });
  it('학생 판정 F 는 성적 등급(P/F 아님), NP 는 P/F', () => {
    const base = { items: { a: { score: 50, max: 100, weight: 1 } } };
    expect(run('us_letter_plus_minus', { ...base, entry: { exists: true, level: 'F' } })).toEqual({ score: 50, passed: false, level: 'F' });
    expect(run('us_letter_plus_minus', { ...base, entry: { exists: true, level: 'NP' } })).toEqual({ score: null, passed: false, level: 'NP' });
  });
});

describe('모집단: 과목평균·표준편차·분포비율', () => {
  it('과목평균은 원점수 평균, 소수 첫째 자리(빈 모집단 null)', () => {
    expect(subjectMean([93, 74, 80])).toBe(82.3);
    expect(subjectMean([1, 2])).toBe(1.5);
    expect(subjectMean([null])).toBeNull();
    expect(populationStdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2);
  });
  it('분포비율은 소수 첫째 자리, 성취도 없는 학생은 분모에서 뺀다', () => {
    expect(levelDistribution(['A', 'a', 'B', null, ' '], ['A', 'B', 'C'])).toEqual({ A: 66.7, B: 33.3, C: 0 });
  });
});

describe('모집단: 석차·석차등급(기재요령 고등 별표 9)', () => {
  const people = (scores: number[]) => scores.map((total, i) => ({ key: `s${i + 1}`, total }));
  it('누적 인원 = 수강자수 × 누적비율 반올림: 178명 → 18·43·56·43·18', () => {
    const rows = people(Array.from({ length: 178 }, (_, i) => 1000 - i));
    const per = [1, 2, 3, 4, 5].map((g) => rankGrades(rows).filter((r) => r.grade === g).length);
    expect(per).toEqual([18, 43, 56, 43, 18]);
    expect(KR_GRADE5).toEqual([10, 34, 66, 90, 100]);
  });
  it('예 1: 96명 중 1등 동점 19명 → 중간석차 10, 10.42% → 모두 2등급(1등급 없음)', () => {
    const rows = people([...Array(19).fill(100), ...Array.from({ length: 77 }, (_, i) => 99 - i)]);
    const r = rankGrades(rows);
    expect(r.filter((x) => x.grade === 1)).toHaveLength(0);
    expect(r[0]).toEqual({ key: 's1', rank: 1, ties: 19, grade: 2 });
    expect(rankLabel(r[0])).toBe('1(19)');
  });
  it('예 2: 120명 중 1등 1명, 2등 동점 15명 → 중간석차 9, 7.5% → 16명 모두 1등급(인원 초과 허용)', () => {
    const rows = people([200, ...Array(15).fill(150), ...Array.from({ length: 104 }, (_, i) => 149 - i)]);
    const r = rankGrades(rows);
    expect(r.filter((x) => x.grade === 1)).toHaveLength(16);
    expect(r[1]).toMatchObject({ rank: 2, ties: 15, grade: 1 });
  });
  it('등급 안에서 생긴 동점에는 중간석차를 쓰지 않는다', () => {
    const rows = people([100, 90, 90, ...Array.from({ length: 97 }, (_, i) => 80 - i * 0.1)]);
    expect(rankGrades(rows).slice(0, 3).map((x) => x.grade)).toEqual([1, 1, 1]);
  });
  it('동점자 처리 규정(tiebreak) 먼저, 합계는 소수 둘째 자리로 비교', () => {
    const r = rankGrades([{ key: 'a', total: 90.004, tiebreak: [50] }, { key: 'b', total: 90.001, tiebreak: [60] }, { key: 'c', total: 80 }], { minCount: 0 });
    expect(r.map((x) => x.rank)).toEqual([2, 1, 3]);
  });
  it('수강자 5명 이하면 석차는 내고 등급은 내지 않는다, 합계 없는 학생은 빠진다', () => {
    const r = rankGrades([...people([90, 80, 70, 60]), { key: 'x', total: null }]);
    expect(r.map((x) => x.grade)).toEqual([null, null, null, null, null]);
    expect(r.map((x) => x.rank)).toEqual([1, 2, 3, 4, null]);
  });
});

describe('모집단: 평점 평균(GPA)', () => {
  it('학점 가중, P·NP 는 빼고 F 는 0 으로 넣는다', () => {
    const c = [{ level: 'A', credits: 1 }, { level: 'B+', credits: 0.5 }, { level: 'F', credits: 0.5 }, { level: 'P', credits: 1 }];
    expect(gpa(c, US_POINTS_PLUS_MINUS)).toBe(roundTo((4 + 3.3 * 0.5) / 2));
  });
  it('가중(Honors +0.5·AP +1.0)은 학교가 넘기고, F 에는 더하지 않는다', () => {
    const c = [{ level: 'A', credits: 1, weight: 1 }, { level: 'B', credits: 1, weight: 0.5 }, { level: 'F', credits: 1, weight: 1 }];
    expect(gpa(c, US_POINTS_PLUS_MINUS)).toBe(roundTo((5 + 3.5 + 0) / 3));
    expect(gpa([{ level: 'P', credits: 1 }], US_POINTS_PLUS_MINUS)).toBeNull();
  });
});

function roundTo(x: number) { return Math.round(x * 100) / 100; }

describe('척도 견본과 계산식 견본은 같은 구간이다(Codex #166 P1: 마감은 척도 판 band_for 로 등급을 굳힌다)', () => {
  // 짝: 계산식 견본 → 척도 견본. 보충 이수 없음·P/F 아님일 때 원점수 0~100 모두 같은 등급이어야 한다
  const PAIRS: [string, string][] = [
    ['kr_high_common', 'kr_achievement'], ['kr_high_elective', 'kr_elective'], ['kr_high_science_lab', 'kr_science_lab'],
    ['kr_high_arts_pe', 'kr_arts_pe'], ['kr_middle', 'kr_elective'], ['kr_middle_arts_pe', 'kr_arts_pe'],
    ['us_letter_plus_minus', 'us_plus_minus'], ['us_letter_pf', 'us_letter'],
  ];
  it.each(PAIRS)('%s ↔ %s', async (calc, scale) => {
    const { SCALE_PRESETS } = await import('@/lib/grading');
    const bands = SCALE_PRESETS[scale].bands;
    const bandFor = (x: number) => bands.filter((b) => b.min != null && x >= b.min).sort((a, b) => b.min! - a.min!)[0]?.code ?? null;
    for (let x = 0; x <= 100; x++) {
      expect([x, run(calc, { items: { a: { score: x, max: 100, weight: 100 } }, attendance: { rate: 1 } }).level]).toEqual([x, bandFor(x)]);
    }
  });
});
