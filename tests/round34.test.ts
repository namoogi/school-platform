/** 34차: 외부 작업 토큰 (ADR 0012) — 동화 전용 · 시안만 · 학교 간 양방향 거부 · 기한·폐기 · 원문 미저장 · PDF */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';
import { makePdf, PNG } from './fixture-pdf';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let T: string; // A 학교 교사
let storyA: string; let otherA: string; let pageA: string; let storyB: string;

async function sql(q: string, params: unknown[] = []) {
  const c = new pg.Client({ connectionString: TEST_URL });
  await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
const story = (t: string) => ({ title: { ko: t }, blocks: [{ type: 'story_page', text: { ko: `${t} 첫 쪽` } }] });
const issue = (u: string, s: string, input: Record<string, unknown>) => asUser(u, (db) => agent.createAgentToken(db, s, input)).then((r) => r.token);
const as = <T,>(fn: Parameters<typeof asAgent<T>>[0]) => asAgent(fn);

beforeAll(async () => {
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  await asUser(A.userId, (db) => site.saveSettings(db, A.schoolId, { public_slug: 'school-a-site', langs: ['ko'], default_lang: 'ko', is_open: true }));
  storyA = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'story', key: 'brave-elephant', content: story('용감한 코끼리') })))!.id;
  otherA = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'story', key: 'kind-tiger', content: story('친절한 호랑이') })))!.id;
  pageA = (await asUser(A.userId, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'about', content: { title: { ko: '소개' }, blocks: [] } })))!.id;
  storyB = (await asUser(B.userId, (db) => site.createEntry(db, B.schoolId, { kind: 'story', key: 'brave-elephant', content: story('B 학교 동화') })))!.id;
  T = (await sql(`insert into private.app_users(email, display_name) values ('teacher-a@school-a.test', '예시 교사') returning id`))[0].id;
  await sql(`insert into public.memberships(school_id, user_id, role) values ($1, $2, 'teacher')`, [A.schoolId, T]);
});
afterAll(async () => { await getPool().end(); });

describe('외부 작업 토큰 발급', () => {
  it('학교 관리자만 발급하고, DB에는 해시만 남는다. 발급·폐기는 운영 기록에 남는다', async () => {
    const token = await issue(A.userId, A.schoolId, { label: 'Codex', days: 7, entry_key: 'brave-elephant' });
    expect(token).toMatch(agent.AGENT_TOKEN_RE);
    const rows = await sql(`select token_sha256, encode(sha256(convert_to($1, 'UTF8')), 'hex') as h from public.agent_tokens`, [token]);
    expect(rows[0].token_sha256).toBe(rows[0].h);
    expect(JSON.stringify(await sql(`select * from public.agent_tokens`))).not.toContain(token);
    expect(JSON.stringify(await sql(`select * from public.access_log`))).not.toContain(token);
    expect((await sql(`select action from public.access_log where action like 'agent.%'`)).map((r) => r.action)).toContain('agent.token_create');
    // 교사·다른 학교 관리자는 발급 못 한다 (양방향)
    await expect(issue(T, A.schoolId, { days: 7 })).rejects.toThrow('학교 관리자');
    await expect(issue(B.userId, A.schoolId, { days: 7 })).rejects.toThrow('학교 관리자');
    await expect(issue(A.userId, B.schoolId, { days: 7 })).rejects.toThrow('학교 관리자');
    await expect(issue(A.userId, A.schoolId, { days: 45 })).rejects.toThrow('7·30·90');
    await expect(issue(A.userId, A.schoolId, { days: 7, entry_key: 'no-such-story' })).rejects.toThrow('동화가 없습니다');
    // 사람에게도 해시 열은 보이지 않고, 목록은 그 학교 관리자에게만
    await expect(asUser(A.userId, (db) => db.query('select token_sha256 from public.agent_tokens'))).rejects.toThrow();
    expect((await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId))).length).toBe(1);
    expect(await asUser(B.userId, (db) => agent.listAgentTokens(db, A.schoolId))).toEqual([]);
    expect(await asUser(T, (db) => agent.listAgentTokens(db, A.schoolId))).toEqual([]);
  });
});

