/** 62차 ADR 0029 — 학생·보호자 열람 계정: 기존 표 전수 RLS 점검(열람 계정은 아무 표도 못 읽음), 열람 계약(본인·자녀만), 민감 칸 제외, 블라인드·남의 발행본 거부, 보호 관계·계정 끝 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const pp = await import('@/lib/people');
const f = await import('@/lib/foundation');
const g = await import('@/lib/grading');
const rec = await import('@/lib/records');
const pk = await import('@/lib/packages');
const po = await import('@/lib/portal');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let stu: string; let other: string; let guardian: string; let year: string; let link: string;
let stuUser: string; let guardUser: string; let otherUser: string;
let docStu: string; let docBlind: string; let docOther: string;

async function user(email: string) {
  const { rows: [u] } = await su.query(`insert into private.app_users(email, display_name) values ($1, $1) returning id`, [email]);
  return u.id as string;
}

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  stuUser = await user('f6-student@family.test');
  guardUser = await user('f6-guardian@family.test');
  otherUser = await user('f6-other@family.test');
  ({ stu, other, guardian, year, link } = await asUser(A.userId, async (db) => {
    const level = await pp.addSchoolLevel(db, A.schoolId, { code: 'f6', name: '고등' });
    const y = await pp.addAcademicYear(db, A.schoolId, { label: '2026', startsOn: '2026-03-01', endsOn: '2027-03-01' });
    const s = await pp.addPerson(db, A.schoolId, { name: 'F6 본인 학생' });
    const o = await pp.addPerson(db, A.schoolId, { name: 'F6 다른 학생' });
    const gd = await pp.addPerson(db, A.schoolId, { name: 'F6 보호자' });
    for (const p of [s, o]) await pp.enroll(db, A.schoolId, { personId: p, levelId: level, startsOn: '2026-03-02' });
    const l = await f.linkGuardian(db, A.schoolId, { guardianPersonId: gd, studentPersonId: s, startsOn: '2026-01-01' });
    await g.recordNarrative(db, A.schoolId, { personId: s, academicYearId: y, kind: 'behavior', authorRole: 'homeroom', body: '본인 학생 행동 특성' });
    await g.recordNarrative(db, A.schoolId, { personId: o, academicYearId: y, kind: 'behavior', authorRole: 'homeroom', body: '다른 학생 행동 특성' });
    return { stu: s, other: o, guardian: gd, year: y, link: l };
  }));
  await asUser(A.userId, async (db) => {
    await rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 0, requestKey: 'f6-rec-stu-1' });
    await rec.closeRecordYear(db, A.schoolId, other, year, { base_version: 0, requestKey: 'f6-rec-oth-1' });
    docStu = (await rec.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: stu })).id;
    docBlind = (await rec.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: stu, blind: true })).id;
    docOther = (await rec.publishRecordDocument(db, A.schoolId, { format: 'kr_alt_record', personId: other })).id;
    // 학교 정의 기록: 상담(민감) 칸이 있는 기록 유형을 켜고 본인 학생 기록 1건
    await pk.saveDefinition(db, A.schoolId, { kind: 'record_type', code: 'service', base_version: 0, spec: { title: { ko: '봉사' }, subject: 'person', fields: [
      { key: 'activity', type: 'text', label: { ko: '활동' }, privacy: 'internal', required: true },
      { key: 'counsel', type: 'longtext', label: { ko: '상담 메모' }, privacy: 'sensitive' }] } });
    await pk.savePackage(db, A.schoolId, { code: 'service_pack', title: { ko: '봉사' }, members: [{ kind: 'record_type', code: 'service' }], base_version: 0 });
    await pk.setPackageState(db, A.schoolId, { code: 'service_pack', state: 'enabled' });
    await pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: '마을 청소', counsel: '가정 상황 상담 내용' } });
  });
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('열람 계정 만들기', () => {
  it('관리자만, 동의 연령 미만 학생은 근거 필요, 보호 관계 없는 보호자·교직원 이메일 거부, 다른 학교 거부', async () => {
    await expect(asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: stu, email: 'f6-student@family.test', underConsentAge: true })))
      .rejects.toThrow('동의');
    const sid = await asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: stu, email: 'F6-Student@family.test', underConsentAge: true, consentBasis: 'guardian_consent', consentNote: '보호자 동의서 2026-03' }));
    await expect(asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: stu, email: 'f6-student@family.test' }))).rejects.toThrow('이미');
    await expect(asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'guardian', personId: other, email: 'x@family.test' }))).rejects.toThrow('보호 관계');
    await expect(asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: stu, email: 'admin-a@school-a.test' }))).rejects.toThrow('교직원');
    await expect(asUser(B.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: stu, email: 'b@family.test' }))).rejects.toMatchObject({ code: '42501' });
    await asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'guardian', personId: guardian, email: 'f6-guardian@family.test' }));
    // 아직 가입 전인 이메일은 첫 로그인 때 연결된다(대기)
    await asUser(A.userId, (db) => po.addPortalAccount(db, A.schoolId, { kind: 'student', personId: other, email: 'f6-later@family.test' }));
    const list = await asUser(A.userId, (db) => po.listPortalAccounts(db, A.schoolId));
    expect(list.find((a) => a.id === sid)).toMatchObject({ email: 'f6-student@family.test', claimed: true, under_consent_age: true, consent_basis: 'guardian_consent' });
    expect(list.find((a) => a.email === 'f6-later@family.test')!.claimed).toBe(false);
    expect(await asUser(B.userId, (db) => po.listPortalAccounts(db, B.schoolId))).toEqual([]);
  });
});

describe('기존 표 전수 RLS 점검 (지침 9)', () => {
  it('열람 계정으로 public 표를 하나씩 읽으면 자기 열람 계정 행 말고는 아무것도 안 보인다', async () => {
    const { rows: tables } = await su.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm') order by 1`);
    expect(tables.length).toBeGreaterThan(80);
    const seen: string[] = [];
    for (const { relname } of tables) {
      for (const u of [stuUser, guardUser]) {
        const n = await asUser(u, async (db) => {
          try { return Number((await db.query(`select count(*)::int as n from public.${relname}`)).rows[0].n); } catch { return 0; } // 권한 없음 = 닫힘
        });
        if (n > 0) seen.push(`${relname}:${n}`);
      }
    }
    // 학교 목록·모듈 목록처럼 원래 누구나 보는 표는 여기 적는다(학생 자료 아님)
    // languages·ui_messages: 화면 언어 목록·문구(ADR 0037) — 로그인 화면에서도 읽는 공개 정보, 학생 자료 아님
    const allowed = new Set(['portal_accounts', 'module_catalog', 'languages', 'ui_messages']);
    expect(seen.filter((x) => !allowed.has(x.split(':')[0]))).toEqual([]);
    // 함수: 구성원 전용 명령은 거부
    await expect(asUser(stuUser, (db) => rec.closeRecordYear(db, A.schoolId, stu, year, { base_version: 1, requestKey: 'f6-stu-try-1', reason: 'x' }))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(stuUser, (db) => pk.addCustomRecord(db, A.schoolId, { recordType: 'service', personId: stu, data: { activity: 'x' } }))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('열람 계약', () => {
  it('학생은 자기 것, 보호자는 자녀 것만. 확정 기록·출결·정의 기록(민감 칸 제외)·발행본 목록', async () => {
    expect(await asUser(stuUser, (db) => po.portalPeople(db))).toMatchObject([{ person_id: stu, relation: 'self', name: 'F6 본인 학생' }]);
    expect(await asUser(guardUser, (db) => po.portalPeople(db))).toMatchObject([{ person_id: stu, relation: 'child' }]);
    expect(await asUser(otherUser, (db) => po.portalPeople(db))).toEqual([]);
    const r = await asUser(guardUser, (db) => po.portalRecord(db, stu));
    expect(r).toMatchObject({ contract: 'portal-record/1', relation: 'child', student: { name: 'F6 본인 학생' } });
    expect(r.record_years[0].narratives.map((n) => n.body)).toEqual(['본인 학생 행동 특성']);
    expect(r.documents.map((d) => d.id)).toEqual([docStu]); // 블라인드 발행본은 목록에 없다
    expect(r.school_records[0].fields).toEqual([{ key: 'activity', label: { ko: '활동' }, value: '마을 청소' }]);
    expect(JSON.stringify(r)).not.toContain('가정 상황 상담');
    expect(JSON.stringify(r)).not.toContain('다른 학생');
    // 남의 기록·발행본은 거부(양방향: 학생·보호자 모두)
    for (const u of [stuUser, guardUser]) {
      await expect(asUser(u, (db) => po.portalRecord(db, other))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(u, (db) => po.portalDocument(db, docOther))).rejects.toMatchObject({ code: '42501' });
      await expect(asUser(u, (db) => po.portalDocument(db, docBlind))).rejects.toMatchObject({ code: '42501' });
    }
    expect((await asUser(stuUser, (db) => po.portalDocument(db, docStu))).content).toMatchObject({ format: 'kr_alt_record' });
    // 교직원 계정은 열람 계약이 아니라 교직원 화면을 쓴다
    await expect(asUser(A.userId, (db) => po.portalRecord(db, stu))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(B.userId, (db) => po.portalRecord(db, stu))).rejects.toMatchObject({ code: '42501' });
  });

  it('보호 관계가 끝나면 보호자는 못 보고, 열람 계정을 끝내면 학생도 못 본다(다시 열 수 없음)', async () => {
    await asUser(A.userId, (db) => f.endGuardianLink(db, A.schoolId, link, new Date().toISOString().slice(0, 10)));
    expect(await asUser(guardUser, (db) => po.portalPeople(db))).toEqual([]);
    await expect(asUser(guardUser, (db) => po.portalRecord(db, stu))).rejects.toMatchObject({ code: '42501' });
    const acc = (await asUser(A.userId, (db) => po.listPortalAccounts(db, A.schoolId))).find((a) => a.kind === 'student' && a.person_id === stu)!;
    await expect(asUser(stuUser, (db) => po.endPortalAccount(db, A.schoolId, acc.id))).rejects.toMatchObject({ code: '42501' });
    await asUser(A.userId, (db) => po.endPortalAccount(db, A.schoolId, acc.id, '졸업'));
    await expect(asUser(stuUser, (db) => po.portalRecord(db, stu))).rejects.toMatchObject({ code: '42501' });
    await expect(su.query(`update public.portal_accounts set ends_on = null where id = $1`, [acc.id])).rejects.toThrow('다시 열지');
    await expect(su.query(`update public.portal_accounts set person_id = $2 where id = $1`, [acc.id, other])).rejects.toThrow('바꿀 수 없는');
  });
});
