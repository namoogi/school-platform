/**
 * ADR 0040: 계산식 판의 식. 학교 AI·관리자가 JSON 으로 쓰고, 서버는 여기 있는 연산만 실행한다(코드 실행 없음).
 * DB·서버 의존 없음(브라우저 미리 계산에도 같은 함수를 쓴다).
 *
 * 식(Expr)
 * - 값: 숫자 · 참거짓 · 글자 · null
 * - 변수: { "var": "items.essay.score" }  (아래 입력 모양의 경로)
 * - 연산: { "op": 이름, "args": [식…] } 과 몇 가지 전용 꼴(round·weighted_score·count_levels·missing)
 *
 * 입력(학생 한 명 × 수업 하나)
 * - items: { 평가항목코드: { score, weight, max, submitted } }
 * - attendance: { rate(0~1), present_days, absent_days }
 * - competencies: [역량 수준 코드…]
 * - credits: 수업 학점
 *
 * - course: { pass_fail } (과목 속성으로 P/F 인지)
 * - entry: { exists, level } (이번 평가 입력 행이 있는지, 그 행에 적힌 성취도. 예 'P'·'F'. A~E 과목 안에 P 학생이 섞일 수 있다)
 * - prior: { level } (이미 저장된 기록의 성취도. 드리미는 입력 행이 없을 때만 이 값을 이어받는다 — 포털 정정 2026-11-27 ②③)
 *
 * 빈 값 규칙(3값): null 은 '자료 없음'이고 0점·미달과 다르다(드리미포털 회신 2026-11-27, 사고에서 나온 규칙).
 * - 산술·round·band 에 null 이 들어가면 null
 * - 비교에 null 이 들어가면 null(미달 false 가 아니다)
 * - and: 거짓이 하나라도 있으면 false, 아니고 null 이 있으면 null / or: 참이 있으면 true, 아니고 null 이 있으면 null / not(null) = null
 * - if: 조건이 null 이면 결과도 null. 자료 없음을 통과·미달로 접으려면 coalesce 로 직접 적는다
 */
export type Expr =
  | number | boolean | string | null
  | { var: string }
  | { op: string; args?: Expr[]; mode?: string; digits?: number; normalize?: boolean; in?: string[]; bands?: [number, string][]; else?: string };

export type CalcSpec = {
  /** 이름 붙인 중간값. 적힌 순서대로 계산하고, 뒤 식에서 { "var": "let.이름" } 으로 쓴다 */
  lets?: Record<string, Expr>;
  outputs: { score?: Expr; passed?: Expr; level?: Expr };
};

export type ItemInput = { score: number | null; weight: number; max?: number | null; submitted?: boolean };
export type CalcInput = {
  items?: Record<string, ItemInput>;
  attendance?: { rate: number | null; present_days?: number; absent_days?: number };
  competencies?: string[];
  credits?: number;
  course?: { pass_fail?: boolean };
  entry?: { exists?: boolean; level?: string | null };
  prior?: { level?: string | null };
};
export type CalcOutput = { score: number | null; passed: boolean | null; level: string | null };

const NUM_OPS = new Set(['+', '-', '*', '/', 'min', 'max', 'sum', 'avg', 'abs']);
const CMP_OPS = new Set(['>=', '>', '<=', '<', '==', '!=']);
const BOOL_OPS = new Set(['and', 'or', 'not']);
const SPECIAL = new Set(['if', 'round', 'weighted_score', 'count_levels', 'missing', 'count', 'coalesce', 'band']);
export const OPS = [...NUM_OPS, ...CMP_OPS, ...BOOL_OPS, ...SPECIAL];
const ROUND_MODES = new Set(['half_up', 'half_even', 'floor', 'ceil', 'trunc']);
const VAR_RE = /^(items\.[a-z0-9][a-z0-9_.-]{0,40}\.(score|weight|max|submitted)|attendance\.(rate|present_days|absent_days)|competencies\.(count)|credits|course\.pass_fail|entry\.(exists|level)|prior\.level|let\.[a-z][a-z0-9_]{0,30})$/;
const MAX_NODES = 400;
const MAX_DEPTH = 24;

