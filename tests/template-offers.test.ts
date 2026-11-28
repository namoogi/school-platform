/**
 * 125차 ADR 0043 3단계 — 템플릿 새 판 제안. 열린 제안은 계산(학교가 쓰는 템플릿의 최신 판 > 학교 판), 결정만 기록.
 * 쓰는 학교에만 보임 · 미리 보기 · 보류·거절·수락(적용 + 기록) · 판 옮기기는 수락 길 하나 · 되돌아오기·동시 공개에도 어긋남 없음
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const at = await import('@/lib/academic-templates');
const off = await import('@/lib/template-offers');
const f = await import('@/lib/foundation');

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
const tv = async (s: S) => (await asUser(s.userId, (db) => at.schoolTemplate(db, s.schoolId)))?.version;
const offer = (s: S) => asUser(s.userId, (db) => off.openTemplateOffer(db, s.schoolId));
const decide = (s: S, decision: string, to: number, base?: number) => asUser(s.userId, async (db) =>
  off.decideTemplateOffer(db, s.schoolId, { to_version: to, decision, base_version: base ?? await ver(s) }));
// 새 판은 직전 판에 쌓는다(실제 관제가 내는 방식)
const publish = async (version: number, extraScale: string) => {
  const m = (await su.query(`select manifest from public.academic_templates where key = 'kr_general' order by version desc limit 1`)).rows[0].manifest;
  m.scales = [...m.scales, { code: extraScale, preset: 'pass_fail' }];
  return asUser(platformId, (db) => off.publishAcademicTemplate(db, {
    key: 'kr_general', base_version: version - 1, title: { ko: '한국 일반 초·중·고', en: 'Korean K-12 (general)' }, summary: { ko: `${version}판` },
    manifest: m, why: `P/F 척도 ${extraScale} 추가`,
  }));
};
const scaleCount = async (s: S, codes: string[]) =>
  (await su.query(`select count(*)::int as n from public.scales where school_id = $1 and code = any($2)`, [s.schoolId, codes])).rows[0].n;

describe('템플릿 새 판 제안', () => {
  it('새 판은 그 템플릿을 쓰는 학교에만 제안으로 보이고, 학교 사본은 그대로다', async () => {
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 1, base_version: await ver(B) }));
    await asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'homeschool', version: 1, base_version: await ver(A) }));
    expect(await offer(B)).toBeNull();
    expect(await publish(2, 'kr_pf_v2')).toBe(2);
    expect(await offer(B)).toMatchObject({ key: 'kr_general', from: 1, to: 2, status: 'offered', why: 'P/F 척도 kr_pf_v2 추가' });
    expect(await offer(A)).toBeNull();
    expect(await scaleCount(B, ['kr_pf_v2'])).toBe(0);
    expect(await tv(B)).toBe(1);
  });

  it('미리 보기: 없는 척도만 더하고, 학기 구조·숨길 구획·있는 척도는 학교 값', async () => {
    const o = (await offer(B))!;
    expect(o.plan.add).toMatchObject({ levels: [], grades: 0, periods: [], scales: ['kr_pf_v2'] });
    expect(o.plan.keep).toMatchObject({ periods: true, hidden: true });
    expect(o.plan.keep.scales).toEqual(expect.arrayContaining(['kr_achievement', 'kr_elective']));
  });

  it('보류·거절은 기록만, 다른 학교·낡은 판·본 적 없는 판은 거부, 수락은 적용 + 기록', async () => {
    await expect(decide(A, 'held', 2)).rejects.toThrow();
    expect((await decide(B, 'held', 2)).decision).toBe('held');
    expect((await offer(B))!.status).toBe('held');
    expect((await decide(B, 'declined', 2)).decision).toBe('declined');
    expect((await offer(B))!.status).toBe('declined');
    await expect(decide(B, 'accepted', 3)).rejects.toMatchObject({ code: 'P0409' });
    await expect(decide(B, 'accepted', 2, 0)).rejects.toMatchObject({ code: 'P0409' });
    // 보류·거절도 본 판에 묶인다(그 사이 학교 판이 바뀌었으면 409)
    await expect(decide(B, 'held', 2, 0)).rejects.toMatchObject({ code: 'P0409' });
    // 거절한 뒤에도 수락할 수 있다
    const r = await decide(B, 'accepted', 2);
    expect(r).toMatchObject({ decision: 'accepted', to_version: 2, applied: { made: { scales: ['kr_pf_v2'] } } });
    expect(await tv(B)).toBe(2);
    expect(await offer(B)).toBeNull();
    const hist = await asUser(B.userId, (db) => off.templateDecisions(db, B.schoolId));
    expect(hist.map((d) => d.decision)).toEqual(['accepted', 'declined', 'held']);
    // 다른 학교는 결정 기록을 못 본다(RLS)
    expect((await asUser(A.userId, (db) => db.query(`select * from public.academic_template_decisions where school_id = $1`, [B.schoolId]))).rows).toEqual([]);
  });

  it('여러 판이 나오면 제안은 지금 판 → 최신 판 하나다(중간 판을 건너뜀)', async () => {
    await publish(3, 'kr_pf_v3');
    await publish(4, 'kr_pf_v4');
    expect(await offer(B)).toMatchObject({ from: 2, to: 4 });
    await expect(decide(B, 'accepted', 3)).rejects.toMatchObject({ code: 'P0409' });
    await decide(B, 'accepted', 4);
    expect(await tv(B)).toBe(4);
    expect(await scaleCount(B, ['kr_pf_v3', 'kr_pf_v4'])).toBe(2);
  });

  it('DB 함수를 직접 불러도 적용 없는 수락·지난 제안·다른 템플릿 결정은 거부', async () => {
    await publish(5, 'kr_pf_v5');
    const rec = (s: S, to: number, d: string) => asUser(s.userId, async (db) =>
      db.query(`select app.record_template_decision($1, 'kr_general', $2, $3, null, $4)`, [s.schoolId, to, d, await ver(s)]));
    await expect(rec(B, 5, 'accepted')).rejects.toThrow('먼저 적용');
    await expect(rec(B, 4, 'held')).rejects.toMatchObject({ code: 'P0409' });
    await expect(rec(A, 5, 'held')).rejects.toThrow('다른 템플릿');
    // DB 함수도 보류·거절은 본 판이 없거나 낡으면 거부한다
    await expect(asUser(B.userId, (db) => db.query(`select app.record_template_decision($1, 'kr_general', 5, 'held')`, [B.schoolId]))).rejects.toMatchObject({ code: 'P0409' });
    await expect(asUser(B.userId, (db) => db.query(`select app.record_template_decision($1, 'kr_general', 5, 'held', null, 0)`, [B.schoolId]))).rejects.toMatchObject({ code: 'P0409' });
    // '어느 판에서'는 DB가 학교 판에서 정한다(지금 4판)
    await rec(B, 5, 'held');
    expect((await asUser(B.userId, (db) => off.templateDecisions(db, B.schoolId)))[0]).toMatchObject({ from_version: 4, to_version: 5, decision: 'held' });
  });

  it('같은 템플릿의 다른 판으로 바로 적용하는 길은 막힌다(제안 수락만), 같은 판 다시 채우기는 된다', async () => {
    await expect(asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 5, base_version: await ver(B) }))).rejects.toThrow('제안');
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 4, base_version: await ver(B) }));
    expect(await tv(B)).toBe(4);
  });

  it('다른 템플릿을 거쳐 옛 판으로 돌아와도 제안은 다시 계산된다(옛 화면의 판 고르기 포함)', async () => {
    // A: 홈스쿨을 쓰다가 예전에 본 한국 일반 1판 카드를 고른다 → 최신 5판 제안이 곧바로 보인다
    await asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'kr_general', version: 1, base_version: await ver(A) }));
    expect(await offer(A)).toMatchObject({ from: 1, to: 5, status: 'offered' });
    // B: 4판을 쓰던 학교가 다른 템플릿을 거쳐 1판으로 돌아와도 5판 제안이 다시 열린다
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'homeschool', version: 1, base_version: await ver(B) }));
    expect(await offer(B)).toBeNull();
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 1, base_version: await ver(B) }));
    expect(await offer(B)).toMatchObject({ from: 1, to: 5 });
    // 보류(5판) → 수락 → 다른 템플릿 → 1판으로 돌아오면, 예전 보류가 되살아나지 않고 새로 열린 제안이다
    await decide(B, 'accepted', 5);
    expect(await tv(B)).toBe(5);
    expect((await asUser(B.userId, (db) => off.templateDecisions(db, B.schoolId)))[0]).toMatchObject({ from_version: 1, to_version: 5, decision: 'accepted' });
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'homeschool', version: 1, base_version: await ver(B) }));
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 1, base_version: await ver(B) }));
    expect(await offer(B)).toMatchObject({ from: 1, to: 5, status: 'offered', note: null });
  });

  it('학교 사용자 권한으로도 탭 옆 \'새 판\' 표시가 열린 제안을 센다(거절하면 0)', async () => {
    const count = (s: S) => asUser(s.userId, async (db) => (await at.academicsTabCounts(db, s.schoolId)).offers);
    expect(await count(B)).toBe(1);
    await decide(B, 'declined', 5);
    expect(await count(B)).toBe(0);
    expect(await count(A)).toBe(1);
  });

  it('학교 AI 맞춤 지시문은 템플릿이 아니라 지금 학교 사본 값을 요약한다(126차)', async () => {
    const c = await asUser(B.userId, (db) => at.schoolCopySummary(db, B.schoolId, 'ko'));
    expect(c).toMatchObject({ template: { key: 'kr_general', version: 1 }, scheme: 'kr', periods: ['1학기', '2학기'] });
    expect(c!.scales).toEqual(expect.arrayContaining(['kr_achievement', 'kr_elective', 'kr_pf_v5']));
    expect(c!.levels.length).toBeGreaterThan(0);
    // 다른 학교 값은 섞이지 않는다
    const a = await asUser(A.userId, (db) => at.schoolCopySummary(db, A.schoolId, 'ko'));
    expect(a!.scales).not.toContain('kr_pf_v5');
  });

  it('학교 판을 바꾸는 중에 다른 관리자가 보류하면, 바뀐 판이 확정된 뒤를 보고 거부한다(학교별 잠금)', async () => {
    // B는 지금 한국 일반 1판, 5판 제안이 열려 있다. 다른 연결이 학교 판을 홈스쿨로 바꾸는 중(아직 커밋 전)
    const a = new pg.Client({ connectionString: TEST_URL });
    await a.connect();
    await a.query('begin');
    await a.query(`select pg_advisory_xact_lock(hashtext('school-platform:school_profiles'), hashtext($1::text))`, [B.schoolId]);
    await a.query(`insert into public.school_profiles(school_id, version, grade_scheme, template_key, template_version, created_by)
      select school_id, version + 1, grade_scheme, 'homeschool', 1, created_by from public.school_profiles where school_id = $1 order by version desc limit 1`, [B.schoolId]);
    // 결과는 바로 붙잡아 둔다(커밋 뒤에 거부되므로 처리되지 않은 거부가 되지 않게)
    const seen = await ver(B);
    const held = asUser(B.userId, (db) => db.query(`select app.record_template_decision($1, 'kr_general', 5, 'held', null, $2)`, [B.schoolId, seen])).then(() => null, (e: Error) => e);
    await new Promise((r) => setTimeout(r, 300));
    await a.query('commit'); await a.end();
    expect((await held)?.message).toMatch(/다른 템플릿|새 판이 생겼/);
  });

  it('결정 기록은 고치거나 지울 수 없고, 학교 사람은 직접 쓸 수 없다', async () => {
    const id = (await su.query(`select id from public.academic_template_decisions limit 1`)).rows[0].id;
    await expect(su.query(`delete from public.academic_template_decisions where id = $1`, [id])).rejects.toThrow();
    await expect(su.query(`update public.academic_template_decisions set note = 'changed' where id = $1`, [id])).rejects.toThrow();
    await expect(asUser(B.userId, (db) => db.query(`insert into public.academic_template_decisions(school_id, template_key, from_version, to_version, decision) values ($1, 'kr_general', 1, 2, 'accepted')`, [B.schoolId]))).rejects.toThrow();
  });
});
