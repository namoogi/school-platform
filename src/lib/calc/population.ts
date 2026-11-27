/**
 * ADR 0041: 수업 하나의 수강자 전체를 보고 정하는 값(모집단 계산). 계산식 판(expr.ts)은 학생 한 명 × 수업 하나이고,
 * 석차·석차등급·과목평균·분포비율·평점 평균처럼 다른 학생을 함께 봐야 하는 값은 여기서 계산한다.
 * DB·서버 의존 없음. 모집단 열쇠는 수업 id(ADR 0004)이고, 누구를 넣을지(집계 참여)는 부르는 쪽이 정한다.
 *
 * 근거
 * - 한국: 2026 학교생활기록부 기재요령(고등학교) 별표 9 — 반올림·석차·석차등급·중간석차 (docs/research/kr-us-grading-2026-11.md)
 * - 미국: 학교·교육구마다 다르다. 평점표(points)와 가중(weight)은 학교 척도 판에서 받는다(박지 않음)
 */
import { roundBy } from './expr';

const half = (x: number, d: number) => roundBy(x, d, 'half_up');

/** 과목평균: 원점수(정수)의 평균, 소수 둘째 자리에서 반올림해 첫째 자리까지. 빈 모집단은 null(0 아님) */
export function subjectMean(raws: (number | null)[], digits = 1): number | null {
  const xs = raws.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return xs.length ? half(xs.reduce((p, c) => p + c, 0) / xs.length, digits) : null;
}

/** 모표준편차(n 으로 나눔). 기재요령 고등 성적일람표에는 표시하지 않지만 학교 규정·미국 보고에 쓰일 수 있다 */
export function populationStdev(xs0: (number | null)[], digits = 1): number | null {
  const xs = xs0.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  if (!xs.length) return null;
  const m = xs.reduce((p, c) => p + c, 0) / xs.length;
  return half(Math.sqrt(xs.reduce((p, c) => p + (c - m) ** 2, 0) / xs.length), digits);
}

/** 성취도별 분포비율(%): 소수 둘째 자리에서 반올림. 성취도가 없는 학생은 분모에서 뺀다. order 에 있는 등급만 낸다 */
export function levelDistribution(levels: (string | null)[], order: string[], digits = 1): Record<string, number> | null {
  const xs = levels.filter((l): l is string => typeof l === 'string' && l.trim() !== '').map((l) => l.trim().toUpperCase());
  if (!xs.length) return null;
  const out: Record<string, number> = {};
  for (const o of order) out[o] = half((xs.filter((x) => x === o).length / xs.length) * 100, digits);
  return out;
}

export type RankInput = { key: string; total: number | null; tiebreak?: number[] };
export type RankResult = { key: string; rank: number | null; ties: number | null; grade: number | null };

/** 한국 고등 5등급(누적 %). 학교가 다른 비율(예: 9등급 4·11·23·40·60·77·89·96·100)을 넘길 수 있다 */
export const KR_GRADE5 = [10, 34, 66, 90, 100];

/**
 * 석차와 석차등급(기재요령 고등 별표 9 라목 4)~6))
 * 1. 석차: 환산 점수 합계(소수 둘째 자리) 높은 순. 학교 동점자 처리 규정(tiebreak, 앞 칸부터 높은 순)을 먼저 쓰고,
 *    그래도 같으면 동점자 모두에게 가장 좋은 석차를 주고 동점자 수(ties)를 함께 낸다.
 * 2. 등급별 누적 인원 = round(수강자수 × 누적비율) (반올림). i 번째 자리는 누적 인원이 i 이상인 첫 등급.
 * 3. 동점자 무리가 등급 경계에 걸치면 중간석차백분율 = (석차 + (동점자 수 − 1)/2) / 수강자수 × 100 으로
 *    그 무리 전체에 한 등급을 준다. 등급 안에서 생긴 동점에는 쓰지 않는다.
 * - 합계가 없는 학생(null)은 석차·등급 없음이고 수강자수에서도 뺀다. 수강자수(미이수 포함)를 달리 세려면 부르는 쪽이 고른다.
 * - minCount 이하이면 등급을 내지 않는다(기재요령: 수강자 5명 이하면 '석차등급' 또는 '·' 표기). 기본 5.
 */
