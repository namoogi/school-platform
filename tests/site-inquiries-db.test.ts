/**
 * 91차(ADR 0036) — 방문·상담 신청: 방문자(anon)는 검사 함수로만 넣고, 읽기·처리는 그 학교 관리자만.
 * 학교 간 거부는 양방향으로, 교사·방문자·열람 계정 거부, 동의·횟수 제한, 고칠 수 없는 칸, 보존 기간 뒤 가리기.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asVisitor, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const inq = await import('@/lib/site-inquiries');

type S = { schoolId: string; userId: string };
let A: S; let B: S; let su: pg.Client; let teacher: string;
const input = (contact = 'parent@example.org') => inq.parseInquiry({ kind: 'visit', name: '합성 보호자', contact, message: '견학하고 싶어요', consent: true, preferred_date: '2026-12-01' });

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  for (const s of [A, B]) {
    await su.query(`insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
                    select school_id, version + 1, seats, modules || '{homepage}', monthly_estimate_krw, price_snapshot, 'f91', created_by from public.school_licenses
                     where school_id = $1 order by version desc limit 1`, [s.schoolId]);
  }
  const { rows: [t] } = await su.query(`insert into private.app_users(email, display_name) values ('inq-teacher@school-a.test', 'x') returning id`);
  await su.query(`insert into public.memberships(user_id, school_id, role) values ($1, $2, 'teacher')`, [t.id, A.schoolId]);
  teacher = t.id;
  const settings = (slug: string, inquiry: boolean) => ({ public_slug: slug, langs: ['ko'], default_lang: 'ko', theme: 'play', site_title: { ko: slug }, is_open: true, inquiry_open: inquiry });
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, settings('inq-a', true)));
  await asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, settings('inq-b', false)));
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('91차 방문·상담 신청', () => {
  it('방문자는 신청 받는 열린 홈페이지에만 넣고, 학교 ID는 주소로만 정해진다', async () => {
    await asVisitor((db) => inq.submitInquiry(db, 'inq-a', input()));
    await expect(asVisitor((db) => inq.submitInquiry(db, 'inq-b', input()))).rejects.toThrow('받지 않습니다');
    await expect(asVisitor((db) => inq.submitInquiry(db, 'no-such', input()))).rejects.toThrow('받지 않습니다');
    const { rows } = await su.query('select school_id, name, consent_at from public.site_inquiries');
    expect(rows).toHaveLength(1);
    expect(rows[0].school_id).toBe(A.schoolId);
    expect(rows[0].consent_at).toBeTruthy();
  });
  it('방문자는 표를 직접 읽거나 쓰지 못한다', async () => {
    await expect(asVisitor((db) => db.query('select * from public.site_inquiries'))).rejects.toThrow(/permission/);
    await expect(asVisitor((db) => db.query(`insert into public.site_inquiries(school_id, kind, name, contact, consent_at) values ($1, 'visit', 'x', 'xxx', now())`, [A.schoolId]))).rejects.toThrow(/permission/);
  });
  it('동의가 없으면 거부, 같은 연락처는 하루 3건까지', async () => {
    expect(() => inq.parseInquiry({ kind: 'visit', name: 'x', contact: 'abc@example.org', consent: false })).toThrow('동의');
    await expect(asVisitor((db) => db.query("select app.submit_site_inquiry('inq-a','visit','x','abc@example.org',null,null,'ko',null,false)"))).rejects.toThrow('consent_required');
    for (let i = 0; i < 3; i++) await asVisitor((db) => inq.submitInquiry(db, 'inq-a', input('limit@example.org')));
    await expect(asVisitor((db) => inq.submitInquiry(db, 'inq-a', input('LIMIT@example.org ')))).rejects.toThrow('잠시');
  });
  it('동시에 들어와도 같은 연락처 하루 3건을 넘지 않는다(학교별로 한 줄로 세움)', async () => {
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => asVisitor((db) => inq.submitInquiry(db, 'inq-a', input('burst@example.org')))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    await su.query(`delete from public.site_inquiries where contact = 'burst@example.org'`); // 시험 정리(앱 역할은 지울 권한 없음)
  });
  it('그 학교 관리자만 읽고, 교사·다른 학교 관리자는 못 본다(양방향)', async () => {
    const mine = await asUser(A.userId, (db) => inq.listInquiries(db, A.schoolId));
    expect(mine.length).toBe(4);
    expect(await asUser(teacher, (db) => inq.listInquiries(db, A.schoolId))).toEqual([]);
    expect(await asUser(B.userId, (db) => inq.listInquiries(db, A.schoolId))).toEqual([]);
    expect(await asUser(A.userId, (db) => inq.listInquiries(db, B.schoolId))).toEqual([]);
  });
  it('관리자는 처리 상태만 바꾸고, 이름·연락처는 고칠 수 없으며 지울 수 없다. 다른 학교 관리자는 상태도 못 바꾼다', async () => {
    const [first] = await asUser(A.userId, (db) => inq.listInquiries(db, A.schoolId));
    await asUser(A.userId, (db) => inq.setInquiryStatus(db, A.schoolId, A.userId, first.id, 'done'));
    expect((await asUser(A.userId, (db) => inq.listInquiries(db, A.schoolId))).find((i) => i.id === first.id)!.status).toBe('done');
    await expect(asUser(A.userId, (db) => db.query(`update public.site_inquiries set name = 'x' where id = $1`, [first.id]))).rejects.toThrow(/permission/);
    await expect(asUser(A.userId, (db) => db.query(`delete from public.site_inquiries where id = $1`, [first.id]))).rejects.toThrow(/permission/);
    await expect(asUser(B.userId, (db) => inq.setInquiryStatus(db, B.schoolId, B.userId, first.id, 'new'))).rejects.toThrow('찾을 수 없습니다');
    await expect(asUser(teacher, (db) => inq.setInquiryStatus(db, A.schoolId, teacher, first.id, 'new'))).rejects.toThrow('찾을 수 없습니다');
  });
  it('보존 기간이 지난 신청은 개인정보 칸만 가리고 행은 남긴다(관리자만, 30일 미만 거부)', async () => {
    await su.query(`update public.site_inquiries set created_at = now() - interval '400 days' where contact = 'parent@example.org'`);
    await expect(asUser(A.userId, (db) => inq.redactInquiries(db, A.schoolId, 10))).rejects.toThrow('30일');
    await expect(asUser(teacher, (db) => inq.redactInquiries(db, A.schoolId, 365))).rejects.toThrow();
    expect(await asUser(B.userId, (db) => inq.redactInquiries(db, A.schoolId, 365)).catch(() => 'denied')).toBe('denied');
    const r = await asUser(A.userId, (db) => inq.redactInquiries(db, A.schoolId, 365));
    expect(r.redacted).toBe(1);
    const { rows } = await su.query(`select name, contact, message, redacted_at from public.site_inquiries where redacted_at is not null`);
    expect(rows).toEqual([expect.objectContaining({ name: '(가림)', contact: '(가림)', message: null })]);
    expect((await su.query('select count(*)::int as n from public.site_inquiries')).rows[0].n).toBe(4);
  });
  it('공개 사이트 정보에 신청 받기가 보이고, 신청 블록은 블록 검사를 통과한다', async () => {
    expect((await site.publicSite('inq-a'))!.inquiry_open).toBe(true);
    expect((await site.publicSite('inq-b'))!.inquiry_open).toBe(false);
    expect(site.validateContent({ title: { ko: 'x' }, blocks: [{ type: 'inquiry', title: { ko: '방문 신청' } }] }).blocks[0]).toMatchObject({ type: 'inquiry' });
  });
});
