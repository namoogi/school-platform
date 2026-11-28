/** 113차 ADR 0043 2단계 — 학사 관리 템플릿: 목록·학교 사본 만들기·학교 값 유지·판 충돌·관제 새 판·점검표 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const at = await import('@/lib/academic-templates');
const f = await import('@/lib/foundation');
const gs = await import('@/lib/grade-schemes');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let platformId: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
}, 120_000);
afterAll(async () => { await su.end(); await getPool().end(); });

const ver = (s: S) => asUser(s.userId, async (db) => (await f.schoolProfile(db, s.schoolId))?.version ?? 0);
const count = async (table: string, schoolId: string) => Number((await su.query(`select count(*) n from public.${table} where school_id = $1`, [schoolId])).rows[0].n);

describe('학사 관리 템플릿', () => {
  it('학교 관리자는 읽기 함수로 5종 최신 판을 보고, 관제 표는 직접 못 읽는다', async () => {
    const list = await asUser(A.userId, (db) => at.listTemplates(db));
    expect(list.map((t) => t.key)).toEqual(['kr_general', 'kr_alternative', 'us_k12', 'international', 'homeschool']);
    expect(list.every((t) => t.version === 1 && t.title.ko && t.manifest.levels.length > 0)).toBe(true);
    const { rows } = await asUser(A.userId, (db) => db.query('select * from public.academic_templates'));
    expect(rows).toHaveLength(0);
  });

  it('점검표: 새 학교는 템플릿 고르기가 첫 남은 일', async () => {
    const steps = await asUser(B.userId, (db) => at.setupChecklist(db, B.schoolId));
    expect(steps.map((s) => s.key)).toEqual(['template', 'grades', 'terms', 'year', 'calendar', 'people', 'courses']);
    expect(steps.find((s) => !s.done)?.key).toBe('template');
  });

  it('미국 K-12: 학교급 3·학년 13·학기 2(Fall·Spring)·척도는 없는 것만, 관할 판에 템플릿과 체계가 한 판으로', async () => {
    const before = await ver(B);
    const r = await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', version: 1, base_version: before }, 'en'));
    expect(r).toMatchObject({ key: 'us_k12', version: 1, profileVersion: before + 1, made: { levels: 3, grades: 13, periods: 2 }, kept: { periods: false } });
    // us_letter 는 기본판 복제로 이미 있어 그대로, us_plus_minus 만 새로
    expect(r.made.scales).toEqual(['us_plus_minus']);
    expect(r.kept.scales).toEqual(['us_letter']);
    const p = (await su.query(`select grade_scheme, template_key, template_version from public.school_profiles where school_id = $1 order by version desc limit 1`, [B.schoolId])).rows[0];
    expect(p).toEqual({ grade_scheme: 'us', template_key: 'us_k12', template_version: 1 });
    const rule = (await su.query(`select value from public.school_rules where school_id = $1 and topic = 'period_structure'`, [B.schoolId])).rows[0].value;
    expect(rule.periods.map((x: { label: string }) => x.label)).toEqual(['Fall', 'Spring']);
    const steps = await asUser(B.userId, (db) => at.setupChecklist(db, B.schoolId));
    expect(steps.filter((s) => s.done).map((s) => s.key)).toEqual(['template', 'grades', 'terms']);
    expect(await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId))).toMatchObject({ key: 'us_k12', version: 1 });
  });

  it('다시 적용하면 빠진 것만(아무것도 늘지 않음), 학교가 만든 학기 구조는 그대로', async () => {
    const grades = await count('grade_levels', B.schoolId);
    const r = await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', version: 1, base_version: await ver(B) }, 'en'));
    expect(r.made).toEqual({ levels: 0, grades: 0, periods: 0, scales: [] });
    expect(r.kept.periods).toBe(true);
    expect(await count('grade_levels', B.schoolId)).toBe(grades);
  });

  it('국제학교: 템플릿 고유 척도(IB 1–7)를 띠 그대로 만든다', async () => {
    const r = await asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'international', version: 1, base_version: await ver(A) }));
    expect(r.made.scales).toContain('ib_1_7');
    const bands = (await su.query(
      `select v.bands from public.scale_versions v join public.scales s on s.id = v.scale_id where s.school_id = $1 and s.code = 'ib_1_7'`, [A.schoolId])).rows[0].bands;
    expect(bands.map((b: { code: string }) => b.code)).toEqual(['7', '6', '5', '4', '3', '2', '1']);
  });

  it('판 번호가 없거나 낡으면 아무것도 만들지 않는다(지침 10), 모르는 템플릿·다른 학교는 거부', async () => {
    const n = await count('grade_levels', A.schoolId);
    await expect(asUser(A.userId, (db) => at.applyTemplate(db, A.schoolId, { key: 'kr_general', version: 1 }))).rejects.toThrow('base_version');
    await expect(asUser(A.userId, (db) => at.applyTemplate(db, A.schoolId, { key: 'kr_general', version: 1, base_version: 0 }))).rejects.toMatchObject({ code: 'P0409' });
    expect(await count('grade_levels', A.schoolId)).toBe(n);
    await expect(asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'nope', version: 1, base_version: await ver(A) }))).rejects.toThrow();
    // 다른 학교: B에게는 A의 관할 판이 보이지 않아(판 0) 그 판으로 보내면 DB 명령 함수가 권한으로 거부한다
    await expect(asUser(B.userId, (db) => at.applyTemplate(db, A.schoolId, { key: 'kr_general', version: 1, base_version: 0 }))).rejects.toMatchObject({ code: '42501' });
    expect(await count('grade_levels', A.schoolId)).toBe(n);
    // 없는 템플릿 판은 관할 판에 못 적는다
    await expect(asUser(A.userId, (db) => db.query(`select app.set_school_profile($1, '{"template_key":"kr_general","template_version":9}')`, [A.schoolId]))).rejects.toThrow('템플릿 판');
  });

  it('관제만 새 판을 내고(409 포함), 새 판이 나와도 학교 사본·관할 판은 그대로', async () => {
    const pub = (userId: string, base: number) => asUser(userId, (db) => db.query(`select app.publish_academic_template($1) as v`, [JSON.stringify({
      key: 'us_k12', base_version: base, title: { ko: '미국 K-12', en: 'US K-12' }, summary: { ko: '2판' },
      manifest: { grade_scheme: 'us', levels: ['high'], periods: [{ id: 's1', label: 'Fall' }], scales: [], calc_samples: [], attendance: 'day', outputs: [], hide: [] },
    })]));
    await expect(pub(B.userId, 1)).rejects.toMatchObject({ code: '42501' });
    expect((await pub(platformId, 1)).rows[0].v).toBe(2);
    await expect(pub(platformId, 1)).rejects.toMatchObject({ code: 'P0409' });
    expect((await asUser(B.userId, (db) => at.listTemplates(db))).find((t) => t.key === 'us_k12')!.version).toBe(2);
    expect(await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId))).toMatchObject({ key: 'us_k12', version: 1, latest: { version: 2 } });
    // 관할만 고친 판도 템플릿을 잇는다
    await asUser(B.userId, async (db) => f.setSchoolProfile(db, B.schoolId, { country: 'TH', base_version: await ver(B) }));
    expect(await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId))).toMatchObject({ key: 'us_k12', version: 1 });
    expect((await asUser(B.userId, (db) => gs.schemeView(db, B.schoolId, 'en'))).scheme).toBe('us');
    // 모양이 틀린 판은 내지 못한다(학교 화면이 깨지지 않게)
    const bad = (manifest: object) => asUser(platformId, (db) => db.query(`select app.publish_academic_template($1)`, [JSON.stringify({
      key: 'us_k12', base_version: 2, title: { ko: 'x' }, manifest })]));
    await expect(bad({ grade_scheme: 'us' })).rejects.toThrow('템플릿 내용');
    await expect(bad({ grade_scheme: 'us', levels: ['college'], periods: [{ id: 's1', label: 'A' }], scales: [], calc_samples: [], attendance: 'day', outputs: [], hide: [] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ grade_scheme: 'us', levels: ['high'], periods: [{ id: 's1', label: 'A' }], scales: [], calc_samples: [], attendance: 'day', outputs: ['diploma'], hide: [] })).rejects.toThrow('템플릿 내용');
    const ok = { grade_scheme: 'us', levels: ['high'], periods: [{ id: 's1', label: 'A' }], calc_samples: [], attendance: 'day', outputs: [], hide: [] };
    await expect(bad({ ...ok, scales: [{ code: 'x', preset: 'unknown' }] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ ...ok, scales: [{ code: 'x', kind: 'level', bands: [] }] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ ...ok, scales: [{ code: 'x', kind: 'level', bands: [{ code: 'A' }] }] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ ...ok, scales: [{ code: 'x', kind: 'level', bands: [{ code: 'TOOLONGCD', label: { ko: 'A' }, min: 0 }] }] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ ...ok, scales: [{ code: 'x', kind: 'level', bands: [{ code: 'A', label: { korean: 'A' }, min: 0 }] }] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ ...ok, periods: [{ id: 's1', label: 'A' }, { id: 's1', label: 'B' }], scales: [] })).rejects.toThrow('템플릿 내용');
    await expect(asUser(platformId, (db) => db.query(`select app.publish_academic_template($1)`, [JSON.stringify({
      key: 'us_k12', base_version: 2, title: { ko: 'x' }, summary: { ko: { text: 'x' } }, manifest: { ...ok, scales: [] } })]))).rejects.toThrow('템플릿 내용');
    expect((await asUser(B.userId, (db) => at.listTemplates(db))).find((t) => t.key === 'us_k12')!.version).toBe(2);
    await expect(bad({ ...ok, scales: [{ code: 'pass_fail', preset: 'pass_fail' }, { code: 'pass_fail', preset: 'pass_fail' }] })).rejects.toThrow('템플릿 내용');
    await expect(bad({ ...ok, scales: [{ code: 'x', kind: 'level', why: 'w'.repeat(501), bands: [{ code: 'A', label: { ko: 'A' }, min: 0 }] }] })).rejects.toThrow('템플릿 내용');
    // SCALE_PRESETS 와 DB 검사 목록이 같아야 한다(한쪽만 늘면 템플릿이 막히거나 적용이 깨짐)
    const { SCALE_PRESETS } = await import('@/lib/grading');
    const fn = (await su.query(`select prosrc from pg_proc where proname = 'academic_template_ok'`)).rows[0].prosrc as string;
    for (const k of Object.keys(SCALE_PRESETS)) expect(fn).toContain(`'${k}'`);
    // 템플릿 판은 고칠 수 없다
    await expect(su.query(`update public.academic_templates set why = 'x'`)).rejects.toThrow();
  });
  it('낼 수 있는 판은 학교에 실제로 적용된다(경계 값: 8자 띠 코드, 영어만 있는 표기, 학기 3개, 직접 정한 척도)', async () => {
    const manifest = { grade_scheme: 'custom', levels: ['middle'], periods: [{ id: 'q1', label: 'Q1' }, { id: 'q2', label: 'Q2' }, { id: 'q3', label: 'Q3' }],
      scales: [{ code: 'edge_scale', kind: 'level', why: 'edge', bands: [{ code: 'ABCDEFG+', label: { en: 'Top' }, min: 80 }, { code: 'B', label: { en: 'Rest' }, min: null }] }],
      calc_samples: [], attendance: 'day', outputs: ['en_record'], hide: ['gpa'] };
    await asUser(platformId, (db) => db.query(`select app.publish_academic_template($1)`, [JSON.stringify({
      key: 'edge_case', base_version: 0, title: { ko: '경계', en: 'Edge' }, summary: { en: 'edge' }, manifest })]));
    const fresh = (await su.query(`select id from public.schools where slug = 'school-a'`)).rows[0].id;
    expect(fresh).toBe(A.schoolId);
    const r = await asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'edge_case', version: 1, base_version: await ver(A) }));
    expect(r.made.scales).toEqual(['edge_scale']);
    expect(await asUser(A.userId, (db) => at.schoolTemplate(db, A.schoolId))).toMatchObject({ key: 'edge_case', version: 1 });
  });
  it('이름 댄 판 그대로 적용하고(판 번호 필수), 학교가 정한 학년 체계는 다시 적용해도 지킨다', async () => {
    await expect(asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', base_version: await ver(B) }))).rejects.toThrow();
    await expect(asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', version: 9, base_version: await ver(B) }))).rejects.toThrow();
    // 학년 체계를 커스텀으로 바꾼 뒤 템플릿 2판을 채워도 커스텀이 남는다
    await asUser(B.userId, async (db) => gs.applyGradeScheme(db, B.schoolId, { scheme: 'custom', levels: ['high'], base_version: await ver(B) }, 'en'));
    // 125차: 같은 템플릿의 다른 판은 새 판 제안 수락으로만 옮긴다(수락이 쓰는 길과 같은 viaOffer)
    await expect(asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', version: 2, base_version: await ver(B) }, 'en'))).rejects.toThrow('제안');
    const r = await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', version: 2, base_version: await ver(B) }, 'en', { viaOffer: true }));
    expect(r.kept.scheme).toBe('custom');
    expect((await asUser(B.userId, (db) => gs.schemeView(db, B.schoolId, 'en'))).scheme).toBe('custom');
    expect(await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId))).toMatchObject({ key: 'us_k12', version: 2 });
    // 같은 템플릿의 낮은 판으로 내리는 것도 막힌다(125차)
    await expect(asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'us_k12', version: 1, base_version: await ver(B) }, 'en'))).rejects.toThrow('제안');
    expect(await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId))).toMatchObject({ key: 'us_k12', version: 2 });
  });
});
