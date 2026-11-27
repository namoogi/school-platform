/** ADR 0040: 계산식 판 — 학교 관리자만 저장, 모양 검사 통과만, base_version 409, 학교 간 읽기 거부(양방향), 고치지 않음 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const cr = await import('@/lib/calc-rules');
const { PRESETS } = await import('@/lib/calc/expr');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let su: pg.Client;
let teacherA: string;
beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ('calc-teacher@school-a.test', 't') returning id`);
  teacherA = u.id;
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [teacherA, A.schoolId]);
}, 60_000);
afterAll(async () => { await su.end(); await getPool().end(); });

describe('계산식 판', () => {
  const spec = PRESETS.rounded_twice_bands.spec;
  it('학교 관리자가 저장하면 1판, 같은 base_version 으로 다시 저장하면 409', async () => {
    expect(await asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'course_score', title: { ko: '과목 점수' }, spec, why: '드리미 방식', base_version: 0 }))).toEqual({ version: 1 });
    await expect(asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'course_score', spec, base_version: 0 }))).rejects.toMatchObject({ code: 'P0409' });
    expect(await asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'course_score', spec: PRESETS.weighted_average.spec, base_version: 1 }))).toEqual({ version: 2 });
    const list = await asUser(A.userId, (db) => cr.listCalcRules(db, A.schoolId));
    expect(list.map((r) => [r.code, r.version])).toEqual([['course_score', 2]]);
  });

  it('글자 수는 DB 의 jsonb::text 와 같게 세고, 넘치면 DB 에 닿기 전에 검사 문제로 거부한다(Codex 12b816e P2)', async () => {
    const { jsonbTextLength, checkSpec } = await import('@/lib/calc/expr');
    for (const v of [PRESETS.kr_high_common?.spec ?? spec, spec, { outputs: { level: 'A·한글', x: [1, 2.5, true, null, { a: 'b"c' }] } }]) {
      const { rows: [r] } = await su.query('select length($1::jsonb::text) as n', [JSON.stringify(v)]);
      expect(jsonbTextLength(v)).toBe(r.n);
    }
    const big = { outputs: { level: { op: 'count_levels', in: Array(30).fill('M') }, score: 1 }, lets: Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`v${i}`, 'x'.repeat(40)])) };
    expect(checkSpec(big).map((i) => i.message).join()).toMatch(/너무 깁니다/);
    await expect(asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'too_big', spec: big, base_version: 0 }))).rejects.toThrow(/계산식을 고쳐 주세요/);
  });

  it('모양이 틀린 식은 저장하지 않는다(DB 에 닿기 전)', async () => {
    await expect(asUser(A.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'bad_rule', spec: { outputs: { score: { op: 'eval' } } }, base_version: 0 })))
      .rejects.toThrow(/계산식을 고쳐 주세요/);
  });

  it('교사는 저장할 수 없고, 다른 학교 관리자는 이 학교에 저장할 수 없다', async () => {
    await expect(asUser(teacherA, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'by_teacher', spec, base_version: 0 }))).rejects.toThrow(/학교 관리자/);
    await expect(asUser(B.userId, (db) => cr.saveCalcRule(db, A.schoolId, { code: 'cross', spec, base_version: 0 }))).rejects.toThrow(/학교 관리자/);
  });

  it('학교는 자기 계산식만 읽는다(양방향)', async () => {
    await asUser(B.userId, (db) => cr.saveCalcRule(db, B.schoolId, { code: 'b_rule', spec: PRESETS.competency_mastery.spec, base_version: 0 }));
    const a = (await asUser(A.userId, (db) => db.query('select distinct school_id from public.calc_rules'))).rows.map((r) => r.school_id);
    const b = (await asUser(B.userId, (db) => db.query('select distinct school_id from public.calc_rules'))).rows.map((r) => r.school_id);
    expect(a).toEqual([A.schoolId]);
    expect(b).toEqual([B.schoolId]);
    expect(await asUser(B.userId, (db) => cr.listCalcRules(db, A.schoolId))).toEqual([]);
  });

  it('판은 고치거나 지울 수 없다', async () => {
    await expect(su.query(`update public.calc_rules set why = 'x'`)).rejects.toThrow();
    await expect(su.query(`delete from public.calc_rules`)).rejects.toThrow();
  });

  it('미리 계산은 저장하지 않고 견본 입력으로 결과만 돌려준다', () => {
    const r = cr.previewCalc(spec, [{ label: '89.5점', items: { a: { score: 89.5, max: 100, weight: 100 } } }, { label: 'P 학생', entry: { exists: true, level: 'P' }, items: { a: { score: 95, max: 100, weight: 100 } } }]);
    expect(r.issues).toEqual([]);
    expect(r.results).toEqual([{ label: '89.5점', score: 90, passed: null, level: 'A' }, { label: 'P 학생', score: null, passed: null, level: 'P' }]);
  });
});
