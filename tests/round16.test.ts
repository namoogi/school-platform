/** 16차: 전체 관리자, 라이선스(좌석·기능), 초대·역할, 접근 기록, Google 로그인 연결 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { csv, fixture, lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example-project.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';

const { asUser, getPool } = await import('@/lib/db');
const svc = await import('@/lib/services');
const admin = await import('@/lib/admin');
const { loginWithSupabaseToken } = await import('@/lib/google');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let P: string; // 예시 전체 관리자

/** Supabase /auth/v1/user 응답을 흉내 내는 fetch */
function fakeSupabase(users: Record<string, object>): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    expect(url).toBe('https://example-project.supabase.co/auth/v1/user');
    const auth = (init?.headers as Record<string, string>).Authorization;
    const u = users[auth.replace('Bearer ', '')];
    return new Response(JSON.stringify(u ?? { msg: 'invalid' }), { status: u ? 200 : 401 });
  }) as unknown as typeof fetch;
}
const google = (id: string, email: string, confirmed = true) =>
  ({ id, email, email_confirmed_at: confirmed ? '2026-11-22T00:00:00Z' : null, app_metadata: { provider: 'google' }, user_metadata: { full_name: email.split('@')[0] } });

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  P = (await c.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
  await c.end();
});
afterAll(async () => {
  await getPool().end();
});

