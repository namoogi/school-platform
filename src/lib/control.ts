import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 39차: 관제 센터 (ADR 0015). 결정 요청함 + 지시 전달.
 * - 사람(전체 관리자): 요청을 보고 선택지·추가 요청사항으로 답하거나 새 지시를 남긴다. RLS가 author='user'만 허용.
 * - Claude 세션(점검 토큰): control.* 함수로 요청 올리기·보고·전달됨 표시 (src/app/api/control).
 */
import { CLOSED, type Option, type Request, type Session, type Status, type ThreadSummary, type Topic, TOPIC } from './control-shared';
export * from './control-shared';

export async function listControl(db: Db) {
  const { rows: requests } = await db.query<Request>(
    `select r.id, r.no, r.kind, r.title, r.detail, r.options, r.recommended, r.reversible, r.related, r.lab_item_id, r.source_session,
            r.status, r.topic, r.school_id, r.assignee_session, r.door, r.ask, r.default_action, r.due_at, r.changes, r.unchanged, r.undo, (select name from public.schools s where s.id = r.school_id) as school_name,
            r.author, r.created_at, r.updated_at,
            coalesce((select jsonb_agg(to_jsonb(m) - 'request_id' - 'created_by' order by m.id) from public.control_messages m where m.request_id = r.id), '[]') as messages
       from public.control_requests r order by r.no desc`);
  const { rows: sessions } = await db.query<Session>(
    'select id, name, role, tags, active, school_id from public.control_sessions order by active desc, created_at');
  return { requests, sessions };
}

async function sessionRef(db: Db, v: unknown): Promise<string | null> {
  const s = v ? String(v) : '';
  if (!s) return null;
  const { rows } = await db.query('select 1 from public.control_sessions where id = $1 and active', [s]);
  if (!rows.length) throw new ValidationError('err.ctl.pickSession');
  return s;
}

function text(v: unknown, max: number, label: string) {
  const s = String(v ?? '');
  if (s.length > max) throw new ValidationError('err.whatTooLong', { what: label });
  return s;
}

/** 새 지시: 개발·연구소 항목에서 오거나 직접 적는다. 받는 곳은 세션 하나 또는 '새 세션 만들어 실행' */
export async function createDirective(db: Db, input: Record<string, unknown>) {
  const title = String(input.title ?? '').trim();
  if (!title) throw new ValidationError('err.titleRequired');
  if (title.length > 200) throw new ValidationError('err.title200');
  const detail = text(input.detail, 20000, '세부 내용');
  const body = text(input.body, 20000, '추가 요청사항');
  const lab = input.lab_item_id ? String(input.lab_item_id) : null;
  if (lab && !isUuid(lab)) throw new ValidationError('err.lab.linkTarget');
  const newSession = input.new_session === true;
  const target = newSession ? null : await sessionRef(db, input.target_session);
  if (!target && !newSession) throw new ValidationError('err.ctl.pickSessionOrNew');
  const { rows: [r] } = await db.query<{ id: string; no: number }>(
    `insert into public.control_requests(kind, title, detail, lab_item_id, source_session, status, author)
     values ('directive', $1, $2, $3, $4, 'answered', 'user') returning id, no`, [title, detail, lab, target]);
  await db.query(
    `insert into public.control_messages(request_id, author, kind, body, target_session, new_session, deliver)
     values ($1, 'user', 'directive', $2, $3, $4, true)`, [r.id, body, target, newSession]);
  return r;
}

/**
 * 요청에 답하기: 선택지(choice) + 추가 요청사항(body) + 받을 곳.
 * 받을 곳이 있으면 '전달 대기'가 되고 관제가 세션에 보낸다. 받을 곳 없이 남기면 메모(note).
 */
