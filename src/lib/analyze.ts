import crypto from 'node:crypto';

/**
 * 규칙 기반 분석기: 학사 기간과 평가 기간의 관계를 추정한다.
 * AI 연결이 없을 때의 기본 분석기이며, 추정마다 파일·행 근거를 남긴다.
 */

export const ANALYZER = 'rule-based/period-structure@1';

export type SourceForAnalysis = {
  id: string;
  name: string;
  sha256: string;
  rows: { row_number: number; location?: string | null; data: Record<string, string> }[];
};

export type PeriodValue = {
  periods: { id: string; label: string; assessments: string[] }[];
};

export type Evidence = {
  file_id: string;
  file_name: string;
  row_number: number;
  /** 사람이 읽는 위치 (예: 시트 ‘학사력’ 3행, 표 2 · 3행, 2쪽 · 5줄). 없으면 row_number 행 */
  location?: string;
  claim: string;
  cells: Record<string, string>;
};

export type Issue = { kind: string; message: string; evidence?: Evidence };

export type Analysis = {
  proposal: PeriodValue;
  evidence: Evidence[];
  issues: Issue[];
  prompt: string;
  fingerprint: string;
  usedFiles: string[];
};

const PERIOD_ID = ['period_id', 'period', '기간id', '기간_id', 'term_id'];
const PERIOD_LABEL = ['period_label', 'label', '기간명', '기간', 'term_label', 'name'];
const ASSESS_LABEL = ['assessment_label', 'assessment', '평가', '평가명', '평가기간'];
const ASSESS_PARENT = ['parent_period', 'parent', 'period_id', '소속기간', '상위기간'];

function pick(headers: string[], aliases: string[]): string | undefined {
  const lower = headers.map((h) => h.toLowerCase());
  for (const a of aliases) {
    const i = lower.indexOf(a);
    if (i >= 0) return headers[i];
  }
  return undefined;
}

type Role =
  | { kind: 'calendar'; idCol: string; labelCol: string }
  | { kind: 'assessments'; labelCol: string; parentCol: string }
  | { kind: 'unknown' };

export function classify(headers: string[]): Role {
  const aLabel = pick(headers, ASSESS_LABEL);
  const aParent = pick(headers, ASSESS_PARENT);
  if (aLabel && aParent) return { kind: 'assessments', labelCol: aLabel, parentCol: aParent };
  const pId = pick(headers, PERIOD_ID);
  const pLabel = pick(headers, PERIOD_LABEL.filter((x) => x !== pId?.toLowerCase()));
  if (pId && pLabel && pId !== pLabel) return { kind: 'calendar', idCol: pId, labelCol: pLabel };
  return { kind: 'unknown' };
}

