import type { Db } from './db';
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
  const { rows } = await db.query<SchoolUsage>(
    `select s.id, s.name,
            (select count(*)::int from public.site_assets a where a.school_id = s.id) as files,
            (select coalesce(sum(octet_length(a.bytes)), 0)::bigint from public.site_assets a where a.school_id = s.id) as db_site_bytes,
            (select coalesce(sum(octet_length(f.original)), 0)::bigint from public.source_files f where f.school_id = s.id) as db_source_bytes,
            (select coalesce(sum(x.size_bytes), 0)::bigint from (select distinct on (a.sha256) a.size_bytes from public.site_assets a
               where a.school_id = s.id and a.object_key is not null) x) as r2_bytes,
            (select count(*)::int from public.site_assets a where a.school_id = s.id and a.object_key is null) as db_only_files,
            (select count(*)::int from public.agent_token_uses u where u.school_id = s.id and u.created_at > now() - interval '30 days') as agent_actions_30d,
            (select count(*)::int from public.usage_events e where e.school_id = s.id and e.kind = 'ai' and e.created_at > now() - interval '30 days') as ai_calls_30d,
            (select coalesce(sum(e.input_tokens + e.output_tokens), 0)::bigint from public.usage_events e where e.school_id = s.id and e.kind = 'ai' and e.created_at > now() - interval '30 days') as ai_tokens_30d,
            (select coalesce(sum(e.cost_usd), 0)::float from public.usage_events e where e.school_id = s.id and e.kind = 'ai' and e.created_at > now() - interval '30 days') as ai_cost_30d
       from public.schools s where ($1::uuid is null or s.id = $1) order by s.name`, [schoolId]);
  return rows.map((r) => ({ ...r, db_site_bytes: Number(r.db_site_bytes), db_source_bytes: Number(r.db_source_bytes), r2_bytes: Number(r.r2_bytes), ai_tokens_30d: Number(r.ai_tokens_30d) }));
}

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
