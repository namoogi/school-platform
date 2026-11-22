import { describe, expect, it } from 'vitest';
import { parseDelimited } from '@/lib/csv';
import { analyzePeriods, validatePeriodValue } from '@/lib/analyze';

describe('CSV 파서', () => {
  it('BOM·CRLF·따옴표·빈 줄을 처리하고 원본 줄 번호를 남긴다', () => {
    const t = parseDelimited('﻿period_id,period_label\r\nS1,"1학기, 정규"\r\n\r\nS2,"따옴표 ""표기"""\r\n');
    expect(t.headers).toEqual(['period_id', 'period_label']);
    expect(t.rows).toEqual([
      { rowNumber: 2, data: { period_id: 'S1', period_label: '1학기, 정규' } },
      { rowNumber: 4, data: { period_id: 'S2', period_label: '따옴표 "표기"' } },
    ]);
  });
  it('TSV를 읽는다', () => {
    expect(parseDelimited('a\tb\n1\t2', '\t').rows[0].data).toEqual({ a: '1', b: '2' });
  });
});

describe('분석기', () => {
  it('없는 기간을 가리키는 평가는 문제로 표시하고 근거 행을 붙인다', () => {
    const r = analyzePeriods([
      { id: 'c', name: 'cal.csv', sha256: '1', rows: [{ row_number: 2, data: { period_id: 'T1', period_label: 'Term One' } }] },
      { id: 'a', name: 'as.csv', sha256: '2', rows: [{ row_number: 2, data: { assessment_label: 'X', parent_period: 'T9' } }] },
    ])!;
    expect(r.issues[0]).toMatchObject({ kind: 'unknown_parent', evidence: { file_name: 'as.csv', row_number: 2 } });
  });
  it('관계없는 표는 분석하지 않는다', () => {
    expect(analyzePeriods([{ id: 'x', name: 'x.csv', sha256: '1', rows: [{ row_number: 2, data: { a: '1' } }] }])).toBeNull();
  });
  it('한 평가 기간을 두 기간에 넣은 수정값은 거부한다', () => {
    expect(() => validatePeriodValue({ periods: [
      { id: 'S1', label: '1', assessments: ['봄'] }, { id: 'S2', label: '2', assessments: ['봄'] },
    ] })).toThrow('동시에');
  });
});
