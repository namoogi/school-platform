/** 43차: R2 파일 저장소(ADR 0018) + 학교별 사용량·요금 추정 — 로컬 S3 흉내 서버로 시험(실제 R2 없이) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { lookupIds, resetTestDb, TEST_URL } from './helpers';

process.env.DATABASE_URL = TEST_URL;
const { asUser, asAgent, getPool } = await import('@/lib/db');
const site = await import('@/lib/site');
const agent = await import('@/lib/agent');
const storage = await import('@/lib/storage');
const usage = await import('@/lib/usage');

let A: { schoolId: string; userId: string };
let B: { schoolId: string; userId: string };
let P: string;
const objects = new Map<string, { body: Buffer; type: string }>();
let server: http.Server;
const sql = async (q: string, params: unknown[] = []) => {
  const c = new pg.Client({ connectionString: TEST_URL }); await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
};
// 서로 다른 작은 PNG (내용만 다르게)
const png = (n: number) => Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.from(`png-${n}-${'x'.repeat(40)}`)]);
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
function useR2(on: boolean) {
  const addr = server.address() as { port: number };
  for (const [k, v] of Object.entries({ R2_ENDPOINT: `http://127.0.0.1:${addr.port}`, R2_ACCESS_KEY_ID: 'test-id', R2_SECRET_ACCESS_KEY: 'test-secret', R2_BUCKET: 'bkt' })) {
    if (on) process.env[k] = v; else delete process.env[k];
  }
  storage.resetObjectStore();
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const key = decodeURIComponent((req.url ?? '').split('?')[0]);
    // 서명 없는 요청 거부: 머리 서명(쓰기·HEAD) 또는 서명 주소(X-Amz-Signature, 읽기)
    if (!String(req.headers.authorization ?? '').startsWith('AWS4-HMAC-SHA256') && !(req.url ?? '').includes('X-Amz-Signature=')) { res.statusCode = 403; return res.end(); }
    if (req.method === 'PUT') {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c)); req.on('end', () => { objects.set(key, { body: Buffer.concat(chunks), type: String(req.headers['content-type']) }); res.end(); });
      return;
    }
    const o = objects.get(key);
    if (!o) { res.statusCode = 404; return res.end(); }
    res.setHeader('content-length', String(o.body.length));
    res.end(req.method === 'HEAD' ? undefined : o.body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  (globalThis as { __schoolPlatformPool?: unknown }).__schoolPlatformPool = undefined;
  await resetTestDb();
  ({ A, B } = await lookupIds());
  for (const X of [A, B]) await asUser(X.userId, (db) => db.query(`select app.set_license($1, 5, array['intake','records','homepage','stories'])`, [X.schoolId]));
  P = (await sql(`select id from private.app_users where email = 'platform@example.test'`))[0].id;
});
afterAll(async () => { useR2(false); server.close(); await getPool().end(); });

describe('R2 파일 저장소', () => {
  it('설정이 없으면 지금처럼 DB에 저장한다', async () => {
    useR2(false);
    const r = await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'a.png', type: 'image/png', bytes: png(1) }));
    const [row] = await sql('select bytes is not null as has_bytes, object_key from public.site_assets where id = $1', [r!.id]);
    expect(row).toEqual({ has_bytes: true, object_key: null });
  });

  it('설정이 있으면 바이트는 R2에만, DB에는 위치(sha256 키)만', async () => {
    useR2(true);
    const b = png(2);
    const r = await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'b.png', type: 'image/png', bytes: b }));
    const [row] = await sql('select bytes is null as no_bytes, object_key from public.site_assets where id = $1', [r!.id]);
    expect(row).toEqual({ no_bytes: true, object_key: `s/${A.schoolId}/${sha(b)}` });
    expect(objects.get(`/bkt/s/${A.schoolId}/${sha(b)}`)?.body.equals(b)).toBe(true);
  });

  it('읽기: R2 파일은 짧은 서명 주소로 넘기고(302), DB 파일은 바로 보낸다', async () => {
    useR2(true);
    const k = `sha256/${'a'.repeat(64)}`;
    const r2 = await storage.assetResponse({ mime: 'image/png', bytes: null, sha256: 'a'.repeat(64), object_key: k }, {}, 'public, max-age=300');
    expect(r2.status).toBe(302);
    const loc = new URL(r2.headers.get('location')!);
    expect(loc.pathname).toBe(`/bkt/${k}`);
    expect(loc.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(loc.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    expect(r2.headers.get('cache-control')).toBe('public, max-age=120');
    const pdf = await storage.assetResponse({ mime: 'application/pdf', bytes: null, sha256: 'a'.repeat(64), object_key: k }, {}, 'private, max-age=60');
    expect(new URL(pdf.headers.get('location')!).searchParams.get('response-content-disposition')).toBe('attachment');
    const db = await storage.assetResponse({ mime: 'image/png', bytes: png(9), sha256: 'b'.repeat(64), object_key: null }, {}, 'private, max-age=60');
    expect(db.status).toBe(200);
    useR2(false);
    const off = await storage.assetResponse({ mime: 'image/png', bytes: null, sha256: 'a'.repeat(64), object_key: k }, {}, 'x');
    expect(off.status).toBe(503);
  });

  it('작업 토큰 업로드도 R2로: 토큰이 틀리면 R2에 아무것도 쓰지 않는다', async () => {
    useR2(true);
    const tok = (await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { label: '그림', kinds: ['story'], perms: ['read', 'upload'], days: 30 }))).token;
    const b = png(3);
    const r = await asAgent((db) => agent.agentUpload(db, tok, { name: 'c.png', type: 'image/png', bytes: b }));
    const [row] = await sql('select school_id, bytes is null as no_bytes, object_key from public.site_assets where id = $1', [r.id]);
    expect(row).toEqual({ school_id: A.schoolId, no_bytes: true, object_key: `s/${A.schoolId}/${sha(b)}` });
    const before = objects.size;
    await expect(asAgent((db) => agent.agentUpload(db, 'agt_' + '0'.repeat(64), { name: 'd.png', type: 'image/png', bytes: png(4) }))).rejects.toThrow();
    expect(objects.size).toBe(before);
    const ro = (await asUser(A.userId, (db) => agent.createAgentToken(db, A.schoolId, { label: '읽기만', kinds: ['story'], perms: ['read'], days: 30 }))).token;
    await expect(asAgent((db) => agent.agentUpload(db, ro, { name: 'e.png', type: 'image/png', bytes: png(5) }))).rejects.toThrow();
    expect(objects.size).toBe(before);
  });

  it('전체 관리자 복사: DB 파일을 R2로 옮겨 적되 DB 사본은 남긴다. 다시 돌리면 0개', async () => {
    useR2(true);
    const r = await asUser(P, (db) => usage.copyToStorage(db));
    expect(r.copied).toBeGreaterThanOrEqual(1);
    expect(r.left).toBe(0);
    const [row] = await sql(`select bytes is not null as has_bytes, object_key is not null as has_key from public.site_assets where name = 'a.png'`);
    expect(row).toEqual({ has_bytes: true, has_key: true });
    expect((await asUser(P, (db) => usage.copyToStorage(db))).copied).toBe(0);
  });

  it('파일 기록 보호: 위치 말고는 못 바꾸고, 위치도 한 번만·자기 해시로만. 학교 관리자는 위치를 못 적는다', async () => {
    const b = png(6);
    useR2(false);
    const r = await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'f.png', type: 'image/png', bytes: b }));
    await expect(asUser(A.userId, (db) => db.query(`update public.site_assets set object_key = 'sha256/' || sha256 where id = $1`, [r!.id])))
      .resolves.toMatchObject({ rowCount: 0 }); // RLS: 학교 관리자는 대상 행이 없다
    await expect(sql(`update public.site_assets set object_key = 'sha256/${'0'.repeat(64)}' where id = $1`, [r!.id])).rejects.toThrow();
    await expect(sql(`update public.site_assets set name = 'x' where id = $1`, [r!.id])).rejects.toThrow('고칠 수 없습니다');
    // 다른 학교 접두어로는 적을 수 없다(ADR 0019 A1)
    await expect(sql(`update public.site_assets set object_key = 's/' || $2 || '/' || sha256 where id = $1`, [r!.id, B.schoolId])).rejects.toThrow();
    await sql(`update public.site_assets set object_key = 's/' || school_id::text || '/' || sha256 where id = $1`, [r!.id]);
    // 125차: 위치가 있는 행은 DB 사본(bytes)만 비울 수 있다. 다른 칸을 함께 바꾸거나, 위치가 없는 행을 비우는 것은 거부
    await expect(sql(`update public.site_assets set bytes = null, name = 'y' where id = $1`, [r!.id])).rejects.toThrow('고칠 수 없습니다');
    await sql(`update public.site_assets set bytes = null where id = $1`, [r!.id]);
    await expect(sql(`update public.site_assets set bytes = '\\x00'::bytea where id = $1`, [r!.id])).rejects.toThrow('고칠 수 없습니다');
    const r2 = await asUser(A.userId, (db) => site.uploadAsset(db, A.schoolId, { name: 'g.png', type: 'image/png', bytes: png(7) }));
    await expect(sql(`update public.site_assets set bytes = null where id = $1`, [r2!.id])).rejects.toThrow();
    await expect(sql(`delete from public.site_assets where id = $1`, [r!.id])).rejects.toThrow('지울 수 없습니다');
  });

  it('125차 DB 사본 비우기: R2 내용이 같을 때만 비우고, 다르거나 없으면 건너뛴다. 학교 관리자는 못 한다', async () => {
    useR2(true);
    await asUser(P, (db) => usage.copyToStorage(db));
    const before = await sql(`select count(*)::int as n from public.site_assets where object_key is not null and bytes is not null`);
    expect(before[0].n).toBeGreaterThanOrEqual(2);
    // 한 파일은 R2 내용을 바꿔 둔다(손상) → 그 파일은 비우지 않아야 한다
    const [bad] = await sql(`select id, object_key from public.site_assets where object_key is not null and bytes is not null order by created_at limit 1`);
    objects.set(`/bkt/${bad.object_key}`, { body: Buffer.from('broken'), type: 'image/png' });
    await expect(asUser(A.userId, (db) => usage.clearDbCopies(db))).resolves.toMatchObject({ cleared: 0 }); // RLS: 학교 관리자 대상 행 없음
    const r = await asUser(P, (db) => usage.clearDbCopies(db));
    expect(r.skipped).toBe(1);
    expect(r.cleared).toBe(before[0].n - 1);
    expect(r.left).toBe(1);
    const [keep] = await sql(`select bytes is not null as has_bytes from public.site_assets where id = $1`, [bad.id]);
    expect(keep.has_bytes).toBe(true);
    // 비운 파일도 공개 화면에서는 R2 서명 주소로 그대로 열린다
    const [gone] = await sql(`select mime, sha256, object_key from public.site_assets where object_key is not null and bytes is null limit 1`);
    const res = await storage.assetResponse({ mime: gone.mime, bytes: null, sha256: gone.sha256, object_key: gone.object_key }, {}, 'x');
    expect(res.status).toBe(302);
    // 건너뛴 파일이 한 번에 보는 수(limit)를 채워도 다음 차례는 그 뒤부터 본다(Codex #223)
    const p1 = await asUser(P, (db) => usage.clearDbCopies(db, 1));
    expect(p1).toMatchObject({ cleared: 0, skipped: 1, next: bad.id });
    expect(await asUser(P, (db) => usage.clearDbCopies(db, 1, p1.next))).toMatchObject({ cleared: 0, skipped: 0, next: null });
    useR2(false);
    expect(await asUser(P, (db) => usage.clearDbCopies(db))).toMatchObject({ cleared: 0, configured: false }); // R2 설정이 없으면 아무것도 비우지 않는다
  });
});

describe('학교별 사용량·요금 추정', () => {
  it('전체 관리자는 모든 학교, 학교 관리자는 자기 학교만 (양방향)', async () => {
    const all = await asUser(P, (db) => usage.schoolUsage(db, null));
    expect(all.map((u) => u.id).sort()).toEqual([A.schoolId, B.schoolId].sort());
    const a = await asUser(A.userId, (db) => usage.schoolUsage(db, null));
    expect(a.map((u) => u.id)).toEqual([A.schoolId]);
    const b = await asUser(B.userId, (db) => usage.schoolUsage(db, null));
    expect(b.map((u) => u.id)).toEqual([B.schoolId]);
    expect(await asUser(B.userId, (db) => usage.schoolUsage(db, A.schoolId))).toEqual([]);
    const ua = a[0];
    expect(ua.files).toBeGreaterThanOrEqual(4);
    expect(ua.r2_bytes).toBeGreaterThan(0);
    expect(ua.agent_actions_30d).toBeGreaterThanOrEqual(1);
  });

  it('AI 사용 기록: 구성원이 자기 학교에만 남기고, 고치거나 지울 수 없으며, 추정에 더해진다', async () => {
    await asUser(A.userId, (db) => db.query(
      `insert into public.usage_events(school_id, kind, provider, model, input_tokens, output_tokens, cost_usd, feature) values ($1, 'ai', 'anthropic', 'test', 1000, 500, 0.25, 'chat')`, [A.schoolId]));
    await expect(asUser(A.userId, (db) => db.query(
      `insert into public.usage_events(school_id, kind, provider, cost_usd) values ($1, 'ai', 'x', 1)`, [B.schoolId]))).rejects.toThrow();
    await expect(sql(`update public.usage_events set cost_usd = 0`)).rejects.toThrow();
    const [u] = await asUser(A.userId, (db) => usage.schoolUsage(db, A.schoolId));
    expect(u).toMatchObject({ ai_calls_30d: 1, ai_tokens_30d: 1500 });
    expect(usage.estimate(u).ai).toBeCloseTo(0.25);
    const [ub] = await asUser(B.userId, (db) => usage.schoolUsage(db, B.schoolId));
    expect(ub.ai_calls_30d).toBe(0);
  });

  it('요금 계산: 학교별은 포함분 빼기 전, 전체는 R2 10GB·DB 8GB를 뺀 뒤', () => {
    const GB = 1024 ** 3;
    const u = { id: 'x', name: 'x', files: 1, db_site_bytes: 2 * GB, db_source_bytes: 0, r2_bytes: 20 * GB, db_only_files: 0, agent_actions_30d: 0, ai_calls_30d: 0, ai_tokens_30d: 0, ai_cost_30d: 1 };
    const e = usage.estimate(u);
    expect(e.db).toBeCloseTo(0.25); expect(e.r2).toBeCloseTo(0.3); expect(e.total).toBeCloseTo(1.55);
    const t = usage.platformEstimate([u]);
    expect(t.db).toBe(0); expect(t.r2).toBeCloseTo(0.15); expect(t.total).toBeCloseTo(1.15);
  });
});