describe('토큰으로 할 수 있는 일과 없는 일', () => {
  let tok: string; let tokB: string;
  beforeAll(async () => {
    tok = await issue(A.userId, A.schoolId, { label: '코끼리 동화', days: 30, entry_key: 'brave-elephant' });
    tokB = await issue(B.userId, B.schoolId, { label: 'B 동화', days: 30 });
  });

  it('범위 안 동화에 그림·PDF를 올리고 새 판(시안)을 저장한다. 공개는 되지 않는다', async () => {
    expect(await as((db) => agent.agentWhoami(db, tok))).toMatchObject({ scope: 'story', story_key: 'brave-elephant' });
    const png = await as((db) => agent.agentUpload(db, tok, { name: 'elephant.png', type: 'image/png', bytes: PNG }));
    const pdf = await as((db) => agent.agentUpload(db, tok, { name: 'brave-elephant.pdf', type: 'application/pdf', bytes: makePdf() }));
    expect((await as((db) => agent.agentUpload(db, tok, { name: 'again.png', type: 'image/png', bytes: PNG }))).reused).toBe(true);
    const base = await as((db) => agent.agentStory(db, tok, 'brave-elephant'));
    const content = { ...base.latest.content, blocks: [...base.latest.content.blocks,
      { type: 'section', template: 'cards', title: { ko: '등장인물' }, items: [{ title: { ko: '코끼리' }, asset: png.id, alt: { ko: '코끼리' } }] },
      { type: 'download', asset: pdf.id, label: { ko: '동화 PDF' }, file_name: 'fake.exe', size_bytes: 1 }] };
    const v = await as((db) => agent.agentSaveStory(db, tok, 'brave-elephant', { content, note: '캐릭터·PDF' }));
    expect(v).toMatchObject({ version: 2, published: false });
    const saved = (await sql(`select content, note, created_by from public.site_entry_versions where id = $1`, [v.version_id]))[0];
    expect(saved.note).toBe('[작업 토큰: 코끼리 동화] 캐릭터·PDF');
    expect(saved.created_by).toBe(A.userId); // 발급한 관리자가 책임자
    // 파일 이름·크기는 보낸 값이 아니라 서버가 자산에서 채운다
    expect(saved.content.blocks.at(-1)).toMatchObject({ type: 'download', file_name: 'brave-elephant.pdf', size_bytes: makePdf().length });
    expect(await site.publicEntry('school-a-site', 'story', 'brave-elephant')).toBeNull();
    expect((await sql(`select action from public.agent_token_uses order by id`)).map((r) => r.action)).toEqual(['asset.upload', 'asset.upload', 'story.version']);
    expect((await sql(`select last_used_at from public.agent_tokens where label = '코끼리 동화'`))[0].last_used_at).not.toBeNull();
  });

  it('범위 밖 동화·쪽·소식은 읽지도 쓰지도 못한다', async () => {
    await expect(as((db) => agent.agentStory(db, tok, 'kind-tiger'))).rejects.toMatchObject({ code: 'P0002' });
    await expect(as((db) => agent.agentSaveStory(db, tok, 'kind-tiger', { content: story('침입') }))).rejects.toMatchObject({ code: '42501' });
    await expect(as((db) => agent.agentSaveStory(db, tok, 'about', { content: story('침입') }))).rejects.toMatchObject({ code: '42501' });
    expect((await as((db) => agent.agentStories(db, tok)) as { key: string }[]).map((s) => s.key)).toEqual(['brave-elephant']);
    // 함수 밖 표·명령은 아예 권한이 없다: 공개 기록, 설정, 쪽, 다른 학교
    for (const q of [
      [`insert into public.site_publications(school_id, entry_id, version_id) values ($1, $2, null)`, [A.schoolId, storyA]],
      [`update public.site_settings set is_open = false`, []],
      [`select * from public.site_entries`, []],
      [`select * from public.agent_tokens`, []],
      [`select app.create_agent_token($1, 'x', 7, null)`, [A.schoolId]],
      [`select app.set_license($1, 5, array['intake'])`, [A.schoolId]],
    ] as [string, unknown[]][]) {
      await expect(as((db) => db.query(q[0], q[1]))).rejects.toMatchObject({ code: expect.stringMatching(/^(42501|3F000)$/) });
    }
    expect((await sql(`select count(*)::int as n from public.site_entry_versions where entry_id in ($1, $2)`, [otherA, pageA]))[0].n).toBe(2);
  });

  it('다른 학교 동화·자산은 양방향으로 막힌다', async () => {
    // A 토큰으로 B 학교의 같은 key 동화를 고칠 수 없다(A 학교 동화가 고쳐짐)
    const v = await as((db) => agent.agentSaveStory(db, tok, 'brave-elephant', { content: story('A 동화 3판') }));
    expect((await sql(`select entry_id from public.site_entry_versions where id = $1`, [v.version_id]))[0].entry_id).toBe(storyA);
    expect((await sql(`select count(*)::int as n from public.site_entry_versions where entry_id = $1`, [storyB]))[0].n).toBe(1);
    // B 토큰으로는 A 자산이 보이지 않고, A 자산을 가리키는 판도 저장할 수 없다
    const aAssets = await as((db) => agent.agentAssets(db, tok));
    expect(aAssets.length).toBe(2);
    expect(await as((db) => agent.agentAssets(db, tokB))).toEqual([]);
    const withA = { title: { ko: 'B' }, blocks: [{ type: 'story_page', asset: aAssets[0].id, text: { ko: '훔친 그림' } }] };
    await expect(as((db) => agent.agentSaveStory(db, tokB, 'brave-elephant', { content: withA }))).rejects.toThrow('이 학교에 없는');
    await expect(as((db) => agent.agentStory(db, tokB, 'kind-tiger'))).rejects.toMatchObject({ code: 'P0002' });
    // 반대로 A 토큰으로 B 자산도 못 쓴다
    const bPng = await as((db) => agent.agentUpload(db, tokB, { name: 'b.png', type: 'image/png', bytes: Buffer.concat([PNG, Buffer.from('b')]) }));
    await expect(as((db) => agent.agentSaveStory(db, tok, 'brave-elephant', { content: { title: { ko: 'A' }, blocks: [{ type: 'story_page', asset: bPng.id, text: { ko: 'x' } }] } }))).rejects.toThrow('이 학교에 없는');
  });

  it('파일 형식·크기·PDF 내용을 검사한다', async () => {
    await expect(as((db) => agent.agentUpload(db, tok, { name: 'x.pdf', type: 'application/pdf', bytes: makePdf({ extra: '/OpenAction << /S /JavaScript /JS (x) >> ' }) }))).rejects.toThrow('실행 기능');
    await expect(as((db) => agent.agentUpload(db, tok, { name: 'x.pdf', type: 'application/pdf', bytes: PNG }))).rejects.toThrow('형식');
    await expect(as((db) => agent.agentUpload(db, tok, { name: 'x.png', type: 'image/png', bytes: makePdf() }))).rejects.toThrow('형식');
    await expect(as((db) => agent.agentUpload(db, tok, { name: 'x.gif', type: 'image/gif', bytes: Buffer.from('GIF89a') }))).rejects.toThrow('PNG');
    // DB도 직접 막는다 (앱 검사를 건너뛴 경우): PDF 머리
    await expect(as((db) => db.query(`select agent.upload_asset($1, 'x.pdf', 'application/pdf', $2)`, [tok, PNG]))).rejects.toThrow('형식');
    // 내려받기 블록은 PDF만
    const png = (await as((db) => agent.agentAssets(db, tok))).find((a) => a.mime === 'image/png')!;
    await expect(as((db) => agent.agentSaveStory(db, tok, 'brave-elephant', { content: { title: { ko: 'x' }, blocks: [{ type: 'download', asset: png.id }] } }))).rejects.toThrow('PDF');
  });

  it('폐기·기한 지남·형식이 틀린 토큰은 거부한다', async () => {
    await expect(as((db) => agent.agentWhoami(db, 'agt_' + '0'.repeat(64)))).rejects.toMatchObject({ code: '28000' });
    const t2 = await issue(A.userId, A.schoolId, { label: '잠깐', days: 7 });
    expect(await as((db) => agent.agentWhoami(db, t2))).toMatchObject({ story_key: null });
    const [row] = await asUser(A.userId, (db) => agent.listAgentTokens(db, A.schoolId));
    await expect(asUser(B.userId, (db) => agent.revokeAgentToken(db, A.schoolId, row.id))).rejects.toThrow('학교 관리자');
    await asUser(A.userId, (db) => agent.revokeAgentToken(db, A.schoolId, row.id));
    await expect(as((db) => agent.agentWhoami(db, t2))).rejects.toMatchObject({ code: '28000' });
    const t3 = await issue(A.userId, A.schoolId, { label: '기한', days: 7 });
    await sql(`update public.agent_tokens set expires_at = now() - interval '1 minute' where label = '기한'`);
    await expect(as((db) => agent.agentUpload(db, t3, { name: 'x.png', type: 'image/png', bytes: PNG }))).rejects.toMatchObject({ code: '28000' });
    // 기능을 끄면 토큰도 멈춘다
    await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage'])`, [A.schoolId]));
    await expect(as((db) => agent.agentWhoami(db, tok))).rejects.toMatchObject({ code: '28000' });
    await asUser(A.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [A.schoolId]));
    // 사용 기록·토큰 행은 고치거나 지울 수 없다
    await expect(sql(`delete from public.agent_token_uses`)).rejects.toThrow();
    await expect(sql(`delete from public.agent_tokens`)).rejects.toThrow();
  });

  it('관리자가 공개하면 방문자는 PDF를 내려받는다(공개된 판이 가리킬 때만)', async () => {
    const pdf = (await as((db) => agent.agentAssets(db, tok))).find((a) => a.mime === 'application/pdf')!;
    expect(await site.publicAsset('school-a-site', pdf.id)).toBeNull();
    // 2판(PDF 블록 있음)을 골라 공개
    const v2 = (await sql(`select id from public.site_entry_versions where entry_id = $1 and version = 2`, [storyA]))[0].id;
    await asUser(A.userId, (db) => site.publish(db, A.schoolId, storyA, v2));
    expect((await site.publicAsset('school-a-site', pdf.id))!.mime).toBe('application/pdf');
    // 사람도 편집 화면에서 PDF를 올리고 내려받기 블록을 쓸 수 있다
    const own = (await asUser(T, (db) => site.uploadAsset(db, A.schoolId, { name: 'teacher.pdf', type: 'application/pdf', bytes: makePdf({ pad: 10 }) })))!;
    const { id } = (await asUser(T, (db) => site.createEntry(db, A.schoolId, { kind: 'page', key: 'files', content: { title: { ko: '자료' }, blocks: [{ type: 'download', asset: own.id }] } })))!;
    expect((await sql(`select content from public.site_entry_versions where entry_id = $1`, [id]))[0].content.blocks[0].file_name).toBe('teacher.pdf');
  });
});