// ── 검사 ─────────────────────────────────────────────
export type Issue = { path: string; message: string };

/** 식 모양 검사. 저장 전에 반드시 통과해야 한다. knownItems 를 주면 없는 평가 항목 참조를 알려 준다 */
export function checkSpec(spec: unknown, knownItems?: string[]): Issue[] {
  const issues: Issue[] = [];
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return [{ path: '', message: '계산식은 { "outputs": {…} } 꼴입니다.' }];
  const s = spec as Record<string, unknown>;
  for (const k of Object.keys(s)) if (k !== 'lets' && k !== 'outputs') issues.push({ path: k, message: '알 수 없는 칸입니다(lets·outputs만).' });
  let nodes = 0;
  const lets = new Set<string>();
  const walk = (e: unknown, path: string, depth: number) => {
    if (++nodes > MAX_NODES) { if (nodes === MAX_NODES + 1) issues.push({ path, message: `식이 너무 큽니다(마디 ${MAX_NODES}개 이하).` }); return; }
    if (depth > MAX_DEPTH) { issues.push({ path, message: `식이 너무 깊습니다(${MAX_DEPTH}단 이하).` }); return; }
    if (e === null || typeof e === 'number' || typeof e === 'boolean') { if (typeof e === 'number' && !Number.isFinite(e)) issues.push({ path, message: '숫자가 아닙니다.' }); return; }
    if (typeof e === 'string') { if (e.length > 40) issues.push({ path, message: '글자 값은 40자 이하입니다.' }); return; }
    if (typeof e !== 'object' || Array.isArray(e)) { issues.push({ path, message: '식 꼴이 아닙니다.' }); return; }
    const o = e as Record<string, unknown>;
    if ('var' in o) {
      const v = o.var;
      if (typeof v !== 'string' || !VAR_RE.test(v)) { issues.push({ path, message: `쓸 수 없는 변수입니다: ${String(v).slice(0, 60)}` }); return; }
      if (v.startsWith('let.') && !lets.has(v.slice(4))) issues.push({ path, message: `앞에서 정하지 않은 중간값입니다: ${v}` });
      if (knownItems && v.startsWith('items.')) {
        const code = v.split('.').slice(1, -1).join('.');
        if (!knownItems.includes(code)) issues.push({ path, message: `수업에 없는 평가 항목입니다: ${code}` });
      }
      return;
    }
    const op = o.op;
    if (typeof op !== 'string' || !OPS.includes(op)) { issues.push({ path, message: `쓸 수 없는 연산입니다: ${String(op).slice(0, 30)}` }); return; }
    const args = o.args;
    if (args !== undefined && !Array.isArray(args)) { issues.push({ path, message: 'args 는 목록입니다.' }); return; }
    const n = (args as unknown[] | undefined)?.length ?? 0;
    const need = (min: number, max = min) => { if (n < min || n > max) issues.push({ path, message: `${op} 는 값 ${min === max ? min : `${min}~${max}`}개가 필요합니다.` }); };
    if (CMP_OPS.has(op) || op === '/' || op === '-') need(2);
    else if (op === 'not' || op === 'abs' || op === 'missing') need(1);
    else if (op === 'if') need(3);
    else if (op === 'round') { need(1); if (o.digits !== undefined && (!Number.isInteger(o.digits) || (o.digits as number) < 0 || (o.digits as number) > 4)) issues.push({ path, message: 'digits 는 0~4 정수입니다.' }); if (o.mode !== undefined && !ROUND_MODES.has(String(o.mode))) issues.push({ path, message: `mode 는 ${[...ROUND_MODES].join('·')} 중 하나입니다.` }); }
    else if (op === 'weighted_score') need(0);
    else if (op === 'band') {
      need(1);
      const b = o.bands;
      if (!Array.isArray(b) || !b.length || b.length > 20 || b.some((x) => !Array.isArray(x) || x.length !== 2 || typeof x[0] !== 'number' || typeof x[1] !== 'string' || !x[1] || x[1].length > 8)) issues.push({ path, message: 'band 에는 bands: [[하한 숫자, "등급"]…] 가 필요합니다(큰 하한부터).' });
      else if (b.some((x, i) => i > 0 && (x[0] as number) >= (b[i - 1][0] as number))) issues.push({ path, message: 'bands 는 하한이 큰 것부터 적습니다.' });
      if (o.else !== undefined && (typeof o.else !== 'string' || !o.else || o.else.length > 8)) issues.push({ path, message: 'else 등급은 1~8자 글자입니다.' });
    }
    else if (op === 'count_levels') { need(0); if (!Array.isArray(o.in) || !o.in.length || o.in.some((x) => typeof x !== 'string')) issues.push({ path, message: 'count_levels 에는 in: [수준 코드…] 가 필요합니다.' }); }
    else if (n < 1) issues.push({ path, message: `${op} 에는 값이 하나 이상 필요합니다.` });
    (args as unknown[] | undefined)?.forEach((a, i) => walk(a, `${path}.args[${i}]`, depth + 1));
  };
  if (s.lets !== undefined) {
    if (!s.lets || typeof s.lets !== 'object' || Array.isArray(s.lets)) issues.push({ path: 'lets', message: 'lets 는 {이름: 식} 꼴입니다.' });
    else for (const [name, e] of Object.entries(s.lets as Record<string, unknown>)) {
      if (!/^[a-z][a-z0-9_]{0,30}$/.test(name)) issues.push({ path: `lets.${name}`, message: '중간값 이름은 영문 소문자로 시작합니다.' });
      walk(e, `lets.${name}`, 0);
      lets.add(name);
    }
  }
  const out = s.outputs as Record<string, unknown> | undefined;
  if (!out || typeof out !== 'object' || Array.isArray(out)) issues.push({ path: 'outputs', message: 'outputs 가 필요합니다.' });
  else {
    for (const k of Object.keys(out)) if (!['score', 'passed', 'level'].includes(k)) issues.push({ path: `outputs.${k}`, message: '결과 칸은 score·passed·level 만 씁니다.' });
    if (!('score' in out) && !('passed' in out)) issues.push({ path: 'outputs', message: 'score 나 passed 중 하나는 있어야 합니다.' });
    for (const [k, e] of Object.entries(out)) walk(e, `outputs.${k}`, 0);
  }
  return issues;
}

