/** 65차 ADR 0031 — 템플릿 적용: 시안 쪽(1판)만 만들고 공개하지 않음, 같은 주소의 쪽은 건너뜀(학교 것을 덮지 않음), 다시 적용해도 그대로, 다른 학교와 섞이지 않음 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const tpl = await import('@/lib/site-templates');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  for (const s of [A, B]) {
    await su.query(`insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
                    select school_id, version + 1, seats, modules || '{homepage}', monthly_estimate_krw, price_snapshot, 'f65', created_by from public.school_licenses
                     where school_id = $1 order by version desc limit 1`, [s.schoolId]);
  }
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('템플릿 적용', () => {
  it('없는 쪽만 시안으로 만들고, 있는 쪽은 건너뛰며, 공개하지 않는다', async () => {
    await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'about', content: { title: { ko: '우리 학교가 이미 쓴 소개' }, blocks: [] } }));
    const r = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'notice'));
    expect(r.created.map((c) => c.key)).toEqual(['home', 'school-life']);
    expect(r.skipped).toEqual(['about']);
    const entries = await asUser(A.userId, (db) => site.listEntries(db, A.schoolId));
    const about = entries.find((e) => e.key === 'about')!;
    expect(about.latest_title).toEqual({ ko: '우리 학교가 이미 쓴 소개' }); // 덮지 않음
    for (const e of entries.filter((x) => r.created.some((c) => c.key === x.key))) {
      expect(e).toMatchObject({ live_version: null, latest_version: 1, status: 'draft' });
    }
    const home = await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, r.created[0].id));
    expect(home.versions[0].note).toBe('템플릿 알림 중심형 v1');
    expect(home.versions[0].content.site?.footer?.ko).toContain('[학교 이름]');
  });

  it('다시 적용하면 모두 건너뛰고, 다른 템플릿은 없는 주소만 더한다. 다른 학교와 섞이지 않는다', async () => {
    const again = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'notice'));
    expect(again.created).toEqual([]);
    const story = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'story'));
    expect(story.created.map((c) => c.key)).toEqual(['philosophy', 'learning', 'community']);
    expect(story.skipped).toEqual(['home']);
    expect((await asUser(B.userId, (db) => site.listEntries(db, B.schoolId))).length).toBe(0);
    const b = await asUser(B.userId, (db) => tpl.applyTemplate(db, B.schoolId, 'international'));
    expect(b.created.map((c) => c.key)).toEqual(['home', 'curriculum', 'admissions', 'student-life']);
    expect((await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).some((e) => e.key === 'student-life')).toBe(false);
    const { rows } = await su.query(`select detail from public.access_log where school_id = $1 and action = 'site.template_apply' order by id`, [A.schoolId]);
    expect(rows.map((x) => x.detail.template)).toEqual(['notice', 'notice', 'story']);
  });
});
