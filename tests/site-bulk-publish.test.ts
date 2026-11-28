import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { bulkPublishStories, parsePublishSelection } from '@/lib/site-bulk-publish';

const id = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const school = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const choice = { id, base_version: 2, live_version: 1 };
const current = { id: versionId, version: 2, live_version: 1, was_published: true };
function fakeDb(entries: unknown[] = [{ id, archived_at: null }], states: unknown[] = [current]) {
  const query = vi.fn().mockResolvedValueOnce({ rows: entries });
  for (const state of states) query.mockResolvedValueOnce({ rows: state ? [state] : [] });
  query.mockResolvedValue({ rows: [] });
  return { db: { query } as unknown as Db, query };
}

describe('일괄 공개 입력', () => {
  it.each([null, {}, { items: [] }, { items: Array(101).fill(choice) }, { items: [choice, choice] },
    { items: [{ ...choice, id: 'no' }] }, { items: [{ ...choice, base_version: 0 }] },
    { items: [{ ...choice, base_version: '2' }] }, { items: [{ ...choice, live_version: undefined }] },
    { items: [{ ...choice, live_version: -1 }] }, { items: [null] }])('잘못된 요청은 쓰기 전에 거부한다: %j', (raw) => {
    expect(() => parsePublishSelection(raw)).toThrow();
  });
  it('처음 공개하는 판도 고를 수 있다', () => {
    expect(parsePublishSelection({ items: [{ ...choice, live_version: null }] })[0].live_version).toBeNull();
  });
});

describe('확인한 판만 공개', () => {
  it('학교·동화 범위를 잠근 뒤 읽고 정확한 판 ID로 공개 기록 하나를 더한다', async () => {
    const { db, query } = fakeDb();
    expect(await bulkPublishStories(db, school, { items: [choice] })).toEqual({ results: [{ id, status: 'published', version: 2 }] });
    expect(query.mock.calls[0][0]).toContain("school_id = $1 and kind = 'story'");
    expect(query.mock.calls[0][0]).toContain('order by id for update');
    expect(query.mock.calls[0][1]).toEqual([school, [id]]);
    expect(query.mock.calls[2][1]).toEqual([school, id, versionId, null]); // 122차: 사진 없는 판은 허가 확인 칸을 비운다
    expect(query.mock.calls[2][0]).toMatch(/^insert into public.site_publications/);
  });
  it.each([
    { ...current, version: 3 },
    { ...current, live_version: null },
    { ...current, live_version: 4 },
    null,
  ])('판이나 공개 상태가 달라지면 건너뛴다: %j', async (state) => {
    const { db, query } = fakeDb(undefined, [state]);
    const { results } = await bulkPublishStories(db, school, { items: [choice] });
    expect(results[0].status).toBe('skipped'); expect(query).toHaveBeenCalledTimes(2);
  });
  it('응답 유실 뒤 재시도해도 이미 공개한 판의 기록은 중복 생성하지 않는다', async () => {
    const { db, query } = fakeDb(undefined, [{ ...current, live_version: 2 }]);
    expect((await bulkPublishStories(db, school, { items: [choice] })).results[0].status).toBe('unchanged');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('공개 내림 상태는 live_version=null을 보내도 복원하지 않는다', async () => {
    const { db, query } = fakeDb(undefined, [{ ...current, live_version: null }]);
    expect((await bulkPublishStories(db, school, { items: [{ ...choice, live_version: null }] })).results[0].status).toBe('skipped');
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('첫 공개 시안은 공개한다', async () => {
    const { db } = fakeDb(undefined, [{ ...current, live_version: null, was_published: false }]);
    expect((await bulkPublishStories(db, school, { items: [{ ...choice, live_version: null }] })).results[0].status).toBe('published');
  });
  it('다른 학교·비동화·보관 항목은 조회 결과에 따라 건너뛴다', async () => {
    const { db, query } = fakeDb([{ id, archived_at: '2026-01-01' }], []);
    const { results } = await bulkPublishStories(db, school, { items: [choice, { ...choice, id: second }] });
    expect(results.map((r) => r.status)).toEqual(['skipped', 'skipped']); expect(query).toHaveBeenCalledTimes(1);
  });
  it('충돌한 항목을 건너뛰고 나머지만 공개한다', async () => {
    const { db, query } = fakeDb([{ id, archived_at: null }, { id: second, archived_at: null }], [{ ...current, version: 3 }, current]);
    expect((await bulkPublishStories(db, school, { items: [choice, { ...choice, id: second }] })).results.map((r) => r.status)).toEqual(['skipped', 'published']);
    expect(query.mock.calls[3][1]).toEqual([school, second, versionId, null]);
  });
  // 122차: 사진이 든 판은 공개 창에서 사진 공개 허가를 확인해야 공개하고, 확인한 사진을 공개 기록에 남긴다
  const photo = '55555555-5555-4555-8555-555555555555';
  const withPhoto = { ...current, content: { title: { ko: 'x' }, blocks: [{ type: 'story_page', asset: photo, text: {} }] } };
  it('사진이 든 판은 허가 확인 없이 공개하지 않는다', async () => {
    const { db, query } = fakeDb(undefined, [withPhoto]);
    query.mockResolvedValueOnce({ rows: [{ id: photo, name: 'p.png' }] });
    const { results } = await bulkPublishStories(db, school, { items: [choice] });
    expect(results[0]).toMatchObject({ status: 'skipped', reason: expect.stringContaining('공개 허가') });
    expect(query.mock.calls.some((c) => String(c[0]).startsWith('insert'))).toBe(false);
  });
  it('허가를 확인하면 공개하고 확인한 사진을 기록한다', async () => {
    const { db, query } = fakeDb(undefined, [withPhoto]);
    query.mockResolvedValueOnce({ rows: [{ id: photo, name: 'p.png' }] });
    const { results } = await bulkPublishStories(db, school, { photo_consent: true, items: [choice] });
    expect(results[0].status).toBe('published');
    expect(query.mock.calls[3][1]).toEqual([school, id, versionId, [photo]]);
  });
  it('DB 오류를 성공으로 바꾸지 않아 상위 트랜잭션이 전체 롤백한다', async () => {
    const { db, query } = fakeDb(); query.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(bulkPublishStories(db, school, { items: [choice] })).rejects.toThrow();
  });
});