// ── 계산 ─────────────────────────────────────────────
type V = number | boolean | string | null;
const num = (v: V): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const truthy = (v: V) => v === true || (typeof v === 'number' && v !== 0);
/** 3값: true · false · null(자료 없음) */
const tri = (v: V): boolean | null => (v === null ? null : truthy(v));

export function roundBy(x: number, digits = 0, mode = 'half_up'): number {
  const f = 10 ** digits;
  // 부동소수 오차(예: 1.005)를 먼저 걷어낸다
  const y = Number((x * f).toPrecision(12));
  let r: number;
  switch (mode) {
    case 'floor': r = Math.floor(y); break;
    case 'ceil': r = Math.ceil(y); break;
    case 'trunc': r = Math.trunc(y); break;
    case 'half_even': { const fl = Math.floor(y); const d = y - fl; r = d > 0.5 ? fl + 1 : d < 0.5 ? fl : (fl % 2 === 0 ? fl : fl + 1); break; }
    default: r = Math.sign(y) * Math.round(Math.abs(y));
  }
  return r / f;
}

/** 평가 항목 가중 평균(점수는 만점 기준 100점으로 환산). 점수가 있는 항목만 쓰고 normalize 면 가중치 합으로 나눈다 */
export function weightedScore(items: Record<string, ItemInput> = {}, normalize = true): number | null {
  let sum = 0; let wsum = 0; let any = false;
  for (const it of Object.values(items)) {
    if (it.score == null || !(it.weight > 0)) continue;
    // 만점이 0 이하인 영역은 합에서 빼지만 '점수 있음'으로는 센다(드리미 규칙, 그 비율만큼 총점이 낮아짐)
    if (it.max != null && it.max <= 0) { any = true; continue; }
    const pct = it.max ? (it.score / it.max) * 100 : it.score;
    sum += pct * it.weight; wsum += it.weight; any = true;
  }
  if (!any) return null;
  return normalize ? sum / wsum : sum / 100;
}

