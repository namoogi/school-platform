/** 17차: 개발·연구소 보드 (전체 관리자 전용, 변경 이력) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const lab = await import('@/lib/lab');

let A: { schoolId: string; userId: string };
let P: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A } = await lookupIds());
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  P = (await c.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await c.end();
}, 120_000);
afterAll(async () => { await getPool().end(); });

describe('개발·연구소 보드', () => {
  it('시작 내용(로드맵)이 종류별로 들어 있다', async () => {
    const items = await asUser(P, (db) => lab.listItems(db));
    const kinds = new Set(items.map((i) => i.kind));
    expect([...kinds].sort()).toEqual(['lab', 'method', 'plan', 'todo', 'tool']);
    const todo = items.find((i) => i.title.includes('AI 분석 프롬프트'))!;
    expect(items.find((i) => i.id === todo.parent_id)!.title).toContain('AI 분석 연결');
  });

  it('할 일을 만들고 상태·내용을 바꾸면 이전 값이 이력으로 남는다', async () => {
    const plan = (await asUser(P, (db) => lab.listItems(db))).find((i) => i.kind === 'plan')!;
    const { id } = await asUser(P, (db) => lab.createItem(db, { kind: 'todo', title: '디자인 기반 조사', priority: 'high', due_date: '2026-12-01', parent_id: plan.id, tags: '디자인, UI ,디자인' }));
    await asUser(P, (db) => lab.updateItem(db, id, { status: 'doing' }));
    await asUser(P, (db) => lab.updateItem(db, id, { status: 'done', body: '조사 완료' }));
    const item = (await asUser(P, (db) => lab.listItems(db))).find((i) => i.id === id)!;
    expect(item).toMatchObject({ status: 'done', body: '조사 완료', priority: 'high', due_date: '2026-12-01', tags: ['디자인', 'UI'], history_count: 2 });
    const hist = await asUser(P, (db) => lab.itemHistory(db, id));
    expect(hist.map((h) => h.before.status)).toEqual(['doing', 'todo']);
  });

  it('보관은 되지만 삭제와 종류 변경은 막힌다', async () => {
    const { id } = await asUser(P, (db) => lab.createItem(db, { kind: 'tool', title: 'Storybook', status: 'candidate' }));
    await asUser(P, (db) => lab.updateItem(db, id, { archived: true }));
    expect((await asUser(P, (db) => lab.listItems(db))).some((i) => i.id === id)).toBe(false);
    expect((await asUser(P, (db) => lab.listItems(db, true))).some((i) => i.id === id)).toBe(true);
    await expect(asUser(P, (db) => db.query('delete from public.platform_items where id = $1', [id]))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(P, (db) => db.query(`update public.platform_items set kind = 'plan' where id = $1`, [id]))).rejects.toMatchObject({ code: 'P0001' });
  });

  it('종류에 맞지 않는 상태, 빈 제목, 잘못된 링크는 거부한다', async () => {
    await expect(asUser(P, (db) => lab.createItem(db, { kind: 'todo', title: 'x', status: 'adopted' }))).rejects.toThrow('상태');
    await expect(asUser(P, (db) => lab.createItem(db, { kind: 'plan', title: '  ' }))).rejects.toThrow('제목');
    await expect(asUser(P, (db) => lab.createItem(db, { kind: 'lab', title: 'x', link: 'javascript:alert(1)' }))).rejects.toThrow('링크');
    await expect(asUser(P, (db) => lab.createItem(db, { kind: 'nope', title: 'x' }))).rejects.toThrow('종류');
  });

  it('학교 관리자는 보드를 보거나 쓸 수 없다', async () => {
    expect(await asUser(A.userId, (db) => lab.listItems(db, true))).toEqual([]);
    await expect(asUser(A.userId, (db) => lab.createItem(db, { kind: 'todo', title: '몰래' }))).rejects.toMatchObject({ code: '42501' });
    const any = (await asUser(P, (db) => lab.listItems(db)))[0];
    await expect(asUser(A.userId, (db) => lab.updateItem(db, any.id, { title: '변경' }))).rejects.toThrow('찾을 수 없습니다');
  });
});