export function rankGrades(rows: RankInput[], opts: { cumulative?: number[]; minCount?: number } = {}): RankResult[] {
  const cum = opts.cumulative ?? KR_GRADE5;
  const minCount = opts.minCount ?? 5;
  const scored = rows.filter((r) => typeof r.total === 'number' && Number.isFinite(r.total));
  const n = scored.length;
  const cmp = (a: RankInput, b: RankInput) => {
    const d = half(b.total!, 2) - half(a.total!, 2);
    if (d !== 0) return d;
    const ta = a.tiebreak ?? []; const tb = b.tiebreak ?? [];
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
      const x = ta[i]; const y = tb[i];
      if (x == null && y == null) continue;
      if (x == null) return 1; // 동점자 처리 값이 없는 쪽이 뒤
      if (y == null) return -1;
      if (x !== y) return y - x;
    }
    return 0;
  };
  const sorted = [...scored].sort(cmp);
  const counts = cum.map((p) => half((n * p) / 100, 0));
  const gradeAt = (pos: number) => { const g = counts.findIndex((c) => pos <= c); return g < 0 ? cum.length : g + 1; };
  const out = new Map<string, RankResult>();
  for (let i = 0; i < sorted.length;) {
    let j = i + 1;
    while (j < sorted.length && cmp(sorted[i], sorted[j]) === 0) j++;
    const rank = i + 1; const ties = j - i;
    let grade: number | null = null;
    if (n > minCount) {
      const first = gradeAt(rank); const last = gradeAt(rank + ties - 1);
      if (first === last) grade = first;
      else {
        const mid = ((rank + (ties - 1) / 2) / n) * 100;
        const g = cum.findIndex((p) => mid <= p + 1e-9);
        grade = g < 0 ? cum.length : g + 1;
      }
    }
    for (let k = i; k < j; k++) out.set(sorted[k].key, { key: sorted[k].key, rank, ties, grade });
    i = j;
  }
  return rows.map((r) => out.get(r.key) ?? { key: r.key, rank: null, ties: null, grade: null });
}

/** 석차 표기: '3(2)' = 3등, 동점자 2명. 동점자가 없으면 숫자만 */
export const rankLabel = (r: RankResult) => (r.rank == null ? null : r.ties && r.ties > 1 ? `${r.rank}(${r.ties})` : String(r.rank));

export type GpaCourse = { level: string | null; credits: number; weight?: number };

/**
 * 평점 평균(GPA, 미국식 학점 가중): Σ(평점 + 가중) × 학점 ÷ Σ 학점.
 * - points: 학교 척도 판의 등급 → 평점(예: A 4.0, A- 3.7 … F 0). 표에 없는 등급(P·NP·I·W 등)은 평균에서 뺀다.
 * - weight: 과목 가중(예: Honors +0.5, AP +1.0). 학교·교육구마다 다르므로 부르는 쪽이 넘긴다. 평점 0(F)에는 더하지 않는다.
 * - 학점 0·음수는 뺀다. 들어간 과목이 없으면 null.
 */
export function gpa(courses: GpaCourse[], points: Record<string, number>, opts: { digits?: number; mode?: string; weightFailing?: boolean } = {}): number | null {
  let s = 0; let c = 0;
  for (const x of courses) {
    const lv = typeof x.level === 'string' ? x.level.trim().toUpperCase() : '';
    if (!(lv in points) || !(x.credits > 0)) continue;
    const base = points[lv];
    const w = base > 0 || opts.weightFailing ? (x.weight ?? 0) : 0;
    s += (base + w) * x.credits; c += x.credits;
  }
  return c > 0 ? roundBy(s / c, opts.digits ?? 2, opts.mode ?? 'half_up') : null;
}

/** 흔히 쓰는 미국 4.0 평점표(College Board BigFuture 표와 같은 값). 학교가 고쳐 쓴다 */
export const US_POINTS_PLUS_MINUS: Record<string, number> = {
  'A+': 4.0, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7, 'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, 'D-': 0.7, F: 0,
};
