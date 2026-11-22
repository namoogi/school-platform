/** 15차: XLSX·DOCX·PDF 자료가 실제 DB 흐름(등록 → 표별 분석 → 근거 위치)에서 동작하는지 확인한다. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixture, lookupIds, resetTestDb, TEST_URL } from './helpers';
import { schoolACalendarDocx, schoolAAssessmentsXlsx, schoolBCalendarPdf, scannedPdf } from './fixture-files';

process.env.DATABASE_URL = TEST_URL;

const { asUser, getPool } = await import('@/lib/db');
const svc = await import('@/lib/services');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
});
afterAll(async () => {
  await getPool().end();
});

describe('A: DOCX 학사력 + XLSX 평가 일정', () => {
  it('문서 표와 시트를 읽어 두 학기·네 평가 기간을 묻고, 근거에 표·시트 위치를 남긴다', async () => {
    const res = await asUser(A.userId, async (db) => svc.addFiles(db, A.schoolId, [
      { name: '학사력.docx', type: '', bytes: await schoolACalendarDocx() },
      { name: '평가.xlsx', type: '', bytes: await schoolAAssessmentsXlsx() },
    ]));
    expect(res.added.map((a) => a.status)).toEqual(['parsed', 'parsed']);
    expect(res.analysis.state).toBe('question_opened');

    const q = await asUser(A.userId, (db) => svc.openQuestion(db, A.schoolId));
    expect(q!.proposal).toEqual({
      periods: [
        { id: 'S1', label: '1학기', assessments: ['봄 평가', '여름 평가'] },
        { id: 'S2', label: '2학기', assessments: ['가을 평가', '겨울 평가'] },
      ],
    });
    const locs = q!.evidence.map((e) => `${e.file_name}|${e.location}`);
    expect(locs).toEqual(expect.arrayContaining([
      '학사력.docx|표 1 · 2행', '학사력.docx|표 1 · 3행',
      '평가.xlsx|시트 ‘평가일정’ 4행', '평가.xlsx|시트 ‘평가일정’ 7행',
    ]));
    // ‘메모’ 시트는 학사 자료가 아니므로 근거에 없다
    expect(locs.some((l) => l.includes('메모'))).toBe(false);

    const sources = await asUser(A.userId, (db) => svc.listSources(db, A.schoolId));
    expect(sources.map((s) => [s.name, s.reader, s.needs_review])).toEqual([
      ['학사력.docx', 'docx@1', false], ['평가.xlsx', 'xlsx@1', false],
    ]);
    expect(sources[1].status_note).toContain('수식 2칸');
  });

  it('원본 파일은 보관되고 바꿀 수 없다', async () => {
    const id = (await asUser(A.userId, (db) => svc.listSources(db, A.schoolId)))[1].id;
    const len = await asUser(A.userId, async (db) => (await db.query('select octet_length(original) as n from public.source_files where id = $1', [id])).rows[0].n);
    expect(len).toBeGreaterThan(1000);
    await expect(asUser(A.userId, (db) => db.query(`update public.source_files set original = 'x' where id = $1`, [id])))
      .rejects.toMatchObject({ code: 'P0001' });
    // 다른 학교는 원본을 볼 수 없다
    const seen = await asUser(B.userId, async (db) => (await db.query('select count(*)::int as n from public.source_files where id = $1', [id])).rows[0].n);
    expect(seen).toBe(0);
  });
});

describe('B: PDF 학사력 + CSV 평가', () => {
  it('PDF 표를 쪽·줄 위치로 읽고 정확도 확인을 표시한다', async () => {
    await asUser(B.userId, async (db) => svc.addFiles(db, B.schoolId, [
      { name: 'calendar.pdf', type: 'application/pdf', bytes: await schoolBCalendarPdf() },
      fixture('school-b-assessments.csv'),
    ]));
    const q = await asUser(B.userId, (db) => svc.openQuestion(db, B.schoolId));
    expect(q!.proposal.periods.map((p) => [p.label, p.assessments])).toEqual([
      ['Term One', ['Portfolio A']], ['Term Two', ['Portfolio B']], ['Term Three', ['Portfolio C']],
    ]);
    expect(q!.evidence.find((e) => e.claim.includes('T3'))!.location).toBe('1쪽 · 5줄');
    expect(q!.evidence.find((e) => e.claim.includes('Portfolio A'))!.location).toBe('2행');
    const pdf = (await asUser(B.userId, (db) => svc.listSources(db, B.schoolId))).find((s) => s.name === 'calendar.pdf')!;
    expect(pdf.needs_review).toBe(true);
  });

  it('스캔 PDF는 보관만 하고 읽기 대기로 두며 분석을 바꾸지 않는다', async () => {
    const r = await asUser(B.userId, async (db) => svc.addFiles(db, B.schoolId, [{ name: 'scan.pdf', type: 'application/pdf', bytes: await scannedPdf() }]));
    expect(r.added[0].status).toBe('pending_reader');
    expect(r.analysis.state).toBe('unchanged');
    const scan = (await asUser(B.userId, (db) => svc.listSources(db, B.schoolId))).find((s) => s.name === 'scan.pdf')!;
    expect(scan.status_note).toContain('OCR');
  });
});
