/** 39차: 관제 센터 (ADR 0015) — 결정 요청 → 사람의 답·지시 → 전달됨, 작성자·권한 경계 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool, INSPECTOR_ID } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const c = await import('@/lib/control');

let A: { schoolId: string; userId: string };
let P: string;
let T: string;
const RAS = 'session_013RZyUq3bukJr2ggdSiQ2vt';
const CTRL = 'session_013RZyUnii47zkGXkmqAhPmt';

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A } = await lookupIds());
  const cl = new pg.Client({ connectionString: TEST_URL });
  await cl.connect();
  P = (await cl.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await cl.end();
  T = (await asUser(P, (db) => insp.createInspectorToken(db, { label: '관제', days: 7 }))).token;
});
afterAll(async () => { await getPool().end(); });

describe('관제 센터', () => {
  it('시작 내용: 결정 요청함 9건과 세션 목록이 있다', async () => {
    const { requests, sessions } = await asUser(P, (db) => c.listControl(db));
    expect(requests).toHaveLength(9);
    expect(requests.find((r) => r.no === 1)).toMatchObject({ kind: 'decision', recommended: 'A2', status: 'open' });
    expect(sessions.map((s) => s.id)).toContain(RAS);
  });

  it('세션이 결정 요청을 올리고 → 선생님이 선택지·추가 요청사항으로 답하면 → 전달 대기 → 관제가 전달됨 표시', async () => {
    const filed = await asAgent((db) => c.control.file(db, T, {
      title: '소식 목록 카드 모양', detail: '카드와 목록 중 고릅니다.', source_session: RAS, reversible: true, recommended: 'cards',
      options: [{ key: 'cards', label: '카드' }, { key: 'list', label: '목록' }],
    })) as { id: string; status: string; no: number };
    expect(filed.status).toBe('proceeding'); // 되돌릴 수 있으면 추천안으로 진행 중
    // 같은 세션·같은 제목이면 새로 만들지 않는다
    const again = await asAgent((db) => c.control.file(db, T, { title: '소식 목록 카드 모양', source_session: RAS })) as { id: string; existing: boolean };
    expect(again).toMatchObject({ id: filed.id, existing: true });

    const ans = await asUser(P, (db) => c.answerRequest(db, filed.id, { choice: 'list', body: '목록으로 하되 날짜를 앞에.' }));
    expect(ans.status).toBe('answered');
    const inbox = await asAgent((db) => c.control.inbox(db, T)) as { message_id: number; choice_label: string; body: string; target_session: string; request: { title: string } }[];
    const mine = inbox.find((m) => m.request.title === '소식 목록 카드 모양')!;
    expect(mine).toMatchObject({ choice_label: '목록', body: '목록으로 하되 날짜를 앞에.', target_session: RAS }); // 받는 곳 기본값 = 요청한 세션

    await asAgent((db) => c.control.delivered(db, T, String(mine.message_id), 'send_message 완료'));
    await expect(asAgent((db) => c.control.delivered(db, T, String(mine.message_id), null))).rejects.toThrow('이미 전달');
    const after = (await asUser(P, (db) => c.listControl(db))).requests.find((r) => r.id === filed.id)!;
    expect(after.status).toBe('delivered');
    expect(after.messages.find((m) => m.id === mine.message_id)?.delivery_note).toBe('send_message 완료');

    // 세션이 보고하며 끝남으로
    await asAgent((db) => c.control.post(db, T, filed.id, { body: 'PR 병합', status: 'done', author_session: RAS }));
    const done = (await asUser(P, (db) => c.listControl(db))).requests.find((r) => r.id === filed.id)!;
    expect(done.status).toBe('done');
    expect(done.messages.at(-1)).toMatchObject({ author: 'session', author_session: RAS, kind: 'report' });
  });

  it('개발·연구소 항목에서 새 지시: 새 세션 만들어 실행', async () => {
    const lab = (await asUser(P, (db) => db.query(`select id from public.platform_items where kind = 'todo' limit 1`))).rows[0].id;
    const d = await asUser(P, (db) => c.createDirective(db, { title: '할 일 정리', detail: '세부', body: '추가', lab_item_id: lab, new_session: true }));
    const inbox = await asAgent((db) => c.control.inbox(db, T)) as { new_session: boolean; request: { id: string }; lab_item: { title: string } | null }[];
    const m = inbox.find((x) => x.request.id === d.id)!;
    expect(m.new_session).toBe(true);
    expect(m.lab_item).not.toBeNull();
    await expect(asUser(P, (db) => c.createDirective(db, { title: '받는 곳 없음' }))).rejects.toThrow('받을 세션');
  });

  it('받을 곳 없이 남긴 답은 메모이고 전달 대상이 아니다', async () => {
    const r = (await asUser(P, (db) => c.listControl(db))).requests.find((x) => x.no === 7)!;
    const res = await asUser(P, (db) => c.answerRequest(db, r.id, { body: '조금 더 생각해 볼게요', target_session: '' }));
    expect(res.status).toBe('open');
    const inbox = await asAgent((db) => c.control.inbox(db, T)) as { request: { id: string } }[];
    expect(inbox.some((m) => m.request.id === r.id)).toBe(false);
  });

  it('토큰 없이·틀린 토큰·폐기한 토큰은 거부된다', async () => {
    await expect(asAgent((db) => c.control.inbox(db, 'insp_' + '0'.repeat(64)))).rejects.toMatchObject({ code: '28000' });
    const { token } = await asUser(P, (db) => insp.createInspectorToken(db, { days: 7 }));
    const [t] = await asUser(P, (db) => insp.listInspectorTokens(db));
    await asUser(P, (db) => insp.revokeInspectorToken(db, t.id));
    await expect(asAgent((db) => c.control.sessions(db, token))).rejects.toMatchObject({ code: '28000' });
  });

  it('점검 토큰 요청 역할은 표를 직접 읽거나 쓰지 못하고, 사람의 이름(user)으로 쓰지 못한다', async () => {
    await expect(asAgent((db) => db.query('select * from public.control_messages'))).rejects.toMatchObject({ code: '42501' });
    await expect(asAgent((db) => db.query(`select * from public.platform_items`))).rejects.toMatchObject({ code: '42501' });
    const r = (await asUser(P, (db) => c.listControl(db))).requests[0];
    await expect(asAgent((db) => c.control.post(db, T, r.id, { kind: 'answer', body: 'x' }))).rejects.toThrow('보고·메모·상태');
  });

  it('학교 관리자는 관제 센터를 읽지도 쓰지도 못한다. 점검 계정의 화면 요청(로그인 경로)은 읽기만', async () => {
    const { requests } = await asUser(A.userId, (db) => c.listControl(db));
    expect(requests).toHaveLength(0);
    await expect(asUser(A.userId, (db) => c.createDirective(db, { title: 'x', target_session: RAS }))).rejects.toThrow();
    const insRead = await asUser(INSPECTOR_ID, (db) => c.listControl(db));
    expect(insRead.requests.length).toBeGreaterThan(0);
    const r = insRead.requests[0];
    await expect(asUser(INSPECTOR_ID, (db) => c.answerRequest(db, r.id, { body: 'x', target_session: CTRL }))).rejects.toMatchObject({ code: '25006' });
  });

  it('대화 기록은 고치거나 지울 수 없고, 요청은 지우지 않는다', async () => {
    const cl = new pg.Client({ connectionString: TEST_URL });
    await cl.connect();
    try {
      await expect(cl.query(`update public.control_messages set body = 'x' where id = (select min(id) from public.control_messages)`)).rejects.toThrow('고칠 수 없습니다');
      await expect(cl.query(`delete from public.control_messages`)).rejects.toThrow('지울 수 없습니다');
      await expect(cl.query(`delete from public.control_requests`)).rejects.toThrow('접음');
      await expect(cl.query(`update public.control_requests set kind = 'directive' where no = 1`)).rejects.toThrow('바꿀 수 없습니다');
    } finally { await cl.end(); }
  });

  it('세션 등록·갱신', async () => {
    await asAgent((db) => c.control.register(db, T, { id: 'session_TESTabcdef12', name: '시험 세션', tags: ['adr-0015'] }));
    await asAgent((db) => c.control.register(db, T, { id: 'session_TESTabcdef12', active: false }));
    const s = (await asAgent((db) => c.control.sessions(db, T)) as { id: string; name: string; active: boolean; tags: string[] }[]).find((x) => x.id === 'session_TESTabcdef12');
    expect(s).toMatchObject({ name: '시험 세션', active: false, tags: ['adr-0015'] });
    await expect(asAgent((db) => c.control.register(db, T, { id: 'bad id' }))).rejects.toThrow('형식');
  });
});
