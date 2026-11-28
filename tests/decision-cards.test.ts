/** 129차: 결정 카드 표준 (ADR 0048) — 세션이 올리는 결정 요청의 형식 검사 · 문 종류 → 상태 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const c = await import('@/lib/control');

let P: string;
let T: string;
const RAS = 'session_013RZyUq3bukJr2ggdSiQ2vt';
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
const base = () => ({
  source_session: RAS, door: 'default', ask: '소식 목록을 카드로 바꿀까요?',
  changes: '소식 쪽이 사진 카드 3열이 됩니다.', unchanged: '글·주소·공개 여부는 그대로입니다.', undo: '목록형을 다시 고르면 됩니다.',
  options: [{ key: 'cards', label: '사진 카드' }, { key: 'list', label: '목록 유지' }], recommended: 'cards',
  due_at: day(2), default_action: '사진 카드로 바꿉니다.',
});
let n = 0;
const file = (p: Record<string, unknown>) => asAgent((db) => c.control.file(db, T, { title: `카드 ${++n}`, ...p })) as Promise<Record<string, unknown>>;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  const cl = new pg.Client({ connectionString: TEST_URL });
  await cl.connect();
  P = (await cl.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await cl.end();
  T = (await asUser(P, (db) => insp.createInspectorToken(db, { label: '관제', days: 7 }))).token;
});
afterAll(async () => { await getPool().end(); });

describe('결정 카드', () => {
  it('기한 진행 카드: 추천안으로 진행 중, 칸이 그대로 저장되고 관제 목록에 나온다', async () => {
    const r = await file(base());
    expect(r).toMatchObject({ status: 'proceeding', reversible: true, door: 'default', ask: '소식 목록을 카드로 바꿀까요?', default_action: '사진 카드로 바꿉니다.' });
    const { requests } = await asUser(P, (db) => c.listControl(db));
    expect(requests.find((x) => x.id === r.id)).toMatchObject({ door: 'default', changes: '소식 쪽이 사진 카드 3열이 됩니다.', undo: '목록형을 다시 고르면 됩니다.' });
  });

  it('한쪽 문 카드: 보류(사람을 기다림), 기한은 받지 않는다', async () => {
    const { due_at: _d, default_action: _a, ...rest } = base();
    const r = await file({ ...rest, door: 'one_way', ask: '옛 사진 165개를 지울까요?' });
    expect(r).toMatchObject({ status: 'parked', reversible: false, door: 'one_way' });
    await expect(file({ ...rest, door: 'one_way', due_at: day(1) })).rejects.toThrow('기한(due_at)은 기한까지 진행(default) 카드에만');
    await expect(file({ ...rest, door: 'one_way', default_action: '지웁니다' })).rejects.toThrow('default_action 은 기한까지 진행(default) 카드에만');
  });

  it('알림 카드: changes만 있으면 되고 선택지는 두지 않는다', async () => {
    const r = await file({ source_session: RAS, door: 'notice', changes: '번역 40개를 채웠습니다.' });
    expect(r).toMatchObject({ status: 'proceeding', door: 'notice', ask: null });
    await expect(file({ source_session: RAS, door: 'notice', changes: 'x', options: [{ key: 'a', label: 'a' }] })).rejects.toThrow('알림(notice) 카드에는 선택지를');
    // 질문을 알림에 실어 결정 흐름을 건너뛰지 못한다
    await expect(file({ source_session: RAS, door: 'notice', changes: 'x', ask: '학생 자료를 공개할까요?' })).rejects.toThrow('ask·default_action·recommended');
    await expect(file({ source_session: RAS, door: 'notice', changes: 'x', default_action: '공개합니다' })).rejects.toThrow('ask·default_action·recommended');
  });

  it('형식이 빠지면 무엇이 빠졌는지 알려 주며 거부한다', async () => {
    const b = base();
    await expect(file({ ...b, door: undefined })).rejects.toThrow('DECISION-CARDS.md');
    await expect(file({ ...b, door: 'maybe' })).rejects.toThrow('door 는 one_way');
    await expect(file({ ...b, changes: '' })).rejects.toThrow('changes(승인하면 바뀌는 것');
    await expect(file({ ...b, ask: '카드로 바꿉니다.' })).rejects.toThrow('물음표로 끝남');
    await expect(file({ ...b, ask: `${'가'.repeat(120)}?` })).rejects.toThrow('120자 이내');
    await expect(file({ ...b, ask: '첫 질문?\n실제로는 다른 질문?' })).rejects.toThrow('한 줄 질문');
    await expect(file({ ...b, source_session: null })).rejects.toThrow('맡을 세션(source_session)');
    await expect(file({ ...b, undo: '' })).rejects.toThrow('undo(되돌리는 길)');
    await expect(file({ ...b, due_at: day(-1) })).rejects.toThrow('30일 안의 due_at');
    await expect(file({ ...b, due_at: day(31) })).rejects.toThrow('30일 안의 due_at');
    await expect(file({ ...b, due_at: '다음 주' })).rejects.toThrow('30일 안의 due_at');
    // 시간대 없는 값·날짜만·특수 값은 DB 시간대로 해석되므로 받지 않는다
    await expect(file({ ...b, due_at: 'tomorrow' })).rejects.toThrow('30일 안의 due_at');
    await expect(file({ ...b, due_at: day(2).slice(0, 10) })).rejects.toThrow('30일 안의 due_at');
    await expect(file({ ...b, due_at: day(2).replace('Z', '') })).rejects.toThrow('30일 안의 due_at');
    await expect(file({ ...b, due_at: Date.now() + 86400000 })).rejects.toThrow('30일 안의 due_at');
    await expect(file({ ...b, default_action: '' })).rejects.toThrow('default_action');
    await expect(file({ ...b, options: [{ key: 'a', label: 'a' }] })).rejects.toThrow('2~4개');
    await expect(file({ ...b, recommended: null })).rejects.toThrow('2~4개');
    await expect(file({ ...b, recommended: 'zzz' })).rejects.toThrow('선택지 key 가운데');
    await expect(file({ ...b, reversible: false })).rejects.toThrow('reversible 과 door 가 엇갈립니다');
    await expect(file({ ...b, reversible: 'false' })).rejects.toThrow('reversible 과 door 가 엇갈립니다');
    expect(await file({ ...b, reversible: null })).toMatchObject({ reversible: true });
    expect(await file({ ...b, due_at: day(2).replace('Z', '+09:00') })).toMatchObject({ door: 'default' });
  });

  it('같은 세션·같은 제목의 열린 요청은 새로 만들지 않고 돌려준다', async () => {
    const r = await asAgent((db) => c.control.file(db, T, { title: '겹치는 카드', ...base() })) as { id: string };
    const again = await asAgent((db) => c.control.file(db, T, { title: '겹치는 카드', source_session: RAS })) as { id: string; existing: boolean };
    expect(again).toMatchObject({ id: r.id, existing: true });
  });

  it('DB 문구마다 같은 글자의 db.* 이름표가 있다(번역이 조용히 멈추지 않게)', async () => {
    const { CATALOG } = await import('@/lib/i18n/catalog');
    const fs = await import('node:fs');
    const sql = fs.readFileSync('supabase/migrations/20261128001800_decision_cards.sql', 'utf8');
    const msgs = [...sql.matchAll(/raise exception '([^']+)'/g)].map((m) => m[1]).filter((m) => /카드|due_at|reversible 과/.test(m));
    const values = new Set<string>(Object.values(CATALOG));
    expect(msgs.length).toBeGreaterThan(8);
    for (const m of msgs) expect(values.has(m), m).toBe(true);
  });
});
