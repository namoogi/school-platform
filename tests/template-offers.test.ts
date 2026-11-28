/** 121차 ADR 0043 3단계 — 템플릿 새 판 제안: 새 판을 내면 그 템플릿을 쓰는 학교에만 제안, 미리 보기, 보류·거절·수락(적용 + 기록) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const at = await import('@/lib/academic-templates');
const off = await import('@/lib/template-offers');
const f = await import('@/lib/foundation');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;
let platformId: string;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  platformId = (await su.query(`select id from private.app_users where email = 'platform@example.test'`)).rows[0].id;
}, 120_000);
afterAll(async () => { await su.end(); await getPool().end(); });

const ver = (s: S) => asUser(s.userId, async (db) => (await f.schoolProfile(db, s.schoolId))?.version ?? 0);
// 새 판은 직전 판에 쌓는다(실제 관제가 내는 방식)
const latest = async () => (await su.query(`select manifest from public.academic_templates where key = 'kr_general' order by version desc limit 1`)).rows[0].manifest;
const publish = async (version: number, extraScale: string) => {
  const m = await latest();
  m.scales = [...m.scales, { code: extraScale, preset: 'pass_fail' }];
  return asUser(platformId, (db) => off.publishAcademicTemplate(db, {
    key: 'kr_general', base_version: version - 1, title: { ko: '한국 일반 초·중·고', en: 'Korean K-12 (general)' }, summary: { ko: `${version}판` },
    manifest: m, why: `P/F 척도 ${extraScale} 추가`,
  }));
};

describe('템플릿 새 판 제안', () => {
  it('새 판은 그 템플릿을 쓰는 학교에만 제안으로 가고, 학교 사본은 그대로다', async () => {
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 1, base_version: await ver(B) }));
    await asUser(A.userId, async (db) => at.applyTemplate(db, A.schoolId, { key: 'homeschool', version: 1, base_version: await ver(A) }));
    const scales = async () => (await su.query(`select count(*)::int as n from public.scales where school_id = $1`, [B.schoolId])).rows[0].n;
    const before = await scales();
    expect(await publish(2, 'kr_pf_v2')).toBe(2);
    const offers = await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId));
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ template_key: 'kr_general', from_version: 1, to_version: 2, status: 'offered' });
    expect(await asUser(A.userId, (db) => off.templateOffers(db, A.schoolId))).toEqual([]);
    expect(await scales()).toBe(before);
    expect((await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId)))!.version).toBe(1);
    // 다른 학교는 이 제안을 못 본다(RLS)
    expect((await asUser(A.userId, (db) => db.query(`select * from public.academic_template_offers where school_id = $1`, [B.schoolId]))).rows).toEqual([]);
  });

  it('미리 보기: 없는 척도만 더하고, 학기 구조·숨길 구획·있는 척도는 학교 값', async () => {
    const [view] = await asUser(B.userId, (db) => off.templateOfferViews(db, B.schoolId));
    expect(view.why).toBe('P/F 척도 kr_pf_v2 추가');
    expect(view.plan!.add).toMatchObject({ levels: [], grades: 0, periods: [], scales: ['kr_pf_v2'] });
    expect(view.plan!.keep).toMatchObject({ periods: true, hidden: true });
    expect(view.plan!.keep.scales).toEqual(expect.arrayContaining(['kr_achievement', 'kr_elective']));
  });

  it('보류·거절은 기록만, 다른 학교·낡은 판은 거부, 수락은 적용 + 기록(미리 보기와 같은 결과)', async () => {
    const [o] = await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId));
    const decide = (s: S, decision: string, base?: number) => asUser(s.userId, async (db) =>
      off.decideTemplateOffer(db, s.schoolId, { offerId: o.id, decision, base_version: base ?? await ver(s) }));
    await expect(decide(A, 'held')).rejects.toThrow();
    expect((await decide(B, 'held')).status).toBe('held');
    expect((await decide(B, 'declined')).status).toBe('declined');
    await expect(decide(B, 'accepted', 0)).rejects.toMatchObject({ code: 'P0409' });
    expect((await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId)))[0].status).toBe('declined');
    // 거절한 제안도 나중에 수락할 수 있다
    const r = await decide(B, 'accepted');
    expect(r).toMatchObject({ status: 'accepted', to_version: 2, applied: { made: { scales: ['kr_pf_v2'] } } });
    expect((await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId)))!.version).toBe(2);
    await expect(decide(B, 'held')).rejects.toThrow('이미 수락');
  });

  it('적용하지 않은 판은 DB가 수락을 막고, 높은 판을 수락하면 낮은 판의 열린 제안도 함께 닫힌다', async () => {
    await publish(3, 'kr_pf_v3');
    await publish(4, 'kr_pf_v4');
    const offers = await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId));
    const o3 = offers.find((x) => x.to_version === 3)!; const o4 = offers.find((x) => x.to_version === 4)!;
    await expect(asUser(B.userId, (db) => db.query(`select app.decide_template_offer($1, $2, 'accepted')`, [B.schoolId, o3.id]))).rejects.toThrow('먼저 적용');
    await asUser(B.userId, async (db) => off.decideTemplateOffer(db, B.schoolId, { offerId: o4.id, decision: 'accepted', base_version: await ver(B) }));
    const after = await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId));
    expect(after.find((x) => x.id === o3.id)!.status).toBe('accepted');
    expect((await su.query(`select count(*)::int as n from public.scales where school_id = $1 and code in ('kr_pf_v3','kr_pf_v4')`, [B.schoolId])).rows[0].n).toBe(2);
    // 학교가 다른 템플릿으로 바꾸면 옛 템플릿 제안은 보이지 않는다
    await publish(5, 'kr_pf_v5');
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'homeschool', version: 1, base_version: await ver(B) }));
    expect(await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId))).toEqual([]);
    const o5 = (await su.query(`select id from public.academic_template_offers where school_id = $1 and to_version = 5`, [B.schoolId])).rows[0].id;
    await expect(asUser(B.userId, (db) => db.query(`select app.decide_template_offer($1, $2, 'held')`, [B.schoolId, o5]))).rejects.toThrow('다른 템플릿');
    // 최신 판(5판)으로 다시 고르면 옛 제안은 지난 것: 보이지 않고, 결정하면 판을 내리지 않고 거부(Codex 199번 PR 검토)
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 5, base_version: await ver(B) }));
    expect((await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId))).filter((x) => x.status !== 'accepted')).toEqual([]);
    await expect(asUser(B.userId, async (db) => off.decideTemplateOffer(db, B.schoolId, { offerId: o5, decision: 'accepted', base_version: await ver(B) }))).rejects.toThrow('지난 제안');
    await expect(asUser(B.userId, (db) => db.query(`select app.decide_template_offer($1, $2, 'held')`, [B.schoolId, o5]))).rejects.toThrow('지난 제안');
    expect((await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId)))!.version).toBe(5);
    // 함께 닫힌 제안은 언어와 상관없는 판 번호를 남긴다
    expect(after.find((x) => x.id === o3.id)!.included_in).toBe(4);
  });

  it('같은 템플릿의 다른 판으로 바로 적용하는 길은 막힌다(제안 수락만)', async () => {
    await publish(6, 'kr_pf_v6');
    await expect(asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 6, base_version: await ver(B) }))).rejects.toThrow();
    expect((await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId)))!.version).toBe(5);
    // 같은 판 다시 채우기는 된다
    await asUser(B.userId, async (db) => at.applyTemplate(db, B.schoolId, { key: 'kr_general', version: 5, base_version: await ver(B) }));
    const [o6] = (await asUser(B.userId, (db) => off.templateOffers(db, B.schoolId))).filter((x) => x.status !== 'accepted');
    expect(o6.to_version).toBe(6);
    await asUser(B.userId, async (db) => off.decideTemplateOffer(db, B.schoolId, { offerId: o6.id, decision: 'accepted', base_version: await ver(B) }));
    expect((await asUser(B.userId, (db) => at.schoolTemplate(db, B.schoolId)))!.version).toBe(6);
  });

  it('제안 행은 지울 수 없고, 학교 사람은 직접 쓸 수 없다', async () => {
    const id = (await su.query(`select id from public.academic_template_offers limit 1`)).rows[0].id;
    await expect(su.query(`delete from public.academic_template_offers where id = $1`, [id])).rejects.toThrow();
    await expect(asUser(B.userId, (db) => db.query(`update public.academic_template_offers set status = 'accepted' where id = $1`, [id]))).rejects.toThrow();
  });
});
