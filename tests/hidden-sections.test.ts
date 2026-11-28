/** 116차 ADR 0043 — 학교가 숨길 구획: 처음 템플릿에서 복사, 학교가 고치면 다시 적용해도 유지, 발행본에서 GPA 빼기 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const at = await import('@/lib/academic-templates');
const sec = await import('@/lib/sections');
const f = await import('@/lib/foundation');
const demo = await import('@/lib/demo-school');
const rec = await import('@/lib/records');

type S = { schoolId: string; userId: string };
let B: S;
let su: pg.Client;
let platformId: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
}, 120_000);
afterAll(async () => { await su.end(); await getPool().end(); });

const ver = (s: S) => asUser(s.userId, async (db) => (await f.schoolProfile(db, s.schoolId))?.version ?? 0);
const hidden = (s: S) => asUser(s.userId, async (db) => [...(await sec.hiddenSections(db, s.schoolId))].sort());

describe('숨길 구획', () => {
  it('처음 고른 템플릿의 숨김을 학교 사본으로 복사하고, 학교가 고치면 다시 적용·다른 템플릿에도 학교 값을 지킨다', async () => {
    expect(await hidden(B)).toEqual([]);
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_alternative', version: 1, base_version: await ver(B) }));
    expect(await hidden(B)).toEqual(['gpa', 'rank']);
    await asUser(B.userId, async (db) => sec.setHiddenSections(db, B.schoolId, { sections: ['gpa'], base_version: await ver(B) }));
    expect(await hidden(B)).toEqual(['gpa']);
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_alternative', version: 1, base_version: await ver(B) }));
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'homeschool', version: 1, base_version: await ver(B) }));
    expect(await hidden(B)).toEqual(['gpa']);
    // 관할만 고친 판도 잇는다
    await asUser(B.userId, async (db) => f.setSchoolProfile(db, B.schoolId, { country: 'TH', base_version: await ver(B) }));
    expect(await hidden(B)).toEqual(['gpa']);
  });

  it('템플릿을 고르기 전에 학교가 정한 숨김은 템플릿이 덮지 않는다', async () => {
    const { A } = await lookupIds();
    await asUser(A.userId, async (db) => sec.setHiddenSections(db, A.schoolId, { sections: ['period_attendance'], base_version: await ver(A) }));
    await asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'homeschool', version: 1, base_version: await ver(A) }));
    expect(await hidden(A)).toEqual(['period_attendance']);
  });

  it('모르는 구획·판 번호 없음·낡은 판·다른 학교는 거부', async () => {
    await expect(asUser(B.userId, async (db) => sec.setHiddenSections(db, B.schoolId, { sections: ['grades'], base_version: await ver(B) }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => db.query(`select app.set_school_profile($1, '{"hidden_sections":["grades"]}')`, [B.schoolId]))).rejects.toThrow('숨길 구획');
    await expect(asUser(B.userId, (db) => sec.setHiddenSections(db, B.schoolId, { sections: [] }))).rejects.toThrow('base_version');
    await expect(asUser(B.userId, (db) => sec.setHiddenSections(db, B.schoolId, { sections: [], base_version: 0 }))).rejects.toMatchObject({ code: 'P0409' });
    const { A } = await lookupIds();
    await expect(asUser(A.userId, (db) => sec.setHiddenSections(db, B.schoolId, { sections: [], base_version: 0 }))).rejects.toMatchObject({ code: '42501' });
    await expect(su.query(`update public.school_profiles set hidden_sections = '{"grades"}' where school_id = $1`, [B.schoolId])).rejects.toThrow();
  });

  it('평점을 숨긴 학교의 성적증명서 발행본에는 GPA 칸이 없고, 숨기지 않으면 있다(스냅샷은 같음)', async () => {
    const r = await asUser(platformId, (db) => demo.buildDemoSchool(db));
    const senior = (await su.query(
      `select c.person_id from public.record_closures c where c.school_id = $1 order by c.person_id limit 1`, [r.schoolId])).rows[0].person_id;
    const v = () => asUser(platformId, async (db) => (await f.schoolProfile(db, r.schoolId))!.version);
    // 시연 학교(한국 일반)는 숨김 없음 → GPA 칸이 있다
    const shown = await asUser(platformId, (db) => rec.publishRecordDocument(db, r.schoolId, { format: 'us_transcript', personId: senior }));
    expect(JSON.stringify(shown.content)).toContain('"gpa"');
    await asUser(platformId, async (db) => sec.setHiddenSections(db, r.schoolId, { sections: ['gpa'], base_version: await v() }));
    const hid = await asUser(platformId, (db) => rec.publishRecordDocument(db, r.schoolId, { format: 'us_transcript', personId: senior }));
    const c = hid.content as { years: Record<string, unknown>[]; cumulative: Record<string, unknown>; key: Record<string, unknown>[] };
    expect(c.years.every((y) => !('gpa' in y))).toBe(true);
    expect('gpa' in c.cumulative).toBe(false);
    expect(c.key.every((k) => !('points' in k))).toBe(true);
    expect(hid.issues.some((i) => i.level === 'info' && i.message.includes('GPA is hidden'))).toBe(true);
    // 학교 소개서도 GPA 방식을 싣지 않는다
    const profile = await asUser(platformId, (db) => rec.publishRecordDocument(db, r.schoolId, { format: 'us_school_profile' }));
    expect((profile.content as { gpa_policy: string }).gpa_policy).toBe('GPA is not reported by this school.');
    expect((profile.content as { grading_scale: Record<string, unknown>[] }).grading_scale.every((g) => !('points' in g))).toBe(true);
  }, 120_000);
});