describe('라이선스와 좌석', () => {
  it('학교 관리자가 좌석과 기능을 등록하면 새 판으로 쌓이고, 가격 변경 전 판의 금액은 그대로 남는다', async () => {
    await asUser(P, async (db) => {
      await admin.setModulePrice(db, 'intake', 3000);
      await admin.setModulePrice(db, 'records', 2000);
    });
    const v2 = await asUser(A.userId, async (db) => {
      await admin.setLicense(db, A.schoolId, { seats: 3, modules: ['records'], note: '시범 운영' });
      return admin.licenseInfo(db, A.schoolId);
    });
    expect(v2.current).toMatchObject({ version: 2, seats: 3, modules: ['intake', 'records'], monthly_estimate_krw: 15000 });
    expect(v2.current!.price_snapshot).toEqual({ intake: 3000, records: 2000 });
    await asUser(P, (db) => admin.setModulePrice(db, 'records', 9000));
    const after = await asUser(A.userId, (db) => admin.licenseInfo(db, A.schoolId));
    expect(after.current!.monthly_estimate_krw).toBe(15000);
    expect(after.history.map((h) => h.version)).toEqual([2, 1]);
  });

  it('준비 중 기능은 고를 수 없고, 필수 기능(제도 분석)은 항상 포함된다', async () => {
    await expect(asUser(A.userId, (db) => admin.setLicense(db, A.schoolId, { seats: 3, modules: ['ai_analysis'] })))
      .rejects.toMatchObject({ code: '22023' });
    const r = await asUser(A.userId, async (db) => {
      await admin.setLicense(db, A.schoolId, { seats: 3, modules: [] });
      return svc.currentSchool(db);
    });
    expect(r.modules).toEqual(['intake']);
    // 문서실을 다시 켠다
    await asUser(A.userId, (db) => admin.setLicense(db, A.schoolId, { seats: 3, modules: ['records'] }));
  });

  it('초대는 좌석 안에서만 되고, 사용 중인 좌석보다 적게 줄일 수 없다', async () => {
    // 좌석 3: 관리자 A(1) + 초대 2 = 3
    expect((await asUser(A.userId, (db) => admin.invite(db, A.schoolId, 'Teacher1@School-A.test', 'teacher'))).result).toBe('invited');
    expect((await asUser(A.userId, (db) => admin.invite(db, A.schoolId, 'teacher2@school-a.test', 'teacher'))).result).toBe('invited');
    await expect(asUser(A.userId, (db) => admin.invite(db, A.schoolId, 'teacher3@school-a.test', 'teacher')))
      .rejects.toThrow('좌석이 모두 찼습니다');
    await expect(asUser(A.userId, (db) => admin.invite(db, A.schoolId, 'teacher1@school-a.test', 'admin')))
      .rejects.toThrow('이미 초대한 이메일');
    await expect(asUser(A.userId, (db) => admin.setLicense(db, A.schoolId, { seats: 2, modules: ['records'] })))
      .rejects.toThrow('적게 줄일 수 없습니다');
    const m = await asUser(A.userId, (db) => admin.members(db, A.schoolId));
    expect(m.members.map((x) => x.role)).toEqual(['admin']);
    expect(m.invitations.map((x) => x.email)).toEqual(['teacher1@school-a.test', 'teacher2@school-a.test']);
    // 초대 취소하면 좌석이 돌아온다
    await asUser(A.userId, (db) => admin.revokeInvitation(db, A.schoolId, m.invitations[1].id));
    expect((await asUser(A.userId, (db) => admin.licenseInfo(db, A.schoolId))).seatsUsed).toBe(2);
  });

  it('다른 학교의 라이선스·구성원은 바꾸거나 볼 수 없다 (양방향)', async () => {
    for (const [me, other] of [[A, B], [B, A]] as const) {
      await expect(asUser(me.userId, (db) => admin.setLicense(db, other.schoolId, { seats: 9, modules: [] }))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(me.userId, (db) => admin.invite(db, other.schoolId, 'x@x.test', 'admin'))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(me.userId, (db) => admin.members(db, other.schoolId))).rejects.toMatchObject({ code: '42501' });
      expect((await asUser(me.userId, (db) => admin.licenseInfo(db, other.schoolId).catch((e) => e))).code).toBe('42501');
    }
  });

  it('학교 관리자는 전체 관리 기능(학교 생성·가격·청구·현황)을 쓸 수 없다', async () => {
    await expect(asUser(A.userId, (db) => admin.createSchool(db, { slug: 'x-school', name: 'X', locale: 'ko', adminEmail: 'x@x.test', seats: 2 })))
      .rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => admin.setModulePrice(db, 'intake', 0))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => admin.createStatement(db, A.schoolId, '2026-11'))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(A.userId, (db) => admin.overview(db))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Google 로그인 연결', () => {
  const users = {
    t1: google('sub-teacher-1', 'teacher1@school-a.test'),
    stranger: google('sub-stranger', 'stranger@example.test'),
    unconfirmed: google('sub-unconfirmed', 'teacher1@school-a.test', false),
    hijack: google('sub-other', 'teacher1@school-a.test'),
    platform: google('sub-platform', 'platform@example.test'),
  };
  const f = fakeSupabase(users);

  it('초대되지 않은 계정, 인증 안 된 이메일, 잘못된 토큰은 거부한다', async () => {
    expect(await loginWithSupabaseToken('stranger', f)).toMatchObject({ ok: false, status: 403 });
    expect(await loginWithSupabaseToken('unconfirmed', f)).toMatchObject({ ok: false, status: 403 });
    expect(await loginWithSupabaseToken('bad-token', f)).toMatchObject({ ok: false, status: 401 });
  });

  it('초대된 이메일로 처음 로그인하면 계정이 생기고 초대가 구성원으로 바뀐다', async () => {
    const r = await loginWithSupabaseToken('t1', f);
    expect(r).toMatchObject({ ok: true, joined: 1 });
    const school = await asUser((r as { userId: string }).userId, (db) => svc.currentSchool(db));
    expect(school).toMatchObject({ id: A.schoolId, role: 'teacher', isAdmin: false, isPlatformAdmin: false });
    // 같은 계정으로 다시 로그인해도 같은 사용자
    const again = await loginWithSupabaseToken('t1', f);
    expect(again).toMatchObject({ ok: true, joined: 0, userId: (r as { userId: string }).userId });
  });

  it('같은 이메일이라도 다른 외부 계정이면 연결하지 않는다', async () => {
    expect(await loginWithSupabaseToken('hijack', f)).toMatchObject({ ok: false, status: 403 });
  });

  it('전체 관리자 이메일은 초대 없이 로그인된다', async () => {
    expect(await loginWithSupabaseToken('platform', f)).toMatchObject({ ok: true, userId: P });
  });

  it('설정이 없으면 Google 로그인을 쓸 수 없다고 알린다', async () => {
    const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(await loginWithSupabaseToken('t1', f)).toMatchObject({ ok: false, status: 503 });
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });
});

