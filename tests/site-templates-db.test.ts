/** 65차 ADR 0031 — 템플릿 적용: 시안 쪽(1판)만 만들고 공개하지 않음, 같은 주소의 쪽은 건너뜀(학교 것을 덮지 않음), 다시 적용해도 그대로, 다른 학교와 섞이지 않음 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const tpl = await import('@/lib/site-templates');

type S = { schoolId: string; userId: string };
let A: S; let B: S;
let su: pg.Client;

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  su = new pg.Client({ connectionString: TEST_URL });
  await su.connect();
  for (const s of [A, B]) {
    await su.query(`insert into public.school_licenses(school_id, version, seats, modules, monthly_estimate_krw, price_snapshot, note, created_by)
                    select school_id, version + 1, seats, modules || '{homepage}', monthly_estimate_krw, price_snapshot, 'f65', created_by from public.school_licenses
                     where school_id = $1 order by version desc limit 1`, [s.schoolId]);
  }
});
afterAll(async () => { await su.end(); await getPool().end(); });

describe('템플릿 적용', () => {
  it('없는 쪽만 시안으로 만들고, 있는 쪽은 건너뛰며, 공개하지 않는다', async () => {
    await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'about', content: { title: { ko: '우리 학교가 이미 쓴 소개' }, blocks: [] } }));
    const r = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'notice'));
    expect(r.created.map((c) => c.key)).toEqual(['home', 'school-life', 'admission', 'letters']);
    expect(r.skipped).toEqual(['about']);
    const entries = await asUser(A.userId, (db) => site.listEntries(db, A.schoolId));
    const about = entries.find((e) => e.key === 'about')!;
    expect(about.latest_title).toEqual({ ko: '우리 학교가 이미 쓴 소개' }); // 덮지 않음
    for (const e of entries.filter((x) => r.created.some((c) => c.key === x.key))) {
      expect(e).toMatchObject({ live_version: null, latest_version: 1, status: 'draft' });
    }
    const home = await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, r.created[0].id));
    expect(home.versions[0].note).toBe('템플릿 알림 중심형 v5');
    expect(home.versions[0].content.site?.footer?.ko).toContain('[학교 이름]');
  });

  it('다시 적용하면 모두 건너뛰고, 다른 템플릿은 없는 주소만 더한다. 다른 학교와 섞이지 않는다', async () => {
    const again = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'notice'));
    expect(again.created).toEqual([]);
    const story = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'story'));
    expect(story.created.map((c) => c.key)).toEqual(['philosophy', 'learning', 'community']);
    expect(story.skipped).toEqual(['home', 'admission']);
    expect((await asUser(B.userId, (db) => site.listEntries(db, B.schoolId))).length).toBe(0);
    const b = await asUser(B.userId, (db) => tpl.applyTemplate(db, B.schoolId, 'international'));
    expect(b.created.map((c) => c.key)).toEqual(['home', 'about', 'curriculum', 'admissions', 'student-life']);
    expect((await asUser(A.userId, (db) => site.listEntries(db, A.schoolId))).some((e) => e.key === 'student-life')).toBe(false);
    const { rows } = await su.query(`select detail from public.access_log where school_id = $1 and action = 'site.template_apply' order by id`, [A.schoolId]);
    expect(rows.map((x) => x.detail.template)).toEqual(['notice', 'notice', 'story']);
  });
});

describe('66차 학교 자료로 빈 칸 채우기', () => {
  const brochure = Buffer.from(['교육 목표', '- 스스로 배우는 사람: 질문을 세운다', '- 함께 사는 사람: 이웃을 섬긴다', '', '학사일정', '3월: 입학식', '7월: 발표회', '',
    '급식', '텃밭 채소로 점심을 준비합니다.', '', '오시는 길', '경기도 예시시 꿈마을로 12', '전화 031-123-4567 · hello@example-school.test'].join('\n'));
  it('제안은 파일을 저장하지 않고 돌려주며, 넣으면 안내 자리만 채운 새 시안 판(학교가 쓴 쪽은 그대로)', async () => {
    const pv = await asUser(A.userId, (db) => tpl.autofillPropose(db, A.schoolId, 'notice', [{ name: '소개서.txt', bytes: brochure }], '드리미 예시학교'));
    const ids = pv.proposals.map((p) => p.slotId);
    expect(ids).toEqual(expect.arrayContaining(['goals', 'calendar', 'meals', 'address', 'footer']));
    expect(pv.notes).toEqual([{ file: '소개서.txt', ok: true, note: '글 파일' }]);
    const r = await asUser(A.userId, (db) => tpl.autofillApply(db, A.schoolId, 'notice', pv.proposals.map((p) => ({ slotId: p.slotId, value: p.value }))));
    const by = Object.fromEntries(r.result.map((x) => [x.page, x]));
    expect(by.home).toMatchObject({ version: 2, filled: expect.arrayContaining(['address', 'footer']) });
    expect(by['school-life']).toMatchObject({ version: 2, filled: expect.arrayContaining(['calendar', 'meals']) });
    expect(by.about).toMatchObject({ version: null, kept: ['goals'] }); // 학교가 먼저 쓴 소개 쪽(템플릿 블록 없음)은 그대로
    const entries = await asUser(A.userId, (db) => site.listEntries(db, A.schoolId));
    const home = entries.find((e) => e.key === 'home')!;
    expect(home).toMatchObject({ live_version: null, meta: { template: 'notice@5' } });
    const v = await asUser(A.userId, (db) => site.getEntry(db, A.schoolId, home.id));
    expect(v.versions[0].content.site?.address).toEqual({ ko: '경기도 예시시 꿈마을로 12' });
    expect(v.versions[0].note).toContain('자료로 빈 칸 채움');
    // 다시 넣으면 이미 채운 칸이라 판이 늘지 않는다
    const again = await asUser(A.userId, (db) => tpl.autofillApply(db, A.schoolId, 'notice', [{ slotId: 'address', value: '다른 주소' }]));
    expect(again.result[0]).toMatchObject({ version: null, kept: ['address'] });
  });

  it('형식이 틀린 값·없는 칸·다른 학교 그림은 거부', async () => {
    await expect(asUser(A.userId, (db) => tpl.autofillApply(db, A.schoolId, 'notice', [{ slotId: 'nope', value: 'x' }]))).rejects.toThrow('없는 칸');
    await expect(asUser(A.userId, (db) => tpl.autofillApply(db, A.schoolId, 'notice', [{ slotId: 'meals', value: '' }]))).rejects.toThrow('형식');
    await expect(asUser(A.userId, (db) => tpl.autofillApply(db, A.schoolId, 'story', [{ slotId: 'hero-photo', value: '00000000-0000-4000-8000-000000000000' }]))).rejects.toThrow('그림이 아닙니다');
    await expect(asUser(A.userId, (db) => tpl.autofillPropose(db, A.schoolId, 'notice', [], 'x'))).rejects.toThrow('하나 이상');
  });
});


describe('67차 기존 사이트에서 옮기기', () => {
  it('읽은 쪽으로 제안을 만들고, 고른 그림만 형식 검사 뒤 학교 그림으로 가져온다(가짜 크롤러·시험 전용)', async () => {
    const { crawlSite } = await import('@/lib/site-crawl');
    const fakeCrawl = (async () => ({ start: 'https://old.example/', skipped: [], pages: [
      { url: 'https://old.example/about', title: '학교 소개', text: '교육 철학\n스스로 묻고 함께 답을 찾는 배움터입니다.\n\n하루 일과\n아침 산책으로 시작합니다.', images: [{ src: 'https://old.example/a.png', alt: '전경' }] },
    ] })) as unknown as typeof crawlSite;
    const pv = await asUser(A.userId, (db) => tpl.migratePropose(db, A.schoolId, 'story', 'https://old.example/', '드리미 예시학교', fakeCrawl));
    expect(pv.pages).toEqual([{ url: 'https://old.example/about', title: '학교 소개' }]);
    expect(pv.proposals.map((p) => p.slotId)).toEqual(expect.arrayContaining(['belief', 'day']));
    expect(pv.images).toEqual([{ src: 'https://old.example/a.png', alt: '전경' }]);
    expect(pv.imageSlots.map((s) => s.slotId)).toEqual(['hero-photo']);
    const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    const fakeImg = (async (u: string) => u.endsWith('a.png') ? { bytes: PNG, type: 'image/png', name: 'a.png' } : { bytes: Buffer.from('<html>'), type: 'text/html', name: 'x' }) as never;
    const r = await asUser(A.userId, (db) => tpl.migrateImages(db, A.schoolId, ['https://old.example/a.png', 'https://old.example/not-image'], fakeImg));
    expect(r.imported.map((i) => i.name)).toEqual(['a.png']);
    expect(r.failed).toHaveLength(1);
    const assets = await asUser(A.userId, (db) => site.listAssets(db, A.schoolId));
    expect(assets.some((a) => a.id === r.imported[0].id && a.mime === 'image/png')).toBe(true);
    await expect(asUser(A.userId, (db) => tpl.migrateImages(db, A.schoolId, Array(11).fill('https://old.example/a.png'), fakeImg))).rejects.toThrow('10장');
    // 실제 크롤러는 사설 주소를 거부한다
    await expect(asUser(A.userId, (db) => tpl.migratePropose(db, A.schoolId, 'story', 'http://127.0.0.1/', 'x'))).rejects.toThrow(/공개 인터넷/);
  });
});

describe('87차 주소만 넣고 새 디자인으로 옮기기', () => {
  it('템플릿 없이 읽으면 맞는 템플릿을 추천하고 템플릿마다 제안을 준다 → 고른 템플릿 시작 + 제안 넣기 = 공개 안 된 시안', async () => {
    const { crawlSite } = await import('@/lib/site-crawl');
    const fakeCrawl = (async () => ({ start: 'https://old-mission.example/', skipped: [], pages: [
      { url: 'https://old-mission.example/', title: '등대학교', text: '우리의 사명\n배움이 닿지 않는 마을에 학교를 세웁니다.\n\n후원 안내\n- 정기 후원: 매달 자동 이체\n- 봉사: 방학 캠프\n- 기도: 기도 편지 신청', images: [] },
      { url: 'https://old-mission.example/give', title: '후원하기', text: '후원금 사용\n- 교사 생활비: 60%\n- 교재: 40%\n기도 제목을 나눕니다.', images: [] },
    ] })) as unknown as typeof crawlSite;
    const pv = await asUser(B.userId, (db) => tpl.migratePropose(db, B.schoolId, '', 'https://old-mission.example/', '등대학교', fakeCrawl));
    expect(pv.fits[0].key).toBe('mission');
    expect(pv.template).toBe('mission');
    expect(pv.fits[0].reasons).toEqual(expect.arrayContaining(['후원']));
    expect(Object.keys(pv.byTemplate!)).toHaveLength(tpl.SITE_TEMPLATES.length);
    expect(pv.proposals.map((p) => p.slotId)).toEqual(expect.arrayContaining(['ways']));
    // 화면이 하는 순서 그대로: 템플릿 시작(없는 쪽만 시안) → 고른 제안 넣기(새 시안 판)
    const applied = await asUser(B.userId, (db) => tpl.applyTemplate(db, B.schoolId, 'mission'));
    expect(applied.created.map((c) => c.key)).toEqual(expect.arrayContaining(['partner']));
    const fills = pv.proposals.filter((p) => p.kind !== 'image').map((p) => ({ slotId: p.slotId, value: p.value }));
    const r = await asUser(B.userId, (db) => tpl.autofillApply(db, B.schoolId, 'mission', fills));
    const partner = r.result.find((x) => x.page === 'partner')!;
    expect(partner.version).toBe(2);
    const entries = await asUser(B.userId, (db) => site.listEntries(db, B.schoolId));
    expect(entries.filter((e) => e.kind === 'page').every((e) => !e.live_version)).toBe(true);
  });
  it('없는 템플릿 키는 읽기 전에 거부, 교사는 막힘은 API(admin)에서', async () => {
    await expect(asUser(A.userId, (db) => tpl.migratePropose(db, A.schoolId, 'nope', 'https://old.example/', 'x'))).rejects.toThrow();
  });
});

describe('89차 템플릿 = 완성 디자인(ADR 0034)', () => {
  it('design이면 학교 화면 모양이 템플릿 디자인으로 바뀌고, 설정이 없으면 no-settings, 다른 학교는 그대로', async () => {
    // 설정 없는 학교: 쪽만 만들고 모양은 못 바꿈
    await su.query('delete from public.site_settings where school_id = any($1)', [[A.schoolId, B.schoolId]]);
    const none = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'project', { design: true }));
    expect(none.design).toBe('no-settings');
    await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'design-a', langs: ['ko'], default_lang: 'ko', theme: 'campus', site_title: { ko: 'A' }, is_open: false }));
    await asUser(B.userId, (db) => site.saveSettings(db, B.schoolId, { public_slug: 'design-b', langs: ['ko'], default_lang: 'ko', theme: 'campus', site_title: { ko: 'B' }, is_open: false }));
    const r = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'project', { design: true }));
    expect(r.design).toBe('applied');
    expect((await asUser(A.userId, (db) => site.getSettings(db, A.schoolId)))!.theme).toBe('studio');
    expect((await asUser(B.userId, (db) => site.getSettings(db, B.schoolId)))!.theme).toBe('campus');
    // design을 주지 않으면 모양은 그대로
    const kept = await asUser(A.userId, (db) => tpl.applyTemplate(db, A.schoolId, 'mission'));
    expect(kept.design).toBe('kept');
    expect((await asUser(A.userId, (db) => site.getSettings(db, A.schoolId)))!.theme).toBe('studio');
  });
  it('설정 저장은 목록에 있는 모양만 받고, 모르는 값은 학사 기본으로', async () => {
    await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'design-a', langs: ['ko'], default_lang: 'ko', theme: 'horizon', site_title: { ko: 'A' }, is_open: false }));
    expect((await asUser(A.userId, (db) => site.getSettings(db, A.schoolId)))!.theme).toBe('horizon');
    await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'design-a', langs: ['ko'], default_lang: 'ko', theme: 'nope', site_title: { ko: 'A' }, is_open: false }));
    expect((await asUser(A.userId, (db) => site.getSettings(db, A.schoolId)))!.theme).toBe('campus');
  });
});
