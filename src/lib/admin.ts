import type { Db } from './db';
import { isUuid, NotFoundError, ValidationError } from './services';

/** 학교 설정과 전체 관리 기능. 권한 검사는 DB 함수(app.*)가 한다. */

export type Module = {
  key: string; name: string; description: string; monthly_price_per_seat_krw: number;
  available: boolean; required: boolean; sort: number;
};
export type License = {
  id: string; version: number; seats: number; modules: string[]; monthly_estimate_krw: number;
  price_snapshot: Record<string, number>; note: string | null; created_at: string;
};
export type Member = { user_id: string; email: string; display_name: string; role: 'admin' | 'teacher'; joined_at: string };
export type Invitation = { id: string; email: string; role: 'admin' | 'teacher'; created_at: string };
export type AccessEntry = { id: number; school_id: string | null; actor_label: string; action: string; detail: Record<string, unknown>; created_at: string };
export type Statement = { id: string; school_id: string; period: string; seats: number; modules: string[]; amount_krw: number; status: string; created_at: string };

export async function catalog(db: Db): Promise<Module[]> {
  return (await db.query<Module>('select * from public.module_catalog order by sort')).rows;
}

export async function licenseInfo(db: Db, schoolId: string) {
  const { rows: history } = await db.query<License>(
    `select id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_at
     from public.school_licenses where school_id = $1 order by version desc limit 20`, [schoolId]);
  const { rows: [{ used }] } = await db.query('select app.seats_used($1) as used', [schoolId]);
  return { current: history[0] ?? null, history, seatsUsed: used as number, catalog: await catalog(db) };
}

export async function setLicense(db: Db, schoolId: string, input: { seats?: unknown; modules?: unknown; note?: unknown }) {
  const seats = Number(input.seats);
  if (!Number.isInteger(seats)) throw new ValidationError('좌석 수는 정수로 입력해 주세요.');
  const modules = Array.isArray(input.modules) ? input.modules.map(String) : [];
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 300) : null;
  const { rows: [r] } = await db.query('select app.set_license($1, $2, $3, $4) as id', [schoolId, seats, modules, note]);
  return { id: r.id as string };
}

export async function members(db: Db, schoolId: string) {
  const { rows: list } = await db.query<Member>('select * from app.school_members($1)', [schoolId]);
  const { rows: pending } = await db.query<Invitation>(
    `select id, email, role, created_at from public.invitations
     where school_id = $1 and accepted_at is null and revoked_at is null order by created_at`, [schoolId]);
  return { members: list, invitations: pending };
}

export async function invite(db: Db, schoolId: string, email: unknown, role: unknown) {
  const { rows: [r] } = await db.query('select app.invite_member($1, $2, $3) as result', [schoolId, String(email ?? ''), String(role ?? '')]);
  return { result: r.result as 'added' | 'invited' };
}

export async function revokeInvitation(db: Db, schoolId: string, id: string) {
  if (!isUuid(id)) throw new NotFoundError('초대를 찾을 수 없습니다.');
  await db.query('select app.revoke_invitation($1, $2)', [schoolId, id]);
}

export async function removeMember(db: Db, schoolId: string, userId: string) {
  if (!isUuid(userId)) throw new NotFoundError('구성원을 찾을 수 없습니다.');
  await db.query('select app.remove_member($1, $2)', [schoolId, userId]);
}

export async function accessLog(db: Db, schoolId: string | null, limit = 30): Promise<AccessEntry[]> {
  const { rows } = schoolId
    ? await db.query<AccessEntry>('select * from public.access_log where school_id = $1 order by id desc limit $2', [schoolId, limit])
    : await db.query<AccessEntry>('select * from public.access_log order by id desc limit $1', [limit]);
  return rows;
}

export async function statements(db: Db, schoolId: string | null): Promise<Statement[]> {
  const { rows } = schoolId
    ? await db.query<Statement>('select * from public.billing_statements where school_id = $1 order by period desc', [schoolId])
    : await db.query<Statement>('select * from public.billing_statements order by period desc, created_at desc limit 100');
  return rows;
}

// ── 전체 관리자 ───────────────────────────────────────────
export type SchoolOverview = {
  id: string; slug: string; name: string; locale: string; status: string; seats: number | null; seats_used: number;
  modules: string[] | null; monthly_estimate_krw: number | null; sources: number; documents: number; open_questions: number;
};

export async function overview(db: Db): Promise<SchoolOverview[]> {
  return (await db.query<SchoolOverview>('select * from app.platform_overview()')).rows;
}

export async function createSchool(db: Db, input: Record<string, unknown>) {
  const { rows: [r] } = await db.query('select app.create_school($1, $2, $3, $4, $5, $6) as id', [
    String(input.slug ?? '').trim().toLowerCase(), String(input.name ?? ''), String(input.locale ?? 'ko'),
    String(input.adminEmail ?? ''), Number(input.seats ?? 5), Array.isArray(input.modules) ? input.modules.map(String) : [],
  ]);
  return { id: r.id as string };
}

export async function setSchoolStatus(db: Db, schoolId: string, status: unknown) {
  if (!isUuid(schoolId)) throw new NotFoundError('학교를 찾을 수 없습니다.');
  await db.query('select app.set_school_status($1, $2)', [schoolId, String(status ?? '')]);
}

export async function setModulePrice(db: Db, key: unknown, price: unknown) {
  const p = Number(price);
  if (!Number.isInteger(p)) throw new ValidationError('가격은 원 단위 정수로 입력해 주세요.');
  await db.query('select app.set_module_price($1, $2)', [String(key ?? ''), p]);
}

export async function createStatement(db: Db, schoolId: string, period: unknown) {
  if (!isUuid(schoolId)) throw new NotFoundError('학교를 찾을 수 없습니다.');
  const pr = String(period ?? '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(pr)) throw new ValidationError('청구 월은 2026-11 형식으로 입력해 주세요.');
  const { rows: [r] } = await db.query('select app.create_statement($1, $2) as id', [schoolId, pr]);
  return { id: r.id as string };
}

/** 작업 학교 전환. 볼 수 있는 학교인지 RLS로 확인하고, 소속이 아닌 전체 관리자의 입장은 기록한다. */
export async function enterSchool(db: Db, schoolId: string) {
  if (!isUuid(schoolId)) throw new NotFoundError('학교를 찾을 수 없습니다.');
  const { rows } = await db.query(
    `select s.id, exists(select 1 from public.memberships m where m.school_id = s.id and m.user_id = app.uid()) as member
     from public.schools s where s.id = $1`, [schoolId]);
  if (!rows[0]) throw new NotFoundError('학교를 찾을 수 없습니다.');
  if (!rows[0].member) await db.query(`select app.log_access($1, 'school.enter')`, [schoolId]);
  return { id: schoolId };
}