describe('교사와 학교 관리자의 역할', () => {
  let T: string;
  beforeAll(async () => {
    T = ((await loginWithSupabaseToken('t1', fakeSupabase({ t1: google('sub-teacher-1', 'teacher1@school-a.test') }))) as { userId: string }).userId;
  });

  it('교사는 자료를 올리고 볼 수 있지만 규칙 확정·발행·양식·설정은 할 수 없다', async () => {
    await asUser(T, (db) => svc.addFiles(db, A.schoolId, [fixture('school-a-calendar.csv'), fixture('school-a-assessments.csv')]));
    const q = await asUser(T, (db) => svc.openQuestion(db, A.schoolId));
    expect(q).not.toBeNull();
    await expect(asUser(T, (db) => svc.answerQuestion(db, A.schoolId, q!.id, { decision: 'accepted' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(T, (db) => svc.createTemplateVersion(db, A.schoolId, { title: 't', period_heading: 'p', assessment_heading: 'a', footer_note: 'f' })))
      .rejects.toMatchObject({ code: '42501' });
    await expect(asUser(T, (db) => admin.members(db, A.schoolId))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(T, (db) => admin.setLicense(db, A.schoolId, { seats: 9, modules: [] }))).rejects.toMatchObject({ code: '42501' });
    // 관리자는 확정·발행할 수 있다
    await asUser(A.userId, (db) => svc.answerQuestion(db, A.schoolId, q!.id, { decision: 'accepted' }));
    await expect(asUser(T, async (db) => svc.publishDocument(db, await svc.currentSchool(db)))).rejects.toMatchObject({ code: '42501' });
    await asUser(A.userId, async (db) => svc.publishDocument(db, await svc.currentSchool(db)));
    expect((await asUser(T, (db) => svc.listDocuments(db, A.schoolId))).length).toBe(1);
  });

  it('마지막 학교 관리자는 뺄 수 없고, 교사는 뺄 수 있다', async () => {
    await expect(asUser(A.userId, (db) => admin.removeMember(db, A.schoolId, A.userId))).rejects.toThrow('마지막 학교 관리자');
    await asUser(A.userId, (db) => admin.removeMember(db, A.schoolId, T));
    await expect(asUser(T, (db) => svc.currentSchool(db))).rejects.toThrow('소속 학교가 없습니다');
  });
});

describe('전체 관리자', () => {
  it('모든 학교 현황을 보고, 학교에 들어가면 그 학교의 기록에 입장이 남는다', async () => {
    const list = await asUser(P, (db) => admin.overview(db));
    expect(list.map((s) => s.slug)).toEqual(['school-a', 'school-b']);
    expect(list[0]).toMatchObject({ seats: 3, documents: 1 });
    await asUser(P, (db) => admin.enterSchool(db, B.schoolId));
    const school = await asUser(P, (db) => svc.currentSchool(db, B.schoolId));
    expect(school).toMatchObject({ id: B.schoolId, role: null, isPlatformAdmin: true, isAdmin: true });
    // 전체 관리자는 B 자료를 읽을 수 있다
    await asUser(B.userId, (db) => svc.addFiles(db, B.schoolId, [fixture('school-b-calendar.csv')]));
    expect((await asUser(P, (db) => svc.listSources(db, B.schoolId))).length).toBe(1);
    // B 관리자는 전체 관리자의 입장 기록을 본다
    const log = await asUser(B.userId, (db) => admin.accessLog(db, B.schoolId));
    expect(log.some((e) => e.action === 'school.enter' && e.actor_label.includes('전체 관리자'))).toBe(true);
    // A 관리자는 B의 기록을 못 본다
    expect(await asUser(A.userId, (db) => admin.accessLog(db, B.schoolId))).toEqual([]);
  });

  it('작업 학교가 없는 전체 관리자는 학교 선택이 필요하다', async () => {
    await expect(asUser(P, (db) => svc.currentSchool(db))).rejects.toBeInstanceOf(svc.NoSchoolError);
  });

  it('학교를 만들면 시범 상태·라이선스·양식·관리자 초대가 함께 생기고, 초대받은 관리자가 Google로 합류한다', async () => {
    const { id } = await asUser(P, (db) => admin.createSchool(db, {
      slug: 'hope-school', name: '소망 예시학교', locale: 'ko', adminEmail: 'head@hope.test', seats: 4, modules: ['records'],
    }));
    const r = await loginWithSupabaseToken('h', fakeSupabase({ h: google('sub-head', 'head@hope.test') }));
    const school = await asUser((r as { userId: string }).userId, (db) => svc.currentSchool(db));
    expect(school).toMatchObject({ id, status: 'trial', role: 'admin', modules: ['intake', 'records'], seats: 4 });
    const tpl = await asUser((r as { userId: string }).userId, (db) => svc.latestTemplate(db, id));
    expect(tpl).toMatchObject({ version: 1, title: '학기 학습 보고서' });
    await expect(asUser(P, (db) => admin.createSchool(db, { slug: 'hope-school', name: '중복', locale: 'ko', adminEmail: 'a@b.test', seats: 1 })))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('청구 예정액을 월별로 확정하면 바꿀 수 없고, 같은 달은 한 번만 만든다', async () => {
    await asUser(P, (db) => admin.createStatement(db, A.schoolId, '2026-11'));
    const bills = await asUser(A.userId, (db) => admin.statements(db, A.schoolId));
    // 최신 라이선스(가격 변경 뒤 다시 저장한 판): 좌석 3 × (3,000 + 9,000원)
    expect(bills[0]).toMatchObject({ period: '2026-11', seats: 3, amount_krw: 36000, status: 'estimated' });
    await expect(asUser(P, (db) => admin.createStatement(db, A.schoolId, '2026-11'))).rejects.toMatchObject({ code: '23505' });
    // 로그인 사용자는 수정 권한 자체가 없고(42501), DB 소유자도 트리거에 막힌다(P0001)
    await expect(asUser(P, (db) => db.query(`update public.billing_statements set amount_krw = 0`))).rejects.toMatchObject({ code: '42501' });
    const owner = await getPool().connect();
    try {
      await expect(owner.query('update public.billing_statements set amount_krw = 0')).rejects.toMatchObject({ code: 'P0001' });
    } finally { owner.release(); }
    await expect(asUser(P, (db) => admin.createStatement(db, A.schoolId, '2026-13'))).rejects.toThrow('형식');
  });

  it('이용 중지한 학교는 소속 관리자가 쓸 수 없고 전체 관리자는 들어갈 수 있다', async () => {
    await asUser(P, (db) => admin.setSchoolStatus(db, B.schoolId, 'suspended'));
    await expect(asUser(B.userId, (db) => svc.currentSchool(db))).rejects.toThrow('이용이 중지된 학교');
    expect((await asUser(P, (db) => svc.currentSchool(db, B.schoolId))).status).toBe('suspended');
    await asUser(P, (db) => admin.setSchoolStatus(db, B.schoolId, 'active'));
    expect((await asUser(B.userId, (db) => svc.currentSchool(db))).id).toBe(B.schoolId);
  });

  it('전체 관리자가 아닌 계정이 다른 학교 ID로 작업 학교를 바꾸려 하면 무시되고 자기 학교로 돌아간다', async () => {
    const s = await asUser(A.userId, (db) => svc.currentSchool(db, B.schoolId));
    expect(s.id).toBe(A.schoolId);
    await expect(asUser(A.userId, (db) => admin.enterSchool(db, B.schoolId))).rejects.toThrow('찾을 수 없습니다');
  });
});

// 미사용 경고 방지
void csv;