/**
 * 성취도 글자는 읽을 때 정리한다: 앞뒤 공백을 빼고 대문자로, 빈 글자는 자료 없음(null).
 * 입력 쪽에서도 정리하지만 이미 저장된 옛 값(' p ' 등)이 계승 경로로 들어와도 같은 판정을 받게 한다
 * (드리미포털 회신: '문이 없으면 옆문으로 들어온다', 빈 성취도가 잣대를 조용히 지나간 사고 ④)
 */
export function levelOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().toUpperCase();
  return t ? t : null;
}

function getVar(path: string, input: CalcInput, lets: Record<string, V>): V {
  if (path.startsWith('let.')) return lets[path.slice(4)] ?? null;
  if (path === 'credits') return input.credits ?? null;
  if (path === 'course.pass_fail') return input.course?.pass_fail ?? false;
  if (path === 'entry.exists') return input.entry?.exists ?? false;
  if (path === 'entry.level') return levelOf(input.entry?.level);
  if (path === 'prior.level') return levelOf(input.prior?.level);
  if (path === 'competencies.count') return input.competencies?.length ?? 0;
  if (path.startsWith('attendance.')) {
    const a = input.attendance as Record<string, number | null> | undefined;
    return a?.[path.slice(11)] ?? null;
  }
  if (path.startsWith('items.')) {
    const parts = path.split('.');
    const field = parts.pop() as keyof ItemInput;
    const it = input.items?.[parts.slice(1).join('.')];
    if (!it) return field === 'submitted' ? false : null;
    if (field === 'submitted') return it.submitted ?? it.score != null;
    return (it[field] as number | null | undefined) ?? null;
  }
  return null;
}

