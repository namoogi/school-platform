/** 22차: 학교별 개발 연동 (전체 관리자만 쓰기, 학교 관리자는 자기 학교 읽기, 비밀 값 거부) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const dl = await import('@/lib/devlinks');
const admin = await import('@/lib/admin');

// 검사용 가짜 키 (저장소 점검에 걸리지 않게 실행 때 조립)
const FAKE_KEY = ['sk', 'ant', 'x'.repeat(24)].join('-');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let P: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  P = (await c.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await c.end();
});
afterAll(async () => { await getPool().end(); });

describe('학교별 개발 연동', () => {
  it('전체 관리자가 학교별로 연동을 추가하고, 그 학교 관리자만 읽는다', async () => {
    await asUser(P, (db) => dl.createLink(db, A.schoolId, { kind: 'github_repo', label: 'A 홈페이지 저장소', url: 'https://github.com/example-org/school-a-site' }));
    await asUser(P, (db) => dl.createLink(db, A.schoolId, { kind: 'claude_session', label: 'A 학생부 작업', url: 'https://claude.ai/code/session_EXAMPLE', status: 'planned' }));
    await asUser(P, (db) => dl.createLink(db, B.schoolId, { kind: 'vercel_project', label: 'B 홈페이지', url: 'https://vercel.com/example/school-b' }));
    expect((await asUser(A.userId, (db) => dl.listLinks(db, A.schoolId))).map((l) => l.label)).toEqual(['A 학생부 작업', 'A 홈페이지 저장소']);
    expect(await asUser(A.userId, (db) => dl.listLinks(db, B.schoolId))).toEqual([]);
    expect(await asUser(B.userId, (db) => dl.listLinks(db, A.schoolId))).toEqual([]);
    // 접근 기록이 학교에 남는다
    expect((await asUser(A.userId, (db) => admin.accessLog(db, A.schoolId))).some((e) => e.action === 'devlink.add')).toBe(true);
  });

  it('학교 관리자는 연동을 만들거나 바꿀 수 없다', async () => {
    await expect(asUser(A.userId, (db) => dl.createLink(db, A.schoolId, { kind: 'other', label: 'x', url: 'https://example.com' })))
      .rejects.toMatchObject({ code: '42501' });
    const link = (await asUser(P, (db) => dl.listLinks(db, A.schoolId)))[0];
    await expect(asUser(A.userId, (db) => dl.updateLink(db, link.id, { label: '변경' }))).rejects.toThrow('찾을 수 없습니다');
  });

  it('종류별 주소 형식과 비밀 값을 검사한다', async () => {
    await expect(asUser(P, (db) => dl.createLink(db, A.schoolId, { kind: 'github_repo', label: 'x', url: 'https://gitlab.com/a/b' }))).rejects.toThrow('GitHub 저장소 주소 형식');
    await expect(asUser(P, (db) => dl.createLink(db, A.schoolId, { kind: 'other', label: 'x', url: 'http://insecure.example' }))).rejects.toThrow('주소 형식');
    await expect(asUser(P, (db) => dl.createLink(db, A.schoolId, { kind: 'other', label: 'x', url: 'https://example.com', notes: `token ${'gh' + 'p_'}abcdefghijklmnop` })))
      .rejects.toThrow('토큰·키처럼');
    // 앱 검사를 건너뛰어도 DB 제약이 막는다
    await expect(asUser(P, (db) => db.query(
      `insert into public.school_dev_links(school_id, kind, label, url, notes) values ($1,'other','x','https://example.com',$2)`, [A.schoolId, FAKE_KEY])))
      .rejects.toMatchObject({ code: '23514' });
  });

  it('삭제 대신 보관하고 다시 쓸 수 있다', async () => {
    const link = (await asUser(P, (db) => dl.listLinks(db, A.schoolId)))[0];
    await asUser(P, (db) => dl.updateLink(db, link.id, { status: 'archived' }));
    expect((await asUser(P, (db) => dl.listLinks(db, A.schoolId))).some((l) => l.id === link.id)).toBe(false);
    expect((await asUser(P, (db) => dl.listLinks(db, A.schoolId, true))).some((l) => l.id === link.id)).toBe(true);
    await expect(asUser(P, (db) => db.query('delete from public.school_dev_links where id = $1', [link.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(P, (db) => db.query('update public.school_dev_links set school_id = $2 where id = $1', [link.id, B.schoolId]))).rejects.toMatchObject({ code: 'P0001' });
  });

  it('세션 요청 문구에 학교 식별자와 전용 저장소가 들어간다', async () => {
    const links = await asUser(P, (db) => dl.listLinks(db, A.schoolId));
    const text = dl.sessionPrompt({ id: A.schoolId, slug: 'school-a', name: '드리미 예시학교' }, links, 'codex');
    expect(text).toContain(`school_id: ${A.schoolId}`);
    expect(text).toContain('codex/school-school-a-');
  });
});
