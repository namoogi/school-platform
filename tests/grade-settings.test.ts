/**
 * 128차: 학교 관리자가 학사 설정을 화면에서 새 판으로 저장한다 — 맞춤 척도·성적 정책 전체·계산식(미리 계산 경계값)·출력 프로필.
 * 모두 판 추가만, base_version 409, 학교 관리자만, 학교 간 쓰기·읽기 거부(양방향). 화면 검사(띠·정책 칸·'왜')는 서버 쪽 함수로 본다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const gr = await import('@/lib/grading');
const gb = await import('@/lib/gradebook');
const cr = await import('@/lib/calc-rules');
const rec = await import('@/lib/records');
const { requireWhy } = await import('@/lib/services');
const { PRESETS } = await import('@/lib/calc/expr');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let su: pg.Client; let teacherA: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ('gset-teacher@school-a.test', 't') returning id`);
  teacherA = u.id;
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [teacherA, A.schoolId]);
}, 60_000);
afterAll(async () => { await su.end(); await getPool().end(); });

const bands = [
  { code: 'A', min: 85, points: 4 }, { code: 'B', min: 70, points: 3 }, { code: 'C', min: 50, points: 2 },
  { code: 'F', min: 0, points: 0, earns_credit: false },
];

describe('맞춤 척도', () => {
  it('띠 검사: 표기 없으면 코드, 코드 겹침·숫자 아닌 하한은 거부', () => {
    expect(gr.checkBands([{ code: 'P', min: 60 }, { code: 'F', min: 0, earns_credit: false }])[0]).toMatchObject({ code: 'P', label: { ko: 'P', en: 'P' }, min: 60, earns_credit: true });
    // 바닥 구간이 없으면 60 미만이 등급 없이 이수로 마감된다(Codex #228)
    expect(() => gr.checkBands([{ code: 'P', min: 60 }], { floor: true })).toThrow(expect.objectContaining({ key: 'err.grade.bandFloor' }));
    expect(() => gr.checkBands([{ code: 'F', min: 0, earns_credit: 'false' }])).toThrow(expect.objectContaining({ key: 'err.grade.bandCredit' }));
    expect(() => gr.checkBands([{ code: 'P' }], { floor: true })).toThrow(expect.objectContaining({ key: 'err.grade.bandFloor' }));
    for (const k of Object.keys(gr.SCALE_PRESETS)) expect(() => gr.checkBands(gr.SCALE_PRESETS[k].bands, { floor: true })).not.toThrow();
    expect(() => gr.checkBands([{ code: 'A', min: 90 }, { code: 'A', min: 80 }])).toThrow(expect.objectContaining({ key: 'err.grade.bandDup' }));
    expect(() => gr.checkBands([{ code: 'A', min: 'ninety' }])).toThrow(expect.objectContaining({ key: 'err.grade.bandNumber' }));
    expect(() => gr.checkBands([])).toThrow(expect.objectContaining({ key: 'err.grade.bands' }));
  });

  it('학교 관리자: 1판 → 보고 고친 판으로 2판, 같은 판으로 다시 저장하면 409', async () => {
    expect(await asUser(A.userId, (db) => gr.saveScale(db, A.schoolId, { code: 'school_letter', kind: 'letter', bands, why: '학업성적관리규정 12조', base_version: 0 })))
      .toMatchObject({ version: 1 });
    const v2 = bands.map((b) => (b.code === 'A' ? { ...b, min: 90 } : b));
    expect(await asUser(A.userId, (db) => gr.saveScale(db, A.schoolId, { code: 'school_letter', kind: 'letter', bands: v2, why: 'A 경계 90으로', base_version: 1 })))
      .toMatchObject({ version: 2 });
    await expect(asUser(A.userId, (db) => gr.saveScale(db, A.schoolId, { code: 'school_letter', kind: 'letter', bands, why: '옛 판에서 고침', base_version: 1 })))
      .rejects.toMatchObject({ code: 'P0409' });
    const [s] = (await asUser(A.userId, (db) => gb.listScales(db, A.schoolId))).filter((x) => x.code === 'school_letter');
    expect(s.version).toBe(2);
    expect(s.bands.find((b) => b.code === 'A')?.min).toBe(90);
    expect(s.why).toBe('A 경계 90으로');
    // 1판은 그대로 남는다(판은 추가만)
    const { rows } = await su.query(`select version from public.scale_versions v join public.scales s on s.id = v.scale_id where s.school_id = $1 and s.code = 'school_letter' order by version`, [A.schoolId]);
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it('교사는 저장 못 하고, 다른 학교 관리자는 양쪽 다 쓰기·읽기 거부', async () => {
    await expect(asUser(teacherA, (db) => gr.saveScale(db, A.schoolId, { code: 'by_teacher', kind: 'letter', bands, why: 'x', base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await expect(asUser(B.userId, (db) => gr.saveScale(db, A.schoolId, { code: 'cross_b', kind: 'letter', bands, why: 'x', base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await expect(asUser(A.userId, (db) => gr.saveScale(db, B.schoolId, { code: 'cross_a', kind: 'letter', bands, why: 'x', base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await asUser(B.userId, (db) => gr.saveScale(db, B.schoolId, { code: 'b_only', kind: 'letter', bands, why: 'B 규정', base_version: 0 }));
    expect((await asUser(B.userId, (db) => gb.listScales(db, A.schoolId))).length).toBe(0);
    expect((await asUser(A.userId, (db) => gb.listScales(db, B.schoolId))).length).toBe(0);
  });
});

describe('성적 정책 전체', () => {
  it('플랫폼이 읽는 칸만 받고 값 모양을 본다', () => {
    const ok = { score_digits: 1, final_digits: 0, stats: { sd: 'sample', digits: 1 }, narrative_limits: { subject_detail: 500 }, gpa: { enabled: true, level_bonus: { AP: 1 } }, rank: { enabled: false }, attendance: { min_attendance_ratio: 0.6667 }, requests: { due_days: 30 } };
    expect(gr.checkGradingPolicy(ok)).toEqual(ok);
    expect(() => gr.checkGradingPolicy({ rounding: 'up' })).toThrow(expect.objectContaining({ key: 'err.grade.policyUnknown' }));
    expect(() => gr.checkGradingPolicy({ score_digits: 7 })).toThrow(expect.objectContaining({ key: 'err.grade.policyField', vars: { key: 'score_digits' } }));
    expect(() => gr.checkGradingPolicy({ stats: { sd: 'median' } })).toThrow(expect.objectContaining({ vars: { key: 'stats' } }));
    expect(() => gr.checkGradingPolicy({ attendance: { chronic_ratio: 10 } })).toThrow(expect.objectContaining({ vars: { key: 'attendance' } }));
    expect(() => gr.checkGradingPolicy([])).toThrow(expect.objectContaining({ key: 'err.grade.policyObject' }));
    // 묶음 안쪽 오타도 거부(Codex #228)
    expect(() => gr.checkGradingPolicy({ attendance: { min_attendence_ratio: 0.7 } })).toThrow(expect.objectContaining({ key: 'err.grade.policyUnknown', vars: expect.objectContaining({ key: 'attendance.min_attendence_ratio' }) }));
    expect(() => gr.checkGradingPolicy({ gpa: { enable: true } })).toThrow(expect.objectContaining({ vars: expect.objectContaining({ key: 'gpa.enable' }) }));
    expect(gr.checkGradingPolicy({ narrative_limits: { club: 100, career: 700 } })).toEqual({ narrative_limits: { club: 100, career: 700 } });
  });

  it('새 판 저장·409, 교사·다른 학교 양방향 거부', async () => {
    const base = (await asUser(A.userId, (db) => gb.latestPolicy(db, A.schoolId)))?.version ?? 0;
    const policy = gr.checkGradingPolicy({ score_digits: 1, final_digits: 0, narrative_limits: { subject_detail: 300 } });
    expect(await asUser(A.userId, (db) => gr.saveGradingPolicy(db, A.schoolId, policy, { why: '서술 300자', base_version: base }))).toBe(base + 1);
    await expect(asUser(A.userId, (db) => gr.saveGradingPolicy(db, A.schoolId, policy, { why: '옛 판', base_version: base }))).rejects.toMatchObject({ code: 'P0409' });
    expect((await asUser(A.userId, (db) => gb.latestPolicy(db, A.schoolId)))?.policy).toMatchObject({ narrative_limits: { subject_detail: 300 } });
    await expect(asUser(teacherA, (db) => gr.saveGradingPolicy(db, A.schoolId, policy, { why: 'x', base_version: base + 1 }))).rejects.toThrow(/학교 관리자/);
    await expect(asUser(B.userId, (db) => gr.saveGradingPolicy(db, A.schoolId, policy, { why: 'x', base_version: base + 1 }))).rejects.toThrow(/학교 관리자/);
    const bBase = (await asUser(B.userId, (db) => gb.latestPolicy(db, B.schoolId)))?.version ?? 0;
    await expect(asUser(A.userId, (db) => gr.saveGradingPolicy(db, B.schoolId, policy, { why: 'x', base_version: bBase }))).rejects.toThrow(/학교 관리자/);
    expect(await asUser(B.userId, (db) => gb.latestPolicy(db, A.schoolId))).toBeNull();
  });
});

describe('계산식 미리 계산(경계값)', () => {
  it('89.5 · 59.5 · 39.5 로 계산해 보여 주고, 식이 틀리면 결과 없이 문제만', () => {
    const samples = cr.boundarySamples((s) => `점수 ${s}`);
    const r = cr.previewCalc(PRESETS.weighted_average.spec, samples);
    expect(r.issues).toEqual([]);
    expect(r.results.map((x) => [x.label, x.score, x.passed])).toEqual([['점수 89.5', 89.5, true], ['점수 59.5', 59.5, false], ['점수 39.5', 39.5, false]]);
    const bad = cr.previewCalc({ outputs: { score: { op: 'eval' } } }, samples);
    expect(bad.issues.length).toBeGreaterThan(0);
    expect(bad.results).toEqual([]);
  });

  it('반올림 경계: 정수 반올림 식이면 89.5 → 90, 59.5 → 60(이수)', () => {
    const spec = { lets: { s: { op: 'round', args: [{ op: 'weighted_score' }], digits: 0, mode: 'half_up' } }, outputs: { score: { var: 'let.s' }, passed: { op: '>=', args: [{ var: 'let.s' }, 60] } } };
    const r = cr.previewCalc(spec, cr.boundarySamples(String));
    expect(r.results.map((x) => [x.score, x.passed])).toEqual([[90, true], [60, true], [40, false]]);
  });
});

describe('출력 프로필', () => {
  it('새 판 저장·목록·409, 판은 추가만', async () => {
    expect(await asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'kr_alt_record', code: 'kr_school', settings: { char_limits: { subject_detail: 500 } }, why: '학교 학생부 글자 수', base_version: 0 })))
      .toMatchObject({ version: 1 });
    expect(await asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'kr_alt_record', code: 'kr_school', settings: { char_limits: { subject_detail: 400 }, note: '자체 학습 기록' }, why: '400자로', base_version: 1 })))
      .toMatchObject({ version: 2 });
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'kr_alt_record', code: 'kr_school', settings: {}, why: '옛 판', base_version: 1 }))).rejects.toMatchObject({ code: 'P0409' });
    const list = await asUser(A.userId, (db) => rec.listOutputProfiles(db, A.schoolId));
    expect(list.find((p) => p.code === 'kr_school')).toMatchObject({ format: 'kr_alt_record', version: 2, why: '400자로', settings: { char_limits: { subject_detail: 400 } } });
  });

  it('서식별 설정 칸·모양만 받는다(Codex #228: 띠에 null 이면 발행 때 서버 오류)', async () => {
    expect(rec.checkProfileSettings('th_por_por_1', { bands: [{ min: 80, grade: 4 }, { min: 0, grade: 0 }], note: '학교 사본' })).toBeTruthy();
    expect(() => rec.checkProfileSettings('th_por_por_1', { bands: [null] })).toThrow(expect.objectContaining({ key: 'err.rec.profileField', vars: { key: 'bands' } }));
    expect(() => rec.checkProfileSettings('kr_alt_record', { char_limits: { subject_detail: '500' } })).toThrow(expect.objectContaining({ key: 'err.rec.profileField' }));
    expect(() => rec.checkProfileSettings('us_transcript', { columns: ['grade'] })).toThrow(expect.objectContaining({ key: 'err.rec.profileUnknown' }));
    expect(() => rec.checkProfileSettings('en_record', [])).toThrow(expect.objectContaining({ key: 'err.rec.profileSettings' }));
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'th_por_por_1', code: 'th_bad', settings: { bands: [null] }, why: 'x', base_version: 0 })))
      .rejects.toThrow(expect.objectContaining({ key: 'err.rec.profileField' }));
  });

  it('ปพ.1 띠를 오름차순으로 넣어도 높은 하한부터 고른다(Codex #228)', () => {
    const snap = { year: { label: '2569' }, courses: [{ subject_code: 'TH101', labels: { record: { th: 'ภาษาไทย' }, all: {} }, term: 's1', credits: 1, pass_fail: false, result: { attempt_status: 'completed', final_score: 85 } }], school: {}, student: {} };
    const out = rec.renderThPorPor1([snap as never], { bands: [{ min: 0, grade: 0 }, { min: 70, grade: 3 }, { min: 80, grade: 4 }] });
    expect(JSON.stringify(out.content)).toContain('"grade":"4"');
  });

  it('있는 프로필의 서식은 바꾸지 못하고, 소개서 척도 코드는 학교에 있어야 한다(Codex #228)', async () => {
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'th_por_por_1', code: 'kr_school', settings: { bands: [{ min: 0, grade: 0 }] }, why: 'x', base_version: 2 })))
      .rejects.toThrow(expect.objectContaining({ key: 'err.rec.profileFormat' }));
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'us_school_profile', code: 'sp_typo', settings: { scale_code: 'us_ltter' }, why: 'x', base_version: 0 })))
      .rejects.toThrow(expect.objectContaining({ key: 'err.rec.profileScale' }));
    expect(await asUser(A.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'us_school_profile', code: 'sp_ok', settings: { scale_code: 'school_letter' }, why: '학교 척도', base_version: 0 })))
      .toMatchObject({ version: 1 });
  });

  it('발행 때 다른 서식의 프로필은 고르지 못한다', async () => {
    await expect(asUser(A.userId, (db) => rec.publishRecordDocument(db, A.schoolId, { format: 'us_school_profile', profileCode: 'kr_school' })))
      .rejects.toThrow(expect.objectContaining({ key: 'err.rec.profileFormat' }));
  });

  it('교사·다른 학교 양방향 쓰기·읽기 거부', async () => {
    await expect(asUser(teacherA, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'en_record', code: 't_one', settings: {}, why: 'x', base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await expect(asUser(B.userId, (db) => rec.saveOutputProfile(db, A.schoolId, { format: 'en_record', code: 'cross_b', settings: {}, why: 'x', base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await expect(asUser(A.userId, (db) => rec.saveOutputProfile(db, B.schoolId, { format: 'en_record', code: 'cross_a', settings: {}, why: 'x', base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await asUser(B.userId, (db) => rec.saveOutputProfile(db, B.schoolId, { format: 'en_record', code: 'b_profile', settings: {}, why: 'B', base_version: 0 }));
    expect(await asUser(B.userId, (db) => rec.listOutputProfiles(db, A.schoolId))).toEqual([]);
    expect(await asUser(A.userId, (db) => rec.listOutputProfiles(db, B.schoolId))).toEqual([]);
  });
});

describe("'왜' 칸", () => {
  it('비우면 거부, 500자 넘으면 거부', () => {
    expect(requireWhy('  규정 5조 ')).toBe('규정 5조');
    expect(() => requireWhy('')).toThrow(expect.objectContaining({ key: 'err.whyRequired' }));
    expect(() => requireWhy(undefined)).toThrow(expect.objectContaining({ key: 'err.whyRequired' }));
    expect(() => requireWhy('가'.repeat(501))).toThrow(expect.objectContaining({ key: 'err.whyTooLong' }));
  });
});