export function evaluate(spec: CalcSpec, input: CalcInput): CalcOutput {
  const lets: Record<string, V> = {};
  const ev = (e: Expr): V => {
    if (e === null || typeof e !== 'object') return e as V;
    if ('var' in e) return getVar(e.var, input, lets);
    const a = (e.args ?? []) as Expr[];
    const vals = () => a.map(ev);
    switch (e.op) {
      case '+': case '*': case 'sum': {
        const xs = vals().map(num);
        if (e.op === 'sum') { const ok = xs.filter((x): x is number => x != null); return ok.length ? ok.reduce((p, c) => p + c, 0) : null; }
        if (xs.some((x) => x == null)) return null;
        return e.op === '*' ? xs.reduce((p, c) => p! * c!, 1)! : xs.reduce((p, c) => p! + c!, 0)!;
      }
      case '-': { const [x, y] = vals().map(num); return x == null || y == null ? null : x - y; }
      case '/': { const [x, y] = vals().map(num); return x == null || y == null || y === 0 ? null : x / y; }
      case 'abs': { const x = num(ev(a[0])); return x == null ? null : Math.abs(x); }
      case 'min': case 'max': { const xs = vals().map(num).filter((x): x is number => x != null); return xs.length ? (e.op === 'min' ? Math.min(...xs) : Math.max(...xs)) : null; }
      case 'avg': { const xs = vals().map(num).filter((x): x is number => x != null); return xs.length ? xs.reduce((p, c) => p + c, 0) / xs.length : null; }
      case 'count': return vals().filter((v) => v !== null && v !== false).length;
      case '>=': case '>': case '<=': case '<': {
        const [x, y] = vals().map(num); if (x == null || y == null) return null;
        return e.op === '>=' ? x >= y : e.op === '>' ? x > y : e.op === '<=' ? x <= y : x < y;
      }
      case '==': case '!=': { const [x, y] = vals(); if (x == null || y == null) return null; return e.op === '==' ? x === y : x !== y; }
      case 'and': { const xs = a.map((x) => tri(ev(x))); return xs.includes(false) ? false : xs.includes(null) ? null : true; }
      case 'or': { const xs = a.map((x) => tri(ev(x))); return xs.includes(true) ? true : xs.includes(null) ? null : false; }
      case 'not': { const x = tri(ev(a[0])); return x === null ? null : !x; }
      case 'if': { const c = tri(ev(a[0])); return c === null ? null : c ? ev(a[1]) : ev(a[2]); }
      case 'coalesce': { for (const x of a) { const v = ev(x); if (v !== null) return v; } return null; }
      case 'band': {
        const x = num(ev(a[0])); if (x == null) return null;
        for (const [min, label] of e.bands ?? []) if (x >= min) return label;
        return e.else ?? null;
      }
      case 'missing': return ev(a[0]) == null;
      case 'round': { const x = num(ev(a[0])); return x == null ? null : roundBy(x, e.digits ?? 0, e.mode ?? 'half_up'); }
      case 'weighted_score': return weightedScore(input.items, e.normalize !== false);
      case 'count_levels': { const want = new Set(e.in ?? []); return (input.competencies ?? []).filter((c) => want.has(c)).length; }
      default: return null;
    }
  };
  for (const [name, e] of Object.entries(spec.lets ?? {})) lets[name] = ev(e);
  const score = spec.outputs.score === undefined ? null : num(ev(spec.outputs.score));
  const passedV = spec.outputs.passed === undefined ? null : ev(spec.outputs.passed);
  const levelV = spec.outputs.level === undefined ? null : ev(spec.outputs.level);
  return { score, passed: tri(passedV), level: levelV == null ? null : String(levelV) };
}

