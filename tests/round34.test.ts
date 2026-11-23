/**
 * 34차 화면 편집 (ADR 0011 1단계): 편집 화면이 쓰는 기존 경로(판 저장·공개)의 권한과 학교 경계.
 * - 교사는 화면 편집 결과를 시안(새 판)으로만 저장하고 공개는 못 한다.
 * - 숨긴 블록은 판에 남고, 공개 판에도 hidden 표시로 실린다(방문자 화면은 그리지 않음).
 * - 다른 학교 항목은 편집 화면에서 읽지도(getEntry) 저장·공개하지도 못한다 (양방향).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const edit = await import('@/lib/site-edit');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let T: string; // A 학교 교사
let aPage: string;
let bPage: string;

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const page = (t: string) => ({ title: { ko: t }, blocks: [{ type: 'heading', text: { ko: '첫 구역' } }, { type: 'text', text: { ko: '둘째 구역' } }] });

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const S of [A, B]) {
    await asUser(S.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage'])`, [S.schoolId]));
    await asUser(S.userId, (db) => site.saveSettings(db, S.schoolId, { public_slug: S === A ? 'edit-a' : 'edit-b', langs: ['ko', 'en'], default_lang: 'ko', is_open: true }));
  }
  T = (await sql(`insert into private.app_users(email, display_name) values ('teacher-a@school-a.test', '예시 교사') returning id`))[0].id;
  await sql(`insert into public.memberships(school_id, user_id, role) values ($1, $2, 'teacher')`, [A.schoolId, T]);
  aPage = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'about', content: page('A 소개') })))!.id;
  bPage = (await asUser(B.userId, (db) => site.createEntry(db, B.schoolId, { kind: 'page', key: 'about', content: page('B 소개') })))!.id;
  await asUser(A.userId, (db) => site.publish(db, A.schoolId, aPage, undefined));
});
afterAll(async () => { await getPool().end(); });

describe('화면 편집 → 시안 → 공개', () => {
  it('교사: 화면에서 고친 내용(글·순서·숨김·새 구역)을 시안으로 저장하고, 공개는 거부된다', async () => {
    const { versions } = await asUser(T, (db) => site.getEntry(db, A.schoolId, aPage));
    let c = versions[0].content;
    c = edit.setLangText(c, ['blocks', 0, 'text'], 'en', 'First');
    c = edit.moveBlock(c, 1, 0);
    c = edit.toggleHidden(c, 1);
    c = edit.insertBlock(c, 2, edit.LAYOUT_PALETTE.find((p) => p.id === 'section:quote')!.make());
    c = edit.setLangText(c, ['blocks', 2, 'body'], 'ko', '합성 인용 문장');
    const v = (await asUser(T, (db) => site.saveVersion(db, A.schoolId, aPage, { content: c, note: '화면 편집' })))!;
    expect(v.version).toBe(2);
    await expect(asUser(T, (db) => site.publish(db, A.schoolId, aPage, undefined))).rejects.toThrow('권한');
    // 방문자는 여전히 1판
    expect((await site.publicEntry('edit-a', 'page', 'about'))!.version).toBe(1);
  });

  it('관리자가 공개하면 방문자 판에 바뀐 순서와 숨김 표시가 실린다', async () => {
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, aPage, undefined));
    const e = (await site.publicEntry('edit-a', 'page', 'about'))!;
    expect(e.version).toBe(2);
    expect(e.content.blocks.map((b) => [b.type, b.hidden ?? false])).toEqual([['text', false], ['heading', true], ['section', false]]);
    expect(e.content.blocks[1]).toMatchObject({ text: { ko: '첫 구역', en: 'First' } });
  });

  it('숨김을 풀어 다시 공개하면 되돌아온다(판 기록은 그대로)', async () => {
    const { versions } = await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, aPage));
    await asUser(A.userId, (db) => site.saveVersion(db, A.schoolId, aPage, { content: edit.toggleHidden(versions[0].content, 1) }));
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, aPage, undefined));
    expect((await site.publicEntry('edit-a', 'page', 'about'))!.content.blocks[1].hidden).toBeUndefined();
    expect((await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, aPage))).versions.map((v) => v.version)).toEqual([3, 2, 1]);
  });
});

describe('다른 학교 항목은 편집 화면에서 다룰 수 없다 (양방향)', () => {
  it('B 학교 관리자 → A 학교 항목: 읽기·시안 저장·공개 거부', async () => {
    await expect(asUser(B.userId, (db) => site.getEntry(db, A.schoolId, aPage))).rejects.toThrow('찾을 수 없');
    await expect(asUser(B.userId, (db) => site.getEntry(db, B.schoolId, aPage))).rejects.toThrow('찾을 수 없'); // 자기 학교 id 로 남의 항목
    await expect(asUser(B.userId, (db) => site.saveVersion(db, B.schoolId, aPage, { content: page('침입') }))).rejects.toThrow();
    await expect(asUser(B.userId, (db) => site.publish(db, B.schoolId, aPage, undefined))).rejects.toThrow();
    await expect(sql(`select count(*)::int as n from public.site_entry_versions where entry_id = $1`, [aPage])).resolves.toEqual([{ n: 3 }]);
  });

  it('A 학교 관리자·교사 → B 학교 항목: 읽기·시안 저장·공개 거부', async () => {
    for (const U of [A.userId, T]) {
      await expect(asUser(U, (db) => site.getEntry(db, B.schoolId, bPage))).rejects.toThrow('찾을 수 없');
      await expect(asUser(U, (db) => site.getEntry(db, A.schoolId, bPage))).rejects.toThrow('찾을 수 없');
      await expect(asUser(U, (db) => site.saveVersion(db, A.schoolId, bPage, { content: page('침입') }))).rejects.toThrow();
      await expect(asUser(U, (db) => site.publish(db, A.schoolId, bPage, undefined))).rejects.toThrow();
    }
    // RLS 가 직접 넣기도 막는다(서비스 검사를 건너뛴 경우)
    await expect(asUser(A.userId, (db) => db.query(
      `insert into public.site_entry_versions(school_id, entry_id, version, content) values ($1, $2, 9, '{"title":{"ko":"x"},"blocks":[]}')`, [B.schoolId, bPage]))).rejects.toThrow();
    expect(await site.publicEntry('edit-b', 'page', 'about')).toBeNull();
  });
});