export async function answerRequest(db: Db, id: string, input: Record<string, unknown>) {
  if (!isUuid(id)) throw new NotFoundError('db.requestNotFound');
  const { rows: [r] } = await db.query<{ options: Option[]; source_session: string | null; status: Status }>(
    'select options, source_session, status from public.control_requests where id = $1', [id]);
  if (!r) throw new NotFoundError('db.requestNotFound');
  const choice = input.choice ? String(input.choice) : null;
  if (choice && !r.options.some((o) => o.key === choice)) throw new ValidationError('err.ctl.badOption');
  const body = text(input.body, 20000, '추가 요청사항').trim();
  const newSession = input.new_session === true;
  const target = newSession ? null : await sessionRef(db, input.target_session === undefined ? r.source_session : input.target_session);
  const deliver = newSession || !!target;
  if (!choice && !body) throw new ValidationError('err.ctl.optionOrNote');
  const { rows: [m] } = await db.query<{ id: number }>(
    `insert into public.control_messages(request_id, author, kind, choice, body, target_session, new_session, deliver)
     values ($1, 'user', $2, $3, $4, $5, $6, $7) returning id`,
    [id, deliver ? (choice ? 'answer' : 'directive') : 'note', choice, body, target, newSession, deliver]);
  if (deliver) await db.query(`update public.control_requests set status = 'answered' where id = $1`, [id]);
  return { id: m.id, delivered: false, status: deliver ? 'answered' : r.status };
}

export async function setRequestStatus(db: Db, id: string, status: unknown) {
  if (!isUuid(id)) throw new NotFoundError('db.requestNotFound');
  const s = String(status ?? '');
  if (!['open', 'done', 'dropped'].includes(s)) throw new ValidationError('err.ctl.closeOnly');
  const { rowCount } = await db.query('update public.control_requests set status = $2 where id = $1', [id, s]);
  if (!rowCount) throw new NotFoundError('db.requestNotFound');
  await db.query(`insert into public.control_messages(request_id, author, kind, choice) values ($1, 'user', 'status', $2)`, [id, s]);
  return { id, status: s };
}

// ── Claude 세션 (점검 토큰) ── 함수가 토큰을 확인한다
const q = async (db: Db, sql: string, args: unknown[]) => (await db.query<{ r: unknown }>(sql, args)).rows[0]?.r;
// ── 41차: 대화창 (ADR 0017) ── 사람 쪽은 모두 RLS(전체 관리자 · 그 학교 관리자) 안에서 돈다
/** 보는 범위: platform = 모든 대화, school = 그 학교 대화만(전체 관리자가 학교 화면에서 열어도 그 학교만) */
export type ChatScope = { isPlatform: boolean; schoolId: string | null; userId: string };

const TITLE_MAX = 80;
const firstLine = (s: string) => s.trim().split('\n')[0].slice(0, TITLE_MAX) || '대화';

export async function listThreads(db: Db, scope: ChatScope): Promise<ThreadSummary[]> {
  const { rows } = await db.query<ThreadSummary>(
    `select r.id, r.no, r.kind, r.title, r.status, r.topic, r.school_id, r.assignee_session, r.door,
            (select name from public.schools s where s.id = r.school_id) as school_name,
            greatest(r.updated_at, coalesce(l.created_at, r.updated_at)) as activity_at,
            case when l.id is null then null else jsonb_build_object('author', l.author, 'body', left(l.body, 140), 'kind', l.kind) end as last
       from public.control_requests r
       left join lateral (select m.id, m.author, m.body, m.kind, m.created_at from public.control_messages m
                           where m.request_id = r.id and m.kind <> 'status' order by m.id desc limit 1) l on true
      where ($1::uuid is null or r.school_id = $1)
      order by activity_at desc limit 300`, [scope.schoolId]);
  return rows;
}

export async function getThread(db: Db, scope: ChatScope, id: string): Promise<Request> {
  if (!isUuid(id)) throw new NotFoundError('err.ctl.threadNotFound');
  const { rows: [r] } = await db.query<Request>(
    `select r.id, r.no, r.kind, r.title, r.detail, r.options, r.recommended, r.reversible, r.related, r.lab_item_id, r.source_session,
            r.assignee_session, r.status, r.topic, r.school_id, r.door, r.ask, r.default_action, r.due_at, r.changes, r.unchanged, r.undo, (select name from public.schools s where s.id = r.school_id) as school_name,
            r.author, r.created_at, r.updated_at,
            coalesce((select jsonb_agg(to_jsonb(m) - 'request_id' - 'created_by' - 'school_id'
                        || jsonb_build_object('author_name', case when m.author = 'user' then app.chat_author_name(m.created_by) end,
                                              'mine', m.author = 'user' and m.created_by = $2) order by m.id)
                        from public.control_messages m where m.request_id = r.id), '[]') as messages
       from public.control_requests r where r.id = $1 and ($3::uuid is null or r.school_id = $3)`, [id, scope.userId, scope.schoolId]);
  if (!r) throw new NotFoundError('err.ctl.threadNotFound');
  return r;
}

