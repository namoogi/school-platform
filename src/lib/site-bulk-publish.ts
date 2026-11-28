import type { Db } from './db';
import { isUuid, ValidationError } from './services';
import { photosOf } from './site';
import type { Content } from './site-shared';

export type PublishSelection = { id: string; base_version: number; live_version: number | null };
export type PublishOutcome = { id: string; status: 'published' | 'unchanged' | 'skipped'; reason?: string; version?: number };

export function parsePublishSelection(raw: unknown): PublishSelection[] {
  const items = (raw as { items?: unknown } | null)?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new ValidationError('공개할 동화를 1~100편 선택해 주세요.');
  }
  const seen = new Set<string>();
  return items.map((item) => {
    if (!item || typeof item.id !== 'string' || !isUuid(item.id)
      || !Number.isSafeInteger(item.base_version) || item.base_version < 1
      || !(item.live_version === null || (Number.isSafeInteger(item.live_version) && item.live_version > 0))) {
      throw new ValidationError('동화와 확인한 판 번호를 다시 선택해 주세요.');
    }
    const id = item.id.toLowerCase();
    if (seen.has(id)) throw new ValidationError('같은 동화를 여러 번 선택할 수 없습니다.');
    seen.add(id);
    return { id, base_version: item.base_version, live_version: item.live_version };
  });
}

/**
 * 관리자 asUser 트랜잭션 안에서 호출. 확인한 판만 공개하며 기존 판·공개 기록은 보존한다.
 * 122차: 사진이 든 판은 공개 창에서 사진 공개 허가를 확인해야(photo_consent: true) 공개하고, 확인 기록을 남긴다.
 */
export async function bulkPublishStories(db: Db, schoolId: string, raw: unknown): Promise<{ results: PublishOutcome[] }> {
  const items = parsePublishSelection(raw);
  const consent = (raw as { photo_consent?: unknown } | null)?.photo_consent === true;
  // 동일 항목을 포함한 일괄 요청의 잠금 순서를 통일한다. FK로 연결된 새 판·공개 삽입도 잠금이 풀릴 때까지 기다린다.
  const { rows: entries } = await db.query<{ id: string; archived_at: string | null }>(
    `select id, archived_at from public.site_entries
     where school_id = $1 and kind = 'story' and id = any($2::uuid[]) order by id for update`,
    [schoolId, items.map((item) => item.id)]);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const results: PublishOutcome[] = [];
  for (const item of items) {
    const entry = byId.get(item.id);
    const skip = (reason: string) => results.push({ id: item.id, status: 'skipped', reason });
    if (!entry) { skip('이 학교에서 공개할 동화를 찾을 수 없습니다.'); continue; }
    if (entry.archived_at) { skip('보관한 동화입니다.'); continue; }
    // 잠금을 얻은 다음 별도 문장으로 읽어, 기다리는 동안 완료된 변경도 확인한다.
    const { rows: [current] } = await db.query<{
      id: string; version: number; content: Content; live_version: number | null; was_published: boolean;
    }>(
      `select v.id, v.version, v.content, lv.version as live_version, p.id is not null as was_published
       from public.site_entry_versions v
       left join lateral (select id, version_id from public.site_publications
         where school_id = $1 and entry_id = $2 order by id desc limit 1) p on true
       left join public.site_entry_versions lv on lv.id = p.version_id and lv.school_id = $1
       where v.school_id = $1 and v.entry_id = $2 order by v.version desc limit 1`, [schoolId, item.id]);
    if (!current || current.version !== item.base_version) { skip('그 사이 새 판이 생겼습니다. 최신 판을 확인해 주세요.'); continue; }
    if (current.live_version === current.version) {
      results.push({ id: item.id, status: 'unchanged', version: current.version }); continue;
    }
    if (current.was_published && current.live_version === null) { skip('공개를 내려 둔 동화입니다. 제목 옆에서 개별 공개해 주세요.'); continue; }
    if (current.live_version !== item.live_version) { skip('공개 상태가 바뀌었습니다. 목록을 다시 확인해 주세요.'); continue; }
    const photos = await photosOf(db, schoolId, current.content);
    if (photos.length && !consent) { skip('사진 공개 허가 확인이 필요합니다.'); continue; }
    await db.query(
      `insert into public.site_publications(school_id, entry_id, version_id, photo_consent_at, photo_consent_assets)
       values ($1,$2,$3, case when $4::uuid[] is null then null else now() end, $4::uuid[])`,
      [schoolId, item.id, current.id, photos.length ? photos.map((p) => p.id) : null]);
    results.push({ id: item.id, status: 'published', version: current.version });
  }
  return { results };
}
