import type { Db } from './db';
import { createHash } from 'node:crypto';
import { objectKey, objectStore, putVerified, StorageError } from './storage';
import { PRICES, type SchoolUsage } from './usage-shared';
export * from './usage-shared';

/**
 * 43차: 학교별 사용량·요금 추정 (ADR 0018). 모두 RLS 안에서 읽는다
 * (전체 관리자 = 모든 학교, 학교 관리자 = 자기 학교).
 * - 저장소: site_assets(홈페이지 그림·PDF)·source_files(학사 원본)에서 바로 계산. 같은 내용은 R2에 한 번만 있으므로 sha256 으로 겹침을 뺀다.
 * - AI: usage_events(호출한 쪽이 남긴 추정 금액) 최근 30일.
 * - 외부 에이전트 작업: agent_token_uses 최근 30일(학교 구독이라 플랫폼 요금 아님).
 */
export async function schoolUsage(db: Db, schoolId: string | null): Promise<SchoolUsage[]> {
  // 58차(ADR 0027): 관제는 학교 내부 표를 직접 읽지 않고 보고 계약(app.school_report_v1)으로만 모은다
  const { rows } = await db.query<{ r: SchoolReport }>(
    `select app.school_report_v1(s.id) as r from public.schools s where ($1::uuid is null or s.id = $1) order by s.name`, [schoolId]);
  return rows.map(({ r }) => ({
    id: r.school.id, name: r.school.name, files: Number(r.storage.files), db_site_bytes: Number(r.storage.db_site_bytes),
    db_source_bytes: Number(r.storage.db_source_bytes), r2_bytes: Number(r.storage.r2_bytes), db_only_files: Number(r.storage.db_only_files),
    agent_actions_30d: Number(r.activity_30d.agent_actions), ai_calls_30d: Number(r.activity_30d.ai_calls),
    ai_tokens_30d: Number(r.activity_30d.ai_tokens), ai_cost_30d: Number(r.activity_30d.ai_cost_usd),
  }));
}

/** 보고 계약 1판의 모양(관제가 학교에 기대하는 것). 학교 내부 구조가 바뀌어도 이 모양은 유지한다 */
export type SchoolReport = {
  contract: 'school-report/1';
  school: { id: string; slug: string; name: string; locale: string; status: string };
  profile: { country: string | null; sector: string | null; accreditation: string | null } | null;
  baseline_version: number | null;
  modules: string[] | null;
  counts: Record<'members' | 'people' | 'students_enrolled' | 'staff_active' | 'offerings' | 'closures' | 'site_entries', number>;
  storage: Record<'files' | 'db_site_bytes' | 'db_source_bytes' | 'r2_bytes' | 'db_only_files', number>;
  activity_30d: Record<'agent_actions' | 'ai_calls' | 'ai_tokens' | 'ai_cost_usd', number>;
  reported_at: string;
};

export function storageStatus() {
  const store = objectStore();
  return { configured: !!store, bucket: store?.bucket ?? null, prices: PRICES };
}

/** 연결 확인: 작은 확인용 객체를 올리고 크기를 대조한다(학교 자료 아님) */
export async function checkStorage() {
  const store = objectStore();
  if (!store) return { ok: false, message: 'R2 설정(환경 변수 4개)이 없습니다. 지금은 DB에 저장합니다.' };
  try {
    const body = new TextEncoder().encode(`onschools storage check ${new Date().toISOString()}`);
    await putVerified(store, 'health/check.txt', body, 'text/plain');
    return { ok: true, message: `연결됨 · 버킷 ${store.bucket}에 쓰고 읽었습니다.` };
  } catch (e) {
    return { ok: false, message: e instanceof StorageError ? e.message : 'R2에 연결하지 못했습니다. 계정 ID·키·버킷 이름을 확인해 주세요.' };
  }
}

/**
 * DB에만 있는 홈페이지 파일을 R2로 복사(전체 관리자, 한 번에 n개). DB 사본은 남긴다 — 비우기는 따로 결정.
 * 올린 뒤 크기를 대조하고 나서 object_key 를 적는다(트리거가 이 한 번만 허용).
 */
export async function copyToStorage(db: Db, limit = 25) {
  const store = objectStore();
  if (!store) return { copied: 0, left: null as number | null, message: 'R2 설정이 없습니다.' };
  const { rows } = await db.query<{ id: string; school_id: string; sha256: string; mime: string; bytes: Buffer }>(
    `select id, school_id, sha256, mime, bytes from public.site_assets where object_key is null and bytes is not null order by created_at limit $1`, [limit]);
  let copied = 0;
  for (const a of rows) {
    await putVerified(store, objectKey(a.school_id, a.sha256), a.bytes, a.mime);
    await db.query(`update public.site_assets set object_key = 's/' || school_id::text || '/' || sha256 where id = $1 and object_key is null`, [a.id]);
    copied++;
  }
  const { rows: [l] } = await db.query<{ n: number }>('select count(*)::int as n from public.site_assets where object_key is null');
  return { copied, left: l.n, message: `${copied}개 복사 · 남은 파일 ${l.n}개` };
}

/**
 * 125차: R2로 옮긴 파일의 DB 사본 비우기(전체 관리자, 한 번에 n개). 되돌릴 수 없으므로 하나씩 확인한다.
 * - R2 객체를 실제로 내려받아 sha256 이 DB 기록과 같을 때만 bytes 를 비운다(크기만 보지 않는다).
 * - 다르거나 없으면 비우지 않고 건너뛴 개수로 돌려준다(DB 사본이 유일한 원본으로 남는다).
 * - DB 가드: object_key 가 있는 행에서 bytes 만 비우는 것만 허락한다(20261128001700).
 */
export async function clearDbCopies(db: Db, limit = 25) {
  const store = objectStore();
  if (!store) return { cleared: 0, skipped: 0, left: null as number | null, message: 'R2 설정이 없습니다. DB 사본을 비울 수 없습니다.' };
  const { rows } = await db.query<{ id: string; sha256: string; object_key: string; mime: string }>(
    `select id, sha256, object_key, mime from public.site_assets where object_key is not null and bytes is not null order by created_at limit $1`, [limit]);
  let cleared = 0; let skipped = 0;
  for (const a of rows) {
    let same = false;
    try {
      const res = await fetch(await store.signedGet(a.object_key, { mime: a.mime, seconds: 120 }));
      if (res.ok) same = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex') === a.sha256;
    } catch { same = false; }
    if (!same) { skipped++; continue; }
    const r = await db.query(`update public.site_assets set bytes = null where id = $1 and object_key = $2 and bytes is not null`, [a.id, a.object_key]);
    cleared += r.rowCount ?? 0;
  }
  const { rows: [l] } = await db.query<{ n: number }>('select count(*)::int as n from public.site_assets where object_key is not null and bytes is not null');
  return { cleared, skipped, left: l.n, message: `DB 사본 ${cleared}개 비움 · 건너뜀 ${skipped}개 · 남은 사본 ${l.n}개` };
}

/** R2에도 있고 DB 사본도 남은 파일 수(비울 수 있는 것) */
export async function dbCopyCount(db: Db) {
  const { rows: [r] } = await db.query<{ n: number }>('select count(*)::int as n from public.site_assets where object_key is not null and bytes is not null');
  return r.n;
}