/** 받을 세션: 대화를 맡은 세션 → 그 학교를 맡은 세션 → 없으면 관제가 정한다(null) */
async function routeFor(db: Db, r: { assignee_session: string | null; school_id: string | null; topic: Topic }) {
  if (r.assignee_session) return r.assignee_session;
  // 시스템 기능은 플랫폼 일이라 학교 세션이 아니라 관제가 정한다
  if (!r.school_id || r.topic === 'system') return null;
  const { rows: [s] } = await db.query<{ id: string }>(
    'select id from public.control_sessions where school_id = $1 and active order by created_at limit 1', [r.school_id]);
  return s?.id ?? null;
}

export async function startChat(db: Db, scope: ChatScope, input: Record<string, unknown>) {
  const topic = String(input.topic ?? '') as Topic;
  if (!(topic in TOPIC)) throw new ValidationError('err.ctl.topic');
  const body = text(input.body, 20000, '내용').trim();
  if (!body) throw new ValidationError('err.bodyRequired');
  const title = String(input.title ?? '').trim().slice(0, 200) || firstLine(body);
  // 학교 화면: 지금 학교(클라이언트 값을 쓰지 않음). 전체 관리 화면: 학교 주제는 고른 학교(RLS가 다시 확인)
  let schoolId: string | null = scope.schoolId;
  if (scope.schoolId === null && topic !== 'control') {
    const v = input.school_id ? String(input.school_id) : '';
    if (v && !isUuid(v)) throw new ValidationError('err.badSchool');
    schoolId = v || null;
  }
  if (topic === 'control') {
    if (!scope.isPlatform || scope.schoolId) throw new ValidationError('err.ctl.openFromAdmin');
    schoolId = null;
  }
  if ((topic === 'school_ai' || topic === 'site_ui') && !schoolId) throw new ValidationError('err.ctl.pickSchool');
  const status: Status = topic === 'system' && !scope.isPlatform ? 'pending' : 'answered';
  const assignee = scope.isPlatform && input.assignee_session ? await sessionRef(db, input.assignee_session) : null;
  const { rows: [r] } = await db.query<{ id: string; no: number }>(
    `insert into public.control_requests(kind, title, detail, topic, school_id, assignee_session, status, author)
     values ('chat', $1, '', $2, $3, $4, $5, 'user') returning id, no`, [title, topic, schoolId, assignee, status]);
  const target = await routeFor(db, { assignee_session: assignee, school_id: schoolId, topic });
  await db.query(
    `insert into public.control_messages(request_id, author, kind, body, target_session, deliver) values ($1, 'user', 'message', $2, $3, true)`,
    [r.id, body, target]);
  return { ...r, status };
}

/**
 * 대화에 글 보내기. choice = 결정 카드의 선택지(누르면 그 안으로 결정), own = '직접 작성한 안으로 계속'.
 * 승인 대기 대화는 글이 쌓이기만 하고 승인 뒤 함께 전달된다.
 */
export async function sendChat(db: Db, scope: ChatScope, id: string, input: Record<string, unknown>) {
  const r = await getThread(db, scope, id);
  if (CLOSED.includes(r.status)) throw new ValidationError('err.ctl.closed');
  const choice = input.choice ? String(input.choice) : null;
  if (choice && !r.options.some((o) => o.key === choice)) throw new ValidationError('err.ctl.badOption');
  let body = text(input.body, 20000, '내용').trim();
  if (input.own === true) {
    if (!body) throw new ValidationError('err.ctl.customOption');
    body = `직접 작성한 안: ${body}`;
  }
  if (!choice && !body) throw new ValidationError('err.bodyRequired');
  const target = await routeFor(db, r);
  const kind = choice || input.own === true ? 'answer' : input.revise === true ? 'directive' : 'message';
  const { rows: [m] } = await db.query<{ id: number }>(
    `insert into public.control_messages(request_id, author, kind, choice, body, target_session, deliver)
     values ($1, 'user', $2, $3, $4, $5, true) returning id`, [id, kind, choice, body, target]);
  const status: Status = r.status === 'pending' ? 'pending' : 'answered';
  if (status !== r.status) await db.query('update public.control_requests set status = $2 where id = $1', [id, status]);
  return { id: m.id, status };
}