export function analyzePeriods(sources: SourceForAnalysis[]): Analysis | null {
  const evidence: Evidence[] = [];
  const issues: Issue[] = [];
  const periods = new Map<string, { id: string; label: string; assessments: string[] }>();
  const pendingAssessments: { label: string; parent: string; ev: Evidence }[] = [];
  const used = new Set<string>();

  // 같은 학교 안에서는 먼저 올린 자료부터 읽는다. (호출 쪽에서 created_at 순으로 전달)
  for (const src of sources) {
    const headers = Object.keys(src.rows[0]?.data ?? {});
    const role = classify(headers);
    if (role.kind === 'calendar') {
      used.add(src.id);
      for (const r of src.rows) {
        const id = r.data[role.idCol]?.trim();
        const label = r.data[role.labelCol]?.trim();
        if (!id || !label) continue;
        const ev: Evidence = {
          file_id: src.id, file_name: src.name, row_number: r.row_number, location: r.location ?? undefined,
          claim: `기간 ${id} = ‘${label}’`, cells: { [role.idCol]: id, [role.labelCol]: label },
        };
        const existing = periods.get(id);
        if (existing && existing.label !== label) {
          issues.push({ kind: 'conflicting_label', message: `기간 ${id}의 이름이 자료마다 다릅니다: ‘${existing.label}’ / ‘${label}’`, evidence: ev });
          continue;
        }
        if (!existing) periods.set(id, { id, label, assessments: [] });
        evidence.push(ev);
      }
    } else if (role.kind === 'assessments') {
      used.add(src.id);
      for (const r of src.rows) {
        const label = r.data[role.labelCol]?.trim();
        const parent = r.data[role.parentCol]?.trim();
        if (!label || !parent) continue;
        pendingAssessments.push({
          label, parent,
          ev: {
            file_id: src.id, file_name: src.name, row_number: r.row_number, location: r.location ?? undefined,
            claim: `‘${label}’ → ${parent}`, cells: { [role.labelCol]: label, [role.parentCol]: parent },
          },
        });
      }
    }
  }

  if (!used.size) return null;

  for (const a of pendingAssessments) {
    const p = periods.get(a.parent);
    if (!p) {
      issues.push({ kind: 'unknown_parent', message: `‘${a.label}’이 가리키는 기간 ${a.parent}을 학사력 자료에서 찾지 못했습니다.`, evidence: a.ev });
      continue;
    }
    if (!p.assessments.includes(a.label)) p.assessments.push(a.label);
    evidence.push(a.ev);
  }

  const proposal: PeriodValue = { periods: [...periods.values()] };
  const assessmentCount = proposal.periods.reduce((n, p) => n + p.assessments.length, 0);

  if (!periods.size) issues.push({ kind: 'missing_calendar', message: '학사 기간(학기·텀)을 정의한 자료가 아직 없습니다.' });
  if (!pendingAssessments.length) issues.push({ kind: 'missing_assessments', message: '평가 기간 자료가 아직 없습니다. 평가 자료를 추가하면 관계를 다시 묻습니다.' });
  for (const p of proposal.periods) {
    if (pendingAssessments.length && !p.assessments.length) {
      issues.push({ kind: 'empty_period', message: `${p.label}(${p.id})에 속한 평가 기간이 없습니다.` });
    }
  }

  const labels = proposal.periods.map((p) => p.label).join(', ');
  const prompt = periods.size
    ? assessmentCount
      ? `자료에서 기간 ${periods.size}개(${labels})와 평가 기간 ${assessmentCount}개를 찾았습니다. 각 평가 기간이 아래 기간에 속하는 것이 맞나요?`
      : `자료에서 기간 ${periods.size}개(${labels})를 찾았습니다. 이 기간 이름을 문서에 그대로 쓸까요? 평가 기간 자료는 아직 없습니다.`
    : '평가 기간 자료는 있지만 학사 기간 자료가 없습니다. 학사력 자료를 추가해 주세요.';

  const usedFiles = [...new Map(sources.filter((s) => used.has(s.id)).map((s) => [s.id, s])).values()];
  const fingerprint = crypto
    .createHash('sha256')
    .update(ANALYZER + '|' + usedFiles.map((s) => s.sha256).sort().join('|'))
    .digest('hex');

  return { proposal, evidence, issues, prompt, fingerprint, usedFiles: usedFiles.map((s) => s.id) };
}

/** 비교용 정규화: 기간·평가 순서를 유지한 채 공백만 정리한다. */
export function canonical(v: PeriodValue): string {
  return JSON.stringify(v.periods.map((p) => [p.id.trim(), p.label.trim(), p.assessments.map((a) => a.trim())]));
}

/** 관리자가 보낸 값 검증. 통과하면 정리된 값을 돌려준다. */
export function validatePeriodValue(input: unknown): PeriodValue {
  const v = input as PeriodValue;
  if (!v || !Array.isArray(v.periods) || !v.periods.length) throw new ValidationError('err.period.none');
  if (v.periods.length > 12) throw new ValidationError('err.period.max');
  const ids = new Set<string>();
  const assessments = new Set<string>();
  const periods = v.periods.map((p) => {
    const id = String(p?.id ?? '').trim();
    const label = String(p?.label ?? '').trim();
    if (!id || !label) throw new ValidationError('err.period.idName');
    if (id.length > 40 || label.length > 80) throw new ValidationError('err.period.tooLong');
    if (ids.has(id)) throw new ValidationError('err.period.dupId', { id });
    ids.add(id);
    const list = Array.isArray(p.assessments) ? p.assessments.map((a) => String(a).trim()).filter(Boolean) : [];
    for (const a of list) {
      if (a.length > 80) throw new ValidationError('err.period.assessTooLong');
      if (assessments.has(a)) throw new ValidationError('err.period.assessTwice', { name: a });
      assessments.add(a);
    }
    return { id, label, assessments: list };
  });
  return { periods };
}

import { ValidationError } from './errors';
export { ValidationError };
