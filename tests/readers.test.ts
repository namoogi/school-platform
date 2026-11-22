import { describe, expect, it } from 'vitest';
import { readFile } from '@/lib/readers';
import { schoolACalendarDocx, schoolAAssessmentsXlsx, schoolBCalendarPdf, scannedPdf } from './fixture-files';

describe('XLSX 판독', () => {
  it('머리행을 찾아 시트별 표로 읽고, 수식 칸은 계산 결과값을 쓰며, 위치를 시트·행으로 남긴다', async () => {
    const r = await readFile('평가.xlsx', await schoolAAssessmentsXlsx());
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.tables.map((t) => t.label)).toEqual(['시트 ‘평가일정’', '시트 ‘메모’']);
    const t = r.tables[0];
    expect(t.headers).toEqual(['assessment_label', 'parent_period', 'weeks']);
    expect(t.rows.map((x) => [x.location, x.data.assessment_label, x.data.parent_period, x.data.weeks])).toEqual([
      ['시트 ‘평가일정’ 4행', '봄 평가', 'S1', '2'],
      ['시트 ‘평가일정’ 5행', '여름 평가', 'S1', '3'],
      ['시트 ‘평가일정’ 6행', '가을 평가', 'S2', '2'],
      ['시트 ‘평가일정’ 7행', '겨울 평가', 'S2', '2'],
    ]);
    expect(r.note).toContain('수식 2칸');
    expect(r.needsReview).toBe(false);
  });

  it('손상된 엑셀은 읽기 실패로 돌려준다', async () => {
    const r = await readFile('broken.xlsx', Buffer.from('not a zip'));
    expect(r).toMatchObject({ ok: false, reader: 'xlsx@1' });
  });
});

describe('DOCX 판독', () => {
  it('문서 속 표를 읽고 문단은 분석에서 뺀다', async () => {
    const r = await readFile('학사력.docx', await schoolACalendarDocx());
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0].rows.map((x) => [x.location, x.data.period_id, x.data.period_label])).toEqual([
      ['표 1 · 2행', 'S1', '1학기'],
      ['표 1 · 3행', 'S2', '2학기'],
    ]);
    expect(r.note).toContain('표 밖의 문단은 분석에 쓰지 않았습니다');
  });
});

describe('PDF 판독', () => {
  it('글자 위치로 표를 추정하고 쪽·줄 위치와 함께 정확도 확인을 요구한다', async () => {
    const r = await readFile('calendar.pdf', await schoolBCalendarPdf());
    expect(r?.ok).toBe(true);
    if (!r?.ok) return;
    expect(r.needsReview).toBe(true);
    expect(r.tables).toHaveLength(1);
    expect(r.tables[0].headers).toEqual(['period_id', 'period_label']);
    expect(r.tables[0].rows.map((x) => [x.location, x.data.period_id, x.data.period_label])).toEqual([
      ['1쪽 · 3줄', 'T1', 'Term One'],
      ['1쪽 · 4줄', 'T2', 'Term Two'],
      ['1쪽 · 5줄', 'T3', 'Term Three'],
    ]);
  });

  it('글자 정보가 없는 PDF(스캔)는 OCR 필요로 표시한다', async () => {
    const r = await readFile('scan.pdf', await scannedPdf());
    expect(r).toMatchObject({ ok: false, reader: 'pdf@1' });
    expect(r && !r.ok && r.note).toContain('OCR');
  });
});

describe('지원하지 않는 형식', () => {
  it('HWP 등은 판독기 없음(null)', async () => {
    expect(await readFile('학칙.hwp', Buffer.from('x'))).toBeNull();
  });
});
