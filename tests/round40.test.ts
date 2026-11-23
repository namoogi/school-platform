/** 40차: 어디서나 여는 대화창 (ADR 0016) — 학교 관리자 대화, 승인 대기, 세션 답·결과 확인, 학교 간 거부(양방향) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const insp = await import('@/lib/inspector');
const c = await import('@/lib/control');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let P: string;
let T: string;
const SA = 'session_TESTschoolA01';
const scopeA = () => ({ isPlatform: false, schoolId: A.schoolId, userId: A.userId });
const scopeB = () => ({ isPlatform: false, schoolId: B.schoolId, userId: B.userId });
const scopeP = () => ({ isPlatform: true, schoolId: null, userId: P });
type Inbox = { message_id: number; target_session: string | null; body: string; choice: string | null; request: { id: string; topic: string; school: { slug: string } | null }; recent: unknown[] }[];
const inbox = () => asAgent((db) => c.control.inbox(db, T)) as Promise<Inbox>;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  const cl = new pg.Client({ connectionString: TEST_URL });
  await cl.connect();
  P = (await cl.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await cl.end();
  T = (await asUser(P, (db) => insp.createInspectorToken(db, { label: '관제', days: 7 }))).token;
  await asAgent((db) => c.control.register(db, T, { id: SA, name: 'A학교 세션', school: 'school-a' }));
});
afterAll(async () => { await getPool().end(); });

describe('대화창', () => {
  it('학교 관리자가 홈페이지 대화를 열면 그 학교를 맡은 세션으로 전달 대기 → 세션 답(결과 확인) → 확인 완료', async () => {
    const t = await asUser(A.userId, (db) => c.startChat(db, scopeA(), { topic: 'site_ui', body: '첫 화면 사진을 더 크게\n두 줄째' }));
    expect(t.status).toBe('answered');
    const mine = (await inbox()).find((m) => m.request.id === t.id)!;
    expect(mine).toMatchObject({ target_session: SA, body: '첫 화면 사진을 더 크게\n두 줄째', request: { topic: 'site_ui', school: { slug: 'school-a' } } });
    const th = await asUser(A.userId, (db) => c.getThread(db, scopeA(), t.id));
    expect(th.title).toBe('첫 화면 사진을 더 크게');
    expect(th.messages[0]).toMatchObject({ mine: true, author: 'user' });

    await asAgent((db) => c.control.delivered(db, T, String(mine.message_id), 'send_message'));
    await asAgent((db) => c.control.post(db, T, t.id, { kind: 'message', body: '고쳤습니다. 시안 확인 부탁', status: 'review', author_session: SA }));
    expect(await asUser(A.userId, (db) => c.chatBadge(db, scopeA()))).toBeGreaterThanOrEqual(1);
    const again = await asUser(A.userId, (db) => c.getThread(db, scopeA(), t.id));
    expect(again.status).toBe('review');
    expect(again.messages.at(-1)).toMatchObject({ author: 'session', kind: 'message', body: '고쳤습니다. 시안 확인 부탁' });
    await asUser(A.userId, (db) => c.chatAction(db, scopeA(), t.id, 'confirm'));
    expect((await asUser(A.userId, (db) => c.getThread(db, scopeA(), t.id))).status).toBe('done');
  });

  it('다시 수정 요청은 같은 세션으로 다시 간다', async () => {
    const t = await asUser(A.userId, (db) => c.startChat(db, scopeA(), { topic: 'school_ai', body: '소식 하나 초안' }));
    await asAgent((db) => c.control.post(db, T, t.id, { kind: 'message', body: '초안 올림', status: 'review', author_session: SA }));
    await asUser(A.userId, (db) => c.sendChat(db, scopeA(), t.id, { body: '제목을 짧게', revise: true }));
    const m = (await inbox()).find((x) => x.request.id === t.id && x.body === '제목을 짧게')!;
    expect(m.target_session).toBe(SA);
    expect(m.recent.length).toBeGreaterThanOrEqual(2); // 앞 대화 맥락을 함께 준다
    expect((await asUser(A.userId, (db) => c.getThread(db, scopeA(), t.id))).status).toBe('answered');
  });

  it('학교의 시스템 기능 요청은 승인 대기 → 전달되지 않음 → 학교는 스스로 승인 못 함 → 전체 관리자 승인 뒤 관제로', async () => {
    const t = await asUser(A.userId, (db) => c.startChat(db, scopeA(), { topic: 'system', body: '성적표 내려받기 기능' }));
    expect(t.status).toBe('pending');
    expect((await inbox()).some((m) => m.request.id === t.id)).toBe(false);
    await expect(asUser(A.userId, (db) => c.chatAction(db, scopeA(), t.id, 'approve'))).rejects.toThrow('전체 관리자');
    await expect(asUser(A.userId, (db) => db.query(`update public.control_requests set status = 'answered' where id = $1`, [t.id]))).rejects.toThrow('전체 관리자');
    // 학교 관리자가 처음부터 'answered'로 넣는 것도 RLS가 막는다
    await expect(asUser(A.userId, (db) => db.query(
      `insert into public.control_requests(kind, title, topic, school_id, status, author) values ('chat', 'x', 'system', $1, 'answered', 'user')`, [A.schoolId]))).rejects.toThrow();
    await asUser(P, (db) => c.chatAction(db, scopeP(), t.id, 'approve'));
    const m = (await inbox()).find((x) => x.request.id === t.id)!;
    expect(m.target_session).toBeNull(); // 시스템 기능은 학교 세션이 아니라 관제가 정한다
    await asAgent((db) => c.control.assign(db, T, t.id, 'session_013RZyUnii47zkGXkmqAhPmt'));
    await asUser(A.userId, (db) => c.sendChat(db, scopeA(), t.id, { body: 'PDF로' }));
    expect((await inbox()).find((x) => x.body === 'PDF로')!.target_session).toBe('session_013RZyUnii47zkGXkmqAhPmt');
  });

  it('학교 관리자는 관제 센터 대화를 열지 못하고, 관제 대화는 학교 화면에 보이지 않는다', async () => {
    await expect(asUser(A.userId, (db) => c.startChat(db, scopeA(), { topic: 'control', body: 'x' }))).rejects.toThrow('전체 관리 화면');
    const list = await asUser(A.userId, (db) => c.listThreads(db, scopeA()));
    expect(list.every((t) => t.school_id === A.schoolId)).toBe(true);
    const all = await asUser(P, (db) => c.listThreads(db, scopeP()));
    expect(all.some((t) => t.topic === 'control')).toBe(true);
  });

  it('학교 간 거부: A의 대화를 B가 읽거나 글을 쓰지 못하고, 그 반대도 같다', async () => {
    const a = await asUser(A.userId, (db) => c.startChat(db, scopeA(), { topic: 'site_ui', body: 'A 전용' }));
    const b = await asUser(B.userId, (db) => c.startChat(db, scopeB(), { topic: 'site_ui', body: 'B 전용' }));
    // 화면 범위(scope)를 속여도 RLS가 막는다
    const fakeB = { isPlatform: false, schoolId: null, userId: B.userId };
    await expect(asUser(B.userId, (db) => c.getThread(db, fakeB, a.id))).rejects.toThrow('찾을 수 없습니다');
    await expect(asUser(A.userId, (db) => c.getThread(db, { ...fakeB, userId: A.userId }, b.id))).rejects.toThrow('찾을 수 없습니다');
    expect((await asUser(B.userId, (db) => c.listThreads(db, fakeB))).some((t) => t.id === a.id)).toBe(false);
    expect((await asUser(A.userId, (db) => c.listThreads(db, { ...fakeB, userId: A.userId }))).some((t) => t.id === b.id)).toBe(false);
    await expect(asUser(B.userId, (db) => db.query(
      `insert into public.control_messages(request_id, author, kind, body, deliver) values ($1, 'user', 'message', 'x', true)`, [a.id]))).rejects.toThrow();
    await expect(asUser(A.userId, (db) => db.query(
      `insert into public.control_messages(request_id, author, kind, body, deliver) values ($1, 'user', 'message', 'x', true)`, [b.id]))).rejects.toThrow();
    // 다른 학교 대화를 내 학교로 옮길 수도 없다
    await expect(asUser(A.userId, (db) => db.query(`update public.control_requests set school_id = $2 where id = $1`, [a.id, B.schoolId]))).rejects.toThrow();
  });

  it('세션이 학교 결정 요청을 올리면 그 학교 관리자 대화창에서 고른다(카드 = 바로 결정)', async () => {
    const r = await asAgent((db) => c.control.file(db, T, {
      title: '메뉴 이름', detail: '‘소식’과 ‘알림’ 중', school: 'school-a', topic: 'site_ui', source_session: SA, reversible: true,
      options: [{ key: 'news', label: '소식' }, { key: 'notice', label: '알림' }], recommended: 'news',
    })) as { id: string; status: string };
    expect(r.status).toBe('proceeding');
    const list = await asUser(A.userId, (db) => c.listThreads(db, scopeA()));
    expect(list.find((t) => t.id === r.id)?.kind).toBe('decision');
    expect((await asUser(B.userId, (db) => c.listThreads(db, scopeB()))).some((t) => t.id === r.id)).toBe(false);
    await asUser(A.userId, (db) => c.sendChat(db, scopeA(), r.id, { choice: 'notice', body: '아이콘도' }));
    const m = (await inbox()).find((x) => x.request.id === r.id)!;
    expect(m).toMatchObject({ choice: 'notice', target_session: SA, body: '아이콘도' });
    await expect(asUser(A.userId, (db) => c.sendChat(db, scopeA(), r.id, { own: true, body: '' }))).rejects.toThrow('직접 작성한 안');
  });

  it('메시지의 학교는 대화의 학교를 따른다(다른 학교를 적어도 덮어씀)', async () => {
    const a = await asUser(A.userId, (db) => c.startChat(db, scopeA(), { topic: 'site_ui', body: '학교 확인' }));
    await asUser(A.userId, (db) => db.query(
      `insert into public.control_messages(request_id, author, kind, body, deliver, school_id) values ($1, 'user', 'message', 'y', false, $2)`, [a.id, B.schoolId]));
    const cl = new pg.Client({ connectionString: TEST_URL });
    await cl.connect();
    const { rows } = await cl.query(`select distinct school_id from public.control_messages where request_id = $1`, [a.id]);
    await cl.end();
    expect(rows).toEqual([{ school_id: A.schoolId }]);
  });
});