/** 승인·반려(전체 관리자, 승인 대기), 확인 완료(결과 확인), 끝내기·접기·다시 열기 */
export async function chatAction(db: Db, scope: ChatScope, id: string, action: unknown) {
  const r = await getThread(db, scope, id);
  const a = String(action ?? '');
  const to: Record<string, Status> = { approve: 'answered', reject: 'dropped', confirm: 'done', close: 'done', drop: 'dropped', reopen: 'open' };
  if (!(a in to)) throw new ValidationError('err.notAllowed');
  if ((a === 'approve' || a === 'reject') && (!scope.isPlatform || r.status !== 'pending')) {
    throw new ValidationError('err.ctl.approvalByAdmin');
  }
  if (a === 'confirm' && r.status !== 'review') throw new ValidationError('err.ctl.notReview');
  if (a === 'reopen' && !CLOSED.includes(r.status)) throw new ValidationError('err.ctl.reopenClosedOnly');
  // 승인할 때 학교 요청의 받을 곳이 비어 있으면 관제가 정한다(inbox 로 간다)
  await db.query('update public.control_requests set status = $2 where id = $1', [id, to[a]]);
  await db.query(`insert into public.control_messages(request_id, author, kind, choice) values ($1, 'user', 'status', $2)`, [id, to[a]]);
  return { id, status: to[a] };
}

export async function chatBadge(db: Db, scope: ChatScope) {
  const { rows: [c] } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.control_requests r
      where ($1::uuid is null or r.school_id = $1)
        and (r.status in ('open', 'parked', 'review') or (r.status = 'pending' and $2)
             -- 기한 진행 결정 카드: 기한 전에 반대할 수 있게 숫자에 넣는다(ADR 0048)
             or (r.status = 'proceeding' and r.door = 'default'))`,
    [scope.schoolId, scope.isPlatform]);
  return c.n;
}

export const control = {
  inbox: (db: Db, t: string) => q(db, 'select control.inbox($1) as r', [t]),
  requests: (db: Db, t: string, status: string | null) => q(db, 'select control.requests($1, $2) as r', [t, status]),
  file: (db: Db, t: string, body: unknown) => q(db, 'select control.file_request($1, $2) as r', [t, JSON.stringify(body ?? {})]),
  post: (db: Db, t: string, id: string, body: unknown) => {
    if (!isUuid(id)) throw new NotFoundError('db.requestNotFound');
    return q(db, 'select control.post($1, $2, $3) as r', [t, id, JSON.stringify(body ?? {})]);
  },
  delivered: (db: Db, t: string, id: string, note: unknown) => {
    if (!/^\d{1,18}$/.test(id)) throw new NotFoundError('err.ctl.directiveNotFound');
    return q(db, 'select control.mark_delivered($1, $2, $3) as r', [t, id, note ? String(note) : null]);
  },
  register: (db: Db, t: string, body: unknown) => q(db, 'select control.register_session($1, $2) as r', [t, JSON.stringify(body ?? {})]),
  sessions: (db: Db, t: string) => q(db, 'select control.sessions($1) as r', [t]),
  thread: (db: Db, t: string, id: string) => {
    if (!isUuid(id)) throw new NotFoundError('db.requestNotFound');
    return q(db, 'select control.thread($1, $2) as r', [t, id]);
  },
  assign: (db: Db, t: string, id: string, session: unknown) => {
    if (!isUuid(id)) throw new NotFoundError('db.requestNotFound');
    return q(db, 'select control.assign($1, $2, $3) as r', [t, id, session ? String(session) : null]);
  },
};