// ── 일반형 견본(대안학교에 흔한 방식). 학교가 골라 고쳐 쓴다 ──
export const PRESETS: Record<string, { spec: CalcSpec; note: string }> = {
  weighted_average: {
    note: '평가 항목 가중 평균(만점 환산, 가중치 합으로 나눔) → 소수 첫째 자리 반올림, 60점 이상 + 출석 2/3 이상이면 이수',
    spec: {
      lets: { avg: { op: 'round', args: [{ op: 'weighted_score' }], digits: 1, mode: 'half_up' } },
      outputs: {
        score: { var: 'let.avg' },
        passed: { op: 'and', args: [{ op: '>=', args: [{ var: 'let.avg' }, 60] }, { op: '>=', args: [{ var: 'attendance.rate' }, 0.6667] }] },
      },
    },
  },
  competency_mastery: {
    note: '역량 도달 개수: 도달(M)·넘어섬(E) 수준이 5개 이상이면 이수',
    spec: {
      lets: { reached: { op: 'count_levels', in: ['M', 'E'] } },
      outputs: { score: { var: 'let.reached' }, passed: { op: '>=', args: [{ var: 'let.reached' }, 5] } },
    },
  },
  pass_fail_project: {
    note: '통과/미통과(프로젝트): 출석 2/3 이상 + 산출물 제출 + 발표 루브릭 3점(4점 만점) 이상이면 P',
    spec: {
      lets: { ok: { op: 'and', args: [
        { op: '>=', args: [{ var: 'attendance.rate' }, 0.6667] },
        { var: 'items.product.submitted' },
        { op: '>=', args: [{ var: 'items.presentation.score' }, 3] },
      ] } },
      outputs: { passed: { var: 'let.ok' }, level: { op: 'if', args: [{ var: 'let.ok' }, 'P', 'F'] } },
    },
  },
  rounded_twice_bands: {
    note: '드리미포털 방식(회신·정정 2026-11-27): 영역 합 Σ(점수÷만점×비율)을 정규화하지 않고 소수 2자리 → 정수(원점수) 반올림 → 원점수로 성취도 A~E. 학생 판정 = 입력 행의 성취도, 입력 행이 없을 때만 이전 기록의 성취도(계승). P/F 여부 = 과목 속성 또는 학생 판정 P·F. P/F면 원점수만 비우고 성취도는 남긴다(과목만 P/F면 A~E + 원점수 빈칸)',
    spec: {
      lets: {
        total: { op: 'round', args: [{ op: 'weighted_score', normalize: false }], digits: 2 },
        raw: { op: 'round', args: [{ var: 'let.total' }], digits: 0 },
        manual: { op: 'if', args: [{ var: 'entry.exists' }, { var: 'entry.level' }, { var: 'prior.level' }] },
        manual_pf: { op: 'coalesce', args: [{ op: 'or', args: [
          { op: '==', args: [{ var: 'let.manual' }, 'P'] }, { op: '==', args: [{ var: 'let.manual' }, 'F'] },
        ] }, false] },
        is_pf: { op: 'or', args: [{ var: 'course.pass_fail' }, { var: 'let.manual_pf' }] },
      },
      outputs: {
        score: { op: 'if', args: [{ var: 'let.is_pf' }, null, { var: 'let.raw' }] },
        level: { op: 'if', args: [{ var: 'let.manual_pf' }, { var: 'let.manual' },
          { op: 'band', args: [{ var: 'let.raw' }], bands: [[90, 'A'], [80, 'B'], [70, 'C'], [60, 'D']], else: 'E' }] },
      },
    },
  },
  us_letter_pf: {
    note: '미국식 글자 성적 A·B·C·D·F(F는 한국식 E와 같은 맨 아래 등급). 가중 평균 → 정수 반올림 → 90/80/70/60, 그 밖 F. F는 성적 등급이므로 학생 판정 F를 P/F로 읽지 않는다. P/F는 과목 속성이거나 학생 판정이 P·NP일 때만',
    spec: {
      lets: {
        raw: { op: 'round', args: [{ op: 'weighted_score' }], digits: 0 },
        manual: { op: 'if', args: [{ var: 'entry.exists' }, { var: 'entry.level' }, { var: 'prior.level' }] },
        manual_pf: { op: 'coalesce', args: [{ op: 'or', args: [
          { op: '==', args: [{ var: 'let.manual' }, 'P'] }, { op: '==', args: [{ var: 'let.manual' }, 'NP'] },
        ] }, false] },
        is_pf: { op: 'or', args: [{ var: 'course.pass_fail' }, { var: 'let.manual_pf' }] },
        letter: { op: 'band', args: [{ var: 'let.raw' }], bands: [[90, 'A'], [80, 'B'], [70, 'C'], [60, 'D']], else: 'F' },
      },
      outputs: {
        score: { op: 'if', args: [{ var: 'let.is_pf' }, null, { var: 'let.raw' }] },
        level: { op: 'if', args: [{ var: 'let.manual_pf' }, { var: 'let.manual' },
          { op: 'if', args: [{ var: 'course.pass_fail' }, { op: 'if', args: [{ op: '>=', args: [{ var: 'let.raw' }, 60] }, 'P', 'NP'] }, { var: 'let.letter' }] }] },
        passed: { op: 'if', args: [{ var: 'let.manual_pf' }, { op: '==', args: [{ var: 'let.manual' }, 'P'] }, { op: '>=', args: [{ var: 'let.raw' }, 60] }] },
      },
    },
  },
  peer_teacher_mix: {
    note: '동료평가 20% + 교사평가 80%, 둘 중 하나라도 비면 계산하지 않음(null)',
    spec: {
      lets: { mix: { op: '+', args: [{ op: '*', args: [{ var: 'items.peer.score' }, 0.2] }, { op: '*', args: [{ var: 'items.teacher.score' }, 0.8] }] } },
      outputs: { score: { op: 'round', args: [{ var: 'let.mix' }], digits: 1 }, passed: { op: '>=', args: [{ var: 'let.mix' }, 60] } },
    },
  },
};
