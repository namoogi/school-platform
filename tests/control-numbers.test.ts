/** 134차 ADR 0051: 관제가 차시·ADR·마이그레이션 번호를 나눠 준다 — 겹치지 않고, 본 번호(floor)보다 크고, 고칠 수 없다 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const c = await import('@/lib/control');
const route = await import('@/app/api/control/numbers/route');

let P: string; let T: string;
const S = 'session_013RZyUnwt4z9YdwgRdiKz8U';
const S2 = 'session_013RZyUq3bukJr2ggdSiQ2vt';
type Got = { kind: string; value: number; label: string };
const reserve = (body: Record<string, unknown>) => asAgent((db) => c.control.reserve(db, T, body)) as Promise<Got>;
const post = async (body: unknown, token = T) => {
  const res = await route.POST(new Request('http://x/api/control/numbers', { method: 'POST', headers: { 'x-inspector-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  const cl = new pg.Client({ connectionString: TEST_URL }); await cl.connect();
  P = (await cl.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id; await cl.end();
  T = (await asUser(P, (db) => insp.createInspectorToken(db, { days: 7 }))).token;
});
afterAll(async () => { await getPool().end(); });

describe('관제 번호 나눠 주기', () => {
  it('차시: 본 번호(floor)보다 크고, 다음 세션은 그다음 번호를 받는다', async () => {
    const a = await reserve({ kind: 'round', session: S, title: '편집 화면', floor: 133 });
    expect(a).toEqual({ kind: 'round', value: 134, label: '134차' });
    // 다른 세션이 낡은 floor(130)를 보내도 이미 나간 번호보다 큰 값을 받는다
    const b = await reserve({ kind: 'round', session: S2, title: '메뉴', floor: 130 });
    expect(b.value).toBe(135);
    // floor가 더 크면 그 위로 건너뛴다(그 사이 번호는 비어 둔다)
    expect((await reserve({ kind: 'round', session: S, title: '건너뜀', floor: 140 })).value).toBe(141);
  });

  it('ADR은 네 자리 표기, 종류마다 따로 센다', async () => {
    const a = await reserve({ kind: 'adr', session: S, title: '번호 규칙', floor: 50 });
    expect(a).toEqual({ kind: 'adr', value: 51, label: '0051' });
  });

  it('마이그레이션: 오늘 날짜 + 100씩, 본 번호보다 크다', async () => {
    const day = Number(new Date().toISOString().slice(0, 10).replaceAll('-', '')) * 1_000_000;
    const a = await reserve({ kind: 'migration', session: S, title: 'x', floor: day + 2000 });
    expect(a.value).toBe(day + 2100);
    expect((await reserve({ kind: 'migration', session: S2, title: 'y' })).value).toBe(day + 2200);
    // 어제 날짜의 floor는 오늘 번호에 영향이 없다
    expect((await reserve({ kind: 'migration', session: S2, title: 'z', floor: day - 1_000_000 + 9900 })).value).toBe(day + 2300);
    expect(String(a.label)).toMatch(/^\d{14}$/);
  });

  it('동시에 받아도 같은 번호가 나오지 않는다', async () => {
    const got = await Promise.all(Array.from({ length: 8 }, (_, i) => reserve({ kind: 'round', session: S, title: `동시 ${i}` })));
    const values = got.map((g) => g.value);
    expect(new Set(values).size).toBe(8);
  });

  it('잘못된 요청·토큰은 거부하고, 받은 번호는 고치거나 지울 수 없다', async () => {
    expect((await post({ kind: 'page', session: S, title: 'x' })).status).toBe(400);
    expect((await post({ kind: 'round', session: 'nope', title: 'x' })).status).toBe(400);
    expect((await post({ kind: 'round', session: S, title: '' })).status).toBe(400);
    expect((await post({ kind: 'round', session: S, title: 'x', floor: 'abc' })).status).toBe(400);
    expect((await post({ kind: 'round', session: S, title: 'x' }, 'insp_' + '0'.repeat(64))).status).toBe(401);
    const ok = await post({ kind: 'round', session: S, title: '경로' });
    expect(ok.status).toBe(200);
    expect(ok.body.label).toMatch(/^\d+차$/);
    const su = new pg.Client({ connectionString: TEST_URL }); await su.connect();
    await expect(su.query(`update public.control_numbers set title = 'y' where kind = 'round'`)).rejects.toThrow(/고치거나 지우지/);
    await expect(su.query(`delete from public.control_numbers`)).rejects.toThrow(/고치거나 지우지/);
    await su.end();
  });

  it('목록은 전체 관리자(점검 토큰)만, 사람 학교 사용자는 표를 읽지 못한다', async () => {
    const list = await asAgent((db) => c.control.numbers(db, T, 'adr')) as { value: number }[];
    expect(list.map((x) => x.value)).toEqual([51]);
    const cl = new pg.Client({ connectionString: TEST_URL }); await cl.connect();
    const u = (await cl.query(`select id from private.app_users where email <> 'platform@example.test' order by email limit 1`)).rows[0].id;
    await cl.end();
    const rows = await asUser(u, (db) => db.query('select * from public.control_numbers'));
    expect(rows.rows).toEqual([]);
  });
});
