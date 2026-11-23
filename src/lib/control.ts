import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/**
 * 39차: 관제 센터 (ADR 0015). 결정 요청함 + 지시 전달.
 * - 사람(전체 관리자): 요청을 보고 선택지·추가 요청사항으로 답하거나 새 지시를 남긴다. RLS가 author='user'만 허용.
 * - Claude 세션(점검 토큰): control.* 함수로 요청 올리기·보고·전달됨 표시 (src/app/api/control).
 */
import { type Option, type Request, type Session, type Status } from './control-shared';
export * from './control-shared';

export async function listControl(db: Db) {
  const { rows: requests } = await db.query<Request>(
    `select r.id, r.no, r.kind, r.title, r.detail, r.options, r.recommended, r.reversible, r.related, r.lab_item_id, r.source_session,
            r.status, r.author, r.created_at, r.updated_at,
            coalesce((select jsonb_agg(to_jsonb(m) - 'request_id' - 'created_by' order by m.id) from public.control_messages m where m.request_id = r.id), '[]') as messages
       from public.control_requests r order by r.no desc`);
  const { rows: sessions } = await db.query<Session>(
    'select id, name, role, tags, active from public.control_sessions order by active desc, created_at');
  return { requests, sessions };
}

async function sessionRef(db: Db, v: unknown): Promise<string | null> {
  const s = v ? String(v) : '';
  if (!s) return null;
  const { rows } = await db.query('select 1 from public.control_sessions where id = $1 and active', [s]);
  if (!rows.length) throw new ValidationError('받을 세션을 목록에서 골라 주세요.');
  return s;
}

function text(v: unknown, max: number, label: string) {
  const s = String(v ?? '');
  if (s.length > max) throw new ValidationError(`${label}이 너무 깁니다.`);
  return s;
}

/** 새 지시: 개발·연구소 항목에서 오거나 직접 적는다. 받는 곳은 세션 하나 또는 '새 세션 만들어 실행' */
export async function createDirective(db: Db, input: Record<string, unknown>) {
  const title = String(input.title ?? '').trim();
  if (!title) throw new ValidationError('제목을 입력해 주세요.');
  if (title.length > 200) throw new ValidationError('제목은 200자 이내로 적어 주세요.');
  const detail = text(input.detail, 20000, '세부 내용');
  const body = text(input.body, 20000, '추가 요청사항');
  const lab = input.lab_item_id ? String(input.lab_item_id) : null;
  if (lab && !isUuid(lab)) throw new ValidationError('연결할 항목이 올바르지 않습니다.');
  const newSession = input.new_session === true;
  const target = newSession ? null : await sessionRef(db, input.target_session);
  if (!target && !newSession) throw new ValidationError('받을 세션을 고르거나 "새 세션 만들어 실행"을 골라 주세요.');
  const { rows: [r] } = await db.query<{ id: string; no: number }>(
    `insert into public.control_requests(kind, title, detail, lab_item_id, source_session, status, author)
     values ('directive', $1, $2, $3, $4, 'answered', 'user') returning id, no`, [title, detail, lab, target]);
  await db.query(
    `insert into public.control_messages(request_id, author, kind, body, target_session, new_session)
     values ($1, 'user', 'directive', $2, $3, $4)`, [r.id, body, target, newSession]);
  return r;
}

/**
 * 요청에 답하기: 선택지(choice) + 추가 요청사항(body) + 받을 곳.
 * 받을 곳이 있으면 '전달 대기'가 되고 관제가 세션에 보낸다. 받을 곳 없이 남기면 메모(note).
 */
export async function answerRequest(db: Db, id: string, input: Record<string, unknown>) {
  if (!isUuid(id)) throw new NotFoundError('요청을 찾을 수 없습니다.');
  const { rows: [r] } = await db.query<{ options: Option[]; source_session: string | null; status: Status }>(
    'select options, source_session, status from public.control_requests where id = $1', [id]);
  if (!r) throw new NotFoundError('요청을 찾을 수 없습니다.');
  const choice = input.choice ? String(input.choice) : null;
  if (choice && !r.options.some((o) => o.key === choice)) throw new ValidationError('선택지가 올바르지 않습니다.');
  const body = text(input.body, 20000, '추가 요청사항').trim();
  const newSession = input.new_session === true;
  const target = newSession ? null : await sessionRef(db, input.target_session === undefined ? r.source_session : input.target_session);
  const deliver = newSession || !!target;
  if (!choice && !body) throw new ValidationError('선택지를 고르거나 추가 요청사항을 적어 주세요.');
  const { rows: [m] } = await db.query<{ id: number }>(
    `insert into public.control_messages(request_id, author, kind, choice, body, target_session, new_session)
     values ($1, 'user', $2, $3, $4, $5, $6) returning id`,
    [id, deliver ? (choice ? 'answer' : 'directive') : 'note', choice, body, target, newSession]);
  if (deliver) await db.query(`update public.control_requests set status = 'answered' where id = $1`, [id]);
  return { id: m.id, delivered: false, status: deliver ? 'answered' : r.status };
}

export async function setRequestStatus(db: Db, id: string, status: unknown) {
  if (!isUuid(id)) throw new NotFoundError('요청을 찾을 수 없습니다.');
  const s = String(status ?? '');
  if (!['open', 'done', 'dropped'].includes(s)) throw new ValidationError('끝남·접음·다시 열기만 할 수 있습니다.');
  const { rowCount } = await db.query('update public.control_requests set status = $2 where id = $1', [id, s]);
  if (!rowCount) throw new NotFoundError('요청을 찾을 수 없습니다.');
  await db.query(`insert into public.control_messages(request_id, author, kind, choice) values ($1, 'user', 'status', $2)`, [id, s]);
  return { id, status: s };
}

// ── Claude 세션 (점검 토큰) ── 함수가 토큰을 확인한다
const q = async (db: Db, sql: string, args: unknown[]) => (await db.query<{ r: unknown }>(sql, args)).rows[0]?.r;
export const control = {
  inbox: (db: Db, t: string) => q(db, 'select control.inbox($1) as r', [t]),
  requests: (db: Db, t: string, status: string | null) => q(db, 'select control.requests($1, $2) as r', [t, status]),
  file: (db: Db, t: string, body: unknown) => q(db, 'select control.file_request($1, $2) as r', [t, JSON.stringify(body ?? {})]),
  post: (db: Db, t: string, id: string, body: unknown) => {
    if (!isUuid(id)) throw new NotFoundError('요청을 찾을 수 없습니다.');
    return q(db, 'select control.post($1, $2, $3) as r', [t, id, JSON.stringify(body ?? {})]);
  },
  delivered: (db: Db, t: string, id: string, note: unknown) => {
    if (!/^\d{1,18}$/.test(id)) throw new NotFoundError('지시를 찾을 수 없습니다.');
    return q(db, 'select control.mark_delivered($1, $2, $3) as r', [t, id, note ? String(note) : null]);
  },
  register: (db: Db, t: string, body: unknown) => q(db, 'select control.register_session($1, $2) as r', [t, JSON.stringify(body ?? {})]),
  sessions: (db: Db, t: string) => q(db, 'select control.sessions($1) as r', [t]),
};
